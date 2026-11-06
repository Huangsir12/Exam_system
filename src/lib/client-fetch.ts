// 前端 API 请求封装：自动携带 localStorage 中的会话 token（双通道认证的主通道）。
// 背景：预览页可能运行在嵌入上下文中，第三方 cookie 会被浏览器拦截导致会话丢失；
// 因此登录响应同时下发 token，前端存储后在每次请求通过 x-admin-token / x-candidate-token 头携带。
'use client';

const ADMIN_TOKEN_KEY = 'exam_admin_token';
const CANDIDATE_TOKEN_KEY = 'exam_candidate_token';

export function saveClientToken(kind: 'admin' | 'candidate', token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(kind === 'admin' ? ADMIN_TOKEN_KEY : CANDIDATE_TOKEN_KEY, token);
}

export function clearClientToken(kind: 'admin' | 'candidate'): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(kind === 'admin' ? ADMIN_TOKEN_KEY : CANDIDATE_TOKEN_KEY);
}

export function getClientToken(kind: 'admin' | 'candidate'): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(kind === 'admin' ? ADMIN_TOKEN_KEY : CANDIDATE_TOKEN_KEY);
}

/** 与 fetch 同签名；自动附加两个角色 token 头（存在才带），服务端按角色读取对应头 */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const adminToken = getClientToken('admin');
  const candidateToken = getClientToken('candidate');
  if (adminToken && !headers.has('x-admin-token')) headers.set('x-admin-token', adminToken);
  if (candidateToken && !headers.has('x-candidate-token')) headers.set('x-candidate-token', candidateToken);
  return fetch(input, { ...init, headers });
}
