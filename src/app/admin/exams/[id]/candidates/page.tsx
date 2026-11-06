'use client';

import { useExam } from '../layout';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { maskPhone, type Candidate } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Download, FileDown, Loader2, Pencil, Trash2, Upload, UserPlus, Users } from 'lucide-react';

interface ImportRow {
  name: string;
  phone: string;
  error?: string;
}

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: { line: number; name: string; phone: string; reason: string }[];
}

export default function CandidatesPage() {
  const { exam, reload: reloadExam } = useExam();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [previewRows, setPreviewRows] = useState<ImportRow[]>([]);
  const [previewError, setPreviewError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importMode, setImportMode] = useState<'skip' | 'update'>('skip');
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const editable = ['draft', 'pending'].includes(exam.status);

  const load = useCallback(async () => {
    const res = await fetch(`/api/exams/${exam.id}/candidates`);
    const json = await res.json();
    if (json.code === 0) setCandidates(json.data);
    setLoading(false);
  }, [exam.id]);

  useEffect(() => {
    load();
  }, [load]);

  function parseCSV(text: string): ImportRow[] {
    const rows: ImportRow[] = [];
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim().replace(/^﻿/, '');
      if (!trimmed) continue;
      const parts = trimmed.split(/[,，\t]/).map((s) => s.trim().replace(/^"|"$/g, ''));
      if (parts.length < 2) continue;
      const [name, phone] = parts;
      if (name === '姓名' || name.toLowerCase() === 'name') continue; // 表头
      rows.push({ name: name ?? '', phone: phone ?? '' });
    }
    return rows;
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewError('');
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setPreviewError('未解析到有效数据，请使用「姓名,手机号」两列格式');
        return;
      }
      setPreviewRows(rows);
      setShowPreview(true);
    };
    reader.readAsText(file, 'utf-8');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function confirmImport() {
    setImporting(true);
    setMessage('');
    try {
      const res = await fetch(`/api/exams/${exam.id}/candidates/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: previewRows, mode: importMode }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setMessage(json.message || '导入失败');
        return;
      }
      setImportResult(json.data);
      setShowPreview(false);
      await load();
      reloadExam();
    } finally {
      setImporting(false);
    }
  }

  async function addOne() {
    setMessage('');
    if (!addName.trim() || !addPhone.trim()) {
      setMessage('请输入姓名和手机号');
      return;
    }
    const res = await fetch(`/api/exams/${exam.id}/candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addName.trim(), phone: addPhone.trim() }),
    });
    const json = await res.json();
    if (json.code !== 0) {
      setMessage(json.message || '添加失败');
      return;
    }
    setAddName('');
    setAddPhone('');
    await load();
    reloadExam();
  }

  async function saveEdit() {
    if (!editing) return;
    const res = await fetch(`/api/exams/${exam.id}/candidates/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editing.name.trim(), phone: editing.phone.trim() }),
    });
    const json = await res.json();
    if (json.code !== 0) {
      setMessage(json.message || '保存失败');
      return;
    }
    setEditing(null);
    await load();
  }

  async function remove(c: Candidate) {
    if (!window.confirm(`确认移除「${c.name}」？已开考人员的成绩记录会保留。`)) return;
    await fetch(`/api/exams/${exam.id}/candidates/${c.id}`, { method: 'DELETE' });
    await load();
    reloadExam();
  }

  async function removeAll() {
    if (!window.confirm(`确认清空全部 ${candidates.length} 名考生？`)) return;
    await fetch(`/api/exams/${exam.id}/candidates`, { method: 'DELETE' });
    await load();
    reloadExam();
  }

  function downloadTemplate() {
    const content = '﻿姓名,手机号\n张三,13800138000\n李四,13900139000\n';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '参考人员名单导入模板.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportCandidates() {
    const res = await fetch(`/api/exams/${exam.id}/export?kind=candidates`);
    if (!res.ok) {
      window.alert('导出失败');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `名单-${exam.title}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">共 <span className="font-bold text-foreground">{candidates.length}</span> 人（手机号已脱敏展示）</p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-1" />下载模板
          </Button>
          {candidates.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCandidates}>
              <FileDown className="w-4 h-4 mr-1" />导出名单
            </Button>
          )}
          {editable && (
            <>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1" />导入名单
              </Button>
              {candidates.length > 0 && (
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={removeAll}>清空名单</Button>
              )}
            </>
          )}
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {message && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{message}</p>}

      {importResult && (
        <Card className="border-emerald-200">
          <CardContent className="p-4 text-sm space-y-1">
            <p className="font-medium text-emerald-700">
              导入完成：新增 {importResult.imported} 人{importResult.updated > 0 ? `，更新 ${importResult.updated} 人` : ''}{importResult.skipped > 0 ? `，跳过 ${importResult.skipped} 人` : ''}，失败 {importResult.errors.length} 行
            </p>
            {importResult.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-xs mt-2">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1">行号</th><th>姓名</th><th>手机号</th><th>原因</th></tr></thead>
                  <tbody>
                    {importResult.errors.map((err, i) => (
                      <tr key={i} className="border-t border-border/50 text-red-700">
                        <td className="py-1">{err.line}</td><td>{err.name}</td><td>{err.phone}</td><td>{err.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button variant="ghost" size="sm" className="mt-1" onClick={() => setImportResult(null)}>关闭</Button>
          </CardContent>
        </Card>
      )}

      {editable && (
        <Card>
          <CardContent className="p-4 flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs">姓名</Label>
              <Input className="w-36" placeholder="姓名" value={addName} onChange={(e) => setAddName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">手机号</Label>
              <Input className="w-44" placeholder="11 位手机号" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} />
            </div>
            <Button size="sm" onClick={addOne}>
              <UserPlus className="w-4 h-4 mr-1" />添加
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : candidates.length === 0 ? (
        <Card>
          <CardContent className="p-14 text-center">
            <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">名单为空，发布考试前必须配置参考人员</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {candidates.map((c, i) => (
                <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="text-xs text-muted-foreground w-8">{i + 1}</span>
                  <span className="text-sm font-medium w-24 truncate">{c.name}</span>
                  <span className="text-sm text-muted-foreground font-mono">{maskPhone(c.phone)}</span>
                  {editable && (
                    <div className="ml-auto flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing({ ...c })}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => remove(c)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 导入预览 */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>导入预览（{previewRows.length} 行）</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={importMode === 'skip'} onChange={() => setImportMode('skip')} />
                跳过已存在人员
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={importMode === 'update'} onChange={() => setImportMode('update')} />
                更新已存在人员姓名
              </label>
            </div>
            <div className="border border-border rounded-lg max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left text-muted-foreground text-xs">
                    <th className="px-3 py-2">#</th><th className="px-3 py-2">姓名</th><th className="px-3 py-2">手机号</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => {
                    const bad = !row.name || !/^1\d{10}$/.test(row.phone);
                    return (
                      <tr key={i} className={cn('border-t border-border/50', bad && 'bg-red-50 text-red-700')}>
                        <td className="px-3 py-1.5 text-muted-foreground text-xs">{i + 1}</td>
                        <td className="px-3 py-1.5">{row.name || '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{row.phone || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {previewError && <p className="text-xs text-red-600">{previewError}</p>}
            <p className="text-xs text-muted-foreground">红色行为无效数据（姓名为空或手机号格式错误），导入时将被标记为失败行。</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPreview(false)}>取消</Button>
              <Button onClick={confirmImport} disabled={importing}>
                {importing && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                确认导入
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑 */}
      <Dialog open={editing !== null} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>编辑考生</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>姓名</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>手机号</Label>
                <Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </div>
              <div className="flex justify-end"><Button onClick={saveEdit}>保存</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
