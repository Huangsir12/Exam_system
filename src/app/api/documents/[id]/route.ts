// 知识文档：详情 / 重命名 / 删除（管理员）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const full = new URL(req.url).searchParams.get('full') === '1';
  const client = getSupabaseClient();
  const { data, error } = await client.from('documents').select('*').eq('id', id).single();
  if (error || !data) return fail('文档不存在', 404);
  const contentText = (data.content_text as string) ?? '';
  if (full) {
    return ok({ ...data, content_text: contentText });
  }
  // 默认返回预览，避免大文本拖慢列表
  return ok({
    ...data,
    content_text: undefined,
    content_length: contentText.length,
    content_preview: contentText.slice(0, 2000),
  });
});

export const PATCH = withErrorHandling(async (request: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = (await request.json()) as { name?: string };
  const name = (body.name ?? '').trim();
  if (!name) return fail('文档名称不能为空');

  const client = getSupabaseClient();
  const { data: doc, error: qErr } = await client.from('documents').select('name').eq('id', id).single();
  if (qErr || !doc) return fail('文档不存在', 404);

  const { error } = await client
    .from('documents')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`重命名失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'document_rename',
    targetType: 'document',
    targetId: id,
    detail: { before: { name: doc.name }, after: { name } },
  });
  return ok({ id, name });
});

export const DELETE = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();

  const { data: doc, error: qErr } = await client.from('documents').select('*').eq('id', id).single();
  if (qErr || !doc) return fail('文档不存在', 404);

  // 检查引用（题目快照已保存原文，删除文档不影响历史试卷）
  const { count } = await client
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('source_document_id', id);

  const { error } = await client.from('documents').delete().eq('id', id);
  if (error) throw new Error(`删除失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'document_delete',
    targetType: 'document',
    targetId: id,
    detail: { name: doc.name, referenced_questions: count ?? 0 },
  });
  return ok({ deleted: true, referenced_questions: count ?? 0 });
});
