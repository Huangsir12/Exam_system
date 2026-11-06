// 管理端：查看考生完整答卷（含答案解析）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth';
import { fail, maskPhone, ok, withErrorHandling } from '@/lib/api';
import type { SnapshotQuestion } from '@/lib/grading';
import type { Attempt, PaperSnapshotItem } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();

  const { data: attempt, error: aErr } = await client.from('attempts').select('*').eq('id', id).single();
  if (aErr || !attempt) return fail('答题记录不存在', 404);
  const a = attempt as Attempt;

  const { data: exam } = await client.from('exams').select('id, title, total_score, pass_score').eq('id', a.exam_id).single();

  const snapshot = a.paper_snapshot as PaperSnapshotItem[];
  const { data: answers } = await client.from('attempt_answers').select('*').eq('attempt_id', id);
  const answerMap = new Map((answers ?? []).map((ans) => [ans.question_id as string, ans]));

  const items = snapshot
    .map((snapItem) => {
      const answerRow = answerMap.get(snapItem.question_id);
      if (!answerRow) return null;
      const snap = answerRow.question_snapshot as SnapshotQuestion;

      let standardAnswer: unknown;
      if (snap.type === 'judge') standardAnswer = snap.answer === true ? '正确' : '错误';
      else if (snap.type === 'fill' && Array.isArray(snap.answer)) {
        standardAnswer = (snap.answer as string[][]).map((g) => g.join(' / '));
      } else {
        standardAnswer = snap.answer;
      }

      return {
        answer_id: answerRow.id,
        sort: snapItem.sort_order,
        question_id: snapItem.question_id,
        type: snap.type,
        content: snap.content,
        options: snap.options,
        score: snap.score,
        difficulty: snap.difficulty,
        knowledge_point: snap.knowledge_point,
        my_answer: answerRow.user_answer ?? null,
        my_score: answerRow.score ?? null,
        is_correct: answerRow.is_correct ?? null,
        grader_comment: answerRow.grader_comment ?? null,
        graded_by: answerRow.graded_by ?? null,
        standard_answer: standardAnswer,
        analysis: snap.analysis,
        source_document_name: snap.source_document_name,
        source_location: snap.source_location,
        source_excerpt: snap.source_excerpt,
      };
    })
    .filter((x) => x !== null);

  return ok({
    attempt: {
      id: a.id,
      candidate_name: a.candidate_name,
      phone_masked: maskPhone(a.candidate_phone),
      status: a.status,
      started_at: a.started_at,
      submitted_at: a.submitted_at,
      duration_seconds: a.duration_seconds,
      objective_score: a.objective_score,
      subjective_score: a.subjective_score,
      total_score: a.total_score,
      is_passed: a.is_passed,
      grading_status: a.grading_status,
    },
    exam,
    items,
  });
});
