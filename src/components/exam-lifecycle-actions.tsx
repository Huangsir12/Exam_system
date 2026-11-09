'use client';

import { useState } from 'react';
import { Archive, Loader2, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { apiFetch } from '@/lib/client-fetch';
import type { Exam } from '@/lib/types';

type Action = 'stop' | 'delete' | 'archive';
const LABELS: Record<Action, string> = { stop: '停止考试', delete: '删除考试', archive: '归档考试' };

export function ExamLifecycleActions({ exam, onChanged, onDeleted }: {
  exam: Exam;
  onChanged: () => Promise<void>;
  onDeleted?: () => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function execute() {
    if (!action || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`/api/exams/${exam.id}${action === 'delete' ? '' : `/${action}`}`, {
        method: action === 'delete' ? 'DELETE' : 'POST',
      });
      const json = await response.json() as { code: number; message?: string };
      if (!response.ok || json.code !== 0) throw new Error(json.message || '操作失败，请重试');
      setAction(null);
      setNotice(`${LABELS[action]}成功`);
      if (action === 'delete' && onDeleted) onDeleted();
      else await onChanged();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '网络异常，请重试');
    } finally {
      setBusy(false);
    }
  }

  function choose(next: Action) {
    setError('');
    setNotice('');
    setAction(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {['published', 'ongoing'].includes(exam.status) && (
          <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => choose('stop')}>
            <Square aria-hidden="true" />停止考试
          </Button>
        )}
        {exam.status === 'ended' && (
          <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => choose('archive')}>
            <Archive aria-hidden="true" />归档考试
          </Button>
        )}
        {exam.status === 'draft' && (
          <Button variant="outline" className="min-h-11 text-destructive hover:text-destructive" disabled={busy || exam.generation_status === 'generating'} onClick={() => choose('delete')}>
            <Trash2 aria-hidden="true" />删除考试
          </Button>
        )}
      </div>
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      <AlertDialog open={action !== null} onOpenChange={(open) => { if (!open && !busy) setAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action ? LABELS[action] : ''}：{exam.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {action === 'delete'
                ? '将永久删除这场草稿考试及其题目、参考名单，无法恢复。知识文档不会删除。'
                : action === 'stop'
                  ? '停止后不可重新开考，考生不能再进入或保存新答案。在线答题页将检测结束并提交已保存的答案；离线考生需重新打开答题页交卷。已有答题记录和成绩会保留。'
                  : '归档后考试不可再修改，已有答题记录和成绩仍会保留。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <Button variant={action === 'archive' ? 'default' : 'destructive'} disabled={busy} onClick={() => void execute()}>
              {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
              {busy ? '处理中…' : `确认${action ? LABELS[action] : ''}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
