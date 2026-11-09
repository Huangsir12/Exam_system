// 答题：开始考试 / 恢复进行中的考试（考生）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireCandidate } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import { buildPaperSnapshot, buildQuestionSnapshots, type SnapshotQuestion } from '@/lib/grading';
import { EXAM_STATUS, normalizePaperMode, type PaperSnapshotItem, type Question, type QuestionConfigItem } from '@/lib/types';

/** 返回给考生的安全题目视图（剥离答案与解析） */
function toPublicQuestion(snap: SnapshotQuestion, sort: number) {
  return {
    question_id: snap.id,
    sort,
    type: snap.type,
    content: snap.content,
    options: snap.options,
    score: snap.score,
  };
}

export const POST = withErrorHandling(async (request: Request): Promise<NextResponse> => {
  const session = await requireCandidate();
  const body = (await request.json()) as { exam_id?: string };
  const examId = body.exam_id ?? '';
  if (!examId) return fail('参数缺失');

  const client = getSupabaseClient();

  // 名单校验（服务端权限控制：非名单内人员无法进入考试）
  const { data: candidates } = await client
    .from('candidates')
    .select('id, name')
    .eq('exam_id', examId)
    .eq('phone', session.phone)
    .limit(1);
  if (!candidates || candidates.length === 0) return fail('你不在该考试的参考名单中', 403);
  const candidate = candidates[0];

  const { data: exam, error: eErr } = await client.from('exams').select('*').eq('id', examId).single();
  if (eErr || !exam) return fail('考试不存在', 404);

  const now = new Date();
  if (exam.status === EXAM_STATUS.DRAFT || exam.status === EXAM_STATUS.PENDING) return fail('考试尚未发布', 403);
  if (exam.status === EXAM_STATUS.ARCHIVED) return fail('考试已归档', 403);
  if (exam.status === EXAM_STATUS.ENDED) return fail('考试已结束', 403);
  if (exam.start_time && now < new Date(exam.start_time as string)) return fail('考试尚未开始', 403);
  if (exam.end_time && now > new Date(exam.end_time as string)) return fail('考试已结束', 403);

  // 恢复进行中的考试（同一考生仅允许一个有效答题会话）
  const { data: inProgressList } = await client
    .from('attempts')
    .select('*')
    .eq('exam_id', examId)
    .eq('candidate_phone', session.phone)
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false })
    .limit(1);
  const existing = inProgressList?.[0];
  if (existing) {
    const deadline = new Date(existing.deadline_at as string);
    if (now >= deadline) {
      // 已超时：提示前端走自动交卷
      return fail('考试时间已到，请交卷', 410, { attempt_id: existing.id, expired: true });
    }
    const snapshot = existing.paper_snapshot as PaperSnapshotItem[];
    const { data: answers } = await client
      .from('attempt_answers')
      .select('question_id, user_answer, marked, question_snapshot')
      .eq('attempt_id', existing.id);
    const answerRows = answers ?? [];
    const savedAnswers: Record<string, unknown> = {};
    const markedMap: Record<string, boolean> = {};
    const snapMap = new Map<string, SnapshotQuestion>();
    for (const a of answerRows) {
      const qid = a.question_id as string;
      savedAnswers[qid] = a.user_answer;
      markedMap[qid] = Boolean(a.marked);
      snapMap.set(qid, a.question_snapshot as SnapshotQuestion);
    }
    return ok({
      attempt_id: existing.id,
      resumed: true,
      exam: { id: exam.id, title: exam.title, duration_minutes: exam.duration_minutes, end_time: exam.end_time, total_score: exam.total_score },
      started_at: existing.started_at,
      server_now: now.toISOString(),
      deadline: deadline.toISOString(),
      questions: snapshot
        .map((s) => {
          const snap = snapMap.get(s.question_id);
          return snap ? toPublicQuestion(snap, s.sort_order) : null;
        })
        .filter(Boolean),
      saved_answers: savedAnswers,
      marked: markedMap,
    });
  }

  // 次数校验
  const { count: finishedCount } = await client
    .from('attempts')
    .select('id', { count: 'exact', head: true })
    .eq('exam_id', examId)
    .eq('candidate_phone', session.phone)
    .neq('status', 'in_progress');
  if ((finishedCount ?? 0) >= (exam.max_attempts as number)) {
    return fail('已达到允许的最大考试次数', 403);
  }

  // 生成试卷快照
  const { data: questions, error: qsErr } = await client
    .from('questions')
    .select('*')
    .eq('exam_id', examId)
    .order('sort_order', { ascending: true });
  if (qsErr) throw new Error(`查询试题失败: ${qsErr.message}`);
  if (!questions || questions.length === 0) return fail('试卷暂无题目', 400);

  const questionConfig = (exam.question_config as QuestionConfigItem[] | null) ?? [];
  const paperMode = normalizePaperMode(exam.paper_mode as string);

  // 随机试卷：校验题库题量是否满足抽题要求
  if (paperMode === 'random') {
    for (const cfg of questionConfig) {
      const poolCount = (questions as Question[]).filter((q) => q.type === cfg.type).length;
      if (poolCount < cfg.count) {
        return fail('题库题量不足，无法生成试卷，请联系管理员', 409);
      }
    }
  }

  const seed = Date.now() % 2147483647;
  const snapshot = buildPaperSnapshot(questions as Question[], {
    paperMode,
    questionConfig: questionConfig.map((c) => ({ type: c.type, count: c.count })),
    seed,
  });
  const questionSnaps = buildQuestionSnapshots(questions as Question[], snapshot);

  // 截止时间 = min(开考时间 + 答题时长, 考试结束时间)
  let deadline = new Date(now.getTime() + (exam.duration_minutes as number) * 60 * 1000);
  if (exam.end_time && new Date(exam.end_time as string) < deadline) {
    deadline = new Date(exam.end_time as string);
  }

  const attemptNo = (finishedCount ?? 0) + 1;
  const { data: attempt, error: aErr } = await client
    .from('attempts')
    .insert({
      exam_id: examId,
      candidate_id: candidate.id,
      candidate_name: candidate.name,
      candidate_phone: session.phone,
      attempt_no: attemptNo,
      status: 'in_progress',
      grading_status: 'none',
      paper_snapshot: snapshot,
      started_at: now.toISOString(),
      deadline_at: deadline.toISOString(),
    })
    .select()
    .single();
  if (aErr) throw new Error(`创建答题记录失败: ${aErr.message}`);

  // 预创建答题行（题目完整快照落库，保证可追溯）
  const answerRows = questionSnaps.map(({ questionId, snap }) => ({
    attempt_id: attempt.id,
    question_id: questionId,
    question_snapshot: snap,
    user_answer: null,
  }));
  const { error: insErr } = await client.from('attempt_answers').insert(answerRows);
  if (insErr) throw new Error(`初始化答题记录失败: ${insErr.message}`);

  return ok({
    attempt_id: attempt.id,
    resumed: false,
    exam: { id: exam.id, title: exam.title, duration_minutes: exam.duration_minutes, end_time: exam.end_time, total_score: exam.total_score },
    started_at: now.toISOString(),
    server_now: now.toISOString(),
    deadline: deadline.toISOString(),
    questions: questionSnaps.map(({ snap }, i) => toPublicQuestion(snap, i)),
    saved_answers: {},
    marked: {},
  });
});
