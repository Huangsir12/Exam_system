import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const MAX_PAGE_SIZE = 100;
const ALLOWED_CATEGORIES = new Set(['admin', 'candidate', 'document', 'exam', 'question']);
const ALLOWED_OPERATOR_TYPES = new Set(['admin', 'candidate', 'system']);

export const GET = withErrorHandling(async (request: NextRequest): Promise<NextResponse> => {
  await requireAdmin();
  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(10, Number.parseInt(request.nextUrl.searchParams.get('page_size') ?? '30', 10) || 30));
  const category = request.nextUrl.searchParams.get('category') ?? '';
  const operatorType = request.nextUrl.searchParams.get('operator_type') ?? '';
  const operatorName = (request.nextUrl.searchParams.get('operator_name') ?? '').trim().slice(0, 64);
  const from = (page - 1) * pageSize;

  const client = getSupabaseClient();
  let query = client
    .from('operation_logs')
    .select('id, operator_type, operator_name, action, target_type, target_id, detail, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (category === 'exam') {
    query = query.or('action.like.exam_%,action.eq.manual_grade,action.eq.publish_results,action.eq.export');
  } else if (ALLOWED_CATEGORIES.has(category)) {
    query = query.like('action', `${category}_%`);
  }
  if (ALLOWED_OPERATOR_TYPES.has(operatorType)) query = query.eq('operator_type', operatorType);
  if (operatorName) query = query.ilike('operator_name', `%${operatorName}%`);

  const { data, count, error } = await query.range(from, from + pageSize - 1);

  if (error) throw new Error(`查询操作日志失败: ${error.message}`);

  return ok({
    items: data ?? [],
    total: count ?? 0,
    page,
    page_size: pageSize,
  });
});
