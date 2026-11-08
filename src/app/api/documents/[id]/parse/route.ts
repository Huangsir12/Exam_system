// 知识文档：触发解析（管理员）
import { NextResponse } from 'next/server';
import { S3Storage, FetchClient } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import { DOCUMENT_STATUS } from '@/lib/types';
import { extractChapters } from '@/lib/docparse';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();

  const { data: doc, error: qErr } = await client.from('documents').select('*').eq('id', id).single();
  if (qErr || !doc) return fail('文档不存在', 404);

  // 标记解析中
  await client
    .from('documents')
    .update({ parse_status: DOCUMENT_STATUS.PARSING, parse_error: null, updated_at: new Date().toISOString() })
    .eq('id', id);

  try {
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: process.env.COZE_BUCKET_ACCESS_KEY,
      secretKey: process.env.COZE_BUCKET_SECRET_KEY,
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });
    const signedUrl = await storage.generatePresignedUrl({ key: doc.file_key as string, expireTime: 600 });

    const fetchClient = new FetchClient();
    const result = await fetchClient.fetch(signedUrl);

    if (result.status_code && result.status_code >= 400) {
      throw new Error(`文档解析服务返回错误（${result.status_code}）`);
    }
    const contentText = (result.content ?? [])
      .filter((item) => item.type === 'text' && item.text)
      .map((item) => item.text)
      .join('\n')
      .trim();
    if (!contentText) {
      throw new Error('未能从文档中提取到文本内容');
    }

    const chapters = extractChapters(contentText);
    const { error: upErr } = await client
      .from('documents')
      .update({
        parse_status: DOCUMENT_STATUS.SUCCESS,
        content_text: contentText,
        chapters,
        parse_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (upErr) throw new Error(`保存解析结果失败: ${upErr.message}`);

    await writeLog({
      operatorType: 'admin',
      operatorId: admin.user_id,
      operatorName: admin.user_name,
      action: 'document_parse',
      targetType: 'document',
      targetId: id,
      detail: { name: doc.name, content_length: contentText.length, chapters: chapters.length },
    });

    return ok({ parse_status: DOCUMENT_STATUS.SUCCESS, content_length: contentText.length, chapter_count: chapters.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : '解析失败';
    await client
      .from('documents')
      .update({ parse_status: DOCUMENT_STATUS.FAILED, parse_error: message, updated_at: new Date().toISOString() })
      .eq('id', id);
    return fail(`解析失败：${message}`, 500);
  }
});
