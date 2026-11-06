'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, CloudUpload, Flag, Loader2, Send,
} from 'lucide-react';

interface PublicQuestion {
  question_id: string;
  type: 'single' | 'multiple' | 'judge' | 'fill' | 'essay';
  content: string;
  options: { key: string; text: string }[] | null;
  score: number;
  sort: number;
  blank_count: number;
}

interface AttemptData {
  id: string;
  status: string;
  grading_status: string;
  started_at: string;
  deadline_at: string;
  duration_seconds: number | null;
  exam: { id: string; title: string; duration_minutes: number };
  snapshot: { question_id: string; sort_order: number; options: { key: string; text: string }[] | null }[];
  questions: PublicQuestion[];
  saved_answers: Record<string, { user_answer: unknown; marked: boolean }>;
}

type UserAnswerMap = Record<string, string | string[] | boolean>;

const TYPE_LABELS: Record<string, string> = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' };

function isAnswered(q: PublicQuestion, ans: string | string[] | boolean | undefined): boolean {
  if (ans === undefined || ans === null || ans === '') return false;
  if (Array.isArray(ans)) {
    if (q.type === 'fill') return ans.some((v) => String(v).trim() !== '');
    return ans.length > 0;
  }
  return true;
}

export default function TakeExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: examId } = use(params);
  const searchParams = useSearchParams();
  const attemptId = searchParams.get('attempt') ?? '';
  const router = useRouter();

  const [data, setData] = useState<AttemptData | null>(null);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<UserAnswerMap>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [remainSec, setRemainSec] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showSubmit, setShowSubmit] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const deadlineRef = useRef(0);
  const dataRef = useRef<AttemptData | null>(null);
  const answersRef = useRef<UserAnswerMap>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingQidRef = useRef<string | null>(null);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // 提交试卷
  const doSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      const res = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.code === 0 || json.message?.includes('已提交')) {
        router.replace(`/exams/${examId}/result?attempt=${attemptId}`);
        return;
      }
      submittedRef.current = false;
      setError(json.message || '交卷失败，请重试');
      setSubmitting(false);
    } catch {
      submittedRef.current = false;
      setError('网络异常，交卷失败，请重试');
      setSubmitting(false);
    }
  }, [attemptId, examId, router]);

  // 保存单题答案
  const saveAnswer = useCallback(async (questionId: string, answer: unknown, isMarked: boolean) => {
    setSaveState('saving');
    try {
      const res = await fetch(`/api/attempts/${attemptId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: questionId, answer, marked: isMarked }),
      });
      const json = await res.json();
      if (json.code === 0) {
        setSaveState('saved');
        if (json.data?.deadline_at) deadlineRef.current = new Date(json.data.deadline_at).getTime();
      } else if (json.data?.already_submitted) {
        doSubmit();
      } else {
        setSaveState('error');
      }
    } catch {
      setSaveState('error');
    }
  }, [attemptId, doSubmit]);

  // 加载答题记录
  useEffect(() => {
    if (!attemptId) {
      setError('缺少答题记录参数');
      return;
    }
    fetch(`/api/attempts/${attemptId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.code !== 0) {
          setError(json.message || '加载失败');
          return;
        }
        const d = json.data as AttemptData;
        setData(d);
        const restored: UserAnswerMap = {};
        const restoredMarked: Record<string, boolean> = {};
        for (const [qid, v] of Object.entries(d.saved_answers ?? {})) {
          if (v.user_answer !== null && v.user_answer !== undefined) {
            restored[qid] = v.user_answer as string | string[] | boolean;
          }
          if (v.marked) restoredMarked[qid] = true;
        }
        setAnswers(restored);
        setMarked(restoredMarked);
        deadlineRef.current = new Date(d.deadline_at).getTime();
        setRemainSec(Math.max(0, Math.floor((deadlineRef.current - Date.now()) / 1000)));
      })
      .catch(() => setError('网络异常，加载失败'));
  }, [attemptId]);

  // 倒计时（以服务端截止时间为准）
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => {
      const remain = Math.max(0, Math.floor((deadlineRef.current - Date.now()) / 1000));
      setRemainSec(remain);
      if (remain <= 0) {
        clearInterval(timer);
        doSubmit();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [data, doSubmit]);

  // 更新答案（带防抖自动保存）
  const updateAnswer = useCallback((qid: string, value: string | string[] | boolean) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
    pendingQidRef.current = qid;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const pendingId = pendingQidRef.current;
      if (pendingId) {
        saveAnswer(pendingId, answersRef.current[pendingId], !!marked[qid]);
        pendingQidRef.current = null;
      }
    }, 600);
  }, [marked, saveAnswer]);

  const toggleMark = useCallback((qid: string) => {
    setMarked((prev) => {
      const next = { ...prev, [qid]: !prev[qid] };
      saveAnswer(qid, answersRef.current[qid] ?? null, next[qid]);
      return next;
    });
  }, [saveAnswer]);

  const questions = useMemo(() => data?.questions ?? [], [data]);
  const q = questions[current];
  const answeredCount = useMemo(
    () => questions.filter((qq) => isAnswered(qq, answers[qq.question_id])).length,
    [questions, answers],
  );

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto mb-3" />
          <p className="font-medium">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/exams')}>返回考试列表</Button>
        </div>
      </div>
    );
  }

  if (!data || !q) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const mm = Math.floor(remainSec / 60);
  const ss = remainSec % 60;
  const urgent = remainSec < 300;
  const curAns = answers[q.question_id];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-20 bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <h1 className="font-medium text-sm truncate flex-1">{data.exam.title}</h1>
          <div className={cn(
            'flex items-center gap-1.5 font-mono text-sm px-3 py-1 rounded-md border',
            urgent ? 'bg-red-50 text-red-700 border-red-200' : 'bg-muted text-foreground border-border',
          )}>
            <Clock3 className="w-4 h-4" />
            {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
          </div>
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground w-24">
            {saveState === 'saving' && <><Loader2 className="w-3.5 h-3.5 animate-spin" />保存中</>}
            {saveState === 'saved' && <><CloudUpload className="w-3.5 h-3.5 text-emerald-600" />已保存</>}
            {saveState === 'error' && <><AlertTriangle className="w-3.5 h-3.5 text-red-600" />保存失败</>}
          </div>
          <Button size="sm" onClick={() => setShowSubmit(true)}>
            <Send className="w-3.5 h-3.5 mr-1" />
            交卷
          </Button>
        </div>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-5 flex flex-col lg:flex-row gap-4">
        {/* 答题主区域 */}
        <main className="flex-1 min-w-0">
          <div className="bg-card border border-border rounded-xl p-5 sm:p-7 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded">{TYPE_LABELS[q.type]}</span>
                <span className="text-xs text-muted-foreground">{q.score} 分</span>
              </div>
              <button
                onClick={() => toggleMark(q.question_id)}
                className={cn(
                  'flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border transition-colors',
                  marked[q.question_id]
                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                    : 'text-muted-foreground border-border hover:bg-muted',
                )}
              >
                <Flag className="w-3.5 h-3.5" />
                {marked[q.question_id] ? '已标记' : '标记待检查'}
              </button>
            </div>

            <p className="text-base leading-relaxed whitespace-pre-wrap">
              <span className="font-serif font-bold mr-1.5">{current + 1}.</span>
              {q.content}
            </p>

            {/* 作答区 */}
            <div className="mt-5 space-y-2.5">
              {q.type === 'single' && q.options?.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => updateAnswer(q.question_id, opt.key)}
                  className={cn(
                    'w-full text-left flex items-start gap-3 border rounded-lg px-4 py-3 transition-colors',
                    curAns === opt.key
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40 hover:bg-muted/40',
                  )}
                >
                  <span className={cn(
                    'w-6 h-6 rounded-full border flex items-center justify-center text-xs font-medium shrink-0 mt-0.5',
                    curAns === opt.key ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/40',
                  )}>
                    {opt.key}
                  </span>
                  <span className="text-sm leading-relaxed">{opt.text}</span>
                </button>
              ))}

              {q.type === 'multiple' && q.options?.map((opt) => {
                const arr = Array.isArray(curAns) ? curAns as string[] : [];
                const checked = arr.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    onClick={() => {
                      const next = checked ? arr.filter((k) => k !== opt.key) : [...arr, opt.key];
                      updateAnswer(q.question_id, next);
                    }}
                    className={cn(
                      'w-full text-left flex items-start gap-3 border rounded-lg px-4 py-3 transition-colors',
                      checked ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/40',
                    )}
                  >
                    <span className={cn(
                      'w-6 h-6 rounded-md border flex items-center justify-center text-xs font-medium shrink-0 mt-0.5',
                      checked ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/40',
                    )}>
                      {opt.key}
                    </span>
                    <span className="text-sm leading-relaxed">{opt.text}</span>
                  </button>
                );
              })}
              {q.type === 'multiple' && (
                <p className="text-xs text-muted-foreground">多选题：全部选对得满分，错选、漏选不得分</p>
              )}

              {q.type === 'judge' && (
                <div className="grid grid-cols-2 gap-3">
                  {[{ v: true, label: '正确' }, { v: false, label: '错误' }].map((opt) => (
                    <button
                      key={String(opt.v)}
                      onClick={() => updateAnswer(q.question_id, opt.v)}
                      className={cn(
                        'border rounded-lg px-4 py-4 text-sm font-medium transition-colors',
                        curAns === opt.v
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/40 hover:bg-muted/40',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'fill' && (
                <div className="space-y-3">
                  {Array.from({ length: q.blank_count }).map((_, i) => {
                    const arr = Array.isArray(curAns) ? (curAns as string[]) : [];
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground shrink-0">第 {i + 1} 空</span>
                        <Input
                          value={arr[i] ?? ''}
                          onChange={(e) => {
                            const next = [...arr];
                            while (next.length < q.blank_count) next.push('');
                            next[i] = e.target.value;
                            updateAnswer(q.question_id, next);
                          }}
                          placeholder="请输入答案"
                          className="flex-1"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {q.type === 'essay' && (
                <Textarea
                  value={typeof curAns === 'string' ? curAns : ''}
                  onChange={(e) => updateAnswer(q.question_id, e.target.value)}
                  placeholder="请在此作答…"
                  rows={8}
                  className="resize-y"
                />
              )}
            </div>

            {/* 翻页 */}
            <div className="flex items-center justify-between mt-7 pt-5 border-t border-border">
              <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setCurrent(current - 1)}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                上一题
              </Button>
              <span className="text-sm text-muted-foreground">{current + 1} / {questions.length}</span>
              {current === questions.length - 1 ? (
                <Button size="sm" onClick={() => setShowSubmit(true)}>
                  <Send className="w-4 h-4 mr-1" />
                  交卷
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setCurrent(current + 1)}>
                  下一题
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </main>

        {/* 答题卡（桌面端侧栏） */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm sticky top-20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">答题卡</span>
              <span className="text-xs text-muted-foreground">{answeredCount}/{questions.length}</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {questions.map((qq, i) => {
                const answered = isAnswered(qq, answers[qq.question_id]);
                const isMarked = !!marked[qq.question_id];
                return (
                  <button
                    key={qq.question_id}
                    onClick={() => setCurrent(i)}
                    className={cn(
                      'aspect-square rounded-md text-xs font-medium border transition-colors relative',
                      i === current && 'ring-2 ring-primary ring-offset-1',
                      answered
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border text-muted-foreground hover:border-primary/50',
                    )}
                  >
                    {i + 1}
                    {isMarked && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-primary inline-block" />已作答</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded border border-border inline-block" />未作答</div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block ml-0.5" /><span className="-ml-0.5">待检查</span></div>
            </div>
          </div>
        </aside>
      </div>

      {/* 移动端底部答题卡入口 */}
      <div className="lg:hidden sticky bottom-0 bg-card border-t border-border px-4 py-2.5 flex items-center justify-between">
        <button className="text-sm text-primary font-medium" onClick={() => setShowNav(true)}>
          答题卡 {answeredCount}/{questions.length}
        </button>
        <Button size="sm" onClick={() => setShowSubmit(true)}>交卷</Button>
      </div>

      {/* 移动端答题卡抽屉 */}
      {showNav && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setShowNav(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-medium">答题卡</span>
              <span className="text-xs text-muted-foreground">已答 {answeredCount}/{questions.length}</span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {questions.map((qq, i) => {
                const answered = isAnswered(qq, answers[qq.question_id]);
                return (
                  <button
                    key={qq.question_id}
                    onClick={() => { setCurrent(i); setShowNav(false); }}
                    className={cn(
                      'aspect-square rounded-md text-xs font-medium border relative',
                      i === current && 'ring-2 ring-primary',
                      answered ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground',
                    )}
                  >
                    {i + 1}
                    {marked[qq.question_id] && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 交卷确认 */}
      {showSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !submitting && setShowSubmit(false)} />
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-serif font-bold text-lg mb-2">确认交卷？</h3>
            <div className="text-sm text-muted-foreground space-y-1.5">
              <p>共 {questions.length} 题，已答 <span className="text-emerald-700 font-medium">{answeredCount}</span> 题</p>
              {questions.length - answeredCount > 0 && (
                <p className="text-amber-700">还有 {questions.length - answeredCount} 题未作答，交卷后不可修改</p>
              )}
            </div>
            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" disabled={submitting} onClick={() => setShowSubmit(false)}>
                再检查一下
              </Button>
              <Button
                className="flex-1"
                disabled={submitting}
                onClick={() => {
                  setSubmitting(true);
                  setError('');
                  doSubmit();
                }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                确认交卷
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
