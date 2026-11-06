'use client';

import { apiFetch } from '@/lib/client-fetch';
import { createContext, use, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { EXAM_STATUS_LABELS, fmtDateTime, type Exam } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface ExamContextValue {
  exam: Exam;
  reload: () => Promise<void>;
}

const ExamContext = createContext<ExamContextValue | null>(null);

export function useExam(): ExamContextValue {
  const ctx = useContext(ExamContext);
  if (!ctx) throw new Error('useExam must be used within exam layout');
  return ctx;
}

const TABS = [
  { href: '', label: '考试设置' },
  { href: '/generate', label: '智能出题' },
  { href: '/paper', label: '试卷编辑' },
  { href: '/candidates', label: '参考名单' },
  { href: '/results', label: '成绩明细' },
  { href: '/grading', label: '人工阅卷' },
  { href: '/stats', label: '统计分析' },
];

export default function ExamAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const pathname = usePathname();
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const res = await apiFetch(`/api/exams/${id}`);
    const json = await res.json();
    if (json.code !== 0) {
      setError(json.message || '考试不存在');
      return;
    }
    setExam(json.data);
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/admin/exams')}>返回考试列表</Button>
      </div>
    );
  }

  if (!exam) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const base = `/admin/exams/${id}`;

  return (
    <ExamContext.Provider value={{ exam, reload }}>
      <div className="space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/exams')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif text-xl font-bold truncate">{exam.title}</h1>
              <StatusBadge status={exam.status} label={EXAM_STATUS_LABELS[exam.status] ?? exam.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fmtDateTime(exam.start_time)} ~ {fmtDateTime(exam.end_time)} · {exam.duration_minutes} 分钟 · 总分 {Number(exam.total_score)} 分 · 及格 {Number(exam.pass_score)} 分
            </p>
          </div>
        </div>

        <div className="border-b border-border flex gap-1 overflow-x-auto -mx-1 px-1">
          {TABS.map((tab) => {
            const href = `${base}${tab.href}`;
            const active = tab.href === '' ? pathname === base : pathname.startsWith(href);
            return (
              <Link
                key={tab.href}
                href={href}
                className={cn(
                  'px-4 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors',
                  active
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {children}
      </div>
    </ExamContext.Provider>
  );
}
