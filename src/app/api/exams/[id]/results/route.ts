// 管理端：成绩明细列表（含筛选）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth';
import { fail, maskPhone, ok, withErrorHandling } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (request: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const keyword = (url.searchParams.get('keyword') ?? '').trim();
  const passFilter = url.searchParams.get('pass'); // 'pass' | 'fail' | ''
  const statusFilter = url.searchParams.get('status'); // 'submitted' | 'not_started' | 'grading' | 'completed'

  const client = getSupabaseClient();
  const { data: exam, error: eErr } = await client.from('exams').select('*').eq('id', id).single();
  if (eErr || !exam) return fail('考试不存在', 404);

  const { data: candidates, error: cErr } = await client
    .from('candidates')
    .select('id, name, phone')
    .eq('exam_id', id);
  if (cErr) throw new Error(`查询名单失败: ${cErr.message}`);

  const { data: attempts, error: aErr } = await client
    .from('attempts')
    .select('*')
    .eq('exam_id', id)
    .order('created_at', { ascending: false });
  if (aErr) throw new Error(`查询成绩失败: ${aErr.message}`);

  // 每人取最新一条记录
  const latestByPhone = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts ?? []) {
    if (!latestByPhone.has(a.candidate_phone as string)) {
      latestByPhone.set(a.candidate_phone as string, a);
    }
  }

  let rows = (candidates ?? []).map((c) => {
    const a = latestByPhone.get(c.phone as string);
    return {
      candidate_id: c.id,
      name: c.name,
      phone_masked: maskPhone(c.phone as string),
      has_started: !!a,
      attempt_id: a?.id ?? null,
      attempt_status: a?.status ?? 'not_started',
      started_at: a?.started_at ?? null,
      submitted_at: a?.submitted_at ?? null,
      duration_seconds: a?.duration_seconds ?? null,
      objective_score: a?.objective_score ?? null,
      subjective_score: a?.subjective_score ?? null,
      total_score: a?.total_score ?? null,
      is_passed: a?.is_passed ?? null,
      grading_status: a?.grading_status ?? 'none',
    };
  });

  if (keyword) {
    rows = rows.filter((r) => (r.name as string).includes(keyword) || (r.phone_masked as string).includes(keyword));
  }
  if (passFilter === 'pass') rows = rows.filter((r) => r.is_passed === true);
  if (passFilter === 'fail') rows = rows.filter((r) => r.is_passed === false);
  if (statusFilter === 'not_started') rows = rows.filter((r) => !r.has_started);
  if (statusFilter === 'grading') rows = rows.filter((r) => r.grading_status === 'pending');
  if (statusFilter === 'completed') rows = rows.filter((r) => r.attempt_status === 'completed');

  return ok({
    exam: {
      id: exam.id,
      title: exam.title,
      total_score: exam.total_score,
      pass_score: exam.pass_score,
      status: exam.status,
    },
    rows,
  });
});
