// 考生端：查看成绩与解析（按考试公开规则过滤）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireCandidate } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import type { SnapshotQuestion } from '@/lib/grading';
import type { Attempt, PaperSnapshotItem } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const session = await requireCandidate();
  const { id } = await ctx.params;
  const client = getSupabaseClient();

  const { data: attempt, error: aErr } = await client.from('attempts').select('*').eq('id', id).single();
  if (aErr || !attempt) return fail('答题记录不存在', 404);
  if (attempt.candidate_phone !== session.phone) return fail('无权查看该成绩', 403);
  const a = attempt as Attempt;
  if (a.status === 'in_progress') return fail('考试尚未交卷', 400);

  const { data: exam } = await client.from('exams').select('*').eq('id', a.exam_id).single();
  if (!exam) return fail('考试不存在', 404);

  // 阅卷中
  if (a.grading_status === 'pending') {
    return ok({
      view: 'grading',
      message: '试卷阅卷中，成绩将在阅卷完成后公布',
      exam_title: exam.title,
      submitted_at: a.submitted_at,
    });
  }

  // 成绩公开规则
  const visibility = exam.result_visibility as string;
  const now = new Date();
  const visible =
    visibility === 'immediate' ||
    (visibility === 'after_end' && exam.end_time && now > new Date(exam.end_time as string)) ||
    (visibility === 'manual' && exam.result_published === true);

  if (!visible) {
    return ok({
      view: 'hidden',
      message: visibility === 'manual' ? '成绩将由管理员统一发布' : '成绩将在考试结束后公布',
      exam_title: exam.title,
      submitted_at: a.submitted_at,
    });
  }

  // 组装逐题详情（全部基于答题快照，防止考生通过接口获取未公开信息）
  const snapshot = a.paper_snapshot as PaperSnapshotItem[];
  const { data: answers } = await client.from('attempt_answers').select('*').eq('attempt_id', id);
  const answerMap = new Map((answers ?? []).map((ans) => [ans.question_id as string, ans]));

  const showAnswer = exam.show_answer as boolean;
  const showAnalysis = exam.show_analysis as boolean;
  const showSource = exam.show_source as boolean;

  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  const items = snapshot
    .map((snapItem) => {
      const answerRow = answerMap.get(snapItem.question_id);
      if (!answerRow) return null;
      const snap = answerRow.question_snapshot as SnapshotQuestion;

      const userAnswer = (answerRow.user_answer ?? null) as string | string[] | boolean | null;
      const unanswered =
        userAnswer === null ||
        userAnswer === '' ||
        (Array.isArray(userAnswer) && userAnswer.every((v) => !String(v).trim()));
      if (unanswered) unansweredCount += 1;
      else if (answerRow.is_correct === true) correctCount += 1;
      else if (answerRow.is_correct === false) wrongCount += 1;

      // 标准答案（快照中的答案已是展示 key；judge 转为文字）
      let standardAnswer: unknown = null;
      if (showAnswer) {
        if (snap.type === 'judge') standardAnswer = snap.answer === true ? '正确' : '错误';
        else if (snap.type === 'fill' && Array.isArray(snap.answer)) {
          standardAnswer = (snap.answer as string[][]).map((g) => g[0] ?? '');
        } else if (snap.type === 'essay') {
          const ea = snap.answer as { reference?: string; points?: string[] };
          standardAnswer = { reference: ea?.reference ?? '', points: ea?.points ?? [] };
        } else {
          standardAnswer = snap.answer;
        }
      }

      return {
        sort: snapItem.sort_order,
        question_id: snapItem.question_id,
        type: snap.type,
        content: snap.content,
        options: snap.options,
        score: snap.score,
        my_answer: userAnswer,
        my_score: answerRow.score ?? null,
        is_correct: answerRow.is_correct ?? null,
        grader_comment: answerRow.grader_comment ?? null,
        standard_answer: standardAnswer,
        analysis: showAnalysis ? snap.analysis : null,
        source: showSource
          ? {
              document_name: snap.source_document_name,
              location: snap.source_location,
              excerpt: snap.source_excerpt,
            }
          : null,
      };
    })
    .filter((x) => x !== null);

  // 题型得分汇总
  const typeStats: Record<string, { total: number; earned: number }> = {};
  for (const item of items) {
    const t = item.type as string;
    if (!typeStats[t]) typeStats[t] = { total: 0, earned: 0 };
    typeStats[t].total += Number(item.score);
    typeStats[t].earned += Number(item.my_score ?? 0);
  }

  return ok({
    view: 'result',
    exam_title: exam.title,
    total_score: a.total_score,
    objective_score: a.objective_score,
    subjective_score: a.subjective_score,
    pass_score: exam.pass_score,
    is_passed: a.is_passed,
    started_at: a.started_at,
    submitted_at: a.submitted_at,
    duration_seconds: a.duration_seconds,
    correct_count: correctCount,
    wrong_count: wrongCount,
    unanswered_count: unansweredCount,
    type_stats: typeStats,
    show_answer: showAnswer,
    show_analysis: showAnalysis,
    show_source: showSource,
    items,
  });
});
