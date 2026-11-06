// 试题：列表 / 手动新增（管理员）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import { EXAM_STATUS, QUESTION_TYPES, type QuestionType } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('questions')
    .select('*')
    .eq('exam_id', id)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`查询试题失败: ${error.message}`);
  return ok(data);
});

export const POST = withErrorHandling(async (request: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = (await request.json()) as {
    type?: QuestionType;
    content?: string;
    options?: { key: string; text: string }[] | null;
    answer?: string | string[] | boolean | string[][] | { reference: string; points: string[] } | null;
    analysis?: string;
    score?: number;
    difficulty?: string;
    knowledge_point?: string;
    source_location?: string;
    source_excerpt?: string;
  };

  if (!body.type || !QUESTION_TYPES.includes(body.type)) return fail('题型无效');
  if (!body.content?.trim()) return fail('题干不能为空');
  if (!body.score || body.score <= 0) return fail('分值必须大于 0');

  const client = getSupabaseClient();
  const { data: exam, error: eErr } = await client.from('exams').select('status').eq('id', id).single();
  if (eErr || !exam) return fail('考试不存在', 404);
  if ([EXAM_STATUS.ONGOING, EXAM_STATUS.ENDED, EXAM_STATUS.ARCHIVED].includes(exam.status as never)) {
    return fail('考试已开考，不允许新增题目');
  }

  const { data: maxRow } = await client
    .from('questions')
    .select('sort_order')
    .eq('exam_id', id)
    .order('sort_order', { ascending: false })
    .limit(1);
  const nextOrder = ((maxRow?.[0]?.sort_order as number) ?? 0) + 1;

  const { data, error } = await client
    .from('questions')
    .insert({
      exam_id: id,
      type: body.type,
      content: body.content.trim(),
      options: body.options ?? null,
      answer: body.answer ?? null,
      analysis: body.analysis?.trim() ?? '',
      score: body.score,
      difficulty: body.difficulty ?? 'medium',
      knowledge_point: body.knowledge_point?.trim() ?? '',
      source_location: body.source_location?.trim() ?? '',
      source_excerpt: body.source_excerpt?.trim() ?? '',
      sort_order: nextOrder,
    })
    .select()
    .single();
  if (error) throw new Error(`新增题目失败: ${error.message}`);

  // 重算总分；题目变更后固定试卷需重新确认
  const { data: qs } = await client.from('questions').select('score').eq('exam_id', id);
  const totalScore = (qs ?? []).reduce((s: number, q) => s + (q.score as number), 0);
  await client.from('exams').update({ total_score: totalScore, confirmed_at: null, updated_at: new Date().toISOString() }).eq('id', id);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'question_create',
    targetType: 'exam',
    targetId: id,
    detail: { question_id: data.id, type: body.type },
  });
  return ok(data);
});
