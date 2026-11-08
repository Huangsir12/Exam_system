// 试题：批量排序（管理员）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = (await request.json()) as { question_ids?: string[] };
  if (!Array.isArray(body.question_ids) || body.question_ids.length === 0) return fail('参数无效');

  const client = getSupabaseClient();
  for (let i = 0; i < body.question_ids.length; i++) {
    const { error } = await client
      .from('questions')
      .update({ sort_order: i + 1, updated_at: new Date().toISOString() })
      .eq('id', body.question_ids[i])
      .eq('exam_id', id);
    if (error) throw new Error(`排序失败: ${error.message}`);
  }

  // 题序调整后固定试卷需重新确认
  await client.from('exams').update({ confirmed_at: null, updated_at: new Date().toISOString() }).eq('id', id);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'question_reorder',
    targetType: 'exam',
    targetId: id,
    detail: { count: body.question_ids.length },
  });
  return ok({ reordered: true });
});
