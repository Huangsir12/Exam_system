// 考生端：考试说明详情
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireCandidate } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import { EXAM_STATUS } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const session = await requireCandidate();
  const { id } = await ctx.params;
  const client = getSupabaseClient();

  // 权限校验：考生必须在名单中
  const { data: candidate } = await client
    .from('candidates')
    .select('id')
    .eq('exam_id', id)
    .eq('phone', session.phone)
    .limit(1);
  if (!candidate || candidate.length === 0) return fail('你不在该考试的参考名单中', 403);

  const { data: exam, error } = await client.from('exams').select('*').eq('id', id).single();
  if (error || !exam) return fail('考试不存在', 404);
  if (exam.status === EXAM_STATUS.DRAFT) return fail('考试尚未发布', 403);

  const { count: questionCount } = await client
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('exam_id', id);

  const { data: attempts } = await client
    .from('attempts')
    .select('id, status, grading_status')
    .eq('exam_id', id)
    .eq('candidate_phone', session.phone)
    .order('created_at', { ascending: false });
  const submittedCount = (attempts ?? []).filter((a) => a.status !== 'in_progress').length;
  const inProgress = (attempts ?? []).find((a) => a.status === 'in_progress');

  return ok({
    id: exam.id,
    title: exam.title,
    description: exam.description,
    status: exam.status,
    start_time: exam.start_time,
    end_time: exam.end_time,
    duration_minutes: exam.duration_minutes,
    total_score: exam.total_score,
    pass_score: exam.pass_score,
    max_attempts: exam.max_attempts,
    question_count: questionCount ?? 0,
    submitted_count: submittedCount,
    remaining_attempts: Math.max(0, (exam.max_attempts as number) - submittedCount),
    in_progress_attempt_id: inProgress?.id ?? null,
  });
});
