// 答题：自动保存单题答案（考生）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireCandidate } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import type { PaperSnapshotItem } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, ctx: Ctx): Promise<NextResponse> => {
  const session = await requireCandidate();
  const { id } = await ctx.params;
  const body = (await request.json()) as {
    question_id?: string;
    answer?: string | string[] | boolean | null;
    marked?: boolean;
  };
  if (!body.question_id) return fail('参数缺失');

  const client = getSupabaseClient();
  const { data: attempt, error: aErr } = await client.from('attempts').select('*').eq('id', id).single();
  if (aErr || !attempt) return fail('答题记录不存在', 404);
  if (attempt.candidate_phone !== session.phone) return fail('无权操作该答题记录', 403);
  if (attempt.status !== 'in_progress') return fail('试卷已提交，不能修改答案', 409, { already_submitted: true });

  // 服务端时间校验（剩余时间以服务端为准）
  const now = new Date();
  const { data: exam, error: examError } = await client.from('exams').select('status, end_time').eq('id', attempt.exam_id).single();
  if (examError || !exam) throw new Error('获取考试状态失败，请重试');
  if (['ended', 'archived'].includes(exam.status as string) || (exam.end_time && now >= new Date(exam.end_time as string))) {
    return fail('考试已停止或结束，请提交已保存的答案', 410, { expired: true });
  }
  if (now > new Date(attempt.deadline_at as string)) {
    return fail('考试时间已结束，系统将自动交卷', 410, { expired: true });
  }

  // 校验题目属于该试卷快照
  const snapshot = attempt.paper_snapshot as PaperSnapshotItem[];
  if (!snapshot.some((q) => q.question_id === body.question_id)) {
    return fail('题目不属于本试卷', 400);
  }

  const answer = body.answer === undefined ? null : body.answer;
  const nowIso = now.toISOString();
  const patch: Record<string, unknown> = { user_answer: answer, saved_at: nowIso, updated_at: nowIso };
  if (typeof body.marked === 'boolean') patch.marked = body.marked;

  const { error } = await client
    .from('attempt_answers')
    .update(patch)
    .eq('attempt_id', id)
    .eq('question_id', body.question_id);
  if (error) throw new Error(`保存答案失败: ${error.message}`);

  return ok({ saved: true, saved_at: nowIso, server_now: nowIso, deadline_at: attempt.deadline_at });
});
