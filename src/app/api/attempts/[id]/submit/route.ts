// 答题：交卷（幂等 + 客观题自动评分）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireCandidate } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import { gradeObjective, isObjective, type SnapshotQuestion } from '@/lib/grading';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const session = await requireCandidate();
  const { id } = await ctx.params;
  const client = getSupabaseClient();

  const { data: attempt, error: aErr } = await client.from('attempts').select('*').eq('id', id).single();
  if (aErr || !attempt) return fail('答题记录不存在', 404);
  if (attempt.candidate_phone !== session.phone) return fail('无权操作该答题记录', 403);

  // 幂等：已提交直接返回现有结果（重复交卷不产生多条成绩）
  if (attempt.status !== 'in_progress') {
    return ok({
      attempt_id: attempt.id,
      status: attempt.status,
      total_score: attempt.total_score,
      objective_score: attempt.objective_score,
      grading_status: attempt.grading_status,
      duplicated: true,
    });
  }

  const { data: exam } = await client.from('exams').select('*').eq('id', attempt.exam_id).single();
  if (!exam) return fail('考试不存在', 404);

  const { data: answers } = await client.from('attempt_answers').select('*').eq('attempt_id', id);

  const now = new Date();
  const startedAt = new Date(attempt.started_at as string);
  const durationSeconds = Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000));

  let objectiveScore = 0;
  let hasEssay = false;

  // 逐题评分（以题目快照为准，母版后续修改不影响本次考试）
  for (const row of answers ?? []) {
    const snap = row.question_snapshot as SnapshotQuestion;
    const userAnswer = row.user_answer as string | string[] | boolean | null;
    const objective = isObjective(snap.type);

    if (objective) {
      const result = gradeObjective(snap, userAnswer);
      objectiveScore += result.score;
      await client
        .from('attempt_answers')
        .update({ score: result.score, is_correct: result.isCorrect, updated_at: now.toISOString() })
        .eq('id', row.id);
    } else {
      hasEssay = true;
      // 简答题待人工阅卷：score 置空
      await client
        .from('attempt_answers')
        .update({ score: null, is_correct: null, updated_at: now.toISOString() })
        .eq('id', row.id);
    }
  }

  const gradingStatus = hasEssay ? 'pending' : 'completed';
  const status = hasEssay ? 'grading' : 'completed';
  const totalScore = hasEssay ? objectiveScore : objectiveScore; // 有主观题时暂为客观分，阅卷完成后更新
  const passScore = Number(exam.pass_score ?? 0);
  const isPassed = hasEssay ? null : objectiveScore >= passScore;

  // 乐观锁：仅当仍是 in_progress 时才更新，防止并发重复交卷
  const { data: updated, error: upErr } = await client
    .from('attempts')
    .update({
      status,
      submitted_at: now.toISOString(),
      duration_seconds: durationSeconds,
      objective_score: objectiveScore,
      subjective_score: 0,
      total_score: totalScore,
      is_passed: isPassed,
      grading_status: gradingStatus,
      updated_at: now.toISOString(),
    })
    .eq('id', id)
    .eq('status', 'in_progress')
    .select('id');
  if (upErr) throw new Error(`交卷失败: ${upErr.message}`);
  if (!updated || updated.length === 0) {
    // 已被其他请求提交
    return ok({ attempt_id: id, duplicated: true, status: 'submitted' });
  }

  return ok({
    attempt_id: id,
    status,
    total_score: hasEssay ? null : totalScore,
    objective_score: objectiveScore,
    grading_status: gradingStatus,
    duplicated: false,
  });
});
