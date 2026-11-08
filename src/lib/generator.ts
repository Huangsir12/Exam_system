// 智能出题：LLM 生成器
import { LLMClient, Config, type Message } from 'coze-coding-dev-sdk';
import type { Difficulty, QuestionType } from '@/lib/types';

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  fill: '填空题',
  essay: '简答题',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

export interface GeneratedQuestion {
  type: QuestionType;
  content: string;
  options: { key: string; text: string }[] | null;
  answer: string | string[] | boolean | string[][] | { reference: string; points: string[] } | null;
  analysis: string;
  score: number;
  difficulty: Difficulty;
  knowledge_point: string;
  source_location: string;
  source_excerpt: string;
}

interface Chunk {
  title: string;
  text: string;
  docName: string;
}

function buildPrompt(type: QuestionType, count: number, score: number, difficulty: Difficulty | 'mixed', chunks: Chunk[]): string {
  const typeLabel = QUESTION_TYPE_LABEL[type];
  const diffLabel = difficulty === 'mixed' ? '混合（简单、中等、困难合理分布）' : DIFFICULTY_LABEL[difficulty];
  const materials = chunks
    .map((c, i) => `【材料${i + 1}】（来源：《${c.docName}》章节「${c.title}」）\n${c.text}`)
    .join('\n\n');

  const typeSpec =
    type === 'single'
      ? `- options 为 4 个选项，key 分别为 "A"、"B"、"C"、"D"
- answer 为唯一正确选项的 key，例如 "A"
- 单选题只能有一个正确答案`
      : type === 'multiple'
        ? `- options 为 4 个选项，key 分别为 "A"、"B"、"C"、"D"
- answer 为字符串数组，包含至少 2 个正确选项的 key，例如 ["A","C"]
- 多选题必须至少有两个正确答案`
        : type === 'judge'
          ? `- options 为 null（系统固定使用「正确/错误」两个选项）
- answer 为布尔值：题干表述正确为 true，错误为 false`
          : type === 'fill'
            ? `- 题干中用 ____（四个及以上下划线）表示填空位置，每题 1~2 个空
- options 为 null
- answer 为二维字符串数组，按空分组：每个空一个数组，第一个元素为标准答案，其余为可接受答案，例如 [["标准答案","可接受写法"],["第二空答案"]]
- 答案必须是材料中的关键术语或数据，且与空格数量一一对应`
            : `- options 为 null
- answer 为对象 {"reference":"参考答案完整表述","points":["评分要点1","评分要点2","评分要点3"]}
- 简答题必须给出参考答案和明确的评分要点（3~5 条，每条为关键采分点）`;

  return `你是一位严谨的命题专家。请严格依据下面提供的知识材料命制 ${count} 道${typeLabel}，难度：${diffLabel}，每题 ${score} 分。

${materials}

【命题要求】
1. 题目必须且只能依据上述材料命制，答案必须能从材料中找到依据，禁止引入材料之外的知识
2. 题干表述清晰、无歧义，不得出现无答案、多答案（多选题除外）或答案与材料冲突的情况
3. 各题考查点不得重复，尽量覆盖不同材料与不同段落
${typeSpec}
- analysis 为解析：说明答案依据与理由，50~200 字
- knowledge_point 为该题考查的知识点名称（10 字以内）
- source_location 为来源定位，格式：《文档名》章节「章节标题」
- source_excerpt 为支持该题答案的材料原文摘录（从上述材料中原文复制，80 字以内）

【输出格式】
只输出一个 JSON 数组，不要输出任何其他文字、解释或 markdown 代码块标记。数组元素格式：
[{"type":"${type}","content":"题干","options":...,"answer":...,"analysis":"解析","knowledge_point":"知识点","source_location":"《...》章节「...」","source_excerpt":"原文摘录"}]

请生成恰好 ${count} 道题。`;
}

function extractJsonArray(text: string): unknown[] {
  // 去掉 markdown 代码块
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('LLM 输出中未找到 JSON 数组');
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed)) throw new Error('LLM 输出不是 JSON 数组');
  return parsed;
}

