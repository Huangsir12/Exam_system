'use client';

import { useExam } from '../layout';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Download, Eye, Loader2, PenLine } from 'lucide-react';

interface ResultRow {
  candidate_id: string;
  name: string;
  phone_masked: string;
  has_started: boolean;
  attempt_id: string | null;
  attempt_status: string;
  started_at: string | null;
  submitted_at: string | null;
  duration_seconds: number | null;
  objective_score: number | null;
  subjective_score: number | null;
  total_score: number | null;
  is_passed: boolean | null;
  grading_status: string;
}

const SUBMITTED_STATUSES = ['submitted', 'grading', 'completed'];

function fmtDuration(sec: number | null): string {
  if (sec === null || sec === undefined) return '—';
  const m = Math.floor(sec / 60);
  return `${m}分${sec % 60}秒`;
}

export default function ResultsPage() {
  const { exam } = useExam();
  const router = useRouter();
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [passedFilter, setPassedFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'not_started' | 'grading'>('all');
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/exams/${exam.id}/results`);
    const json = await res.json();
    if (json.code === 0) setRows(json.data.rows ?? []);
    setLoading(false);
  }, [exam.id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  const filtered = rows.filter((row) => {
    const submitted = SUBMITTED_STATUSES.includes(row.attempt_status);
    if (keyword && !row.name.includes(keyword) && !row.phone_masked.includes(keyword)) return false;
    if (passedFilter === 'passed' && row.is_passed !== true) return false;
    if (passedFilter === 'failed' && row.is_passed !== false) return false;
    if (statusFilter === 'submitted' && !submitted) return false;
    if (statusFilter === 'not_started' && row.has_started) return false;
    if (statusFilter === 'grading' && row.grading_status !== 'pending') return false;
    if (minScore !== '' && (row.total_score === null || row.total_score < Number(minScore))) return false;
    if (maxScore !== '' && (row.total_score === null || row.total_score > Number(maxScore))) return false;
    return true;
  });

  async function handleExport() {
    const url = `/api/exams/${exam.id}/export`;
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${exam.title}-成绩明细.csv`;
    link.click();
    window.URL.revokeObjectURL(blobUrl);
  }

  const submittedCount = rows.filter((r) => SUBMITTED_STATUSES.includes(r.attempt_status)).length;
  const gradingPending = rows.filter((r) => r.grading_status === 'pending').length;

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">
          应考 {rows.length} 人 · 已交卷 {submittedCount} 人
          {gradingPending > 0 && <span className="text-amber-300 ml-2">{gradingPending} 份待阅卷</span>}
        </p>
        <div className="flex gap-2">
          {gradingPending > 0 && (
            <Link href={`/admin/exams/${exam.id}/grading`}>
              <Button size="sm" variant="outline">前往阅卷</Button>
            </Link>
          )}
          <Button size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" />导出成绩
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Input className="w-44" placeholder="姓名 / 手机号" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-background" value={passedFilter} onChange={(e) => setPassedFilter(e.target.value as typeof passedFilter)}>
          <option value="all">全部及格状态</option>
          <option value="passed">仅及格</option>
          <option value="failed">仅不及格</option>
        </select>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-background" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="all">全部状态</option>
          <option value="submitted">已交卷</option>
          <option value="not_started">未开考</option>
          <option value="grading">阅卷中</option>
        </select>
        <span className="text-xs text-muted-foreground">分数区间</span>
        <Input className="w-20" placeholder="最低" value={minScore} onChange={(e) => setMinScore(e.target.value)} />
        <span className="text-xs text-muted-foreground">~</span>
        <Input className="w-20" placeholder="最高" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-14 text-center text-sm text-muted-foreground">暂无符合条件的数据</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="px-4 py-3">姓名</th>
                  <th className="px-4 py-3">手机号</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">交卷时间</th>
                  <th className="px-4 py-3">用时</th>
                  <th className="px-4 py-3 text-right">客观题</th>
                  <th className="px-4 py-3 text-right">主观题</th>
                  <th className="px-4 py-3 text-right">总分</th>
                  <th className="px-4 py-3">及格</th>
                  <th className="px-4 py-3">阅卷状态</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.candidate_id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.phone_masked}</td>
                    <td className="px-4 py-3">
                      {SUBMITTED_STATUSES.includes(row.attempt_status) ? <span className="text-emerald-300">已交卷</span> : row.has_started ? <span className="text-amber-300">答题中</span> : <span className="text-muted-foreground">未开考</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{row.submitted_at ? new Date(row.submitted_at).toLocaleString('zh-CN') : '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDuration(row.duration_seconds)}</td>
                    <td className="px-4 py-3 text-right">{row.objective_score ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{row.subjective_score ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-serif font-bold">{row.total_score ?? '—'}</td>
                    <td className="px-4 py-3">
                      {row.is_passed === null || row.is_passed === undefined ? '—' : (
                        <span className={cn('text-xs font-medium', row.is_passed ? 'text-emerald-300' : 'text-red-300')}>
                          {row.is_passed ? '及格' : '不及格'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.grading_status === 'pending' ? <span className="text-xs text-amber-300">待阅卷</span>
                        : row.grading_status === 'completed' ? <span className="text-xs text-emerald-300">已阅卷</span>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {row.attempt_id && SUBMITTED_STATUSES.includes(row.attempt_status) && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2" title="查看答卷" onClick={() => router.push(`/admin/exams/${exam.id}/results/${row.attempt_id}`)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {row.grading_status === 'pending' && (
                            <Button variant="ghost" size="sm" className="h-7 px-2" title="人工阅卷" onClick={() => router.push(`/admin/exams/${exam.id}/grading?attempt=${row.attempt_id}`)}>
                              <PenLine className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
