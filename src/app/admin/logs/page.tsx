'use client';

import { apiFetch } from '@/lib/client-fetch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  Activity, AlertTriangle, BookOpenText, Bot, ChevronLeft, ChevronRight,
  ClipboardList, FileQuestion, Filter, RefreshCw, ScrollText, Search,
  ShieldCheck, UserRound, UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

interface OperationLog {
  id: string;
  operator_type: string;
  operator_name: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

interface LogPage {
  items: OperationLog[];
  total: number;
  page: number;
  page_size: number;
}

interface ActionMeta {
  label: string;
  icon: LucideIcon;
  tone: string;
}

const ACTION_LABELS: Record<string, string> = {
  admin_login: '管理员登录', admin_create: '创建管理员', admin_update: '修改管理员', admin_delete: '删除管理员',
  candidate_login: '考生登录', candidate_add: '添加考生', candidate_import: '导入考生', candidate_update: '修改考生', candidate_remove: '移除考生',
  document_upload: '上传文档', document_parse: '解析文档', document_rename: '重命名文档', document_delete: '删除文档',
  exam_create: '创建考试', exam_update: '修改考试', exam_delete: '删除考试', exam_generate: '智能组卷', exam_confirm: '确认试卷', exam_publish: '发布考试', exam_archive: '归档考试',
  question_create: '新增试题', question_update: '修改试题', question_delete: '删除试题', question_reorder: '调整题序', question_regenerate: '重新生成试题',
  manual_grade: '人工阅卷', publish_results: '发布成绩', export: '导出数据',
};

const CATEGORY_META: Record<string, Omit<ActionMeta, 'label'>> = {
  admin: { icon: ShieldCheck, tone: 'border-violet-400/25 bg-violet-400/10 text-violet-300' },
  candidate: { icon: UsersRound, tone: 'border-sky-400/25 bg-sky-400/10 text-sky-300' },
  document: { icon: BookOpenText, tone: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
  exam: { icon: ClipboardList, tone: 'border-primary/25 bg-primary/10 text-primary' },
  question: { icon: FileQuestion, tone: 'border-amber-400/25 bg-amber-400/10 text-amber-300' },
  manual: { icon: UserRound, tone: 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-300' },
  system: { icon: Bot, tone: 'border-slate-400/25 bg-slate-400/10 text-slate-300' },
};

const OPERATOR_LABELS: Record<string, string> = { admin: '管理员', candidate: '考生', system: '系统' };

function getActionMeta(action: string): ActionMeta {
  const category = ['manual_grade', 'publish_results', 'export'].includes(action)
    ? 'exam'
    : action.split('_')[0] || 'system';
  const meta = CATEGORY_META[category] ?? CATEGORY_META.system;
  return { label: ACTION_LABELS[action] ?? action, ...meta };
}

function formatTime(value: string): { date: string; time: string } {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date),
    time: new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date),
  };
}

function ObjectLabel({ log }: { log: OperationLog }) {
  if (!log.target_type && !log.target_id) return <span className="text-muted-foreground/50">无关联对象</span>;
  return (
    <div className="min-w-0">
      <p className="text-xs text-foreground/80">{log.target_type || '对象'}</p>
      {log.target_id && <p className="mt-1 truncate font-mono text-[10px] tracking-wide text-muted-foreground" title={log.target_id}>ID · {log.target_id.slice(0, 12)}</p>}
    </div>
  );
}

