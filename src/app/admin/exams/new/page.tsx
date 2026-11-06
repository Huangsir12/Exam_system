'use client';

import { apiFetch } from '@/lib/client-fetch';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { QUESTION_TYPE_LABELS, type KnowledgeDocument, type QuestionType } from '@/lib/types';
import { ArrowLeft, Loader2 } from 'lucide-react';

const QUESTION_TYPES: QuestionType[] = ['single', 'multiple', 'judge', 'fill', 'essay'];

interface TypeConfig {
  enabled: boolean;
  count: number;
  score: number;
  difficulty: { easy: number; medium: number; hard: number };
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function NewExamPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [passScore, setPassScore] = useState(60);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [paperMode, setPaperMode] = useState<'fixed' | 'random'>('fixed');
  const [resultVisibility, setResultVisibility] = useState<'immediate' | 'after_end' | 'manual'>('immediate');
  const [showAnswer, setShowAnswer] = useState(true);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [showSource, setShowSource] = useState(true);

  const [typeConfigs, setTypeConfigs] = useState<Record<QuestionType, TypeConfig>>({
    single: { enabled: true, count: 10, score: 4, difficulty: { easy: 4, medium: 4, hard: 2 } },
    multiple: { enabled: true, count: 5, score: 6, difficulty: { easy: 1, medium: 3, hard: 1 } },
    judge: { enabled: true, count: 5, score: 4, difficulty: { easy: 3, medium: 2, hard: 0 } },
    fill: { enabled: false, count: 0, score: 5, difficulty: { easy: 0, medium: 0, hard: 0 } },
    essay: { enabled: false, count: 1, score: 10, difficulty: { easy: 0, medium: 1, hard: 0 } },
  });

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    setStartTime(toLocalInput(start));
    setEndTime(toLocalInput(end));

