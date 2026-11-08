// 考试：创建与列表（管理员）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import {
  EXAM_STATUS,
  GENERATION_STATUS,
  QUESTION_TYPES,
  type QuestionConfigItem,
  type QuestionType,
} from '@/lib/types';

export const GET = withErrorHandling(async (): Promise<NextResponse> => {
  await requireAdmin();
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('exams')
    .select(
      'id, title, status, start_time, end_time, duration_minutes, total_score, pass_score, max_attempts, paper_mode, result_visibility, generation_status, result_published, created_at, published_at'
    )
    .order('created_at', { ascending: false });
  if (error) throw new Error(`查询考试列表失败: ${error.message}`);

  // 补充统计：题目数、名单人数
  const examIds = (data ?? []).map((e) => e.id as string);
  let questionCounts: Record<string, number> = {};
  let candidateCounts: Record<string, number> = {};
  if (examIds.length > 0) {
    const [{ data: qs }, { data: cs }] = await Promise.all([
      client.from('questions').select('exam_id').in('exam_id', examIds),
      client.from('candidates').select('exam_id').in('exam_id', examIds),
    ]);
    for (const q of qs ?? []) {
      const id = q.exam_id as string;
      questionCounts[id] = (questionCounts[id] ?? 0) + 1;
    }
    for (const c of cs ?? []) {
      const id = c.exam_id as string;
      candidateCounts[id] = (candidateCounts[id] ?? 0) + 1;
    }
  }
  const list = (data ?? []).map((e) => ({
    ...e,
    question_count: questionCounts[e.id as string] ?? 0,
    candidate_count: candidateCounts[e.id as string] ?? 0,
  }));
  return ok(list);
});

export const POST = withErrorHandling(async (request: Request): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const body = (await request.json()) as {
    title?: string;
    description?: string;
    document_ids?: string[];
    content_scope?: { docId: string; chapters: string[] }[];
    question_config?: QuestionConfigItem[];
    start_time?: string;
    end_time?: string;
    duration_minutes?: number;
    pass_score?: number;
    max_attempts?: number;
    paper_mode?: string;
    question_order?: string;
    option_shuffle?: boolean;
    result_visibility?: string;
    show_answer?: boolean;
    show_analysis?: boolean;
    show_source?: boolean;
  };

  const title = (body.title ?? '').trim();
  if (!title) return fail('考试名称不能为空');
  if (!body.document_ids || body.document_ids.length === 0) return fail('请至少选择一份知识文档');

  // 校验文档存在且解析成功
  const client = getSupabaseClient();
  const { data: docs, error: dErr } = await client
    .from('documents')
    .select('id, parse_status')
    .in('id', body.document_ids);
  if (dErr) throw new Error(`查询文档失败: ${dErr.message}`);
  if (!docs || docs.length !== body.document_ids.length) return fail('所选知识文档不存在');
  const notParsed = docs.filter((d) => d.parse_status !== 'success');
  if (notParsed.length > 0) return fail('存在未解析成功的文档，无法用于出题');

  // 校验题型配置
  const qc = body.question_config;
  if (!qc || !Array.isArray(qc) || qc.length === 0) return fail('请配置题型');
  let totalScore = 0;
  for (const t of qc) {
    if (!QUESTION_TYPES.includes(t.type)) return fail(`不支持的题型: ${t.type}`);
    const count = Math.floor(Number(t.count));
    const score = Number(t.score);
    if (!count || count <= 0 || count > 100) return fail('题型题量必须在 1~100 之间');
    if (!score || score <= 0 || score > 100) return fail('题型分值必须在 0~100 之间');
    totalScore += count * score;
    const diff = t.difficulty ?? { easy: 0, medium: count, hard: 0 };
    const diffSum = (diff.easy || 0) + (diff.medium || 0) + (diff.hard || 0);
    if (diffSum > 0 && diffSum !== count) {
      return fail(`题型「${t.type}」难度分配数量之和须等于题量`);
    }
  }

  const normalizedConfig: QuestionConfigItem[] = qc.map((t) => {
    const count = Math.floor(Number(t.count));
    const diff = t.difficulty ?? { easy: 0, medium: 0, hard: 0 };
    const diffSum = (diff.easy || 0) + (diff.medium || 0) + (diff.hard || 0);
    return {
      type: t.type as QuestionType,
      count,
      score: Number(t.score),
      difficulty: diffSum === count ? diff : { easy: 0, medium: count, hard: 0 },
    };
  });

  // 时间与数值校验
  if (!body.start_time || !body.end_time) return fail('请设置考试开始与结束时间');
  const startTime = new Date(body.start_time);
  const endTime = new Date(body.end_time);
  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) return fail('考试时间格式不正确');
  if (endTime <= startTime) return fail('结束时间必须晚于开始时间');
  const duration = Math.floor(Number(body.duration_minutes));
  if (!duration || duration <= 0 || duration > 600) return fail('答题时长须在 1~600 分钟之间');
  const passScore = Number(body.pass_score ?? 0);
  if (passScore < 0 || passScore > totalScore) return fail('及格分须在 0 与总分之间');
  const maxAttempts = Math.floor(Number(body.max_attempts ?? 1));
  if (!maxAttempts || maxAttempts < 1 || maxAttempts > 10) return fail('可考次数须在 1~10 之间');
  const paperMode = body.paper_mode === 'random' ? 'random' : 'fixed';
  const questionOrder = paperMode === 'random' ? 'random' : 'fixed';
  const visibility = ['immediate', 'after_end', 'manual'].includes(body.result_visibility ?? '') ? body.result_visibility : 'manual';

  const { data, error } = await client
    .from('exams')
    .insert({
      title,
      description: (body.description ?? '').trim(),
      status: EXAM_STATUS.DRAFT,
      generation_status: GENERATION_STATUS.NONE,
      document_ids: body.document_ids,
      content_scope: Array.isArray(body.content_scope) ? body.content_scope : [],
      question_config: normalizedConfig,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_minutes: duration,
      total_score: totalScore,
      pass_score: passScore,
      max_attempts: maxAttempts,
      paper_mode: paperMode,
      question_order: questionOrder,
      option_shuffle: Boolean(body.option_shuffle),
      result_visibility: visibility,
      show_answer: body.show_answer !== false,
      show_analysis: body.show_analysis !== false,
      show_source: body.show_source !== false,
      created_by: admin.user_name,
    })
    .select()
    .single();
  if (error) throw new Error(`创建考试失败: ${error.message}`);

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'exam_create',
    targetType: 'exam',
    targetId: data.id as string,
    detail: { title, total_score: totalScore },
  });

  return ok(data);
});
