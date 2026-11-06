'use client';

import { useExam } from './layout';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PAPER_MODE_LABELS, QUESTION_TYPE_LABELS, RESULT_VISIBILITY_LABELS, fmtDateTime } from '@/lib/types';
import { useState } from 'react';

export default function ExamSettingsPage() {
  const { exam, reload } = useExam();
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [publishingResults, setPublishingResults] = useState(false);
  const [message, setMessage] = useState('');

  const editable = ['draft', 'pending'].includes(exam.status);

  async function handlePublish() {
    setMessage('');
    setPublishing(true);
    try {
      const res = await fetch(`/api/exams/${exam.id}/publish`, { method: 'POST' });
      const json = await res.json();
      if (json.code !== 0) {
        setMessage(`发布失败：${json.message}`);
        return;
      }
      setMessage('发布成功');
      await reload();
    } finally {
      setPublishing(false);
    }
  }

  async function handleArchive() {
    if (!window.confirm('归档后考试不可再修改，确认归档？')) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/exams/${exam.id}/archive`, { method: 'POST' });
      const json = await res.json();
      if (json.code !== 0) {
        setMessage(`归档失败：${json.message}`);
        return;
      }
      await reload();
    } finally {
      setArchiving(false);
    }
  }

  async function handlePublishResults() {
    if (!window.confirm('发布后考生即可查看成绩与解析，确认发布？')) return;
    setPublishingResults(true);
    try {
      const res = await fetch(`/api/exams/${exam.id}/publish-results`, { method: 'POST' });
      const json = await res.json();
      if (json.code !== 0) {
        setMessage(`操作失败：${json.message}`);
        return;
      }
      setMessage('成绩已发布');
      await reload();
    } finally {
      setPublishingResults(false);
    }
  }

  const config = exam.question_config ?? [];

  return (
    <div className="grid lg:grid-cols-2 gap-5 max-w-5xl">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">考试信息</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2.5">
          <Row label="考试名称" value={exam.title} />
          <Row label="考试说明" value={exam.description || '—'} />
          <Row label="考试时间" value={`${fmtDateTime(exam.start_time)} ~ ${fmtDateTime(exam.end_time)}`} />
          <Row label="答题时长" value={`${exam.duration_minutes} 分钟`} />
          <Row label="可考次数" value={`${exam.max_attempts} 次`} />
          <Row label="试卷总分" value={`${Number(exam.total_score)} 分`} />
          <Row label="及格分" value={`${Number(exam.pass_score)} 分`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">组卷配置</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2.5">
          <Row label="组卷方式" value={PAPER_MODE_LABELS[exam.paper_mode] ?? exam.paper_mode} />
          <Row label="题目顺序" value={exam.question_order === 'random' ? '随机' : '固定'} />
          <Row label="选项乱序" value={exam.option_shuffle ? '开启' : '关闭'} />
          <div className="pt-1.5">
            <p className="text-muted-foreground mb-1.5">题型结构</p>
            <div className="flex flex-wrap gap-2">
              {config.map((cfg) => (
                <span key={cfg.type} className="text-xs bg-muted rounded-md px-2.5 py-1.5">
                  {QUESTION_TYPE_LABELS[cfg.type]} × {cfg.count}（每题 {cfg.score} 分）
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">结果公开规则</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2.5">
          <Row label="成绩公开" value={RESULT_VISIBILITY_LABELS[exam.result_visibility] ?? exam.result_visibility} />
          <Row label="标准答案" value={exam.show_answer ? '公开' : '不公开'} />
          <Row label="解析" value={exam.show_analysis ? '公开' : '不公开'} />
          <Row label="知识原文" value={exam.show_source ? '公开' : '不公开'} />
          <Row label="成绩发布状态" value={exam.result_published ? '已发布' : '未发布'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">操作</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {message && (
            <p className={`text-sm px-3 py-2 rounded-md ${message.includes('失败') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {['draft', 'pending'].includes(exam.status) && (
              <Button onClick={handlePublish} disabled={publishing}>发布考试</Button>
            )}
            {exam.result_visibility === 'manual' && !exam.result_published && ['published', 'ongoing', 'ended'].includes(exam.status) && (
              <Button onClick={handlePublishResults} disabled={publishingResults}>手动发布成绩</Button>
            )}
            {exam.status === 'ended' && (
              <Button variant="outline" onClick={handleArchive} disabled={archiving}>归档考试</Button>
            )}
            {editable && (
              <Button variant="outline" onClick={() => router.push(`/admin/exams/${exam.id}/generate`)}>智能出题</Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            发布前系统会自动校验：题量与分值一致性、答案完整性、解析与知识来源、名单配置。考试开始后试卷内容不可修改。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="flex-1 min-w-0">{value}</span>
    </div>
  );
}
