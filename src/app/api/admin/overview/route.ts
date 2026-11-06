// 管理端：数据总览
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api';
import { EXAM_STATUS } from '@/lib/types';

export const GET = withErrorHandling(async (): Promise<NextResponse> => {
  await requireAdmin();
  const client = getSupabaseClient();

  const [
    { count: docCount },
    { count: examCount },
    { data: exams },
    { count: attemptCount },
    { count: pendingGrading },
  ] = await Promise.all([
    client.from('documents').select('id', { count: 'exact', head: true }),
    client.from('exams').select('id', { count: 'exact', head: true }),
    client.from('exams').select('id, title, status, start_time, end_time, created_at').order('created_at', { ascending: false }).limit(8),
    client.from('attempts').select('id', { count: 'exact', head: true }),
    client.from('attempts').select('id', { count: 'exact', head: true }).eq('grading_status', 'pending'),
  ]);

  const ongoing = (exams ?? []).filter((e) => e.status === EXAM_STATUS.ONGOING).length;

  return ok({
    doc_count: docCount ?? 0,
    exam_count: examCount ?? 0,
    ongoing_count: ongoing,
    attempt_count: attemptCount ?? 0,
    pending_grading: pendingGrading ?? 0,
    recent_exams: exams ?? [],
  });
});
