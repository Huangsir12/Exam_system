// 试卷校验：发布前检查题量/分值/答案完整性（管理员）
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth';
import { fail, ok, withErrorHandling } from '@/lib/api';
import { normalizePaperMode, QUESTION_TYPE_LABELS, type Question, type QuestionConfigItem } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const client = getSupabaseClient();

  const { data: exam, error: eErr } = await client.from('exams').select('*').eq('id', id).single();
  if (eErr || !exam) return fail('考试不存在', 404);
  const { data: questions, error: qErr } = await client
    .from('questions')
    .select('*')
    .eq('exam_id', id)
    .order('sort_order', { ascending: true });
  if (qErr) throw new Error(`查询试题失败: ${qErr.message}`);

  const questionConfig = (exam.question_config as QuestionConfigItem[] | null) ?? [];
  const paperMode = normalizePaperMode(exam.paper_mode as string);
  const qs = (questions ?? []) as Question[];
  const issues: string[] = [];
  const warnings: string[] = [];

  // 1. 题量校验：固定试卷须与配置一致；随机试卷题库题量须不少于抽题配置
  const countByType: Record<string, { actual: number; expected: number; ok: boolean }> = {};
  for (const spec of questionConfig) {
    const actual = qs.filter((q) => q.type === spec.type).length;
    const ok = paperMode === 'random' ? actual >= spec.count : actual === spec.count;
    countByType[spec.type] = { actual, expected: spec.count, ok };
    if (!ok) {
      issues.push(
        paperMode === 'random'
          ? `题库中「${QUESTION_TYPE_LABELS[spec.type]}」不足：抽题需要 ${spec.count} 题，现有 ${actual} 题`
          : `题型「${QUESTION_TYPE_LABELS[spec.type]}」配置 ${spec.count} 题，实际 ${actual} 题`,
      );
    }
  }
  // 配置外多余的题目
  for (const q of qs) {
    if (!questionConfig.some((s) => s.type === q.type)) {
      warnings.push(`存在配置外题型「${QUESTION_TYPE_LABELS[q.type]}」的题目`);
      break;
    }
  }

  // 2. 总分校验（随机试卷按配置卷面总分；固定试卷为题库合计）
  const actualTotal = qs.reduce((s, q) => s + Number(q.score), 0);
  const expectedTotal = questionConfig.reduce((s, t) => s + t.count * t.score, 0);
  if (paperMode !== 'random' && actualTotal !== expectedTotal) {
    issues.push(`目标总分 ${expectedTotal} 分，实际总分 ${actualTotal} 分`);
  }

  // 3-8. 逐题校验
  qs.forEach((q, idx) => {
    const no = `第 ${idx + 1} 题`;
    if (!q.content?.trim()) issues.push(`${no}缺少题干`);
    if (!Number(q.score) || Number(q.score) <= 0) issues.push(`${no}分值无效`);
    if (q.type === 'single' || q.type === 'multiple') {
      if (!Array.isArray(q.options) || q.options.length < 2) issues.push(`${no}选项不完整`);
    }
    if (q.type === 'single') {
      if (typeof q.answer !== 'string' || !q.answer) {
        issues.push(`${no}缺少标准答案`);
      } else if (Array.isArray(q.options) && !q.options.some((o) => o.key === q.answer)) {
        issues.push(`${no}答案与选项不匹配`);
      }
    } else if (q.type === 'multiple') {
      if (!Array.isArray(q.answer) || q.answer.length < 2) issues.push(`${no}多选题至少有两个正确答案`);
    } else if (q.type === 'judge') {
      if (typeof q.answer !== 'boolean') issues.push(`${no}判断题缺少标准答案`);
    } else if (q.type === 'fill') {
      if (!Array.isArray(q.answer) || q.answer.length === 0) issues.push(`${no}填空题缺少标准答案`);
    } else if (q.type === 'essay') {
      const a = q.answer as { reference?: string; points?: string[] } | null;
      if (!a || ((!a.reference || !a.reference.trim()) && (!a.points || a.points.length === 0))) {
        issues.push(`${no}简答题缺少参考评分要点`);
      }
    }
    if (!q.analysis?.trim()) issues.push(`${no}缺少解析`);
    if (!q.source_excerpt?.trim() && !q.source_document_name) issues.push(`${no}缺少知识来源`);
  });

  const totalScore = Number(exam.total_score);
  const passScore = exam.pass_score !== null ? Number(exam.pass_score) : null;
  if (passScore !== null && totalScore > 0 && passScore > totalScore) {
    issues.push(`及格分 ${passScore} 高于试卷总分 ${totalScore}`);
  }

  return ok({
    valid: issues.length === 0,
    errors: issues,
    warnings,
    actual_total: actualTotal,
    expected_total: expectedTotal,
    count_by_type: countByType,
    question_count: qs.length,
    planned_count: questionConfig.reduce((s, t) => s + t.count, 0),
  });
});
