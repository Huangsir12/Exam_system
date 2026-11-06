'use client';

import { apiFetch } from '@/lib/client-fetch';
import { useExam } from '../layout';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface EssayItem {
  answer_id: string;
  question_id: string;
  content: string;
  reference: string;
  points: string[];
  analysis: string;
  source_excerpt: string;
  score: number;
  my_answer: string | null;
  graded: boolean;
  graded_score: number | null;
  grader_comment: string | null;
}

interface GradingItem {
  attempt_id: string;
  candidate_name: string;
  phone_masked: string;
  submitted_at: string;
  objective_score: number;
  essay_count: number;
  graded_count: number;
  essays: EssayItem[];
}

export default function GradingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16 text-muted-foreground text-sm">加载中…</div>}>
      <GradingInner />
    </Suspense>
  );
}

function GradingInner() {
  const { exam, reload: reloadExam } = useExam();
  const searchParams = useSearchParams();
  const focusAttempt = searchParams.get('attempt');
  const [items, setItems] = useState<GradingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/exams/${exam.id}/grading`);
    const json = await res.json();
    if (json.code === 0) {
      const list = (json.data.items ?? []) as GradingItem[];
      setItems(list);
      setScores((prev) => {
        const next = { ...prev };
        for (const g of list) {
          for (const e of g.essays) {
            if (next[e.answer_id] === undefined) next[e.answer_id] = e.graded_score !== null ? String(e.graded_score) : '';
          }
        }
        return next;
      });
      setComments((prev) => {
        const next = { ...prev };
        for (const g of list) {
          for (const e of g.essays) {
            if (next[e.answer_id] === undefined) next[e.answer_id] = e.grader_comment ?? '';
          }
        }
        return next;
      });
    }
    setLoading(false);
  }, [exam.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (focusAttempt) {
      setExpanded((prev) => ({ ...prev, [focusAttempt]: true }));
    }
  }, [focusAttempt]);

  async function grade(item: GradingItem, essay: EssayItem) {
    setMessage('');
    const raw = scores[essay.answer_id];
    const score = Number(raw);
    if (raw === undefined || raw === '' || Number.isNaN(score)) {
      setMessage(`请为「${item.candidate_name}」的作答输入分数`);
      return;
    }
    if (score < 0 || score > Number(essay.score)) {
      setMessage(`分数必须在 0 ~ ${essay.score} 之间`);
      return;
    }
    setSavingId(essay.answer_id);
    try {
      const res = await apiFetch(`/api/exams/${exam.id}/grading/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer_id: essay.answer_id, score, comment: comments[essay.answer_id] ?? '' }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setMessage(json.message || '评分失败');
        return;
      }
      await load();
      reloadExam();
    } finally {
      setSavingId(null);
    }
  }

  const filtered = focusAttempt ? items.filter((i) => i.attempt_id === focusAttempt) : items;
  const totalPending = items.reduce((s, i) => s + (i.essay_count - i.graded_count), 0);

  return (
    <div className="space-y-5 max-w-4xl">
      <p className="text-sm text-muted-foreground">
        <span className="font-bold text-foreground">{items.length}</span> 份答卷待阅卷 · 待评主观题 {totalPending} 道
      </p>

      {message && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">{message}</p>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-14 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">没有待阅卷的主观题</p>
          </CardContent>
        </Card>
      ) : (
        filtered.map((item) => {
          const open = expanded[item.attempt_id] ?? false;
          const allGraded = item.graded_count >= item.essay_count;
          return (
            <Card key={item.attempt_id} className={cn(focusAttempt === item.attempt_id && 'border-primary/50')}>
              <CardContent className="p-5">
                <button
                  className="w-full flex items-center gap-3 text-left"
                  onClick={() => setExpanded((prev) => ({ ...prev, [item.attempt_id]: !open }))}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium">{item.candidate_name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{item.phone_masked}</span>
                      <span className="text-xs text-muted-foreground">交卷于 {new Date(item.submitted_at).toLocaleString('zh-CN')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      客观题 {item.objective_score ?? 0} 分 · 主观题已评 {item.graded_count}/{item.essay_count}
                    </p>
                  </div>
                  {allGraded
                    ? <span className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-1">阅卷完成</span>
                    : <span className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">待阅卷</span>}
                  {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {open && (
                  <div className="mt-4 pt-4 border-t border-border space-y-5">
                    {item.essays.map((essay, ei) => (
                      <div key={essay.answer_id} className="border border-border rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">简答题 {ei + 1}</span>
                          <span className="text-xs bg-muted rounded px-2 py-0.5">满分 {essay.score} 分</span>
                          {essay.graded && <span className="text-xs text-emerald-300">已评 {essay.graded_score} 分</span>}
                        </div>

                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{essay.content}</p>

                        <div className="grid md:grid-cols-2 gap-3">
                          <div className="border border-border rounded-lg p-3.5">
                            <p className="text-xs text-muted-foreground mb-1.5">考生作答</p>
                            <p className={cn('text-sm leading-relaxed whitespace-pre-wrap', !essay.my_answer && 'text-muted-foreground italic')}>
                              {essay.my_answer || '（未作答）'}
                            </p>
                          </div>
                          <div className="border border-emerald-500/30 bg-emerald-500/15 rounded-lg p-3.5">
                            <p className="text-xs text-emerald-300 mb-1.5">参考答案与评分要点</p>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{essay.reference}</p>
                            {essay.points.length > 0 && (
                              <ul className="mt-2 space-y-1">
                                {essay.points.map((point, i) => (
                                  <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                                    <span className="text-emerald-300">•</span>{point}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>

                        {essay.source_excerpt && (
                          <div className="border border-primary/20 bg-primary/5 rounded-lg p-3">
                            <p className="text-xs text-primary mb-1 flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />知识原文</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{essay.source_excerpt}</p>
                          </div>
                        )}

                        <div className="flex items-end gap-3 flex-wrap">
                          <div className="space-y-1.5">
                            <Label className="text-xs">得分（0 ~ {essay.score}）</Label>
                            <Input
                              type="number" min={0} max={essay.score} step={0.5}
                              className="w-28"
                              value={scores[essay.answer_id] ?? ''}
                              onChange={(e) => setScores((prev) => ({ ...prev, [essay.answer_id]: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1.5 flex-1 min-w-52">
                            <Label className="text-xs">阅卷评语（可选）</Label>
                            <Textarea
                              rows={1}
                              value={comments[essay.answer_id] ?? ''}
                              onChange={(e) => setComments((prev) => ({ ...prev, [essay.answer_id]: e.target.value }))}
                            />
                          </div>
                          <Button onClick={() => grade(item, essay)} disabled={savingId === essay.answer_id}>
                            {savingId === essay.answer_id && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                            提交评分
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
