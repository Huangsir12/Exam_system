// 认证：登出（同时清除管理员与考生会话）
import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, CANDIDATE_SESSION_COOKIE, destroySession } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api';

export const POST = withErrorHandling(async (): Promise<NextResponse> => {
  await destroySession('admin');
  await destroySession('candidate');
  const res = ok({ loggedOut: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  res.cookies.set(CANDIDATE_SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
});