const VALID_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export function sanitizeQuestion(raw: unknown, type: QuestionType, score: number): GeneratedQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  const content = typeof q.content === 'string' ? q.content.trim() : '';
  if (!content) return null;

  let options: { key: string; text: string }[] | null = null;
  if (type === 'single' || type === 'multiple') {
    // 兼容 options 为对象映射形式 {"A":"文本","B":"文本"}
    if (!Array.isArray(q.options) && q.options && typeof q.options === 'object') {
      q.options = Object.entries(q.options as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => ({ key: k, text: v as string }));
    }
    if (!Array.isArray(q.options) || q.options.length < 2) return null;
    const KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const parsed: { key: string; text: string }[] = [];
    for (let i = 0; i < q.options.length; i++) {
      const item = q.options[i] as unknown;
      if (!item) continue;
      if (typeof item === 'string') {
        // 兼容纯文本选项："xxx" 或 "A. xxx"
        const m = item.match(/^\s*([A-Ha-h])[.、:：]?\s*(.+)$/);
        parsed.push({ key: m ? m[1].toUpperCase() : KEYS[i] ?? `O${i}`, text: (m ? m[2] : item).trim() });
      } else if (typeof item === 'object') {
        const o = item as Record<string, unknown>;
        if (typeof o.key === 'string' && typeof o.text === 'string') {
          parsed.push({ key: o.key.trim().toUpperCase(), text: o.text.trim() });
        } else {
          // 兼容 {"A": "xxx"} 形式
          const entries = Object.entries(o);
          if (entries.length === 1 && typeof entries[0][1] === 'string') {
            parsed.push({ key: entries[0][0].trim().toUpperCase(), text: entries[0][1].trim() });
          }
        }
      }
    }
    options = parsed.filter((o) => o.key && o.text);
    if (options.length < 2) return null;
    // key 去重
    const keys = new Set(options.map((o) => o.key));
    if (keys.size !== options.length) return null;
  }

  // 清洗选择题答案："A." / "A、xxx" / "a" → "A"
  const cleanChoiceKey = (v: string): string => {
    const m = v.trim().match(/^([A-Ha-h])\b/);
    return m ? m[1].toUpperCase() : v.trim().toUpperCase();
  };

  let answer: GeneratedQuestion['answer'] = null;
  if (type === 'single') {
    if (typeof q.answer !== 'string') return null;
    answer = cleanChoiceKey(q.answer);
    if (options && !options.some((o) => o.key === answer)) return null;
  } else if (type === 'judge') {
    if (typeof q.answer === 'boolean') {
      answer = q.answer;
    } else if (q.answer === 'true' || q.answer === 'A' || q.answer === '正确') {
      answer = true;
    } else if (q.answer === 'false' || q.answer === 'B' || q.answer === '错误') {
      answer = false;
    } else {
      return null;
    }
  } else if (type === 'multiple') {
    if (!Array.isArray(q.answer)) return null;
    const arr = q.answer
      .filter((a): a is string => typeof a === 'string')
      .map((a) => cleanChoiceKey(a))
      .filter((a) => /^[A-H]$/.test(a));
    const keys = new Set((options ?? []).map((o) => o.key));
    if (arr.some((a) => !keys.has(a))) return null;
    if (new Set(arr).size < 2) return null; // 多选至少 2 个正确答案
    answer = [...new Set(arr)];
  } else if (type === 'fill') {
    // 二维数组：[[标准答案,可接受...], ...]
    if (!Array.isArray(q.answer) || q.answer.length === 0) return null;
    const blanks: string[][] = [];
    for (const item of q.answer) {
      if (Array.isArray(item)) {
        const group = item.filter((a): a is string => typeof a === 'string').map((a) => a.trim()).filter(Boolean);
        if (group.length === 0) return null;
        blanks.push(group);
      } else if (typeof item === 'string' && item.trim()) {
        // 兼容一维：按空顺序
        blanks.push([item.trim()]);
      } else {
        return null;
      }
    }
    answer = blanks;
  } else {
    // essay: { reference, points }
    if (q.answer && typeof q.answer === 'object' && !Array.isArray(q.answer)) {
      const a = q.answer as Record<string, unknown>;
      const reference = typeof a.reference === 'string' ? a.reference.trim() : '';
      const points = Array.isArray(a.points)
        ? a.points.filter((p): p is string => typeof p === 'string').map((p) => p.trim()).filter(Boolean)
        : [];
      if (!reference && points.length === 0) return null;
      answer = { reference: reference || points.join('；'), points };
    } else if (typeof q.answer === 'string' && q.answer.trim()) {
      answer = { reference: q.answer.trim(), points: [q.answer.trim()] };
    } else {
      return null;
    }
  }

  const difficulty = VALID_DIFFICULTIES.includes(q.difficulty as Difficulty)
    ? (q.difficulty as Difficulty)
    : 'medium';

  return {
    type,
    content,
    options,
    answer,
    analysis: typeof q.analysis === 'string' ? q.analysis.trim() : '',
    score,
    difficulty,
    knowledge_point: typeof q.knowledge_point === 'string' ? q.knowledge_point.trim().slice(0, 50) : '',
    source_location: typeof q.source_location === 'string' ? q.source_location.trim() : '',
    source_excerpt: typeof q.source_excerpt === 'string' ? q.source_excerpt.trim().slice(0, 500) : '',
  };
}

