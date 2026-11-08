import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth';

export { maskPhone } from '@/lib/types';

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ code: 0, data }, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ code: 1, message, ...extra }, { status });
}

/** 统一包装 API handler：捕获 AuthError 与普通错误 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse | Response>
): (...args: Args) => Promise<NextResponse | Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status);
      }
      const message = err instanceof Error ? err.message : '服务器内部错误';
      console.error('[API Error]', err);
      return fail(message, 500);
    }
  };
}

/** 校验手机号格式（中国大陆 11 位） */
export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

/** 解析 Next.js 16 的异步 params */
export async function resolveId(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;
  return id;
}
