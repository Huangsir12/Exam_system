// 参考名单：编辑 / 删除单条（管理员）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, isValidPhone, maskPhone, ok, withErrorHandling } from '@/lib/api';

type Ctx = { params: Promise<{ id: string; cid: string }> };

export const PATCH = withErrorHandling(async (request: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id, cid } = await ctx.params;
  const body = (await request.json()) as { name?: string };
  const name = (body.name ?? '').trim();
  if (!name) return fail('姓名不能为空');

  const client = getSupabaseClient();
  const { data: candidate, error: qErr } = await client
    .from('candidates')
    .select('*')
    .eq('id', cid)
    .eq('exam_id', id)
    .single();
  if (qErr || !candidate) return fail('人员不存在', 404);

  const { error } = await client.from('candidates').update({ name }).eq('id', cid);
  if (error) throw new Error(`更新失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'candidate_update',
    targetType: 'candidate',
    targetId: cid,
    detail: { before: { name: candidate.name }, after: { name }, phone_masked: maskPhone(candidate.phone as string) },
  });
  return ok({ updated: true });
});

export const DELETE = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id, cid } = await ctx.params;
  const client = getSupabaseClient();

  const { data: candidate, error: qErr } = await client
    .from('candidates')
    .select('*')
    .eq('id', cid)
    .eq('exam_id', id)
    .single();
  if (qErr || !candidate) return fail('人员不存在', 404);

  // 需求 8.8：已开考人员从名单移除时，不删除其答题和成绩记录
  const { error } = await client.from('candidates').delete().eq('id', cid);
  if (error) throw new Error(`删除失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'candidate_remove',
    targetType: 'candidate',
    targetId: cid,
    detail: { name: candidate.name, phone_masked: maskPhone(candidate.phone as string) },
  });
  return ok({ deleted: true });
});
