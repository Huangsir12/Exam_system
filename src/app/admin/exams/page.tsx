'use client';

import { apiFetch } from '@/lib/client-fetch';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { EXAM_STATUS_LABELS, fmtDateTime, type Exam } from '@/lib/types';
import { CalendarClock, ClipboardList, Plus } from 'lucide-react';

export default function AdminExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await apiFetch('/api/exams');
    const json = await res.json();
    if (json.code === 0) setExams(json.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 有生成中/进行中的考试时轮询
  useEffect(() => {
    const hasActive = exams.some((e) => e.generation_status === 'generating' || e.status === 'ongoing');
    if (!hasActive) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [exams, load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">考试管理</h1>
          <p className="text-sm text-muted-foreground mt-1">创建考试、组卷、发布与成绩管理</p>
        </div>
        <Link href="/admin/exams/new">
          <Button>
            <Plus className="w-4 h-4 mr-1.5" />
            创建考试
          </Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-16">加载中…</p>
      ) : exams.length === 0 ? (
        <Card>
          <CardContent className="p-16 text-center">
            <ClipboardList className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">暂无考试</p>
            <p className="text-xs text-muted-foreground/70 mt-1">点击右上角「创建考试」开始第一场考试的组卷</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {exams.map((exam) => (
            <Link key={exam.id} href={`/admin/exams/${exam.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <h3 className="font-medium truncate">{exam.title}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarClock className="w-3.5 h-3.5" />
                          {fmtDateTime(exam.start_time)} ~ {fmtDateTime(exam.end_time)}
                        </span>
                        <span>时长 {exam.duration_minutes} 分钟</span>
                        <span>总分 {Number(exam.total_score)} 分</span>
                        <span>及格 {Number(exam.pass_score)} 分</span>
                        {exam.generation_status === 'generating' && <span className="text-amber-300">智能出题中…</span>}
                        {exam.generation_status === 'failed' && <span className="text-red-300">出题失败</span>}
                      </div>
                    </div>
                    <StatusBadge status={exam.status} label={EXAM_STATUS_LABELS[exam.status] ?? exam.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
