// 管理员账号管理（仅超级管理员）：列表 / 新增
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword, requireSuperAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';

export const GET = withErrorHandling(async (): Promise<NextResponse> => {
  await requireSuperAdmin();
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('admins')
    .select('id, username, name, role, created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`查询管理员列表失败: ${error.message}`);
  return ok(data ?? []);
});

export const POST = withErrorHandling(async (request: NextRequest): Promise<NextResponse> => {
  const session = await requireSuperAdmin();
  const body = (await request.json()) as { username?: string; password?: string; name?: string; role?: string };
  const username = (body.username ?? '').trim();
  const password = body.password ?? '';
  const name = (body.name ?? '').trim();
  const role = body.role === 'super' ? 'super' : 'normal';

  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,31}$/.test(username)) return fail('用户名需以字母开头，3-32 位字母/数字/下划线');
  if (!name || name.length > 32) return fail('请输入姓名（32 字以内）');
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) return fail('密码至少 8 位，需包含字母和数字');

  const client = getSupabaseClient();
  const { data: existing } = await client.from('admins').select('id').eq('username', username).maybeSingle();
  if (existing) return fail('用户名已存在');

  const { data, error } = await client
    .from('admins')
    .insert({ username, password_hash: hashPassword(password), name, role })
    .select('id, username, name, role, created_at')
    .single();
  if (error) throw new Error(`创建管理员失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: session.user_id,
    operatorName: session.user_name,
    action: 'admin_create',
    targetType: 'admin',
    targetId: data.id as string,
    detail: { username, name, role },
  });
  return ok(data);
});
