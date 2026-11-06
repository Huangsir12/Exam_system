'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowLeft, BookOpen, FileText, Loader2 } from 'lucide-react';

interface DetailItem {
  answer_id: string;
  sort: number;
  question_id: string;
  type: string;
  content: string;
  options: { key: string; text: string; original_key?: string }[] | null;
  score: number;
  difficulty: string;
  knowledge_point: string;
  my_answer: string | string[] | boolean | null;
  my_score: number | null;
  is_correct: boolean | null;
  grader_comment: string | null;
  graded_by: string | null;
  standard_answer: unknown;
  analysis: string | null;
  source_document_name: string;
  source_location: string;
  source_excerpt: string;
}

interface DetailData {
  attempt: {
    id: string;
    candidate_name: string;
    phone_masked: string;
    status: string;
    started_at: string;
    submitted_at: string | null;
    duration_seconds: number | null;
    objective_score: number | null;
    subjective_score: number | null;
    total_score: number | null;
    is_passed: boolean | null;
    grading_status: string;
  };
  exam: { id: string; title: string; total_score: number; pass_score: number } | null;
  items: DetailItem[];
}

const TYPE_LABELS: Record<string, string> = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' };

function fmtAnswer(item: DetailItem): string {
  const a = item.my_answer;
  if (a === null || a === undefined || a === '') return '未作答';
  if (item.type === 'judge') return a === true || a === 'true' ? '正确' : a === 'false' ? '错误' : String(a);
  if (Array.isArray(a)) return a.filter((v) => String(v).trim()).join('；') || '未作答';
  return String(a);
}

function fmtStd(item: DetailItem): string {
  const a = item.standard_answer;
  if (a === null || a === undefined) return '—';
  if (typeof a === 'string' || typeof a === 'boolean') return String(a);
  if (Array.isArray(a)) return a.join('；');
  if (typeof a === 'object') return (a as { reference?: string }).reference ?? '';
  return String(a);
}

export default function AttemptDetailPage({ params }: { params: Promise<{ id: string; attemptId: string }> }) {
  const { id, attemptId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/attempts/${attemptId}/detail`)
      .then((r) => r.json())
      .then((json) => {
        if (json.code !== 0) setError(json.message || '加载失败');
        else setData(json.data);
      })
      .catch(() => setError('网络异常'));
  }, [attemptId]);

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push(`/admin/exams/${id}/results`)}>返回成绩明细</Button>
      </div>
    );
  }

  if (!data) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const { attempt, exam } = data;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="font-serif text-lg font-bold">{attempt.candidate_name} 的答卷</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {exam?.title} · {attempt.phone_masked} · 总分 {attempt.total_score ?? '—'} 分（客观 {attempt.objective_score ?? 0} / 主观 {attempt.subjective_score ?? 0}）
            {attempt.is_passed !== null && attempt.is_passed !== undefined && (
              <span className={cn('ml-2 font-medium', attempt.is_passed ? 'text-emerald-700' : 'text-red-700')}>
                {attempt.is_passed ? '及格' : '不及格'}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {data.items.map((item) => (
          <div key={item.question_id} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{item.sort + 1}</span>
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span>{TYPE_LABELS[item.type]}</span>
                  <span>{item.score} 分</span>
                  <span className={cn('font-medium', item.is_correct === true ? 'text-emerald-700' : 'text-red-700')}>得分 {item.my_score ?? 0}</span>
                  {item.graded_by && <span>阅卷人：{item.graded_by}</span>}
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.content}</p>
                {item.options && (
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {item.options.map((opt) => {
                      const isMy = Array.isArray(item.my_answer) ? item.my_answer.includes(opt.key) : item.my_answer === opt.key;
                      const stdArr = Array.isArray(item.standard_answer) ? item.standard_answer as string[] : [String(item.standard_answer ?? '')];
                      const isStd = stdArr.includes(opt.key);
                      return (
                        <div key={opt.key} className={cn('text-xs px-2.5 py-1.5 rounded-md border', isStd ? 'border-emerald-300 bg-emerald-50/60' : isMy ? 'border-red-300 bg-red-50/60' : 'border-border/60 text-muted-foreground')}>
                          {opt.key}. {opt.text}{isMy && '（考生选择）'}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="grid gap-1.5 text-sm">
                  <p><span className="text-muted-foreground">考生答案：</span>{fmtAnswer(item)}</p>
                  <p><span className="text-muted-foreground">标准答案：</span><span className="text-emerald-700">{fmtStd(item)}</span></p>
                  {item.grader_comment && <p><span className="text-muted-foreground">阅卷评语：</span>{item.grader_comment}</p>}
                </div>
                {item.analysis && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><FileText className="w-3.5 h-3.5" />解析</p>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{item.analysis}</p>
                  </div>
                )}
                {item.source_excerpt && (
                  <div className="border border-primary/20 bg-primary/5 rounded-lg p-3">
                    <p className="text-xs text-primary mb-1 flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" />《{item.source_document_name}》{item.source_location}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.source_excerpt}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
