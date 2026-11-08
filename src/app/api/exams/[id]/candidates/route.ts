// 参考名单：列表（脱敏）/ 逐条新增（管理员）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, isValidPhone, maskPhone, ok, withErrorHandling } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('candidates')
    .select('id, exam_id, name, phone, import_batch, created_at')
    .eq('exam_id', id)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`查询名单失败: ${error.message}`);
  const list = (data ?? []).map((c) => ({
    ...c,
    phone_masked: maskPhone(c.phone as string),
  }));
  return ok(list);
});

export const POST = withErrorHandling(async (request: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = (await request.json()) as { name?: string; phone?: string };
  const name = (body.name ?? '').trim();
  const phone = (body.phone ?? '').trim();
  if (!name) return fail('姓名不能为空');
  if (!isValidPhone(phone)) return fail('手机号格式不正确');

  const client = getSupabaseClient();
  const { data: dup } = await client.from('candidates').select('id').eq('exam_id', id).eq('phone', phone).limit(1);
  if (dup && dup.length > 0) return fail('该手机号已在名单中');

  const batch = `manual-${Date.now()}`;
  const { data, error } = await client
    .from('candidates')
    .insert({ exam_id: id, name, phone, import_batch: batch })
    .select('id, exam_id, name, phone, import_batch, created_at')
    .single();
  if (error) throw new Error(`新增失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'candidate_add',
    targetType: 'exam',
    targetId: id,
    detail: { name, phone_masked: maskPhone(phone) },
  });
  return ok({ ...data, phone_masked: maskPhone(phone) });
});
