'use client';

import { apiFetch, clearClientToken } from '@/lib/client-fetch';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { AlertTriangle, CalendarClock, Clock3, FileText, LogOut, Radio, RefreshCw, RotateCcw, Sparkles, Target } from 'lucide-react';

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
  in_progress: { label: '进行中', color: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
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
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
    Promise.all([
      apiFetch('/api/auth/me').then((r) => r.json()),
      apiFetch('/api/my/exams').then((r) => r.json()),
    ]).then(([me, exams]) => {
      if (me.code !== 0 || !me.data?.candidate) {
        router.replace('/login');
        return;
      }
      setUserName(me.data.candidate.user_name ?? '');
      if (exams.code === 0) {
        setList(exams.data ?? []);
      } else {
        setError(exams.message || '考试列表加载失败，请重试');
      }
      setLoading(false);
    }).catch(() => {
      setError('网络连接异常，请检查网络后重试');
      setLoading(false);
    });
    } catch {
      setError('网络连接异常，请检查网络后重试');
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    clearClientToken('candidate');
    router.replace('/login');
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg border border-primary/35 bg-primary/10 text-primary flex items-center justify-center shadow-[0_0_18px_-5px_oklch(0.8_0.13_195/55%)]">
              <FileText className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <span className="block font-display font-bold leading-tight tracking-wide">我的考试</span>
              <span className="hidden sm:block text-[9px] text-muted-foreground tracking-[0.16em]">CANDIDATE TERMINAL</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-muted-foreground">{userName}</span>
            <Button variant="ghost" size="sm" onClick={logout} className="min-h-11" aria-label="退出登录">
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">退出</span>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-4xl mx-auto px-4 sm:px-6 py-7 sm:py-10 space-y-5 page-enter outline-none">
        <section className="relative overflow-hidden rounded-xl border border-primary/20 bg-[linear-gradient(135deg,oklch(0.22_0.035_250/92%),oklch(0.17_0.024_275/96%))] p-5 sm:p-7 shadow-[0_20px_60px_-35px_oklch(0.8_0.13_195/45%)]">
          <div className="absolute -right-16 -top-20 size-56 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex items-end justify-between gap-5">
            <div>
              <div className="tech-kicker"><Radio className="size-3" aria-hidden="true" /> Assessment channel online</div>
              <h1 className="mt-3 font-display text-2xl sm:text-3xl font-bold tracking-wide text-balance">
                {userName ? `${userName}，准备好了吗？` : '考试任务中心'}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">查看考试安排、继续未完成的作答，并在成绩发布后查看解析。</p>
            </div>
            <Sparkles className="hidden sm:block size-10 text-primary/70" aria-hidden="true" />
          </div>
        </section>

        {loading ? (
          <div className="grid gap-4" aria-label="正在加载考试列表" aria-busy="true">
            {[0, 1].map((item) => (
              <div key={item} className="card-tech rounded-xl p-5 animate-pulse">
                <div className="h-5 w-2/5 rounded bg-muted" />
                <div className="mt-3 h-4 w-3/4 rounded bg-muted/70" />
                <div className="mt-6 grid grid-cols-2 gap-3"><div className="h-9 rounded bg-muted/60" /><div className="h-9 rounded bg-muted/60" /></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card-tech rounded-xl px-5 py-12 text-center" role="alert">
            <AlertTriangle className="mx-auto size-9 text-amber-300" aria-hidden="true" />
            <p className="mt-4 font-medium">暂时无法获取考试安排</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-5 min-h-11" onClick={load}><RefreshCw aria-hidden="true" />重新加载</Button>
          </div>
        ) : list.length === 0 ? (
          <div className="card-tech rounded-xl text-center py-16 px-5">
            <div className="w-16 h-16 rounded-2xl border border-primary/20 bg-primary/5 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-primary/70" aria-hidden="true" />
            </div>
            <p className="font-medium text-foreground">暂无考试安排</p>
            <p className="text-sm text-muted-foreground mt-1.5">你当前没有被安排参加任何考试，如有疑问请联系管理员</p>
          </div>
        ) : (
          list.map((exam) => {
            const st = MY_STATUS[exam.my_status] ?? MY_STATUS.not_started;
            const latest = exam.latest_attempt;
            return (
              <article key={exam.id} className="card-tech holo-panel rounded-xl p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-serif font-bold text-lg leading-snug">{exam.title}</h2>
                  <Badge variant="outline" className={st.color}>{st.label}</Badge>
                </div>
                {exam.description && (
                  <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{exam.description}</p>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5 text-sm">
                  <div className="rounded-lg border border-border/70 bg-muted/25 p-3 text-muted-foreground col-span-2 sm:col-span-1">
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wider"><CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />考试时间</div>
                    <span className="block text-xs text-foreground/80">{fmtTime(exam.start_time)} ~ {fmtTime(exam.end_time)}</span>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/25 p-3 text-muted-foreground">
                    <div className="flex items-center gap-1.5 text-[11px]"><Clock3 className="w-3.5 h-3.5" aria-hidden="true" />时长</div>
                    <span className="mt-1 block font-display text-base font-semibold text-foreground">{exam.duration_minutes} 分钟</span>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/25 p-3 text-muted-foreground">
                    <div className="flex items-center gap-1.5 text-[11px]"><Target className="w-3.5 h-3.5" aria-hidden="true" />分数</div>
                    <span className="mt-1 block text-xs text-foreground/90">满分 {exam.total_score} · 及格 {exam.pass_score}</span>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/25 p-3 text-muted-foreground">
                    <div className="flex items-center gap-1.5 text-[11px]"><RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />机会</div>
                    <span className="mt-1 block font-display text-base font-semibold text-foreground">剩余 {exam.remaining_attempts} 次</span>
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
                    <Button className="flex-1 min-h-11 btn-glow" onClick={() => router.push(`/exams/${exam.id}/take?attempt=${exam.in_progress_attempt_id}`)}>
                      继续答题
                    </Button>
                  ) : exam.my_status === 'available' && exam.remaining_attempts > 0 ? (
                    <Button className="flex-1 min-h-11 btn-glow" onClick={() => router.push(`/exams/${exam.id}`)}>
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
              </article>
            );
          })
        )}
      </main>
    </div>
  );
}
