'use client';

import { apiFetch } from '@/lib/client-fetch';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { EXAM_STATUS_LABELS } from '@/lib/types';
import { Activity, AlertTriangle, BookOpenText, ClipboardCheck, ClipboardList, FileClock, Radio, RefreshCw } from 'lucide-react';

interface Overview {
  doc_count: number;
  exam_count: number;
  ongoing_count: number;
  attempt_count: number;
  pending_grading: number;
  recent_exams: { id: string; title: string; status: string; start_time: string | null; end_time: string | null; created_at: string }[];
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/overview')
      .then((r) => r.json())
      .then((json) => {
        if (json.code === 0) setData(json.data);
        else setError(json.message || '总览数据加载失败');
      })
      .catch(() => setError('网络异常，总览数据加载失败'));
  }, []);

  const cards = [
    { label: '知识文档', value: data?.doc_count ?? '-', icon: BookOpenText, href: '/admin/documents' },
    { label: '考试总数', value: data?.exam_count ?? '-', icon: ClipboardList, href: '/admin/exams' },
    { label: '进行中考试', value: data?.ongoing_count ?? '-', icon: ClipboardCheck, href: '/admin/exams' },
    { label: '待阅卷试卷', value: data?.pending_grading ?? '-', icon: FileClock, href: '/admin/exams' },
  ];

  return (
    <div className="space-y-6 page-enter">
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-[linear-gradient(135deg,oklch(0.22_0.035_250/92%),oklch(0.17_0.024_275/96%))] p-5 sm:p-7 shadow-[0_20px_60px_-35px_oklch(0.8_0.13_195/45%)]">
        <div className="absolute -right-20 -top-24 size-64 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-end justify-between gap-5">
          <div>
            <div className="tech-kicker"><Radio className="size-3" aria-hidden="true" /> Command center online</div>
            <h1 className="mt-3 font-display text-2xl sm:text-3xl font-bold tracking-wide">数据总览</h1>
            <p className="text-sm text-muted-foreground mt-2">实时掌握文档、考试与阅卷流程</p>
          </div>
          <Activity className="hidden size-10 text-primary/60 sm:block" aria-hidden="true" />
        </div>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span className="flex items-center gap-2"><AlertTriangle className="size-4" aria-hidden="true" />{error}</span>
          <button className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 hover:bg-amber-500/10" onClick={() => window.location.reload()}><RefreshCw className="size-3.5" aria-hidden="true" />重试</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}>
            <Card className="card-tech holo-panel cursor-pointer h-full group">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{c.label}</span>
                  <span className="flex size-8 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 transition-colors group-hover:bg-primary/10"><c.icon className="w-4 h-4 text-primary/80" aria-hidden="true" /></span>
                </div>
                <p className="font-display text-3xl font-bold mt-2 text-gradient">{c.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="font-serif text-lg font-bold mb-3">最近创建的考试</h2>
        <Card className="card-tech overflow-hidden">
          <CardContent className="p-0">
            {!data ? (
              <p className="text-sm text-muted-foreground p-6 text-center">加载中…</p>
            ) : data.recent_exams.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-muted-foreground text-sm">还没有创建考试</p>
                <Link href="/admin/exams/new" className="text-primary text-sm hover:underline mt-1 inline-block">
                  立即创建 →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.recent_exams.map((exam) => (
                  <Link key={exam.id} href={`/admin/exams/${exam.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 transition-colors">
                    <span className="text-sm font-medium truncate">{exam.title}</span>
                    <StatusBadge status={exam.status} label={EXAM_STATUS_LABELS[exam.status as keyof typeof EXAM_STATUS_LABELS] ?? exam.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
