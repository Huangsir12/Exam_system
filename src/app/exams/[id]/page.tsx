'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CalendarClock, Clock3, FileQuestion, Loader2, Target } from 'lucide-react';

interface ExamDetail {
  id: string;
  title: string;
  description: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  total_score: number;
  pass_score: number;
  max_attempts: number;
  question_count: number;
  submitted_count: number;
  remaining_attempts: number;
  in_progress_attempt_id: string | null;
}

function fmtFull(s: string | null): string {
  if (!s) return '-';
  const d = new Date(s);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ExamIntroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    fetch(`/api/my/exams/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.code !== 0) setError(json.message || '加载失败');
        else setExam(json.data);
      })
      .catch(() => setError('网络异常'));
  }, [id]);

  async function startExam() {
    if (!exam) return;
    setStarting(true);
    setError('');
    try {
      // 已有进行中的答题则直接恢复
      if (exam.in_progress_attempt_id) {
        router.push(`/exams/${id}/take?attempt=${exam.in_progress_attempt_id}`);
        return;
      }
      const res = await fetch('/api/attempts/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: id }),
      });
      const json = await res.json();
      if (!res.ok || json.code !== 0) {
        setError(json.message || '无法开始考试');
        setStarting(false);
        return;
      }
      router.push(`/exams/${id}/take?attempt=${json.data.attempt_id}`);
    } catch {
      setError('网络异常，请稍后再试');
      setStarting(false);
    }
  }

  if (error && !exam) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto mb-3" />
          <p className="text-foreground font-medium">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/exams')}>
            返回考试列表
          </Button>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canStart = exam.remaining_attempts > 0 || !!exam.in_progress_attempt_id;

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="bg-primary text-primary-foreground px-6 py-8">
            <h1 className="font-serif text-2xl font-bold">{exam.title}</h1>
            {exam.description && <p className="text-primary-foreground/80 text-sm mt-2 leading-relaxed">{exam.description}</p>}
          </div>

          <div className="px-6 py-6">
            <h2 className="font-medium mb-4">考试信息</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 bg-muted/50 rounded-lg p-3.5">
                <CalendarClock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">考试时间</p>
                  <p className="text-sm font-medium mt-0.5">{fmtFull(exam.start_time)}</p>
                  <p className="text-sm font-medium">至 {fmtFull(exam.end_time)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-muted/50 rounded-lg p-3.5">
                <Clock3 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">答题时长</p>
                  <p className="text-sm font-medium mt-0.5">{exam.duration_minutes} 分钟</p>
                  <p className="text-xs text-muted-foreground mt-0.5">到时将自动交卷</p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-muted/50 rounded-lg p-3.5">
                <Target className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">总分 / 及格分</p>
                  <p className="text-sm font-medium mt-0.5">{exam.total_score} 分 / {exam.pass_score} 分</p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-muted/50 rounded-lg p-3.5">
                <FileQuestion className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">题量 / 可考次数</p>
                  <p className="text-sm font-medium mt-0.5">{exam.question_count} 题 / {exam.max_attempts} 次（剩 {exam.remaining_attempts} 次）</p>
                </div>
              </div>
            </div>

            <div className="mt-6 border border-amber-200 bg-amber-50/60 rounded-lg p-4">
              <h3 className="text-sm font-medium text-amber-800 mb-2">考试须知</h3>
              <ul className="text-xs text-amber-800/80 space-y-1.5 leading-relaxed list-disc pl-4">
                <li>答题过程自动保存，可刷新页面后继续作答</li>
                <li>剩余时间以服务器时间为准，到达时限自动交卷</li>
                <li>交卷前系统会提示未作答题目数量，提交后不可修改</li>
                <li>请勿在多个设备或浏览器中同时作答同一场考试</li>
              </ul>
            </div>

            <label className="flex items-center gap-2 mt-5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm">我已阅读并理解考试须知</span>
            </label>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mt-4">{error}</p>}

            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => router.push('/exams')} className="flex-1">
                返回列表
              </Button>
              <Button onClick={startExam} disabled={!agreed || !canStart || starting} className="flex-1">
                {starting && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                {exam.in_progress_attempt_id ? '继续答题' : '开始考试'}
              </Button>
            </div>
            {!canStart && (
              <p className="text-xs text-center text-muted-foreground mt-3">考试次数已用完，无法再次进入</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
