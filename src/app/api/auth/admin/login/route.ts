// 认证：管理员登录
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { checkRateLimit, createSession, SESSION_COOKIE, verifyPassword, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';

export const POST = withErrorHandling(async (request: Request): Promise<NextResponse> => {
  const body = (await request.json()) as { username?: string; password?: string };
  const username = (body.username ?? '').trim();
  const password = body.password ?? '';
  if (!username || !password) return fail('请输入账号和密码');

  const allowed = await checkRateLimit(`login:admin:${username}`, 8, 600);
  if (!allowed) return fail('尝试过于频繁，请 10 分钟后再试', 429);

  const client = getSupabaseClient();
  const { data: admin, error } = await client
    .from('admins')
    .select('*')
    .eq('username', username)
    .maybeSingle();
  if (error) throw new Error(`查询管理员失败: ${error.message}`);

  if (!admin || !verifyPassword(password, admin.password_hash as string)) {
    return fail('账号或密码错误', 401);
  }

  const token = await createSession({
    userType: 'admin',
    userId: admin.id as string,
    userName: admin.name as string,
  });

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.id as string,
    operatorName: admin.name as string,
    action: 'admin_login',
    targetType: 'admin',
    targetId: admin.id as string,
  });

  const res = ok({ name: admin.name, username: admin.username });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 3 * 24 * 3600,
  });
  return res;
});
