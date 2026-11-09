import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_request: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();
  const { data: exam, error } = await client.from('exams').select('id, title, status').eq('id', id).single();
  if (error || !exam) return fail('考试不存在', 404);
  if (exam.status === 'ended') return ok({ stopped: true });
  if (!['published', 'ongoing'].includes(exam.status as string)) return fail('仅已发布或进行中的考试可以停止', 409);

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await client.from('exams')
    .update({ status: 'ended', end_time: now, updated_at: now })
    .eq('id', id).eq('status', exam.status).select('id');
  if (updateError) throw new Error(`停止考试失败：${updateError.message}`);
  if (!updated?.length) return fail('考试状态已变更，请刷新后重试', 409);
  await writeLog({
    operatorType: 'admin', operatorId: admin.user_id, operatorName: admin.user_name,
    action: 'exam_stop', targetType: 'exam', targetId: id,
    detail: { title: exam.title, previous_status: exam.status, stopped_at: now },
  });
  return ok({ stopped: true });
});
