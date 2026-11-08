// 知识文档：上传（管理员）
import { NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import { DOCUMENT_STATUS } from '@/lib/types';

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_EXT = ['pdf', 'docx', 'txt', 'md'];

export const POST = withErrorHandling(async (request: Request): Promise<NextResponse> => {
  const admin = await requireAdmin();

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return fail('请选择要上传的文件');

  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    return fail(`不支持的文件格式，仅支持：${ALLOWED_EXT.join('、')}`);
  }
  if (file.size > MAX_SIZE) return fail('文件大小超过 20MB 限制');
  if (file.size === 0) return fail('文件内容为空');

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: process.env.COZE_BUCKET_ACCESS_KEY,
    secretKey: process.env.COZE_BUCKET_SECRET_KEY,
    bucketName: process.env.COZE_BUCKET_NAME,
    region: 'cn-beijing',
  });
  const fileKey = await storage.uploadFile({
    fileContent: buffer,
    fileName: `documents/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
    contentType: file.type || 'application/octet-stream',
  });

  const client = getSupabaseClient();
  const { data, error } = await client
    .from('documents')
    .insert({
      name: file.name,
      file_key: fileKey,
      file_type: ext,
      file_size: file.size,
      parse_status: DOCUMENT_STATUS.PENDING,
      uploaded_by: admin.user_name,
    })
    .select()
    .single();
  if (error) throw new Error(`保存文档记录失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'document_upload',
    targetType: 'document',
    targetId: data.id as string,
    detail: { name: file.name, size: file.size },
  });

  return ok(data);
});
