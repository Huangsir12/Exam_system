'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { PARSE_STATUS_LABELS } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Download, FileText, Loader2, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react';

interface Doc {
  id: string;
  name: string;
  file_type: string;
  file_size: number;
  parse_status: string;
  parse_error: string | null;
  used_count: number;
  created_at: string;
}

const ACCEPT = '.pdf,.docx,.txt,.md';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [parsingIds, setParsingIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/documents');
    const json = await res.json();
    if (json.code === 0) setDocs(json.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 轮询解析中的文档
  useEffect(() => {
    const hasParsing = docs.some((d) => d.parse_status === 'parsing' || d.parse_status === 'pending');
    if (!hasParsing) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [docs, load]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError('');
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/documents/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok || json.code !== 0) {
          setError(json.message || `「${file.name}」上传失败`);
          continue;
        }
        // 自动触发解析
        triggerParse(json.data.id);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
      load();
    }
  }

  async function triggerParse(id: string) {
    setParsingIds((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/documents/${id}/parse`, { method: 'POST' });
    } finally {
      setParsingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      load();
    }
  }

  async function handleDelete(doc: Doc) {
    const warn = doc.used_count > 0
      ? `该文档已被 ${doc.used_count} 场考试引用。删除不影响已生成的试卷（题目快照已独立保存），确认删除？`
      : `确认删除「${doc.name}」？`;
    if (!window.confirm(warn)) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.code !== 0) {
      setError(json.message || '删除失败');
      return;
    }
    load();
  }

  async function handleRename(doc: Doc) {
    const name = renameValue.trim();
    if (!name) return;
    await fetch(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setRenamingId(null);
    load();
  }

  async function handleDownload(id: string) {
    const res = await fetch(`/api/documents/${id}/download`);
    const json = await res.json();
    if (json.code !== 0 || !json.data?.url) return;
    const response = await fetch(json.data.url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = json.data.name ?? 'document';
    link.click();
    window.URL.revokeObjectURL(blobUrl);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">知识文档</h1>
          <p className="text-sm text-muted-foreground mt-1">上传 PDF / DOCX / TXT / Markdown 文档，解析后用于智能出题</p>
        </div>
        <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Upload className="w-4 h-4 mr-1.5" />}
          上传文档
        </Button>
        <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={handleUpload} />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="p-16 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">暂无知识文档</p>
            <p className="text-xs text-muted-foreground/70 mt-1">上传文档后，系统将自动解析内容供智能出题使用</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {docs.map((doc) => (
            <Card key={doc.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                  doc.parse_status === 'success' ? 'bg-emerald-50 text-emerald-700' : doc.parse_status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-muted text-muted-foreground',
                )}>
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  {renamingId === doc.id ? (
                    <div className="flex gap-2">
                      <input
                        className="border border-border rounded-md px-2 py-1 text-sm flex-1 min-w-0 bg-background"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(doc); if (e.key === 'Escape') setRenamingId(null); }}
                        autoFocus
                      />
                      <Button size="sm" onClick={() => handleRename(doc)}>保存</Button>
                    </div>
                  ) : (
                    <a href={`/admin/documents/${doc.id}`} className="font-medium text-sm hover:text-primary truncate block">{doc.name}</a>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {doc.file_type.toUpperCase()} · {fmtSize(doc.file_size)} · 被引用 {doc.used_count} 次 · {new Date(doc.created_at).toLocaleString('zh-CN')}
                  </p>
                  {doc.parse_status === 'failed' && doc.parse_error && (
                    <p className="text-xs text-red-600 mt-1">解析失败：{doc.parse_error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={doc.parse_status} label={PARSE_STATUS_LABELS[doc.parse_status as keyof typeof PARSE_STATUS_LABELS] ?? doc.parse_status} />
                  <Button
                    variant="outline" size="sm"
                    disabled={parsingIds.has(doc.id) || doc.parse_status === 'parsing'}
                    onClick={() => triggerParse(doc.id)}
                  >
                    {(parsingIds.has(doc.id) || doc.parse_status === 'parsing')
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />}
                    {doc.parse_status === 'pending' ? '解析' : '重新解析'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDownload(doc.id)} title="下载">
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setRenamingId(doc.id); setRenameValue(doc.name); }} title="重命名">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(doc)} title="删除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
