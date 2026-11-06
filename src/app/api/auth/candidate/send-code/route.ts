// 认证：考生发送验证码（演示环境直接返回验证码）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { checkRateLimit, generateCode } from '@/lib/auth';
import { fail, isValidPhone, ok, withErrorHandling } from '@/lib/api';

export const POST = withErrorHandling(async (request: Request): Promise<NextResponse> => {
  const body = (await request.json()) as { phone?: string };
  const phone = (body.phone ?? '').trim();
  if (!isValidPhone(phone)) return fail('手机号格式不正确');

  const allowed = await checkRateLimit(`sms:${phone}`, 5, 3600);
  if (!allowed) return fail('验证码发送过于频繁，请稍后再试', 429);

  // 同一手机号 60 秒内只能发一次
  const client = getSupabaseClient();
  const since = new Date(Date.now() - 60 * 1000).toISOString();
  const { data: recent, error: qErr } = await client
    .from('verification_codes')
    .select('id')
    .eq('phone', phone)
    .gt('created_at', since)
    .limit(1);
  if (qErr) throw new Error(`查询验证码失败: ${qErr.message}`);
  if (recent && recent.length > 0) return fail('验证码已发送，请 60 秒后再重新获取', 429);

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await client.from('verification_codes').insert({
    phone,
    code,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`保存验证码失败: ${error.message}`);

  // 演示环境：无短信通道，直接返回验证码并在页面提示
  return ok({ sent: true, dev_code: code, message: '演示模式：验证码已生成' });
});
