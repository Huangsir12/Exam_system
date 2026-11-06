'use client';

import { apiFetch, clearClientToken } from '@/lib/client-fetch';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { CalendarClock, Clock3, FileText, LogOut, RotateCcw, Target } from 'lucide-react';

interface MyExam {
  id: string;
  title: string;
  description: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  total_score: number;
  pass_score: number;
  max_attempts: number;
  my_status: string;
  submitted_count: number;
  remaining_attempts: number;
  latest_attempt: { id: string; total_score: number | null; is_passed: boolean | null; grading_status: string } | null;
  in_progress_attempt_id: string | null;
}

const MY_STATUS: Record<string, { label: string; color: string }> = {
  not_started: { label: '未开始', color: 'bg-secondary text-secondary-foreground border-border' },
  available: { label: '可考试', color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  in_progress: { label: '进行中', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  submitted: { label: '已提交', color: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  grading: { label: '阅卷中', color: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  expired: { label: '已过期', color: 'bg-secondary text-muted-foreground border-border' },
};

function fmtTime(s: string | null): string {
  if (!s) return '-';
  const d = new Date(s);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function MyExamsPage() {
  const router = useRouter();
  const [list, setList] = useState<MyExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch('/api/auth/me').then((r) => r.json()),
      apiFetch('/api/my/exams').then((r) => r.json()),
    ]).then(([me, exams]) => {
      if (me.code !== 0 || !me.data?.candidate) {
        router.replace('/login');
        return;
      }
      setUserName(me.data.candidate.user_name ?? '');
      if (exams.code === 0) setList(exams.data ?? []);
      setLoading(false);
    });
  }, [router]);

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    clearClientToken('candidate');
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <span className="font-serif font-bold">我的考试</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{userName}</span>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4 mr-1" />
              退出
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4 page-enter">
        {loading ? (
          <div className="text-center py-20 text-muted-foreground">加载中…</div>
        ) : list.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground">暂无考试安排</p>
            <p className="text-sm text-muted-foreground mt-1.5">你当前没有被安排参加任何考试，如有疑问请联系管理员</p>
          </div>
        ) : (
          list.map((exam) => {
            const st = MY_STATUS[exam.my_status] ?? MY_STATUS.not_started;
            const latest = exam.latest_attempt;
            return (
              <div key={exam.id} className="card-tech rounded-xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-serif font-bold text-lg leading-snug">{exam.title}</h2>
                  <Badge variant="outline" className={st.color}>{st.label}</Badge>
                </div>
                {exam.description && (
                  <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{exam.description}</p>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <CalendarClock className="w-4 h-4 shrink-0" />
                    <span>{fmtTime(exam.start_time)} ~ {fmtTime(exam.end_time)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock3 className="w-4 h-4" />
                    <span>{exam.duration_minutes} 分钟</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Target className="w-4 h-4" />
                    <span>满分 {exam.total_score} / 及格 {exam.pass_score}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <RotateCcw className="w-4 h-4" />
                    <span>剩余次数 {exam.remaining_attempts}</span>
                  </div>
                </div>

                {latest && latest.total_score !== null && exam.my_status !== 'in_progress' && (
                  <div className="mt-3 text-sm bg-muted/60 rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="text-muted-foreground">最近成绩</span>
                    <span className="font-bold font-serif text-lg">{latest.total_score}</span>
                    {latest.is_passed !== null && (
                      <StatusBadge
                        status={latest.is_passed ? 'success' : 'failed'}
                        label={latest.is_passed ? '及格' : '不及格'}
                      />
                    )}
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  {exam.my_status === 'in_progress' && exam.in_progress_attempt_id ? (
                    <Button className="flex-1" onClick={() => router.push(`/exams/${exam.id}/take?attempt=${exam.in_progress_attempt_id}`)}>
                      继续答题
                    </Button>
                  ) : exam.my_status === 'available' && exam.remaining_attempts > 0 ? (
                    <Button className="flex-1" onClick={() => router.push(`/exams/${exam.id}`)}>
                      进入考试
                    </Button>
                  ) : exam.my_status === 'submitted' || exam.my_status === 'grading' ? (
                    latest && (
                      <Button variant="outline" className="flex-1" onClick={() => router.push(`/exams/${exam.id}/result?attempt=${latest.id}`)}>
                        {exam.my_status === 'grading' ? '查看（阅卷中）' : '查看成绩与解析'}
                      </Button>
                    )
                  ) : (
                    <Button variant="outline" className="flex-1" disabled>
                      {exam.my_status === 'not_started' ? '未到开考时间' : exam.my_status === 'expired' ? '考试已结束' : '不可进入'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
