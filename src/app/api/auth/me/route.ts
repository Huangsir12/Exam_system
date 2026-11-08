// 认证：获取当前会话信息（管理员与考生会话相互独立，分别返回）
import { NextResponse } from 'next/server';
import { getAdminRole, getSession } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api';

export const GET = withErrorHandling(async (): Promise<NextResponse> => {
  const [admin, candidate] = await Promise.all([getSession('admin'), getSession('candidate')]);
  const adminRole = admin ? await getAdminRole(admin.user_id) : null;
  return ok({
    logged_in: Boolean(admin || candidate),
    admin: admin ? { id: admin.user_id, user_name: admin.user_name, role: adminRole ?? 'normal' } : null,
    candidate: candidate ? { user_name: candidate.user_name, phone: candidate.phone } : null,
  });
});
