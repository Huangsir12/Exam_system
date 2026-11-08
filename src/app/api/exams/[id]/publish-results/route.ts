// 管理端：手动发布成绩（result_visibility=manual 时生效）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();
  const { data: exam, error: eErr } = await client.from('exams').select('id, title, result_published').eq('id', id).single();
  if (eErr || !exam) return fail('考试不存在', 404);

  const next = !exam.result_published;
  const { error } = await client
    .from('exams')
    .update({ result_published: next, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`操作失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: next ? 'results_publish' : 'results_unpublish',
    targetType: 'exam',
    targetId: id,
    detail: { title: exam.title },
  });
  return ok({ result_published: next });
});
