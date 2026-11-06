// 试题：修改 / 删除（管理员）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import { EXAM_STATUS } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

async function recalcTotal(examId: string): Promise<void> {
  const client = getSupabaseClient();
  const { data: qs } = await client.from('questions').select('score').eq('exam_id', examId);
  const totalScore = (qs ?? []).reduce((s: number, q) => s + Number(q.score), 0);
  await client.from('exams').update({ total_score: totalScore, updated_at: new Date().toISOString() }).eq('id', examId);
}

export const PATCH = withErrorHandling(async (request: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params; // question id
  const body = (await request.json()) as Record<string, unknown>;

  const client = getSupabaseClient();
  const { data: question, error: qErr } = await client.from('questions').select('*').eq('id', id).single();
  if (qErr || !question) return fail('题目不存在', 404);

  const { data: exam } = await client.from('exams').select('status').eq('id', question.exam_id).single();
  const locked = exam && [EXAM_STATUS.PUBLISHED, EXAM_STATUS.ONGOING, EXAM_STATUS.ENDED, EXAM_STATUS.ARCHIVED].includes(exam.status as never);
  if (locked) {
    // 需求 5.8：考试开始后不允许直接修改题目；成绩修正走人工阅卷/成绩更正通道
    return fail('考试已发布或开考，不允许修改题目；如需修正成绩请使用阅卷更正');
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const editable = ['content', 'options', 'answer', 'analysis', 'score', 'difficulty', 'knowledge_point', 'source_location', 'source_excerpt', 'sort_order'];
  for (const key of editable) {
    if (body[key] !== undefined) {
      patch[key] = body[key];
      before[key] = question[key];
      after[key] = body[key];
    }
  }

  const { error } = await client.from('questions').update(patch).eq('id', id);
  if (error) throw new Error(`更新题目失败: ${error.message}`);
  await recalcTotal(question.exam_id as string);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'question_update',
    targetType: 'question',
    targetId: id,
    detail: { before, after },
  });
  return ok({ updated: true });
});

export const DELETE = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();
  const { data: question, error: qErr } = await client.from('questions').select('*').eq('id', id).single();
  if (qErr || !question) return fail('题目不存在', 404);

  const { data: exam } = await client.from('exams').select('status').eq('id', question.exam_id).single();
  if (exam && [EXAM_STATUS.ONGOING, EXAM_STATUS.ENDED, EXAM_STATUS.ARCHIVED].includes(exam.status as never)) {
    return fail('考试已开考，不允许删除题目');
  }

  const { error } = await client.from('questions').delete().eq('id', id);
  if (error) throw new Error(`删除题目失败: ${error.message}`);
  await recalcTotal(question.exam_id as string);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'question_delete',
    targetType: 'question',
    targetId: id,
    detail: { content: (question.content as string).slice(0, 100) },
  });
  return ok({ deleted: true });
});
