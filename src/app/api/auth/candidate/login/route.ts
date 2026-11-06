// 认证：考生登录（手机号 + 验证码 + 姓名匹配名单）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { checkRateLimit, createSession, SESSION_COOKIE, writeLog } from '@/lib/auth';
import { fail, isValidPhone, ok, withErrorHandling } from '@/lib/api';

export const POST = withErrorHandling(async (request: Request): Promise<NextResponse> => {
  const body = (await request.json()) as { name?: string; phone?: string; code?: string };
  const name = (body.name ?? '').trim();
  const phone = (body.phone ?? '').trim();
  const code = (body.code ?? '').trim();
  if (!name) return fail('请输入姓名');
  if (!isValidPhone(phone)) return fail('手机号格式不正确');
  if (!code) return fail('请输入验证码');

  const allowed = await checkRateLimit(`login:candidate:${phone}`, 10, 600);
  if (!allowed) return fail('尝试过于频繁，请 10 分钟后再试', 429);

  const client = getSupabaseClient();

  // 校验验证码
  const { data: codes, error: cErr } = await client
    .from('verification_codes')
    .select('*')
    .eq('phone', phone)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  if (cErr) throw new Error(`查询验证码失败: ${cErr.message}`);
  const codeRow = codes?.[0];
  if (!codeRow || codeRow.code !== code) return fail('验证码错误或已过期', 401);

  // 校验姓名 + 手机号是否匹配任一考试名单
  const { data: matches, error: mErr } = await client
    .from('candidates')
    .select('id, exam_id, name, phone')
    .eq('phone', phone);
  if (mErr) throw new Error(`查询名单失败: ${mErr.message}`);
  if (!matches || matches.length === 0) {
    return fail('该手机号不在任何考试名单中，请联系管理员', 403);
  }
  const matched = matches.filter((m) => (m.name as string).trim() === name);
  if (matched.length === 0) {
    return fail('姓名与手机号不匹配，请确认后重试', 403);
  }

  // 标记验证码已使用
  const { error: uErr } = await client
    .from('verification_codes')
    .update({ used: true })
    .eq('id', codeRow.id as string);
  if (uErr) throw new Error(`更新验证码失败: ${uErr.message}`);

  const token = await createSession({
    userType: 'candidate',
    userId: matched[0].id as string, // 主 candidate id；考试列表按手机号查询
    userName: name,
    phone,
  });

  await writeLog({
    operatorType: 'candidate',
    operatorId: matched[0].id as string,
    operatorName: name,
    action: 'candidate_login',
    targetType: 'candidate',
    targetId: matched[0].id as string,
  });

  const res = ok({ name, phone });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 3 * 24 * 3600,
  });
  return res;
});
