'use client';

import { apiFetch } from '@/lib/client-fetch';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { PARSE_STATUS_LABELS } from '@/lib/types';
import { ArrowLeft, BookOpen, Loader2 } from 'lucide-react';

interface DocDetail {
  id: string;
  name: string;
  file_type: string;
  file_size: number;
  parse_status: string;
  parse_error: string | null;
  chapters: { title: string; level: number; position: number }[];
  content_length: number;
  content_preview: string;
  used_count: number;
  created_at: string;
}

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [fullContent, setFullContent] = useState('');
  const [loadingFull, setLoadingFull] = useState(false);

  useEffect(() => {
    apiFetch(`/api/documents/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.code === 0) setDoc(json.data);
      });
  }, [id]);

  async function toggleFull() {
    if (showFull) {
      setShowFull(false);
      return;
    }
    if (!fullContent) {
      setLoadingFull(true);
      try {
        const res = await apiFetch(`/api/documents/${id}?full=1`);
        const json = await res.json();
        if (json.code === 0) setFullContent(json.data.content_text ?? '');
      } finally {
        setLoadingFull(false);
      }
    }
    setShowFull(true);
  }

  if (!doc) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl font-bold truncate">{doc.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {doc.file_type.toUpperCase()} · {(doc.file_size / 1024).toFixed(1)} KB · 正文 {doc.content_length} 字 · 被引用 {doc.used_count} 次
          </p>
        </div>
        <StatusBadge status={doc.parse_status} label={PARSE_STATUS_LABELS[doc.parse_status as keyof typeof PARSE_STATUS_LABELS] ?? doc.parse_status} />
      </div>

      {doc.parse_status === 'failed' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-300">
          解析失败：{doc.parse_error ?? '未知错误'}，请尝试重新解析或更换文档。
        </div>
      )}

      {doc.chapters.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-medium text-sm mb-3 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-primary" />
            章节结构（{doc.chapters.length} 个）
          </h2>
          <div className="space-y-1.5">
            {doc.chapters.map((ch, i) => (
              <div key={i} className="text-sm text-muted-foreground" style={{ paddingLeft: `${(ch.level - 1) * 16}px` }}>
                {ch.title}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-sm">解析文本{showFull ? '' : '预览'}</h2>
          <Button variant="outline" size="sm" onClick={toggleFull} disabled={loadingFull}>
            {loadingFull && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            {showFull ? '收起' : '查看全文'}
          </Button>
        </div>
        <pre className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground font-sans max-h-[480px] overflow-y-auto">
          {showFull ? fullContent : doc.content_preview}
        </pre>
      </div>
    </div>
  );
}
