// 考试：详情 / 更新设置（管理员）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import { EXAM_STATUS } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();
  const { data, error } = await client.from('exams').select('*').eq('id', id).single();
  if (error || !data) return fail('考试不存在', 404);

  // 附加统计：题目数、名单数
  const [{ count: questionCount }, { count: candidateCount }] = await Promise.all([
    client.from('questions').select('id', { count: 'exact', head: true }).eq('exam_id', id),
    client.from('candidates').select('id', { count: 'exact', head: true }).eq('exam_id', id),
  ]);
  return ok({ ...data, question_count: questionCount ?? 0, candidate_count: candidateCount ?? 0 });
});

export const PATCH = withErrorHandling(async (request: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = (await request.json()) as Record<string, unknown>;

  const client = getSupabaseClient();
  const { data: exam, error: qErr } = await client.from('exams').select('*').eq('id', id).single();
  if (qErr || !exam) return fail('考试不存在', 404);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  const setField = (key: string, value: unknown) => {
    if (value !== undefined) {
      patch[key] = value;
      before[key] = exam[key];
      after[key] = value;
    }
  };

  setField('title', typeof body.title === 'string' ? body.title.trim() : undefined);
  setField('description', typeof body.description === 'string' ? body.description.trim() : undefined);
  setField('duration_minutes', typeof body.duration_minutes === 'number' ? Math.max(1, Math.floor(body.duration_minutes)) : undefined);
  setField('pass_score', typeof body.pass_score === 'number' ? body.pass_score : undefined);
  setField('max_attempts', typeof body.max_attempts === 'number' ? Math.max(1, Math.floor(body.max_attempts)) : undefined);
  setField('paper_mode', typeof body.paper_mode === 'string' && ['fixed', 'random'].includes(body.paper_mode) ? body.paper_mode : undefined);
  setField('question_order', typeof body.question_order === 'string' ? body.question_order : undefined);
  setField('option_shuffle', typeof body.option_shuffle === 'boolean' ? body.option_shuffle : undefined);
  setField('result_visibility', typeof body.result_visibility === 'string' ? body.result_visibility : undefined);
  setField('show_answer', typeof body.show_answer === 'boolean' ? body.show_answer : undefined);
  setField('show_analysis', typeof body.show_analysis === 'boolean' ? body.show_analysis : undefined);
  setField('show_source', typeof body.show_source === 'boolean' ? body.show_source : undefined);
  if (body.status === EXAM_STATUS.PENDING && exam.status === EXAM_STATUS.DRAFT) setField('status', EXAM_STATUS.PENDING);
  if (body.status === EXAM_STATUS.DRAFT && exam.status === EXAM_STATUS.PENDING) setField('status', EXAM_STATUS.DRAFT);

  if (typeof body.start_time === 'string' && body.start_time) setField('start_time', new Date(body.start_time).toISOString());
  if (typeof body.end_time === 'string' && body.end_time) setField('end_time', new Date(body.end_time).toISOString());

  // 时间校验
  const startTime = (patch.start_time as string) ?? (exam.start_time as string | null);
  const endTime = (patch.end_time as string) ?? (exam.end_time as string | null);
  if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
    return fail('结束时间必须晚于开始时间');
  }

  // 及格分不得高于总分
  const totalScore = Number(exam.total_score);
  const passScore = (patch.pass_score as number) ?? Number(exam.pass_score);
  if (passScore > totalScore) return fail('及格分不得高于总分');

  if (Object.keys(patch).length === 1) return fail('没有需要更新的字段');

  const { error } = await client.from('exams').update(patch).eq('id', id);
  if (error) throw new Error(`更新考试失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'exam_update',
    targetType: 'exam',
    targetId: id,
    detail: { before, after },
  });
  return ok({ updated: true });
});

export const DELETE = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();
  const { data: exam, error: qErr } = await client.from('exams').select('status, title, generation_status').eq('id', id).single();
  if (qErr || !exam) return fail('考试不存在', 404);
  if (exam.status !== EXAM_STATUS.DRAFT) return fail('仅草稿状态的考试可以删除');
  if (exam.generation_status === 'generating') return fail('智能出题进行中，暂不能删除', 409);
  const { count, error: attemptsError } = await client.from('attempts').select('id', { count: 'exact', head: true }).eq('exam_id', id);
  if (attemptsError) throw new Error(`检查答题记录失败：${attemptsError.message}`);
  if (count) return fail('已有答题记录，不能删除，请保留或归档', 409);

  // 依赖外键级联，在单次删除中清理题目和名单，避免先删子表导致半删除。
  const { data: deleted, error } = await client.from('exams').delete().eq('id', id)
    .eq('status', EXAM_STATUS.DRAFT).neq('generation_status', 'generating').select('id');
  if (error) throw new Error(`删除考试失败: ${error.message}`);
  if (!deleted?.length) return fail('考试状态已变更，请刷新后重试', 409);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'exam_delete',
    targetType: 'exam',
    targetId: id,
    detail: { title: exam.title },
  });
  return ok({ deleted: true });
});
