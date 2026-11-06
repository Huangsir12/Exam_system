'use client';

import { useExam } from '../layout';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QUESTION_TYPE_LABELS, type QuestionType } from '@/lib/types';
import { CheckCircle2, Loader2, Sparkles, XCircle } from 'lucide-react';

interface ProgressItem {
  type: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  generated: number;
  total: number;
  detail?: string;
}

interface LogEntry {
  time: string;
  text: string;
}

export default function GeneratePage() {
  const { exam, reload } = useExam();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<{ generated: number; errors: string[] } | null>(null);
  const startedRef = useRef(false);
  const logBoxRef = useRef<HTMLDivElement>(null);

  function pushLog(text: string) {
    setLogs((prev) => [...prev.slice(-80), { time: new Date().toLocaleTimeString('zh-CN'), text }]);
  }

  useEffect(() => {
    logBoxRef.current?.scrollTo({ top: logBoxRef.current.scrollHeight });
  }, [logs]);

  async function startGenerate() {
    if (running) return;
    setRunning(true);
    setResult(null);
    setLogs([]);
    const config = exam.question_config ?? [];
    setItems(config.map((c) => ({ type: c.type, status: 'pending', generated: 0, total: c.count })));
    pushLog('开始智能出题任务…');

    try {
      const res = await fetch(`/api/exams/${exam.id}/generate`, { method: 'POST' });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        pushLog(`启动失败：${json?.message ?? res.statusText}`);
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handle = (event: string, data: Record<string, unknown>) => {
        if (event === 'start') {
          pushLog(`任务启动，计划生成 ${data.total ?? 0} 道题`);
        } else if (event === 'progress') {
          const type = data.type as QuestionType;
          const generated = Number(data.generated ?? 0);
          const detail = String(data.detail ?? '');
          setItems((prev) => prev.map((it) => it.type === type ? { ...it, status: 'generating', generated, detail } : it));
          if (detail) pushLog(`[${QUESTION_TYPE_LABELS[type as QuestionType]}] ${detail}（${generated} 题）`);
        } else if (event === 'type_done') {
          const type = data.type as string;
          const count = Number(data.count ?? 0);
          setItems((prev) => prev.map((it) => it.type === type ? { ...it, status: 'done', generated: count } : it));
          pushLog(`${QUESTION_TYPE_LABELS[type as QuestionType]} 完成，共 ${count} 题`);
        } else if (event === 'done') {
          const generated = Number(data.generated ?? 0);
          const errors = (data.errors as string[]) ?? [];
          setResult({ generated, errors });
          pushLog(`任务结束：成功生成 ${generated} 题${errors.length > 0 ? `，${errors.length} 个题型存在问题` : ''}`);
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const lines = part.split('\n');
          let event = '';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
          }
          if (event && dataStr) {
            try {
              handle(event, JSON.parse(dataStr));
            } catch {
              // 忽略解析失败的片段
            }
          }
        }
      }
    } catch {
      pushLog('连接中断，请刷新页面查看出题结果');
    } finally {
      setRunning(false);
      reload();
    }
  }

  // 若考试处于 generating 状态且页面刚打开，自动启动（来自创建页跳转）
  useEffect(() => {
    if (startedRef.current) return;
    if (exam.generation_status === 'generating' || (exam.generation_status === 'none' && exam.status === 'draft')) {
      startedRef.current = true;
      startGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam.id]);

  const allDone = result !== null;

  return (
    <div className="max-w-4xl grid lg:grid-cols-5 gap-5">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3"><CardTitle className="text-base">出题进度</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 && !running && (
            <p className="text-sm text-muted-foreground">点击下方按钮开始智能出题</p>
          )}
          {items.map((item) => (
            <div key={item.type} className="border border-border rounded-lg p-3.5">
              <div className="flex items-center gap-2.5">
                {item.status === 'done' ? (
                  <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
                ) : item.status === 'generating' ? (
                  <Loader2 className="w-4.5 h-4.5 text-primary animate-spin" />
                ) : item.status === 'error' ? (
                  <XCircle className="w-4.5 h-4.5 text-red-600" />
                ) : (
                  <div className="w-4.5 h-4.5 rounded-full border-2 border-muted" />
                )}
                <span className="text-sm font-medium">{QUESTION_TYPE_LABELS[item.type as QuestionType]}</span>
                <span className="ml-auto text-sm text-muted-foreground">{item.generated} / {item.total}</span>
              </div>
              {item.detail && item.status === 'generating' && (
                <p className="text-xs text-muted-foreground mt-2 pl-7">{item.detail}</p>
              )}
              <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${item.total > 0 ? Math.min(100, (item.generated / item.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))}

          {allDone && (
            <div className={`rounded-lg p-3.5 text-sm ${result.errors.length > 0 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
              <p className="font-medium">共生成 {result.generated} 道题</p>
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs mt-1">{err}</p>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {!running ? (
              <>
                <Button onClick={startGenerate}>
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  {allDone ? '重新生成全部题目' : '开始出题'}
                </Button>
                {allDone && result.generated > 0 && (
                  <Button variant="outline" onClick={() => router.push(`/admin/exams/${exam.id}/paper`)}>前往试卷编辑</Button>
                )}
              </>
            ) : (
              <Button variant="outline" disabled>
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                正在生成，请勿关闭页面
              </Button>
            )}
          </div>
          {exam.generation_status === 'failed' && !running && !allDone && (
            <p className="text-xs text-red-600">上次出题失败（{exam.generation_error ?? '未知原因'}），可重新发起。</p>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader className="pb-3"><CardTitle className="text-base">生成日志</CardTitle></CardHeader>
        <CardContent>
          <div ref={logBoxRef} className="bg-sidebar rounded-lg p-4 h-[420px] overflow-y-auto font-mono text-xs space-y-1.5">
            {logs.length === 0 ? (
              <p className="text-sidebar-foreground/40">等待任务开始…</p>
            ) : (
              logs.map((log, i) => (
                <p key={i} className="text-sidebar-foreground/80">
                  <span className="text-sidebar-foreground/40">[{log.time}]</span> {log.text}
                </p>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
