// 管理端：考试统计分析数据（基于答题快照统计，母版题目变更不影响）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import type { SnapshotQuestion } from '@/lib/grading';
import type { Question } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();

  const { data: exam, error: eErr } = await client.from('exams').select('*').eq('id', id).single();
  if (eErr || !exam) return fail('考试不存在', 404);

  const [{ count: totalCandidates }, { data: attempts }, { data: questions }] = await Promise.all([
    client.from('candidates').select('id', { count: 'exact', head: true }).eq('exam_id', id),
    client.from('attempts').select('*').eq('exam_id', id),
    client.from('questions').select('id, type, content, score, knowledge_point').eq('exam_id', id).order('sort_order', { ascending: true }),
  ]);

  const attemptList = attempts ?? [];
  const started = attemptList.length;
  const submitted = attemptList.filter((a) => a.status !== 'in_progress');
  const submittedCount = submitted.length;
  const notStarted = Math.max(0, (totalCandidates ?? 0) - started);
  const gradingCount = attemptList.filter((a) => a.grading_status === 'pending').length;
  const completed = submitted.filter((a) => a.grading_status === 'completed' || a.grading_status === 'none');

  // 分数指标（只统计已完成阅卷的）
  const scores = completed.map((a) => Number(a.total_score ?? 0));
  const avg = scores.length > 0 ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100 : null;
  const max = scores.length > 0 ? Math.max(...scores) : null;
  const min = scores.length > 0 ? Math.min(...scores) : null;
  const sortedScores = [...scores].sort((a, b) => a - b);
  const median = scores.length > 0
    ? scores.length % 2 === 1
      ? sortedScores[(scores.length - 1) / 2]
      : Math.round(((sortedScores[scores.length / 2 - 1] + sortedScores[scores.length / 2]) / 2) * 100) / 100
    : null;
  const passed = completed.filter((a) => a.is_passed === true).length;

  // 分数分布（按总分 10 等分）
  const totalScore = Number(exam.total_score) || 100;
  const bucketCount = 10;
  const bucketSize = Math.max(1, Math.ceil(totalScore / bucketCount));
  const distribution: { range: string; count: number }[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const lo = i * bucketSize;
    const hi = Math.min(totalScore, (i + 1) * bucketSize);
    const count = scores.filter((s) => s >= lo && (i === bucketCount - 1 ? s <= hi : s < hi)).length;
    distribution.push({ range: `${lo}-${hi}`, count });
  }

  // 拉取全部已交卷的答题明细
  const attemptIds = submitted.map((a) => a.id as string);
  const allAnswers = attemptIds.length > 0
    ? (await client.from('attempt_answers').select('*').in('attempt_id', attemptIds)).data ?? []
    : [];

  // 逐题正确率（按 question_id 聚合，题目信息以快照为准）
  const questionOrder = new Map((questions ?? []).map((q, i) => [q.id as string, i]));
  const questionAgg = new Map<string, {
    type: string; content: string; score: number; knowledge_point: string;
    answered: number; correct: number; scoreSum: number; scoredCount: number;
  }>();
  for (const row of allAnswers) {
    const snap = row.question_snapshot as SnapshotQuestion;
    if (!snap) continue;
    const entry = questionAgg.get(row.question_id) ?? {
      type: snap.type, content: snap.content, score: snap.score, knowledge_point: snap.knowledge_point,
      answered: 0, correct: 0, scoreSum: 0, scoredCount: 0,
    };
    const ua = row.user_answer;
    const answered = !(ua === null || ua === undefined || ua === '' || (Array.isArray(ua) && ua.every((v) => !String(v).trim())));
    if (answered) {
      entry.answered += 1;
      if (row.is_correct === true) entry.correct += 1;
    }
    if (row.score !== null && row.score !== undefined) {
      entry.scoreSum += Number(row.score);
      entry.scoredCount += 1;
    }
    questionAgg.set(row.question_id, entry);
  }

  const questionStats = [...questionAgg.entries()]
    .map(([qid, v]) => ({
      question_id: qid,
      order: questionOrder.get(qid) ?? 9999,
      type: v.type,
      content: v.content.slice(0, 40),
      score: v.score,
      knowledge_point: v.knowledge_point,
      answered: v.answered,
      correct_rate: v.type !== 'essay' && v.answered > 0 ? Math.round((v.correct / v.answered) * 1000) / 10 : null,
      avg_score_rate: v.scoredCount > 0 && v.score > 0 ? Math.round((v.scoreSum / v.scoredCount / v.score) * 1000) / 10 : null,
    }))
    .sort((a, b) => a.order - b.order);

  // 知识点掌握（得分率）
  const kpMap = new Map<string, { totalScore: number; gotScore: number; count: number }>();
  for (const row of allAnswers) {
    const snap = row.question_snapshot as SnapshotQuestion;
    if (!snap) continue;
    const kp = snap.knowledge_point || '未标注';
    const entry = kpMap.get(kp) ?? { totalScore: 0, gotScore: 0, count: 0 };
    entry.totalScore += snap.score;
    entry.gotScore += Number(row.score ?? 0);
    entry.count += 1;
    kpMap.set(kp, entry);
  }
  const knowledgeStats = [...kpMap.entries()]
    .map(([name, v]) => ({
      name,
      count: v.count,
      score_rate: v.totalScore > 0 ? Math.round((v.gotScore / v.totalScore) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // 题型得分率
  const typeMap = new Map<string, { total: number; got: number }>();
  for (const row of allAnswers) {
    const snap = row.question_snapshot as SnapshotQuestion;
    if (!snap) continue;
    const entry = typeMap.get(snap.type) ?? { total: 0, got: 0 };
    entry.total += snap.score;
    entry.got += Number(row.score ?? 0);
    typeMap.set(snap.type, entry);
  }
  const typeStats = [...typeMap.entries()].map(([type, v]) => ({
    type,
    score_rate: v.total > 0 ? Math.round((v.got / v.total) * 1000) / 10 : 0,
  }));

  return ok({
    exam: { id: exam.id, title: exam.title, total_score: exam.total_score, pass_score: exam.pass_score },
    overview: {
      total_candidates: totalCandidates ?? 0,
      started,
      submitted: submittedCount,
      not_started: notStarted,
      grading: gradingCount,
      reference_rate: (totalCandidates ?? 0) > 0 ? Math.round((submittedCount / (totalCandidates ?? 1)) * 1000) / 10 : 0,
      pass_count: passed,
      pass_rate: completed.length > 0 ? Math.round((passed / completed.length) * 1000) / 10 : 0,
      avg_score: avg,
      max_score: max,
      min_score: min,
      median_score: median,
    },
    distribution,
    question_stats: questionStats,
    knowledge_stats: knowledgeStats,
    type_stats: typeStats,
  });
});
