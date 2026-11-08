'use client';

import { apiFetch } from '@/lib/client-fetch';
import { useExam } from '../layout';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QUESTION_TYPE_LABELS } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BarChart3, Loader2 } from 'lucide-react';

interface StatsData {
  exam: { id: string; title: string; total_score: number; pass_score: number };
  overview: {
    total_candidates: number;
    started: number;
    submitted: number;
    not_started: number;
    grading: number;
    reference_rate: number;
    pass_count: number;
    pass_rate: number;
    avg_score: number | null;
    max_score: number | null;
    min_score: number | null;
    median_score: number | null;
  };
  distribution: { range: string; count: number }[];
  question_stats: {
    question_id: string;
    order: number;
    type: string;
    content: string;
    score: number;
    knowledge_point: string | null;
    answered: number;
    correct_rate: number | null;
    avg_score_rate: number;
  }[];
  knowledge_stats: { name: string; count: number; score_rate: number }[];
  type_stats: { type: string; score_rate: number }[];
}

export default function StatsPage() {
  const { exam } = useExam();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/exams/${exam.id}/stats`)
      .then((r) => r.json())
      .then((json) => {
        if (json.code === 0) setStats(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [exam.id]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!stats || stats.overview.total_candidates === 0) {
    return (
      <Card>
        <CardContent className="p-14 text-center">
          <BarChart3 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">暂无考试数据</p>
          <p className="text-xs text-muted-foreground/70 mt-1">导入参考人员并完成考试后，这里将展示统计图表</p>
        </CardContent>
      </Card>
    );
  }

  const { overview: o } = stats;
  const maxDist = Math.max(...stats.distribution.map((d) => d.count), 1);
  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 10) / 10}%`);

  return (
    <div className="space-y-5 max-w-5xl">
      {/* 成绩指标卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="平均分" value={o.avg_score} />
        <MetricCard label="最高分" value={o.max_score} />
        <MetricCard label="最低分" value={o.min_score} />
        <MetricCard label="及格率" value={o.submitted > 0 ? pct(o.pass_rate) : '—'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* 参考情况 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">参考情况</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <BarRow label="应考人数" value={o.total_candidates} max={o.total_candidates} color="bg-primary" />
            <BarRow label="已开考" value={o.started} max={o.total_candidates} color="bg-sky-700" />
            <BarRow label="已交卷" value={o.submitted} max={o.total_candidates} color="bg-emerald-500" />
            <BarRow label="未考人数" value={o.not_started} max={o.total_candidates} color="bg-muted-foreground/40" />
            <BarRow label="阅卷中" value={o.grading} max={o.total_candidates} color="bg-amber-500" />
            <div className="pt-2 border-t border-border flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>参考率 {pct(o.reference_rate)}</span>
              <span>及格人数 {o.pass_count}</span>
              <span>中位数 {o.median_score ?? '—'} 分</span>
            </div>
          </CardContent>
        </Card>

        {/* 分数分布 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">分数分布</CardTitle></CardHeader>
          <CardContent>
            {stats.distribution.every((d) => d.count === 0) ? (
              <p className="text-sm text-muted-foreground py-8 text-center">暂无成绩数据</p>
            ) : (
              <div className="flex items-end gap-2 h-44">
                {stats.distribution.map((d) => (
                  <div key={d.range} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                    <span className="text-xs text-muted-foreground">{d.count > 0 ? d.count : ''}</span>
                    <div
                      className="w-full bg-primary/85 rounded-t-md transition-all"
                      style={{ height: `${Math.max(d.count > 0 ? 6 : 0, (d.count / maxDist) * 130)}px` }}
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{d.range}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* 题型得分 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">题型得分率</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {stats.type_stats.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">暂无数据</p>
            ) : stats.type_stats.map((t) => (
              <div key={t.type}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{QUESTION_TYPE_LABELS[t.type as keyof typeof QUESTION_TYPE_LABELS] ?? t.type}</span>
                  <span className="text-muted-foreground">{pct(t.score_rate)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, t.score_rate)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 知识点掌握 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">知识点掌握情况</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {stats.knowledge_stats.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">暂无数据</p>
            ) : stats.knowledge_stats.slice(0, 10).map((k) => (
              <div key={k.name}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="truncate mr-2">{k.name}</span>
                  <span className="text-muted-foreground shrink-0">{pct(k.score_rate)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, k.score_rate)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* 题目正确率 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">题目正确率与得分率（识别高错误率题目）</CardTitle></CardHeader>
        <CardContent className="space-y-2.5">
          {stats.question_stats.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">暂无数据</p>
          ) : stats.question_stats.map((q) => {
            const rate = q.type === 'essay' || q.type === 'fill' ? q.avg_score_rate : q.correct_rate;
            const label = q.type === 'essay' || q.type === 'fill' ? '得分率' : '正确率';
            return (
              <div key={q.question_id} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-8 shrink-0">第{q.order + 1}题</span>
                <span className="text-xs text-muted-foreground w-14 shrink-0">{QUESTION_TYPE_LABELS[q.type as keyof typeof QUESTION_TYPE_LABELS] ?? q.type}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate mb-1">{q.content}</p>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', rate === null ? 'bg-muted-foreground/40' : rate >= 60 ? 'bg-emerald-500' : rate >= 40 ? 'bg-amber-500' : 'bg-red-500')}
                      style={{ width: `${Math.min(100, rate ?? 0)}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground w-28 shrink-0 text-right">
                  {rate === null ? `无作答` : `${label} ${pct(rate)}`}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string | null }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-serif text-3xl font-bold mt-1.5 tabular-nums">{value ?? '—'}</p>
      </CardContent>
    </Card>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
        <div className={cn('h-full rounded-md', color)} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="text-sm font-medium w-10 text-right tabular-nums">{value}</span>
    </div>
  );
}
