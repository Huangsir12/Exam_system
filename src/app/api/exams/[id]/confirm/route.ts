// 固定试卷：管理员确认试卷（确认后方可发布）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import { EXAM_STATUS, normalizePaperMode } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();

  const { data: exam, error: eErr } = await client.from('exams').select('*').eq('id', id).single();
  if (eErr || !exam) return fail('考试不存在', 404);

  if (normalizePaperMode(exam.paper_mode as string) !== 'fixed') {
    return fail('仅固定试卷需要确认；随机试卷无需确认');
  }
  if (exam.status !== EXAM_STATUS.DRAFT && exam.status !== EXAM_STATUS.PENDING) {
    return fail('考试已发布，无需确认');
  }

  const { count } = await client.from('questions').select('id', { count: 'exact', head: true }).eq('exam_id', id);
  if (!count || count === 0) return fail('试卷尚未生成题目，无法确认');

  const now = new Date().toISOString();
  const { error } = await client.from('exams').update({ confirmed_at: now, updated_at: now }).eq('id', id);
  if (error) throw new Error(`确认失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'exam_confirm',
    targetType: 'exam',
    targetId: id,
    detail: { title: exam.title, question_count: count },
  });

  return ok({ confirmed: true, confirmed_at: now });
});
