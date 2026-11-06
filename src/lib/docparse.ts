// 知识文档：解析工具（章节切分）
import type { DocumentChapter } from '@/lib/types';

/** 从解析后的纯文本中识别章节结构 */
export function extractChapters(text: string): DocumentChapter[] {
  const lines = text.split('\n');
  const chapters: DocumentChapter[] = [];
  const headingRe = [
    /^(#{1,4})\s+(.+)$/, // markdown 标题
    /^(第[一二三四五六七八九十百\d]+[章节篇部分])\s*[：:、]?\s*(.*)$/, // 第一章
    /^([一二三四五六七八九十]+)[、.]\s*(.+)$/, // 一、xxx
    /^(\d+(?:\.\d+){0,3})[、.\s]\s*(.+)$/, // 1.2.3 xxx
  ];

  let offset = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    let title = '';
    let level = 1;
    if (trimmed.length > 0 && trimmed.length < 80) {
      const mdMatch = trimmed.match(headingRe[0]);
      const cnMatch = trimmed.match(headingRe[1]);
      const numCnMatch = trimmed.match(headingRe[2]);
      const numMatch = trimmed.match(headingRe[3]);
      if (mdMatch) {
        level = mdMatch[1].length;
        title = mdMatch[2].trim();
      } else if (cnMatch) {
        level = 1;
        title = (cnMatch[1] + (cnMatch[2] ? ' ' + cnMatch[2] : '')).trim();
      } else if (numCnMatch) {
        level = 2;
        title = trimmed;
      } else if (numMatch) {
        level = Math.min((numMatch[1].match(/\./g)?.length ?? 0) + 1, 4);
        title = trimmed;
      }
    }
    if (title) {
      chapters.push({ title, level, start: offset, end: offset, excerpt: '' });
    }
    offset += line.length + 1;
  }

  // 计算 end 与摘录
  for (let i = 0; i < chapters.length; i++) {
    const end = i + 1 < chapters.length ? chapters[i + 1].start : text.length;
    chapters[i].end = end;
    const body = text.slice(chapters[i].start, Math.min(end, chapters[i].start + 300));
    chapters[i].excerpt = body.replace(/\n+/g, ' ').trim().slice(0, 200);
  }
  return chapters.slice(0, 200);
}

/** 将长文本按章节/长度切块，供出题采样 */
export function splitIntoChunks(text: string, chapters: DocumentChapter[] | null, maxChunkLen = 4000): { title: string; text: string }[] {
  const chunks: { title: string; text: string }[] = [];
  if (chapters && chapters.length > 0) {
    for (const ch of chapters) {
      const body = text.slice(ch.start, ch.end).trim();
      if (!body) continue;
      if (body.length <= maxChunkLen) {
        chunks.push({ title: ch.title, text: body });
      } else {
        for (let i = 0; i < body.length; i += maxChunkLen) {
          chunks.push({ title: ch.title, text: body.slice(i, i + maxChunkLen) });
        }
      }
    }
    return chunks;
  }
  for (let i = 0; i < text.length; i += maxChunkLen) {
    chunks.push({ title: `片段 ${Math.floor(i / maxChunkLen) + 1}`, text: text.slice(i, i + maxChunkLen) });
  }
  return chunks;
}
