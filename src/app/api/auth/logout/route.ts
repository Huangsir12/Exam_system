// 认证：登出
import { NextResponse } from 'next/server';
import { destroySession, SESSION_COOKIE } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api';

export const POST = withErrorHandling(async (): Promise<NextResponse> => {
  await destroySession();
  const res = ok({ loggedOut: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
});
