// 认证：考生登录（姓名 + 手机号；名单外用户可登录，但无法看到/进入未授权考试）
import { NextResponse } from 'next/server';
import { checkRateLimit, CANDIDATE_SESSION_COOKIE, createSession, sessionCookieOptions, writeLog } from '@/lib/auth';
import { fail, isValidPhone, ok, withErrorHandling } from '@/lib/api';

export const POST = withErrorHandling(async (request: Request): Promise<NextResponse> => {
  const body = (await request.json()) as { name?: string; phone?: string };
  const name = (body.name ?? '').trim();
  const phone = (body.phone ?? '').trim();
  if (!name) return fail('请输入姓名');
  if (!isValidPhone(phone)) return fail('手机号格式不正确');

  const allowed = await checkRateLimit(`login:candidate:${phone}`, 10, 600);
  if (!allowed) return fail('尝试过于频繁，请 10 分钟后再试', 429);

  // 不再校验名单：名单外用户也可登录，考试可见性由考试访问层按名单控制
  const token = await createSession({
    userType: 'candidate',
    userId: phone, // 考生以手机号为唯一标识；考试列表按手机号匹配名单
    userName: name,
    phone,
  });

  await writeLog({
    operatorType: 'candidate',
    operatorId: phone,
    operatorName: name,
    action: 'candidate_login',
    targetType: 'candidate',
    targetId: phone,
  });

  const res = ok({ name, phone, token });
  res.cookies.set(CANDIDATE_SESSION_COOKIE, token, sessionCookieOptions(request));
  return res;
});