/** 文本相似度（基于字符 bigram 的 Dice 系数），用于题目去重 */
function similarity(a: string, b: string): number {
  const norm = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '');
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length);
  const grams = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ga = grams(x);
  const gb = grams(y);
  let overlap = 0;
  for (const [g, c] of ga) overlap += Math.min(c, gb.get(g) ?? 0);
  return (2 * overlap) / (x.length - 1 + (y.length - 1));
}

/** 去除重复/高度相似题目（相似度阈值 0.65），保留先出现者 */
export function dedupeQuestions(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  const kept: GeneratedQuestion[] = [];
  for (const q of questions) {
    if (kept.some((k) => similarity(k.content, q.content) >= 0.65)) continue;
    kept.push(q);
  }
  return kept;
}

/** 判断题干是否与已有题目列表中的任一条高度相似 */
export function isSimilarToAny(content: string, existing: string[], threshold = 0.65): boolean {
  return existing.some((c) => similarity(c, content) >= threshold);
}

export interface GenerateProgress {
  type: 'progress' | 'question' | 'batch_error' | 'done';
  step?: string;
  current?: number;
  total?: number;
  question?: GeneratedQuestion;
  message?: string;
}

/** 生成指定题型的一批题目（非流式调用 LLM，内部带重试） */
export async function generateQuestionBatch(
  type: QuestionType,
  count: number,
  score: number,
  difficulty: Difficulty | 'mixed',
  chunks: Chunk[],
): Promise<GeneratedQuestion[]> {
  const client = new LLMClient(new Config());
  const prompt = buildPrompt(type, count, score, difficulty, chunks);
  const messages: Message[] = [
    { role: 'system', content: '你是严谨的命题专家，只输出合法 JSON。' },
    { role: 'user', content: prompt },
  ];

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await client.invoke(messages, { model: 'doubao-seed-2-0-pro-260215', temperature: 0.4 });
      const arr = extractJsonArray(response.content);
      const questions = arr
        .map((item) => sanitizeQuestion(item, type, score))
        .filter((q): q is GeneratedQuestion => q !== null);
      if (questions.length === 0) {
        // 附带原始输出片段便于诊断
        const snippet = (response.content ?? '').replace(/\s+/g, ' ').slice(0, 300);
        throw new Error(`生成结果为空或全部不合法。原始输出片段: ${snippet}`);
      }
      return questions;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error('生成失败');
    }
  }
  throw lastError ?? new Error('生成失败');
}
