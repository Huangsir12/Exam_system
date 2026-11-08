// 管理员账号管理（仅超级管理员）：修改（姓名/角色/重置密码）/ 删除
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword, requireSuperAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (request: NextRequest, context: RouteContext): Promise<NextResponse> => {
  const session = await requireSuperAdmin();
  const { id } = await context.params;
  const body = (await request.json()) as { name?: string; role?: string; password?: string };

  const client = getSupabaseClient();
  const { data: target } = await client.from('admins').select('id, username, name, role').eq('id', id).maybeSingle();
  if (!target) return fail('管理员不存在', 404);

  const updates: Record<string, string> = {};
  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name || name.length > 32) return fail('请输入姓名（32 字以内）');
    updates.name = name;
  }
  if (typeof body.role === 'string') {
    if (!['super', 'normal'].includes(body.role)) return fail('非法角色');
    // 降级超管时保护：不能操作自己，且系统至少保留一名超管
    if (target.role === 'super' && body.role === 'normal') {
      if (target.id === session.user_id) return fail('不能降级自己的角色');
      const { count } = await client.from('admins').select('id', { count: 'exact', head: true }).eq('role', 'super');
      if ((count ?? 0) <= 1) return fail('系统至少保留一名超级管理员');
    }
    updates.role = body.role;
  }
  if (typeof body.password === 'string' && body.password) {
    if (body.password.length < 8 || !/[a-zA-Z]/.test(body.password) || !/\d/.test(body.password)) return fail('密码至少 8 位，需包含字母和数字');
    updates.password_hash = hashPassword(body.password);
  }
  if (Object.keys(updates).length === 0) return fail('没有需要更新的字段');

  const { error } = await client.from('admins').update(updates).eq('id', id);
  if (error) throw new Error(`更新管理员失败: ${error.message}`);

  // 重置密码或删除角色后，强制该管理员重新登录
  if (updates.password_hash) {
    await client.from('sessions').delete().eq('user_type', 'admin').eq('user_id', id);
  }

  await writeLog({
    operatorType: 'admin',
    operatorId: session.user_id,
    operatorName: session.user_name,
    action: 'admin_update',
    targetType: 'admin',
    targetId: id,
    detail: { username: target.username, fields: Object.keys(updates) },
  });
  return ok({ id, ...updates, password_hash: undefined });
});

export const DELETE = withErrorHandling(async (_request: NextRequest, context: RouteContext): Promise<NextResponse> => {
  const session = await requireSuperAdmin();
  const { id } = await context.params;

  if (id === session.user_id) return fail('不能删除自己的账号');

  const client = getSupabaseClient();
  const { data: target } = await client.from('admins').select('id, username, name, role').eq('id', id).maybeSingle();
  if (!target) return fail('管理员不存在', 404);

  if (target.role === 'super') {
    const { count } = await client.from('admins').select('id', { count: 'exact', head: true }).eq('role', 'super');
    if ((count ?? 0) <= 1) return fail('系统至少保留一名超级管理员');
  }

  const { error } = await client.from('admins').delete().eq('id', id);
  if (error) throw new Error(`删除管理员失败: ${error.message}`);
  // 同步清理该管理员的会话
  await client.from('sessions').delete().eq('user_type', 'admin').eq('user_id', id);

  await writeLog({
    operatorType: 'admin',
    operatorId: session.user_id,
    operatorName: session.user_name,
    action: 'admin_delete',
    targetType: 'admin',
    targetId: id,
    detail: { username: target.username, name: target.name },
  });
  return ok({ deleted: true });
});
