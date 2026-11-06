// 管理端：归档考试
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import { EXAM_STATUS } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();
  const { data: exam, error: eErr } = await client.from('exams').select('id, title, status').eq('id', id).single();
  if (eErr || !exam) return fail('考试不存在', 404);
  if (exam.status === EXAM_STATUS.ARCHIVED) return fail('考试已归档');

  const { error } = await client
    .from('exams')
    .update({ status: EXAM_STATUS.ARCHIVED, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`归档失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'exam_archive',
    targetType: 'exam',
    targetId: id,
    detail: { title: exam.title },
  });
  return ok({ archived: true });
});
