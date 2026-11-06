// 考试发布 / 取消发布（管理员）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import { EXAM_STATUS } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();

  const { data: exam, error: eErr } = await client.from('exams').select('*').eq('id', id).single();
  if (eErr || !exam) return fail('考试不存在', 404);

  if (exam.status === EXAM_STATUS.ONGOING || exam.status === EXAM_STATUS.ENDED) {
    return fail('考试已发布，不可重复发布');
  }

  // 发布前检查
  const problems: string[] = [];
  if (!exam.start_time || !exam.end_time) problems.push('未设置考试开始/结束时间');
  if (exam.start_time && exam.end_time && new Date(exam.end_time as string) <= new Date(exam.start_time as string)) {
    problems.push('结束时间必须晚于开始时间');
  }
  if (!exam.duration_minutes || (exam.duration_minutes as number) <= 0) problems.push('未设置有效的答题时长');

  const { count: qCount } = await client.from('questions').select('id', { count: 'exact', head: true }).eq('exam_id', id);
  if (!qCount || qCount === 0) problems.push('试卷尚未生成题目');

  const { data: qs } = await client.from('questions').select('score').eq('exam_id', id);
  const totalScore = (qs ?? []).reduce((s: number, q) => s + Number(q.score), 0);
  if (totalScore <= 0) problems.push('试卷总分无效');
  if (exam.pass_score !== null && Number(exam.pass_score) > totalScore) problems.push('及格分不得高于总分');

  const { count: cCount } = await client.from('candidates').select('id', { count: 'exact', head: true }).eq('exam_id', id);
  if (!cCount || cCount === 0) problems.push('参考人员名单为空');

  if (problems.length > 0) return fail(`发布前检查未通过：${problems.join('；')}`);

  const now = new Date();
  const status = new Date(exam.start_time as string) > now ? EXAM_STATUS.PUBLISHED : EXAM_STATUS.ONGOING;

  const { error } = await client
    .from('exams')
    .update({ status, total_score: totalScore, published_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('id', id);
  if (error) throw new Error(`发布失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'exam_publish',
    targetType: 'exam',
    targetId: id,
    detail: { title: exam.title, question_count: qCount, candidate_count: cCount, total_score: totalScore },
  });

  return ok({ published: true, status });
});
