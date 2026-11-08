// 知识文档：下载签名 URL（管理员）
import { NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();
  const { data: doc, error } = await client.from('documents').select('file_key, name').eq('id', id).single();
  if (error || !doc) return fail('文档不存在', 404);

  const storage = new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: process.env.COZE_BUCKET_ACCESS_KEY,
    secretKey: process.env.COZE_BUCKET_SECRET_KEY,
    bucketName: process.env.COZE_BUCKET_NAME,
    region: 'cn-beijing',
  });
  const url = await storage.generatePresignedUrl({ key: doc.file_key as string, expireTime: 600 });
  return ok({ url, name: doc.name });
});