export default function AdminLogsPage() {
  const [data, setData] = useState<LogPage | null>(null);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('all');
  const [operatorType, setOperatorType] = useState('all');
  const [operatorInput, setOperatorInput] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), page_size: '30' });
    if (category !== 'all') params.set('category', category);
    if (operatorType !== 'all') params.set('operator_type', operatorType);
    if (operatorName) params.set('operator_name', operatorName);

    try {
      const response = await apiFetch(`/api/admin/logs?${params.toString()}`);
      const json = await response.json();
      if (!response.ok || json.code !== 0) {
        setError(json.message || '日志加载失败');
        return;
      }
      setData(json.data as LogPage);
    } catch {
      setError('网络异常，日志加载失败');
    } finally {
      setLoading(false);
    }
  }, [category, operatorName, operatorType, page]);

  useEffect(() => { load(); }, [load]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setOperatorName(operatorInput.trim());
  }

  function resetFilters() {
    setCategory('all'); setOperatorType('all'); setOperatorInput(''); setOperatorName(''); setPage(1);
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const hasFilters = category !== 'all' || operatorType !== 'all' || operatorName !== '';

  return (
    <div className="space-y-6 page-enter">
      <section className="relative overflow-hidden rounded-xl border border-primary/20 bg-[linear-gradient(135deg,oklch(0.22_0.035_250/95%),oklch(0.17_0.024_275/98%))] p-5 shadow-[0_20px_60px_-38px_oklch(0.8_0.13_195/55%)] sm:p-7">
        <div className="absolute -right-20 -top-24 size-64 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="tech-kicker"><Activity className="size-3" aria-hidden="true" /> Audit stream online</div>
            <h1 className="mt-3 font-display text-2xl font-bold tracking-wide sm:text-3xl">操作日志</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">关键行为全链路留痕，让每一次操作有据可查。</p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-primary/15 bg-background/30 px-4 py-3 backdrop-blur-sm">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><ScrollText className="size-4" aria-hidden="true" /></div>
            <div><p className="font-display text-2xl font-bold tabular-nums text-gradient">{data?.total ?? '—'}</p><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">审计记录</p></div>
          </div>
        </div>
      </section>

      <section className="card-tech rounded-xl p-3 sm:p-4" aria-label="日志筛选">
        <form onSubmit={applySearch} className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground"><Filter className="size-4 text-primary" aria-hidden="true" />筛选视图</div>
          <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_150px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={operatorInput} onChange={(event) => setOperatorInput(event.target.value)} className="bg-background/35 pl-9" placeholder="搜索操作者姓名" aria-label="搜索操作者姓名" />
            </div>
            <Select value={category} onValueChange={(value) => { setCategory(value); setPage(1); }}>
              <SelectTrigger className="h-11 w-full bg-background/35 md:h-9" aria-label="操作模块"><SelectValue placeholder="全部模块" /></SelectTrigger>
              <SelectContent><SelectItem value="all">全部模块</SelectItem><SelectItem value="exam">考试管理</SelectItem><SelectItem value="document">知识文档</SelectItem><SelectItem value="question">试题管理</SelectItem><SelectItem value="candidate">考生管理</SelectItem><SelectItem value="admin">管理员</SelectItem></SelectContent>
            </Select>
            <Select value={operatorType} onValueChange={(value) => { setOperatorType(value); setPage(1); }}>
              <SelectTrigger className="h-11 w-full bg-background/35 md:h-9" aria-label="操作者类型"><SelectValue placeholder="全部角色" /></SelectTrigger>
              <SelectContent><SelectItem value="all">全部角色</SelectItem><SelectItem value="admin">管理员</SelectItem><SelectItem value="candidate">考生</SelectItem><SelectItem value="system">系统</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="min-h-11 flex-1 xl:min-h-9 xl:flex-none"><Search aria-hidden="true" />查询</Button>
            {hasFilters && <Button type="button" variant="ghost" className="min-h-11 xl:min-h-9" onClick={resetFilters}><RefreshCw aria-hidden="true" />重置</Button>}
          </div>
        </form>
      </section>

      {error ? (
        <div role="alert" className="card-tech rounded-xl px-5 py-12 text-center"><AlertTriangle className="mx-auto size-9 text-amber-300" aria-hidden="true" /><p className="mt-3 text-sm text-muted-foreground">{error}</p><Button variant="outline" className="mt-4" onClick={load}>重新加载</Button></div>
      ) : loading && !data ? (
        <div className="card-tech h-72 animate-pulse rounded-xl" aria-label="正在加载操作日志" aria-busy="true" />
      ) : data && data.items.length === 0 ? (
        <div className="card-tech rounded-xl px-5 py-16 text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/5"><ScrollText className="size-6 text-primary/60" aria-hidden="true" /></div><p className="mt-4 font-medium">没有匹配的日志</p><p className="mt-1 text-sm text-muted-foreground">调整筛选条件后再试试</p>{hasFilters && <Button variant="outline" className="mt-5" onClick={resetFilters}>清除筛选</Button>}</div>
      ) : data ? (
        <>
          <div className={cn('card-tech overflow-hidden rounded-xl transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
            <div className="hidden md:block">
              <Table>
                <caption className="sr-only">系统操作日志，共 {data.total} 条</caption>
                <TableHeader className="bg-muted/25"><TableRow className="border-border/80 hover:bg-transparent"><TableHead className="h-12 w-44 px-5 text-xs uppercase tracking-wider text-muted-foreground">发生时间</TableHead><TableHead className="h-12 min-w-44 text-xs uppercase tracking-wider text-muted-foreground">操作事件</TableHead><TableHead className="h-12 w-48 text-xs uppercase tracking-wider text-muted-foreground">操作者</TableHead><TableHead className="h-12 w-52 px-5 text-xs uppercase tracking-wider text-muted-foreground">关联对象</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.items.map((log) => {
                    const action = getActionMeta(log.action); const ActionIcon = action.icon; const timestamp = formatTime(log.created_at);
                    return (
                      <TableRow key={log.id} className="group border-border/60 hover:bg-primary/[0.035]">
                        <TableCell className="px-5 py-4"><p className="font-display text-sm font-semibold tabular-nums text-foreground/90">{timestamp.time}</p><p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{timestamp.date}</p></TableCell>
                        <TableCell className="py-4"><div className="flex items-center gap-3"><div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg border transition-transform group-hover:scale-105', action.tone)}><ActionIcon className="size-4" aria-hidden="true" /></div><div><p className="text-sm font-medium text-foreground">{action.label}</p><p className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">{log.action}</p></div></div></TableCell>
                        <TableCell className="py-4"><div className="flex items-center gap-2.5"><div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-xs font-semibold text-foreground">{(log.operator_name || '系').slice(0, 1)}</div><div className="min-w-0"><p className="truncate text-sm font-medium">{log.operator_name || '系统'}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{OPERATOR_LABELS[log.operator_type] ?? log.operator_type}</p></div></div></TableCell>
                        <TableCell className="px-5 py-4"><ObjectLabel log={log} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y divide-border/60 md:hidden">
              {data.items.map((log) => {
                const action = getActionMeta(log.action); const ActionIcon = action.icon; const timestamp = formatTime(log.created_at);
                return (
                  <article key={log.id} className="relative p-4"><div className="flex items-start gap-3"><div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl border', action.tone)}><ActionIcon className="size-4" aria-hidden="true" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">{action.label}</h2><p className="mt-1 text-xs text-muted-foreground">{log.operator_name || '系统'} · {OPERATOR_LABELS[log.operator_type] ?? log.operator_type}</p></div><Badge variant="outline" className="border-border bg-muted/30 font-display text-[10px] text-muted-foreground">{timestamp.time}</Badge></div><div className="mt-3 flex items-end justify-between gap-3 border-t border-border/50 pt-3"><ObjectLabel log={log} /><time className="shrink-0 text-[10px] tabular-nums text-muted-foreground" dateTime={log.created_at}>{timestamp.date}</time></div></div></div></article>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/35 px-4 py-3 sm:flex-row">
            <p className="text-xs text-muted-foreground">显示第 <span className="font-medium text-foreground">{(page - 1) * data.page_size + 1}–{Math.min(page * data.page_size, data.total)}</span> 条，共 <span className="font-medium text-foreground">{data.total}</span> 条</p>
            <div className="flex items-center gap-2"><Button variant="outline" size="sm" className="min-h-10" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" />上一页</Button><span className="min-w-16 text-center font-display text-xs tabular-nums text-muted-foreground">{page} / {pageCount}</span><Button variant="outline" size="sm" className="min-h-10" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>下一页<ChevronRight aria-hidden="true" /></Button></div>
          </div>
        </>
      ) : null}
    </div>
  );
}
