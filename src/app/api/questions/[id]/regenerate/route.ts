// 试题：单题重新生成（管理员）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import { EXAM_STATUS, type KnowledgeDocument, type Question, type QuestionType } from '@/lib/types';
import { generateQuestionBatch } from '@/lib/generator';
import { splitIntoChunks } from '@/lib/docparse';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();

  const { data: question, error: qErr } = await client.from('questions').select('*').eq('id', id).single();
  if (qErr || !question) return fail('题目不存在', 404);
  const q = question as Question;

  const { data: exam, error: eErr } = await client.from('exams').select('*').eq('id', q.exam_id).single();
  if (eErr || !exam) return fail('考试不存在', 404);
  if ([EXAM_STATUS.ONGOING, EXAM_STATUS.ENDED, EXAM_STATUS.ARCHIVED].includes(exam.status as never)) {
    return fail('考试已开考，不允许重新生成题目');
  }

  const documentIds = (exam.document_ids as string[]) ?? [];
  const { data: docs } = await client.from('documents').select('*').in('id', documentIds);
  const parsedDocs = ((docs ?? []) as KnowledgeDocument[]).filter((d) => d.parse_status === 'success' && d.content_text);
  if (parsedDocs.length === 0) return fail('知识文档不可用');

  const chunks: { title: string; text: string; docName: string }[] = [];
  for (const doc of parsedDocs.slice(0, 3)) {
    const text = doc.content_text ?? '';
    if (!text) continue;
    const cs = splitIntoChunks(text, Array.isArray(doc.chapters) ? doc.chapters : null);
    for (const c of cs.slice(0, 4)) chunks.push({ title: c.title, text: c.text.slice(0, 2000), docName: doc.name });
  }

  const generated = await generateQuestionBatch(q.type as QuestionType, 1, Number(q.score), q.difficulty as 'easy' | 'medium' | 'hard', chunks);
  const newQ = generated[0];
  if (!newQ) return fail('重新生成失败，请重试', 500);

  const { error } = await client
    .from('questions')
    .update({
      content: newQ.content,
      options: newQ.options,
      answer: newQ.answer,
      analysis: newQ.analysis,
      difficulty: newQ.difficulty,
      knowledge_point: newQ.knowledge_point,
      source_location: newQ.source_location,
      source_excerpt: newQ.source_excerpt,
      source_document_name: parsedDocs[0].name,
      source_document_id: parsedDocs[0].id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`保存失败: ${error.message}`);

  // 题目变更后固定试卷需重新确认
  await client.from('exams').update({ confirmed_at: null, updated_at: new Date().toISOString() }).eq('id', q.exam_id);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'question_regenerate',
    targetType: 'question',
    targetId: id,
    detail: { before: { content: q.content.slice(0, 100) }, after: { content: newQ.content.slice(0, 100) } },
  });

  const { data: updated } = await client.from('questions').select('*').eq('id', id).single();
  return ok(updated);
});
