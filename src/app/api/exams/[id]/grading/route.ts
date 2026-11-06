// 管理端：待阅卷列表（简答题，基于答题快照）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth';
import { fail, maskPhone, ok, withErrorHandling } from '@/lib/api';
import type { SnapshotQuestion } from '@/lib/grading';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();

  const { data: exam, error: eErr } = await client.from('exams').select('id, title, pass_score').eq('id', id).single();
  if (eErr || !exam) return fail('考试不存在', 404);

  // 待阅卷的 attempts（grading_status = pending）
  const { data: attempts, error: aErr } = await client
    .from('attempts')
    .select('*')
    .eq('exam_id', id)
    .eq('grading_status', 'pending')
    .order('submitted_at', { ascending: true });
  if (aErr) throw new Error(`查询失败: ${aErr.message}`);

  const items = [];
  for (const a of attempts ?? []) {
    const { data: answers } = await client.from('attempt_answers').select('*').eq('attempt_id', a.id);
    const essays = (answers ?? [])
      .filter((ans) => {
        const snap = ans.question_snapshot as SnapshotQuestion;
        return snap?.type === 'essay';
      })
      .sort((x, y) => {
        const sx = (x.question_snapshot as SnapshotQuestion).sort ?? 0;
        const sy = (y.question_snapshot as SnapshotQuestion).sort ?? 0;
        return sx - sy;
      })
      .map((ans) => {
        const snap = ans.question_snapshot as SnapshotQuestion;
        const ea = snap.answer as { reference?: string; points?: string[] };
        return {
          answer_id: ans.id,
          question_id: ans.question_id,
          content: snap.content,
          reference: ea?.reference ?? '',
          points: ea?.points ?? [],
          analysis: snap.analysis,
          source_excerpt: snap.source_excerpt,
          score: snap.score,
          my_answer: (ans.user_answer as string | null) ?? null,
          graded: ans.score !== null && ans.score !== undefined,
          graded_score: ans.score ?? null,
          grader_comment: ans.grader_comment ?? null,
        };
      });

    items.push({
      attempt_id: a.id,
      candidate_name: a.candidate_name,
      phone_masked: maskPhone(a.candidate_phone as string),
      submitted_at: a.submitted_at,
      objective_score: a.objective_score,
      essay_count: essays.length,
      graded_count: essays.filter((e) => e.graded).length,
      essays,
    });
  }

  return ok({ exam, items });
});
