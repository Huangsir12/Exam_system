'use client';

import { apiFetch } from '@/lib/client-fetch';
import { useExam } from '../exam-context';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { fmtDateTime, normalizePaperMode, QUESTION_TYPE_LABELS, type Difficulty, type Question, type QuestionType } from '@/lib/types';
import { ArrowDown, ArrowUp, CheckCircle2, Eye, Loader2, Plus, RefreshCw, ShieldCheck, Shuffle, Trash2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const TYPE_ORDER: Question['type'][] = ['single', 'multiple', 'judge', 'fill', 'essay'];
const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: '简单', medium: '中等', hard: '困难' };

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  actual_total: number;
  expected_total: number;
  count_by_type: Record<string, { actual: number; expected: number; ok: boolean }>;
}

function blankQuestion(type: Question['type'], sortOrder: number): Question {
  return {
    id: '',
    exam_id: '',
    type,
    content: '',
    options: type === 'single' || type === 'multiple' ? [
      { key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' },
    ] : type === 'judge' ? [{ key: 'A', text: '正确' }, { key: 'B', text: '错误' }] : null,
    answer: type === 'single' ? 'A' : type === 'multiple' ? [] : type === 'judge' ? true : type === 'fill' ? [[]] : { reference: '', points: [''] },
    analysis: '',
    score: '5',
    difficulty: 'medium',
    knowledge_point: '',
    source_document_id: null,
    source_document_name: '',
    source_location: '',
    source_excerpt: '',
    sort_order: sortOrder,
    created_at: '',
    updated_at: '',
  };
}

export default function PaperPage() {
  const { exam, reload: reloadExam } = useExam();
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [editing, setEditing] = useState<Question | null>(null);
  const [preview, setPreview] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const editable = ['draft', 'pending'].includes(exam.status);
  const paperMode = normalizePaperMode(exam.paper_mode);
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setMessage('');
    setConfirming(true);
    try {
      const res = await apiFetch(`/api/exams/${exam.id}/confirm`, { method: 'POST' });
      const json = await res.json();
      if (json.code !== 0) {
        setMessage(`确认失败：${json.message}`);
        return;
      }
      setMessage('试卷已确认，可以发布考试');
      await reloadExam();
    } finally {
      setConfirming(false);
    }
  }

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/exams/${exam.id}/questions`);
    const json = await res.json();
    if (json.code === 0) setQuestions(json.data);
    setLoading(false);
    const vres = await apiFetch(`/api/exams/${exam.id}/validate`);
    const vjson = await vres.json();
    if (vjson.code === 0) setValidation(vjson.data);
  }, [exam.id]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<Question['type'], Question[]>();
    for (const t of TYPE_ORDER) map.set(t, []);
    for (const q of questions) map.get(q.type)?.push(q);
    return map;
  }, [questions]);

  const totalScore = useMemo(() => questions.reduce((s, q) => s + Number(q.score), 0), [questions]);

  async function saveQuestion(q: Question) {
    setSaving(true);
    setMessage('');
    try {
      const isNew = !q.id;
      const res = await fetch(isNew ? `/api/exams/${exam.id}/questions` : `/api/questions/${q.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: q.type,
          content: q.content,
          options: q.options,
          answer: q.answer,
          analysis: q.analysis,
          score: q.score,
          difficulty: q.difficulty,
          knowledge_point: q.knowledge_point,
          source_document_name: q.source_document_name,
          source_location: q.source_location,
          source_excerpt: q.source_excerpt,
        }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setMessage(json.message || '保存失败');
        return;
      }
      setEditing(null);
      setMessage('已保存');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuestion(q: Question) {
    if (!window.confirm('确认删除这道题？')) return;
    await apiFetch(`/api/questions/${q.id}`, { method: 'DELETE' });
    await load();
    reloadExam();
  }

  async function regenerate(q: Question) {
    setRegeneratingId(q.id);
    setMessage('');
    try {
      const res = await apiFetch(`/api/questions/${q.id}/regenerate`, { method: 'POST' });
      const json = await res.json();
      if (json.code !== 0) {
        setMessage(`重新生成失败：${json.message}`);
        return;
      }
      setMessage('题目已重新生成');
      await load();
    } finally {
      setRegeneratingId(null);
    }
  }

  async function move(q: Question, dir: -1 | 1) {
    const list = [...questions];
    const idx = list.findIndex((item) => item.id === q.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return;
    [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
    const orders = list.map((item, i) => ({ id: item.id, sort_order: i + 1 }));
    setQuestions(list.map((item, i) => ({ ...item, sort_order: i + 1 })));
    await apiFetch(`/api/exams/${exam.id}/questions/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders }),
    });
    await load();
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="p-16 text-center">
          <p className="text-muted-foreground text-sm">还没有生成试题</p>
          <Button className="mt-4" onClick={() => router.push(`/admin/exams/${exam.id}/generate`)}>前往智能出题</Button>
          <div className="mt-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(blankQuestion('single', 1))}>
              <Plus className="w-4 h-4 mr-1" />手动添加题目
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl">
      {/* 组卷模式状态 */}
      {paperMode === 'fixed' ? (
        <Card className={cn(exam.confirmed_at ? 'border-emerald-500/30 bg-emerald-500/15' : 'border-amber-500/30 bg-amber-500/15')}>
          <CardContent className="p-4 flex items-center gap-3 flex-wrap">
            {exam.confirmed_at ? (
              <>
                <ShieldCheck className="w-5 h-5 text-emerald-300" />
                <div className="text-sm">
                  <span className="font-medium text-emerald-300">固定试卷 · 已确认</span>
                  <span className="text-muted-foreground ml-2">确认时间 {fmtDateTime(exam.confirmed_at)}，所有考生将使用本试卷</span>
                </div>
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5 text-amber-300" />
                <div className="text-sm flex-1">
                  <span className="font-medium text-amber-300">固定试卷 · 待确认</span>
                  <span className="text-muted-foreground ml-2">请核对全部题目后确认试卷，确认后才能发布考试</span>
                </div>
                {editable && (
                  <Button size="sm" onClick={handleConfirm} disabled={confirming || questions.length === 0}>
                    {confirming ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
                    确认试卷
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-indigo-500/30 bg-indigo-500/15">
          <CardContent className="p-4 flex items-center gap-3 flex-wrap">
            <Shuffle className="w-5 h-5 text-indigo-300" />
            <div className="text-sm">
              <span className="font-medium text-indigo-300">随机试卷 · 题库抽题模式</span>
              <span className="text-muted-foreground ml-2">
                本题库共 {questions.length} 题，每位考生开始考试时按配置随机抽题组卷，题序与选项自动乱序
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 校验面板 */}
      {validation && (
        <Card className={cn(validation.valid ? 'border-emerald-500/30' : 'border-red-500/30')}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {validation.valid ? (
                <><CheckCircle2 className="w-4 h-4 text-emerald-300" /><span className="text-sm font-medium text-emerald-300">试卷校验通过</span></>
              ) : (
                <><XCircle className="w-4 h-4 text-red-300" /><span className="text-sm font-medium text-red-300">校验未通过，请修正后发布</span></>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                共 {questions.length} 题 · 实际总分 {validation.actual_total} 分 / 目标 {validation.expected_total} 分
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {TYPE_ORDER.map((t) => {
                const c = validation.count_by_type[t];
                if (!c || c.expected === 0) return null;
                return (
                  <span key={t} className={cn('text-xs px-2.5 py-1 rounded-md', c.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300')}>
                    {QUESTION_TYPE_LABELS[t]} {c.actual}/{c.expected}
                  </span>
                );
              })}
            </div>
            {validation.errors.length > 0 && (
              <ul className="text-xs text-red-300 list-disc pl-5 space-y-0.5 max-h-32 overflow-y-auto">
                {validation.errors.slice(0, 12).map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            )}
            {validation.warnings.length > 0 && (
              <ul className="text-xs text-amber-300 list-disc pl-5 space-y-0.5 max-h-24 overflow-y-auto">
                {validation.warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">{paperMode === 'random' ? '题库共' : '试卷共'} {questions.length} 题，{totalScore} 分</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreview(true)}>
            <Eye className="w-4 h-4 mr-1" />预览考生端
          </Button>
          {editable && (
            <Button variant="outline" size="sm" onClick={() => setEditing(blankQuestion('single', questions.length + 1))}>
              <Plus className="w-4 h-4 mr-1" />手动添加
            </Button>
          )}
        </div>
      </div>

      {message && (
        <p className={cn('text-sm px-3 py-2 rounded-md', message.includes('失败') ? 'bg-red-500/10 text-red-300 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30')}>
          {message}
        </p>
      )}

      {!editable && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
          考试已{EXAM_STATUS_TEXT[exam.status] ?? exam.status}，试卷内容不可修改。
        </p>
      )}

      {TYPE_ORDER.map((type) => {
        const list = grouped.get(type) ?? [];
        if (list.length === 0) return null;
        const subtotal = list.reduce((s, q) => s + Number(q.score), 0);
        return (
          <div key={type}>
            <div className="flex items-center gap-2 mb-2.5">
              <h3 className="font-serif font-bold">{QUESTION_TYPE_LABELS[type]}</h3>
              <span className="text-xs text-muted-foreground">共 {list.length} 题 · {subtotal} 分</span>
            </div>
            <div className="space-y-2.5">
              {list.map((q) => {
                const globalIdx = questions.findIndex((item) => item.id === q.id);
                return (
                  <Card key={q.id} className="group">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <span className="w-7 h-7 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {globalIdx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.content}</p>
                          {q.options && (
                            <div className="mt-2 grid sm:grid-cols-2 gap-1.5">
                              {q.options.map((opt) => {
                                const isAnswer = Array.isArray(q.answer)
                                  ? (q.answer as string[]).includes(opt.key)
                                  : q.answer === opt.key;
                                return (
                                  <div key={opt.key} className={cn('text-xs px-2.5 py-1.5 rounded-md border', isAnswer ? 'border-emerald-500/30 bg-emerald-500/20 font-medium' : 'border-border/60 text-muted-foreground')}>
                                    {opt.key}. {opt.text}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-xs text-muted-foreground">
                            <span>{q.score} 分</span>
                            <span>{DIFFICULTY_LABELS[q.difficulty]}</span>
                            {q.knowledge_point && <span>知识点：{q.knowledge_point}</span>}
                            {q.source_document_name && (
                              <span className="truncate max-w-60">来源：《{q.source_document_name}》{q.source_location}</span>
                            )}
                          </div>
                          {q.source_excerpt && (
                            <p className="text-xs text-muted-foreground/80 mt-1.5 line-clamp-2 border-l-2 border-primary/20 pl-2">
                              原文：{q.source_excerpt}
                            </p>
                          )}
                        </div>
                        {editable && (
                          <div className="flex flex-col gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => move(q, -1)} disabled={globalIdx === 0}><ArrowUp className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => move(q, 1)} disabled={globalIdx === questions.length - 1}><ArrowDown className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => regenerate(q)} disabled={regeneratingId === q.id} title="重新生成此题">
                              {regeneratingId === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-red-300 hover:text-red-300 hover:bg-red-500/10" onClick={() => deleteQuestion(q)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing({ ...q })}>编辑</Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* 编辑对话框 */}
      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? '编辑题目' : '新增题目'}</DialogTitle>
          </DialogHeader>
          {editing && <QuestionForm question={editing} onChange={setEditing} onSave={() => saveQuestion(editing)} saving={saving} />}
        </DialogContent>
      </Dialog>

      {/* 考生端预览 */}
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>考生端预览（仅浏览，不可作答）</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            {questions.map((q, idx) => (
              <div key={q.id} className="border border-border rounded-lg p-4">
                <div className="flex items-start gap-2.5">
                  <span className="text-sm font-medium shrink-0">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.content}</p>
                    <span className="text-xs text-muted-foreground">（{QUESTION_TYPE_LABELS[q.type]} · {q.score} 分）</span>
                    {q.options && (
                      <div className="mt-2.5 space-y-1.5">
                        {q.options.map((opt) => (
                          <div key={opt.key} className="flex items-center gap-2 text-sm border border-border rounded-md px-3 py-2">
                            <span className="font-medium">{opt.key}.</span>
                            <span>{opt.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(q.type === 'fill' || q.type === 'essay') && (
                      <div className="mt-2.5 border border-dashed border-border rounded-md px-3 py-6 text-xs text-muted-foreground text-center">
                        {q.type === 'fill' ? '填空作答区' : '简答作答区'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const EXAM_STATUS_TEXT: Record<string, string> = { published: '发布', ongoing: '开始', ended: '结束', archived: '归档' };

function QuestionForm({
  question,
  onChange,
  onSave,
  saving,
}: {
  question: Question;
  onChange: (q: Question) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const q = question;
  const patch = (p: Partial<Question>) => onChange({ ...q, ...p });
  const answer = q.answer as string | string[] | boolean | string[][] | { reference: string; points: string[] };

  return (
    <div className="space-y-4 pt-1">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>题型</Label>
          <select
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            value={q.type}
            disabled={!!q.id}
            onChange={(e) => {
              const t = e.target.value as QuestionType;
              const fresh = blankQuestion(t, q.sort_order);
              onChange({ ...fresh, id: q.id, exam_id: q.exam_id });
            }}
          >
            {TYPE_ORDER.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>分值 *</Label>
          <Input type="number" min={0.5} step={0.5} value={q.score} onChange={(e) => patch({ score: e.target.value })} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>题干 *（填空题用 ____ 表示空位）</Label>
        <Textarea rows={3} value={q.content} onChange={(e) => patch({ content: e.target.value })} />
      </div>

      {(q.type === 'single' || q.type === 'multiple') && q.options && (
        <div className="space-y-2">
          <Label>选项 *</Label>
          {q.options.map((opt, i) => (
            <div key={opt.key} className="flex items-center gap-2">
              <span className="w-6 text-sm font-medium text-muted-foreground">{opt.key}.</span>
              <Input
                value={opt.text}
                onChange={(e) => {
                  const opts = [...(q.options ?? [])];
                  opts[i] = { ...opt, text: e.target.value };
                  patch({ options: opts });
                }}
              />
              {q.options!.length > 2 && (
                <Button variant="ghost" size="sm" onClick={() => {
                  const opts = q.options!.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, key: String.fromCharCode(65 + idx) }));
                  patch({ options: opts });
                }}><Trash2 className="w-3.5 h-3.5" /></Button>
              )}
            </div>
          ))}
          {q.options.length < 8 && (
            <Button variant="outline" size="sm" onClick={() => patch({ options: [...q.options!, { key: String.fromCharCode(65 + q.options!.length), text: '' }] })}>
              <Plus className="w-3.5 h-3.5 mr-1" />添加选项
            </Button>
          )}
        </div>
      )}

      {q.type === 'single' && q.options && (
        <div className="space-y-2">
          <Label>正确答案 *</Label>
          <RadioGroup value={String(answer)} onValueChange={(v) => patch({ answer: v })} className="flex gap-4">
            {q.options.map((opt) => (
              <label key={opt.key} className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value={opt.key} />{opt.key}
              </label>
            ))}
          </RadioGroup>
        </div>
      )}

      {q.type === 'multiple' && q.options && (
        <div className="space-y-2">
          <Label>正确答案（至少 2 项）*</Label>
          <div className="flex gap-4 flex-wrap">
            {q.options.map((opt) => {
              const arr = (answer as string[]) ?? [];
              return (
                <label key={opt.key} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={arr.includes(opt.key)}
                    onCheckedChange={(v) => {
                      const next = v === true ? [...arr, opt.key].sort() : arr.filter((k) => k !== opt.key);
                      patch({ answer: next });
                    }}
                  />
                  {opt.key}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {q.type === 'judge' && (
        <div className="space-y-2">
          <Label>正确答案 *</Label>
          <RadioGroup value={String(answer)} onValueChange={(v) => patch({ answer: v === 'true' })} className="flex gap-4">
            <label className="flex items-center gap-1.5 text-sm"><RadioGroupItem value="true" />正确</label>
            <label className="flex items-center gap-1.5 text-sm"><RadioGroupItem value="false" />错误</label>
          </RadioGroup>
        </div>
      )}

      {q.type === 'fill' && (
        <div className="space-y-2">
          <Label>每空答案（多个可接受答案用「|」分隔）*</Label>
          {((answer as string[][]) ?? [[]]).map((group, gi) => (
            <div key={gi} className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-14 shrink-0">第 {gi + 1} 空</span>
              <Input
                value={group.join('|')}
                onChange={(e) => {
                  const groups = (answer as string[][]).map((g, idx) => idx === gi ? e.target.value.split('|').map((s) => s.trim()).filter(Boolean) : g);
                  patch({ answer: groups });
                }}
              />
            </div>
          ))}
          <Button
            variant="outline" size="sm"
            onClick={() => patch({ answer: [...((answer as string[][]) ?? [[]]), []] })}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />添加空位
          </Button>
        </div>
      )}

      {q.type === 'essay' && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>参考答案 *</Label>
            <Textarea rows={3} value={(answer as { reference: string; points: string[] }).reference ?? ''} onChange={(e) => patch({ answer: { ...(answer as { reference: string; points: string[] }), reference: e.target.value } })} />
          </div>
          <div className="space-y-2">
            <Label>评分要点（每行一条）*</Label>
            <Textarea
              rows={3}
              value={((answer as { reference: string; points: string[] }).points ?? []).join('\n')}
              onChange={(e) => patch({ answer: { ...(answer as { reference: string; points: string[] }), points: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } })}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>解析 *</Label>
        <Textarea rows={2} value={q.analysis} onChange={(e) => patch({ analysis: e.target.value })} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>难度</Label>
          <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" value={q.difficulty} onChange={(e) => patch({ difficulty: e.target.value as Difficulty })}>
            <option value="easy">简单</option>
            <option value="medium">中等</option>
            <option value="hard">困难</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>知识点</Label>
          <Input value={q.knowledge_point} onChange={(e) => patch({ knowledge_point: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>来源文档</Label>
          <Input value={q.source_document_name} onChange={(e) => patch({ source_document_name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>来源位置（章节/页码）</Label>
          <Input value={q.source_location} onChange={(e) => patch({ source_location: e.target.value })} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>知识原文摘录 *</Label>
        <Textarea rows={3} value={q.source_excerpt} onChange={(e) => patch({ source_excerpt: e.target.value })} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
          保存
        </Button>
      </div>
    </div>
  );
}
