// 管理端：人工阅卷打分（单题），分数以题目快照分值为准
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import type { SnapshotQuestion } from '@/lib/grading';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params; // exam id
  const body = (await request.json()) as { answer_id?: string; score?: number; comment?: string };
  if (!body.answer_id) return fail('参数缺失');
  if (typeof body.score !== 'number' || !Number.isFinite(body.score)) return fail('分数无效');

  const client = getSupabaseClient();
  const { data: answer, error: aErr } = await client
    .from('attempt_answers')
    .select('*')
    .eq('id', body.answer_id)
    .single();
  if (aErr || !answer) return fail('答题记录不存在', 404);

  const snap = answer.question_snapshot as SnapshotQuestion;
  if (!snap) return fail('题目快照缺失', 500);

  // 校验 attempt 归属本考试
  const { data: attemptRow } = await client.from('attempts').select('*').eq('id', answer.attempt_id).single();
  if (!attemptRow || attemptRow.exam_id !== id) return fail('数据不匹配', 400);

  const maxScore = snap.score;
  const score = Math.round(body.score * 100) / 100;
  if (score < 0) return fail('评分不得低于 0 分');
  if (score > maxScore) return fail(`评分不得超过题目分值 ${maxScore} 分`);

  const now = new Date().toISOString();
  const { error } = await client
    .from('attempt_answers')
    .update({
      score,
      is_correct: score >= maxScore * 0.6,
      grader_comment: (body.comment ?? '').trim(),
      graded_by: admin.user_name,
      graded_at: now,
      updated_at: now,
    })
    .eq('id', body.answer_id);
  if (error) throw new Error(`保存评分失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'manual_grade',
    targetType: 'answer',
    targetId: body.answer_id,
    detail: { score, comment: body.comment ?? '', max_score: maxScore },
  });

  // 检查该 attempt 是否所有简答题都已阅完 → 汇总成绩
  const attemptId = answer.attempt_id as string;
  const { data: allAnswers } = await client.from('attempt_answers').select('*').eq('attempt_id', attemptId);
  const essayAnswers = (allAnswers ?? []).filter((x) => (x.question_snapshot as SnapshotQuestion)?.type === 'essay');
  const allGraded = essayAnswers.every((x) => x.score !== null && x.score !== undefined);
  if (allGraded) {
    const subjectiveScore = Math.round(essayAnswers.reduce((s: number, x) => s + Number(x.score ?? 0), 0) * 100) / 100;
    const objectiveScore = Number(attemptRow.objective_score ?? 0);
    const totalScore = Math.round((objectiveScore + subjectiveScore) * 100) / 100;
    const { data: examRow } = await client.from('exams').select('pass_score').eq('id', attemptRow.exam_id).single();
    await client
      .from('attempts')
      .update({
        subjective_score: subjectiveScore,
        total_score: totalScore,
        is_passed: totalScore >= Number(examRow?.pass_score ?? 0),
        grading_status: 'completed',
        status: 'completed',
        updated_at: now,
      })
      .eq('id', attemptId);
  }

  return ok({ graded: true, all_graded: allGraded });
});
