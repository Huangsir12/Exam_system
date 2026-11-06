'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, Clock3, FileText, Loader2, XCircle } from 'lucide-react';

interface ResultItem {
  sort: number;
  question_id: string;
  type: string;
  content: string;
  options: { key: string; text: string }[] | null;
  score: number;
  my_answer: string | string[] | boolean | null;
  my_score: number | null;
  is_correct: boolean | null;
  grader_comment: string | null;
  standard_answer: unknown;
  analysis: string | null;
  source: { document_name: string; location: string; excerpt: string } | null;
}

interface ResultData {
  view: 'result' | 'grading' | 'hidden';
  message?: string;
  exam_title: string;
  total_score?: number;
  objective_score?: number;
  subjective_score?: number;
  pass_score?: number;
  is_passed?: boolean;
  started_at?: string;
  submitted_at?: string;
  duration_seconds?: number | null;
  correct_count?: number;
  wrong_count?: number;
  unanswered_count?: number;
  type_stats?: Record<string, { total: number; earned: number }>;
  show_answer?: boolean;
  show_analysis?: boolean;
  show_source?: boolean;
  items?: ResultItem[];
}

const TYPE_LABELS: Record<string, string> = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' };

function fmtDuration(sec: number | null | undefined): string {
  if (!sec && sec !== 0) return '-';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} 分 ${s} 秒`;
}

function fmtMyAnswer(item: ResultItem): string {
  const a = item.my_answer;
  if (a === null || a === undefined || a === '') return '未作答';
  if (item.type === 'judge') return a === true || a === 'true' ? '正确' : a === 'false' ? '错误' : String(a);
  if (Array.isArray(a)) return a.filter((v) => String(v).trim()).join('；') || '未作答';
  return String(a);
}

function fmtStdAnswer(item: ResultItem): string {
  const a = item.standard_answer;
  if (a === null || a === undefined) return '-';
  if (typeof a === 'string' || typeof a === 'boolean') return String(a);
  if (Array.isArray(a)) return a.join('；');
  if (typeof a === 'object') {
    const o = a as { reference?: string; points?: string[] };
    return o.reference ?? '';
  }
  return String(a);
}

export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  use(params);
  const searchParams = useSearchParams();
  const attemptId = searchParams.get('attempt') ?? '';
  const router = useRouter();
  const [data, setData] = useState<ResultData | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!attemptId) {
      setError('缺少答题记录参数');
      return;
    }
    fetch(`/api/attempts/${attemptId}/result`)
      .then((r) => r.json())
      .then((json) => {
        if (json.code !== 0) setError(json.message || '加载失败');
        else setData(json.data);
      })
      .catch(() => setError('网络异常'));
  }, [attemptId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <p className="font-medium">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/exams')}>返回考试列表</Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.view === 'grading' || data.view === 'hidden') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="bg-card border border-border rounded-xl p-8 max-w-md w-full text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <Clock3 className="w-7 h-7 text-amber-300" />
          </div>
          <h2 className="font-serif font-bold text-lg">{data.exam_title}</h2>
          <p className="text-sm text-muted-foreground mt-2">{data.message}</p>
          <Button className="mt-6" onClick={() => router.push('/exams')}>返回考试列表</Button>
        </div>
      </div>
    );
  }

  const items = data.items ?? [];
  const score = data.total_score ?? 0;
  const passed = data.is_passed === true;

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="font-medium text-sm truncate">{data.exam_title} · 成绩单</h1>
          <Button variant="ghost" size="sm" onClick={() => router.push('/exams')}>返回列表</Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* 成绩总览 */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="text-center">
              <div className={cn('font-serif text-5xl font-bold', passed ? 'text-primary' : 'text-red-300')}>{score}</div>
              <p className="text-xs text-muted-foreground mt-1">总分 {data.type_stats ? undefined : ''}满分 {items.reduce((s, i) => s + Number(i.score), 0)}</p>
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">是否及格</p>
                <p className={cn('font-bold mt-1 flex items-center justify-center gap-1', passed ? 'text-emerald-300' : 'text-red-300')}>
                  {passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {passed ? '及格' : '不及格'}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">答对 / 答错 / 未答</p>
                <p className="font-bold mt-1">{data.correct_count} / {data.wrong_count} / {data.unanswered_count}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">客观题得分</p>
                <p className="font-bold mt-1">{data.objective_score ?? 0}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">主观题得分</p>
                <p className="font-bold mt-1">{data.subjective_score ?? 0}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
            <span>及格线 {data.pass_score} 分</span>
            <span>答题用时 {fmtDuration(data.duration_seconds)}</span>
            {data.type_stats && Object.keys(data.type_stats).length > 0 && (
              <span>
                题型得分：
                {Object.entries(data.type_stats).map(([t, v]) => `${TYPE_LABELS[t] ?? t} ${Math.round(v.earned * 10) / 10}/${v.total}`).join('，')}
              </span>
            )}
          </div>
        </div>

        {/* 逐题解析 */}
        <div className="space-y-3">
          {items.map((item) => {
            const open = expanded[item.sort] ?? (item.is_correct !== true);
            const myAnsText = fmtMyAnswer(item);
            const wrong = item.is_correct === false;
            const unanswered = myAnsText === '未作答';
            return (
              <div key={item.question_id} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <button
                  className="w-full text-left px-5 py-4 flex items-start gap-3"
                  onClick={() => setExpanded((prev) => ({ ...prev, [item.sort]: !open }))}
                >
                  <span className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold',
                    item.is_correct === true ? 'bg-emerald-100 text-emerald-300'
                      : unanswered ? 'bg-secondary text-muted-foreground'
                      : 'bg-red-100 text-red-300',
                  )}>
                    {item.is_correct === true ? '✓' : unanswered ? '–' : '✗'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <span>{item.sort + 1}. {TYPE_LABELS[item.type]}</span>
                      <span>{item.score} 分</span>
                      <span className={cn('font-medium', item.is_correct === true ? 'text-emerald-300' : 'text-red-300')}>
                        得分 {item.my_score ?? 0}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.content}</p>
                  </div>
                  {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
                </button>

                {open && (
                  <div className="px-5 pb-5 pt-1 border-t border-border/60 space-y-3">
                    {item.options && (
                      <div className="space-y-1.5 pt-2">
                        {item.options.map((opt) => {
                          const isMy = Array.isArray(item.my_answer) ? item.my_answer.includes(opt.key) : item.my_answer === opt.key;
                          const stdArr = Array.isArray(item.standard_answer) ? item.standard_answer as string[] : [String(item.standard_answer ?? '')];
                          const isStd = stdArr.includes(opt.key);
                          return (
                            <div
                              key={opt.key}
                              className={cn(
                                'text-sm px-3 py-2 rounded-md border flex gap-2',
                                isStd && data.show_answer ? 'border-emerald-500/30 bg-emerald-500/20'
                                  : isMy ? 'border-red-500/30 bg-red-500/20'
                                  : 'border-border/60',
                              )}
                            >
                              <span className="font-medium shrink-0">{opt.key}.</span>
                              <span>{opt.text}</span>
                              {isMy && <span className="ml-auto text-xs text-muted-foreground shrink-0">我的选择</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid gap-2 text-sm">
                      <div className="flex gap-2">
                        <span className="text-muted-foreground shrink-0 w-20">我的答案</span>
                        <span className={cn('whitespace-pre-wrap', wrong && 'text-red-300')}>{myAnsText}</span>
                      </div>
                      {data.show_answer && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground shrink-0 w-20">标准答案</span>
                          <span className="text-emerald-300 whitespace-pre-wrap">{fmtStdAnswer(item)}</span>
                        </div>
                      )}
                      {item.type === 'essay' && item.grader_comment && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground shrink-0 w-20">阅卷评语</span>
                          <span className="whitespace-pre-wrap">{item.grader_comment}</span>
                        </div>
                      )}
                    </div>

                    {data.show_analysis && item.analysis && (
                      <div className="bg-muted/50 rounded-lg p-3.5">
                        <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />解析
                        </p>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.analysis}</p>
                      </div>
                    )}

                    {data.show_source && item.source && (
                      <div className="border border-primary/20 bg-primary/5 rounded-lg p-3.5">
                        <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5" />
                          知识来源：《{item.source.document_name}》{item.source.location}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{item.source.excerpt}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
