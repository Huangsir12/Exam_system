// 答题：获取答题记录与试卷（考生，用于答题页加载/刷新恢复）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireCandidate } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import type { SnapshotQuestion } from '@/lib/grading';
import type { PaperSnapshotItem } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (request: Request, ctx: Ctx): Promise<NextResponse> => {
  const session = await requireCandidate();
  const { id } = await ctx.params;

  const client = getSupabaseClient();
  const { data: attempt, error: aErr } = await client.from('attempts').select('*').eq('id', id).single();
  if (aErr || !attempt) return fail('答题记录不存在', 404);
  if (attempt.candidate_phone !== session.phone) return fail('无权查看该答题记录', 403);

  const { data: exam, error: examError } = await client
    .from('exams')
    .select('id, title, status, duration_minutes, total_score, pass_score, end_time')
    .eq('id', attempt.exam_id)
    .single();
  if (examError || !exam) throw new Error('获取考试状态失败，请重试');
  const now = new Date().toISOString();
  const deadline = ['ended', 'archived'].includes(exam.status as string)
    ? (exam.end_time && exam.end_time < now ? exam.end_time : now)
    : exam.end_time && new Date(exam.end_time as string) < new Date(attempt.deadline_at as string)
      ? exam.end_time : attempt.deadline_at;
  if (new URL(request.url).searchParams.get('status_only') === '1') {
    return ok({ id: attempt.id, status: attempt.status, deadline_at: deadline, server_now: now });
  }

  const snapshot = (attempt.paper_snapshot as PaperSnapshotItem[]) ?? [];
  const { data: answers } = await client
    .from('attempt_answers')
    .select('question_id, user_answer, marked, question_snapshot')
    .eq('attempt_id', id);

  const answerMap = new Map((answers ?? []).map((a) => [a.question_id as string, a]));
  const savedAnswers: Record<string, { user_answer: unknown; marked: boolean }> = {};
  const questions = snapshot.map((s) => {
    const row = answerMap.get(s.question_id);
    savedAnswers[s.question_id] = {
      user_answer: row?.user_answer ?? null,
      marked: Boolean(row?.marked),
    };
    const snap = row?.question_snapshot as SnapshotQuestion | undefined;
    return {
      question_id: s.question_id,
      sort: s.sort_order,
      type: snap?.type ?? 'single',
      content: snap?.content ?? '',
      options: snap?.options ?? null,
      score: snap?.score ?? 0,
      blank_count: snap?.type === 'fill' && Array.isArray(snap?.answer) ? (snap.answer as string[][]).length : 0,
    };
  });

  return ok({
    id: attempt.id,
    status: attempt.status,
    grading_status: attempt.grading_status,
    started_at: attempt.started_at,
    deadline_at: deadline,
    submitted_at: attempt.submitted_at,
    duration_seconds: attempt.duration_seconds,
    server_now: new Date().toISOString(),
    exam,
    snapshot,
    questions,
    saved_answers: savedAnswers,
  });
});
