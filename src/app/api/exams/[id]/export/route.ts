// 管理端：成绩与名单导出 CSV
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, maskPhone, withErrorHandling } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const GET = withErrorHandling(async (request: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') ?? 'results'; // results | candidates

  const client = getSupabaseClient();
  const { data: exam, error: eErr } = await client.from('exams').select('*').eq('id', id).single();
  if (eErr || !exam) return fail('考试不存在', 404);

  let csv = '';
  let filename = '';

  if (kind === 'candidates') {
    const { data: candidates } = await client
      .from('candidates')
      .select('name, phone, import_batch, created_at')
      .eq('exam_id', id)
      .order('created_at', { ascending: true });
    const lines = ['姓名,手机号,导入批次,导入时间'];
    for (const c of candidates ?? []) {
      lines.push([csvEscape(c.name), csvEscape(c.phone), csvEscape(c.import_batch), csvEscape(c.created_at)].join(','));
    }
    csv = lines.join('\n');
    filename = `名单-${exam.title}.csv`;
  } else {
    const { data: candidates } = await client.from('candidates').select('id, name, phone').eq('exam_id', id);
    const { data: attempts } = await client
      .from('attempts')
      .select('*')
      .eq('exam_id', id)
      .order('created_at', { ascending: false });
    const latestByPhone = new Map<string, NonNullable<typeof attempts>[number]>();
    for (const a of attempts ?? []) {
      if (!latestByPhone.has(a.candidate_phone as string)) latestByPhone.set(a.candidate_phone as string, a);
    }
    const lines = ['姓名,手机号,是否开考,是否交卷,开始时间,交卷时间,答题用时(秒),客观题得分,主观题得分,总分,是否及格,阅卷状态'];
    for (const c of candidates ?? []) {
      const a = latestByPhone.get(c.phone as string);
      lines.push(
        [
          csvEscape(c.name),
          csvEscape(maskPhone(c.phone as string)),
          a ? '是' : '否',
          a && a.status !== 'in_progress' ? '是' : '否',
          csvEscape(a?.started_at ?? ''),
          csvEscape(a?.submitted_at ?? ''),
          a?.duration_seconds ?? '',
          a?.objective_score ?? '',
          a?.subjective_score ?? '',
          a?.total_score ?? '',
          a?.is_passed === true ? '及格' : a?.is_passed === false ? '不及格' : '',
          a?.grading_status === 'pending' ? '阅卷中' : a?.grading_status === 'completed' ? '已完成' : '',
        ].join(','),
      );
    }
    csv = lines.join('\n');
    filename = `成绩-${exam.title}.csv`;
  }

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: kind === 'candidates' ? 'candidates_export' : 'results_export',
    targetType: 'exam',
    targetId: id,
    detail: { title: exam.title, kind },
  });

  return new NextResponse('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});
