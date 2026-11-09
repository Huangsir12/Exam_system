// 知识文档：解析工具（章节切分）
import type { DocumentChapter } from '@/lib/types';

const TOC_TITLE_RE = /^(?:目录|目次|contents?|table\s+of\s+contents)$/i;
const TOC_LINE_RE = /(?:\.{3,}|…{2,}|·{3,}|-{3,}|_{3,})\s*\d*\s*$|^.{1,80}\s+\d{1,4}\s*$/;

function stripHeadingLine(body: string, title: string): string {
  const lines = body.split('\n');
  if (lines.length === 0) return '';
  const first = lines[0].replace(/^#{1,6}\s*/, '').trim();
  const normalizedTitle = title.replace(/^#{1,6}\s*/, '').trim();
  if (first.replace(/\s/g, '') === normalizedTitle.replace(/\s/g, '') && !/[。；，：]/.test(first)) {
    return lines.slice(1).join('\n').trim();
  }
  return body.trim();
}

/** 识别目录页、纯标题等不包含可命题知识的文本。 */
function isNonBodyText(text: string): boolean {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return true;
  const usefulLength = lines.join('').replace(/[\s\p{P}\p{S}]/gu, '').length;
  const tocLines = lines.filter((line) => TOC_TITLE_RE.test(line) || TOC_LINE_RE.test(line)).length;
  if (tocLines >= 2 && tocLines / lines.length >= 0.5 && !lines.some((line) => line.length >= 40 && /[。；]/.test(line))) return true;
  // 保留简短但有效的正文条款，只排除明确带页码/引导符的短目录行。
  return usefulLength < 24
    && lines.length <= 2
    && lines.every((line) => TOC_TITLE_RE.test(line) || TOC_LINE_RE.test(line));
}

function stripLeadingTableOfContents(text: string): string {
  const lines = text.split('\n');
  const searchLimit = Math.min(lines.length, 120);
  const tocIndex = lines.slice(0, searchLimit).findIndex((line) => TOC_TITLE_RE.test(line.trim()));
  if (tocIndex < 0) return text;
  for (let i = tocIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const compactLength = line.replace(/[\s\p{P}\p{S}]/gu, '').length;
    // 正文的第一个完整句子比页码型目录条目更可靠。
    if (compactLength >= 24 && /[。；：，]/.test(line) && !TOC_LINE_RE.test(line)) {
      return lines.slice(i).join('\n').trim();
    }
  }
  return lines.slice(tocIndex + 1).filter((line) => !TOC_LINE_RE.test(line.trim())).join('\n');
}

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
  return chapters;
}

/** 将长文本按章节/长度切块，供出题采样 */
export function splitIntoChunks(text: string, chapters: DocumentChapter[] | null, maxChunkLen = 4000): { title: string; text: string }[] {
  const chunks: { title: string; text: string }[] = [];
  // 老文档可能仅保存了前 200 个目录条目的索引；无范围限制时从全文重新识别。
  if (chapters === null) {
    const refreshed = extractChapters(text);
    if (refreshed.length > 0) {
      const chapterChunks = splitIntoChunks(text, refreshed, maxChunkLen);
      if (chapterChunks.length > 0) return chapterChunks;
    }
  }
  if (chapters && chapters.length > 0) {
    for (const ch of chapters) {
      const rawBody = text.slice(ch.start, ch.end).trim();
      const body = stripLeadingTableOfContents(stripHeadingLine(rawBody, ch.title))
        .split('\n').filter((line) => !TOC_LINE_RE.test(line.trim())).join('\n').trim();
      if (isNonBodyText(body)) continue;
      if (body.length <= maxChunkLen) {
        chunks.push({ title: ch.title, text: body });
      } else {
        for (let i = 0; i < body.length; i += maxChunkLen) {
          const part = body.slice(i, i + maxChunkLen).trim();
          if (!isNonBodyText(part)) chunks.push({ title: ch.title, text: part });
        }
      }
    }
    // 已有章节结构时不回退到全文，否则会把刚过滤的目录重新送给模型。
    return chunks;
  }
  const bodyText = stripLeadingTableOfContents(text);
  for (let i = 0; i < bodyText.length; i += maxChunkLen) {
    const part = bodyText.slice(i, i + maxChunkLen).trim();
    if (!isNonBodyText(part)) {
      chunks.push({ title: `片段 ${Math.floor(i / maxChunkLen) + 1}`, text: part });
    }
  }
  return chunks;
}
