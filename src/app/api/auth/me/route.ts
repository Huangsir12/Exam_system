// 认证：获取当前会话信息
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api';

export const GET = withErrorHandling(async (): Promise<NextResponse> => {
  const session = await getSession();
  if (!session) return ok({ logged_in: false });
  return ok({
    logged_in: true,
    user_type: session.user_type,
    user_name: session.user_name,
    phone: session.phone,
  });
});
