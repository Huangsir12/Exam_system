// 考生端：我的考试列表
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireCandidate } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api';
import { EXAM_STATUS } from '@/lib/types';

export const GET = withErrorHandling(async (): Promise<NextResponse> => {
  const session = await requireCandidate();
  const client = getSupabaseClient();

  // 按手机号找到该考生参加的所有考试
  const { data: candidates, error: cErr } = await client
    .from('candidates')
    .select('exam_id, id')
    .eq('phone', session.phone);
  if (cErr) throw new Error(`查询名单失败: ${cErr.message}`);
  const examIds = [...new Set((candidates ?? []).map((c) => c.exam_id as string))];
  if (examIds.length === 0) return ok([]);

  const { data: exams, error: eErr } = await client
    .from('exams')
    .select('id, title, description, status, start_time, end_time, duration_minutes, total_score, pass_score, max_attempts, result_visibility, show_answer, show_analysis, show_source, result_published')
    .in('id', examIds)
    .neq('status', EXAM_STATUS.DRAFT);
  if (eErr) throw new Error(`查询考试失败: ${eErr.message}`);

  // 查询每个考试的本人答题记录
  const examList = [];
  for (const exam of exams ?? []) {
    const { data: attempts } = await client
      .from('attempts')
      .select('id, status, total_score, is_passed, grading_status, started_at, submitted_at')
      .eq('exam_id', exam.id)
      .eq('candidate_phone', session.phone)
      .order('created_at', { ascending: false });

    const attemptList = attempts ?? [];
    const submittedCount = attemptList.filter((a) => a.status !== 'in_progress').length;
    const inProgress = attemptList.find((a) => a.status === 'in_progress');

    const now = new Date();
    const start = exam.start_time ? new Date(exam.start_time as string) : null;
    const end = exam.end_time ? new Date(exam.end_time as string) : null;
    let displayStatus: string;
    if (inProgress) displayStatus = 'in_progress';
    else if (submittedCount > 0 && attemptList[0].grading_status === 'pending') displayStatus = 'grading';
    else if (submittedCount > 0) displayStatus = 'submitted';
    else if (start && now < start) displayStatus = 'not_started';
    else if (end && now > end) displayStatus = 'expired';
    else displayStatus = 'available';

    examList.push({
      ...exam,
      my_status: displayStatus,
      submitted_count: submittedCount,
      remaining_attempts: Math.max(0, (exam.max_attempts as number) - submittedCount),
      latest_attempt: attemptList[0] ?? null,
      in_progress_attempt_id: inProgress?.id ?? null,
    });
  }

  return ok(examList);
});
