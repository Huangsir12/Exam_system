import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SessionInfo } from '@/lib/types';

// 管理员与考生使用相互独立的会话 Cookie，保证同一浏览器双端共存、互不顶号
export const ADMIN_SESSION_COOKIE = 'exam_admin_session';
export const CANDIDATE_SESSION_COOKIE = 'exam_candidate_session';

/** 会话 Cookie 配置：HTTPS（含 iframe 嵌入预览）下需 SameSite=None; Secure 才会被浏览器接收与携带；HTTP 本地回退 Lax */
export function sessionCookieOptions(request: Request): {
  httpOnly: boolean;
  sameSite: 'lax' | 'none';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  const forwarded = request.headers.get('x-forwarded-proto') ?? '';
  const isHttps = forwarded === 'https' || request.url.startsWith('https://');
  return {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
    maxAge: 3 * 24 * 3600,
  };
}
export type SessionRole = 'admin' | 'candidate';

export function sessionCookieFor(role: SessionRole): string {
  return role === 'admin' ? ADMIN_SESSION_COOKIE : CANDIDATE_SESSION_COOKIE;
}

const SESSION_TTL_HOURS = 24 * 3; // 3 天

// ===================== 密码 =====================
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split(':');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const computed = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

// ===================== 会话 =====================
export async function createSession(params: {
  userType: 'admin' | 'candidate';
  userId: string;
  userName: string;
  phone?: string | null;
}): Promise<string> {
  const client = getSupabaseClient();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();
  const { error } = await client.from('sessions').insert({
    token,
    user_type: params.userType,
    user_id: params.userId,
    user_name: params.userName,
    phone: params.phone ?? null,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`创建会话失败: ${error.message}`);
  return token;
}

export async function getSession(role: SessionRole): Promise<SessionInfo | null> {
  // 双通道：优先 Authorization 系请求头（localStorage token，免疫第三方 cookie 拦截），回退 cookie
  const headerStore = await headers();
  const headerToken = headerStore.get(role === 'admin' ? 'x-admin-token' : 'x-candidate-token');
  const cookieStore = await cookies();
  const token = headerToken ?? cookieStore.get(sessionCookieFor(role))?.value;
  if (!token) return null;
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('sessions')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`查询会话失败: ${error.message}`);
  if (!data || data.user_type !== role) return null;
  return data as SessionInfo;
}

export async function requireAdmin(): Promise<SessionInfo> {
  const session = await getSession('admin');
  if (!session) {
    throw new AuthError('未登录或无管理员权限', 401);
  }
  return session;
}

export async function requireCandidate(): Promise<SessionInfo> {
  const session = await getSession('candidate');
  if (!session) {
    throw new AuthError('未登录或考生身份无效', 401);
  }
  return session;
}

/** 查询管理员角色（super / normal） */
export async function getAdminRole(adminId: string): Promise<string | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.from('admins').select('role').eq('id', adminId).maybeSingle();
  if (error) throw new Error(`查询管理员角色失败: ${error.message}`);
  return (data?.role as string) ?? null;
}

/** 超级管理员校验：仅 super 角色可管理管理员账号 */
export async function requireSuperAdmin(): Promise<SessionInfo> {
  const session = await requireAdmin();
  const role = await getAdminRole(session.user_id);
  if (role !== 'super') {
    throw new AuthError('仅超级管理员可执行此操作', 403);
  }
  return session;
}

export async function destroySession(role: SessionRole): Promise<void> {
  const headerStore = await headers();
  const headerToken = headerStore.get(role === 'admin' ? 'x-admin-token' : 'x-candidate-token');
  const cookieStore = await cookies();
  const token = headerToken ?? cookieStore.get(sessionCookieFor(role))?.value;
  if (!token) return;
  const client = getSupabaseClient();
  const { error } = await client.from('sessions').delete().eq('token', token);
  if (error) throw new Error(`销毁会话失败: ${error.message}`);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

// ===================== 频率限制 =====================
/** 固定窗口限流：返回 true 表示允许，false 表示被限制 */
export async function checkRateLimit(key: string, maxCount: number, windowSeconds: number): Promise<boolean> {
  const client = getSupabaseClient();
  const now = new Date();
  const { data, error } = await client.from('rate_limits').select('*').eq('key', key).maybeSingle();
  if (error) throw new Error(`限流查询失败: ${error.message}`);

  if (!data) {
    const { error: insErr } = await client.from('rate_limits').insert({ key, count: 1, window_start: now.toISOString() });
    if (insErr) throw new Error(`限流写入失败: ${insErr.message}`);
    return true;
  }

  const windowStart = new Date(data.window_start as string).getTime();
  const elapsed = (now.getTime() - windowStart) / 1000;
  if (elapsed > windowSeconds) {
    const { error: updErr } = await client
      .from('rate_limits')
      .update({ count: 1, window_start: now.toISOString() })
      .eq('key', key);
    if (updErr) throw new Error(`限流重置失败: ${updErr.message}`);
    return true;
  }

  const current = (data.count as number) ?? 0;
  if (current >= maxCount) return false;

  const { error: incErr } = await client
    .from('rate_limits')
    .update({ count: current + 1 })
    .eq('key', key);
  if (incErr) throw new Error(`限流计数失败: ${incErr.message}`);
  return true;
}

// ===================== 操作日志 =====================
export async function writeLog(params: {
  operatorType: 'admin' | 'candidate' | 'system';
  operatorId?: string;
  operatorName: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from('operation_logs').insert({
    operator_type: params.operatorType,
    operator_id: params.operatorId ?? '',
    operator_name: params.operatorName,
    action: params.action,
    target_type: params.targetType ?? '',
    target_id: params.targetId ?? '',
    detail: params.detail ?? null,
  });
  if (error) {
    // 日志失败不阻断主流程，但输出告警
    console.warn(`[operation_logs] 写入失败: ${error.message}`);
  }
}

// ===================== 验证码 =====================
export function generateCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}
