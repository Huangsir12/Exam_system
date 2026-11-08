// 知识文档：列表（管理员）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api';
import type { KnowledgeDocument } from '@/lib/types';

export const GET = withErrorHandling(async (): Promise<NextResponse> => {
  await requireAdmin();
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('documents')
    .select('id, name, file_key, file_type, file_size, parse_status, parse_error, chapters, usage_count, uploaded_by, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`查询文档列表失败: ${error.message}`);
  const docs = (data as Omit<KnowledgeDocument, 'content_text'>[]).map((d) => ({
    ...d,
    chapter_count: Array.isArray(d.chapters) ? d.chapters.length : 0,
  }));
  return ok(docs);
});