    apiFetch('/api/documents')
      .then((r) => r.json())
      .then((json) => {
        if (json.code === 0) {
          setDocs((json.data as KnowledgeDocument[]).filter((d) => d.parse_status === 'success'));
        }
      });
  }, []);

  const totalScore = useMemo(
    () => QUESTION_TYPES.reduce((sum, t) => sum + (typeConfigs[t].enabled ? typeConfigs[t].count * typeConfigs[t].score : 0), 0),
    [typeConfigs],
  );

  function toggleDoc(id: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateType(type: QuestionType, patch: Partial<TypeConfig>) {
    setTypeConfigs((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  }

  function updateDifficulty(type: QuestionType, level: 'easy' | 'medium' | 'hard', value: number) {
    setTypeConfigs((prev) => ({
      ...prev,
      [type]: { ...prev[type], difficulty: { ...prev[type].difficulty, [level]: Math.max(0, value) } },
    }));
  }

  async function handleSubmit() {
    setError('');
    if (!title.trim()) return setError('请填写考试名称');
    if (selectedDocs.size === 0) return setError('请至少选择一份知识文档');
    if (!startTime || !endTime) return setError('请设置考试开始和结束时间');
    if (new Date(endTime) <= new Date(startTime)) return setError('结束时间必须晚于开始时间');
    if (duration <= 0) return setError('答题时长必须大于 0');
    const questionConfig = QUESTION_TYPES
      .filter((t) => typeConfigs[t].enabled && typeConfigs[t].count > 0)
      .map((t, idx) => ({
        type: t,
        count: typeConfigs[t].count,
        score: typeConfigs[t].score,
        order: idx + 1,
        difficulty: typeConfigs[t].difficulty,
      }));
    if (questionConfig.length === 0) return setError('请至少配置一种题型');
    for (const cfg of questionConfig) {
      if (cfg.score <= 0) return setError(`${QUESTION_TYPE_LABELS[cfg.type]}单题分值必须大于 0`);
    }
    if (passScore < 0 || passScore > totalScore) return setError(`及格分必须在 0 ~ ${totalScore} 之间`);

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          document_ids: Array.from(selectedDocs),
          content_scope: [],
          question_config: questionConfig,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
          duration_minutes: duration,
          pass_score: passScore,
          max_attempts: maxAttempts,
          paper_mode: paperMode,
          result_visibility: resultVisibility,
          show_answer: showAnswer,
          show_analysis: showAnalysis,
          show_source: showSource,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.code !== 0) {
        setError(json.message || '创建失败');
        return;
      }
      router.push(`/admin/exams/${json.data.id}/generate`);
    } catch {
      setError('网络异常，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="font-serif text-2xl font-bold">创建考试</h1>
          <p className="text-sm text-muted-foreground mt-0.5">配置考试信息与组卷规则，创建后进入智能出题</p>
        </div>
      </div>

      {/* 基本信息 */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">基本信息</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>考试名称 *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：2026 年新员工入职培训考核" />
          </div>
          <div className="space-y-2">
            <Label>考试说明</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="考试目的、注意事项等，将展示给考生" rows={3} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>开始时间 *</Label>
              <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>结束时间 *</Label>
              <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>答题时长（分钟）*</Label>
              <Input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>可考次数</Label>
              <Input type="number" min={1} max={10} value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 知识文档 */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">出题知识文档 *</CardTitle></CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              暂无已解析的文档，请先到 <Link href="/admin/documents" className="text-primary hover:underline">知识文档</Link> 上传并解析。
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {docs.map((doc) => (
                <label
                  key={doc.id}
                  className={`flex items-center gap-2.5 border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${selectedDocs.has(doc.id) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}
                >
                  <Checkbox checked={selectedDocs.has(doc.id)} onCheckedChange={() => toggleDoc(doc.id)} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{doc.file_type.toUpperCase()} · {(doc.file_size / 1024).toFixed(0)} KB</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 题型与分值 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">题型与分值配置 *</CardTitle>
            <span className="text-sm">试卷总分：<span className="font-serif font-bold text-lg text-primary">{totalScore}</span> 分</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {QUESTION_TYPES.map((type) => {
            const cfg = typeConfigs[type];
            return (
              <div key={type} className={`border rounded-lg p-3.5 transition-colors ${cfg.enabled ? 'border-primary/40 bg-primary/[0.02]' : 'border-border'}`}>
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 font-medium text-sm">
                    <Checkbox checked={cfg.enabled} onCheckedChange={(v) => updateType(type, { enabled: v === true })} />
                    {QUESTION_TYPE_LABELS[type]}
                  </label>
                  {cfg.enabled && (
                    <>
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        题量
                        <Input type="number" min={1} max={100} className="w-20 h-8" value={cfg.count} onChange={(e) => updateType(type, { count: Number(e.target.value) })} />
                      </span>
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        每题
                        <Input type="number" min={0.5} step={0.5} className="w-20 h-8" value={cfg.score} onChange={(e) => updateType(type, { score: Number(e.target.value) })} />
                        分
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        难度 易/中/难
                        <Input type="number" min={0} className="w-14 h-8" value={cfg.difficulty.easy} onChange={(e) => updateDifficulty(type, 'easy', Number(e.target.value))} />
                        <Input type="number" min={0} className="w-14 h-8" value={cfg.difficulty.medium} onChange={(e) => updateDifficulty(type, 'medium', Number(e.target.value))} />
                        <Input type="number" min={0} className="w-14 h-8" value={cfg.difficulty.hard} onChange={(e) => updateDifficulty(type, 'hard', Number(e.target.value))} />
                      </span>
                      <span className="ml-auto text-sm text-muted-foreground">小计 <span className="font-bold text-foreground">{cfg.count * cfg.score}</span> 分</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-4 pt-1">
            <div className="space-y-2 w-40">
              <Label>及格分 *</Label>
              <Input type="number" min={0} max={totalScore} value={passScore} onChange={(e) => setPassScore(Number(e.target.value))} />
            </div>
            <p className="text-xs text-muted-foreground mt-6">及格分不得高于试卷总分 {totalScore} 分</p>
          </div>
        </CardContent>
      </Card>

      {/* 组卷方式 */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">组卷方式</CardTitle></CardHeader>
        <CardContent>
          <RadioGroup value={paperMode} onValueChange={(v) => setPaperMode(v as typeof paperMode)} className="grid sm:grid-cols-2 gap-3">
            {[
              { value: 'fixed', label: '固定试卷', desc: '所有考生使用同一套试卷。生成题目后需管理员确认，确认后方可发布' },
              { value: 'random', label: '随机试卷', desc: '系统按试卷要求生成题库，考生点击开始考试时随机抽题组卷，每人试卷不同' },
            ].map((item) => (
              <label key={item.value} className={`border rounded-lg p-3.5 cursor-pointer transition-colors ${paperMode === item.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={item.value} />
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 ml-6">{item.desc}</p>
              </label>
            ))}
          </RadioGroup>
          {paperMode === 'random' && (
            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 mt-3">
              随机试卷将按题型配置题量的 2 倍生成题库；考生开考时从中随机抽题，题目与选项顺序自动打乱。
            </p>
          )}
        </CardContent>
      </Card>

      {/* 结果公开 */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">成绩与解析公开规则</CardTitle></CardHeader>
        <CardContent>
          <RadioGroup value={resultVisibility} onValueChange={(v) => setResultVisibility(v as typeof resultVisibility)} className="grid sm:grid-cols-3 gap-3">
            {[
              { value: 'immediate', label: '提交后立即公开', desc: '交卷后即可查看成绩（有主观题时需待阅卷）' },
              { value: 'after_end', label: '考试结束后公开', desc: '考试结束后统一开放查询' },
              { value: 'manual', label: '管理员手动发布', desc: '由管理员在成绩页手动发布结果' },
            ].map((item) => (
              <label key={item.value} className={`border rounded-lg p-3.5 cursor-pointer transition-colors ${resultVisibility === item.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={item.value} />
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 ml-6">{item.desc}</p>
              </label>
            ))}
          </RadioGroup>
          <div className="flex gap-6 mt-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={showAnswer} onCheckedChange={(v) => setShowAnswer(v === true)} />
              公开标准答案
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={showAnalysis} onCheckedChange={(v) => setShowAnalysis(v === true)} />
              公开解析
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={showSource} onCheckedChange={(v) => setShowSource(v === true)} />
              公开知识原文
            </label>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => router.back()}>取消</Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
          创建并智能出题
        </Button>
      </div>
    </div>
  );
}
