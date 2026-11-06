'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { EXAM_STATUS_LABELS } from '@/lib/types';
import { BookOpenText, ClipboardCheck, ClipboardList, FileClock } from 'lucide-react';

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

  useEffect(() => {
    fetch('/api/admin/overview')
      .then((r) => r.json())
      .then((json) => {
        if (json.code === 0) setData(json.data);
      });
  }, []);

  const cards = [
    { label: '知识文档', value: data?.doc_count ?? '-', icon: BookOpenText, href: '/admin/documents' },
    { label: '考试总数', value: data?.exam_count ?? '-', icon: ClipboardList, href: '/admin/exams' },
    { label: '进行中考试', value: data?.ongoing_count ?? '-', icon: ClipboardCheck, href: '/admin/exams' },
    { label: '待阅卷试卷', value: data?.pending_grading ?? '-', icon: FileClock, href: '/admin/exams' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">数据总览</h1>
        <p className="text-sm text-muted-foreground mt-1">系统整体运行情况一览</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{c.label}</span>
                  <c.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="font-serif text-3xl font-bold mt-2">{c.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="font-serif text-lg font-bold mb-3">最近创建的考试</h2>
        <Card>
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
