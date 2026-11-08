import type { PaperSnapshotItem, PaperSnapshotOption, Question, QuestionType } from '@/lib/types';

// ===================== 客观题评分 =====================
export function gradeObjective(
  question: { type: string; answer: unknown; score: number },
  userAnswer: unknown
): { score: number; isCorrect: boolean } {
  const fullScore = Number(question.score);
  const type = question.type as QuestionType;

  if (userAnswer === null || userAnswer === undefined || userAnswer === '') {
    return { score: 0, isCorrect: false };
  }

  switch (type) {
    case 'single': {
      const correct = userAnswer === question.answer;
      return { score: correct ? fullScore : 0, isCorrect: correct };
    }
    case 'judge': {
      // 用户答案可能为 boolean / 'A'(正确) / 'B'(错误) / 'true' / 'false'
      let uBool: boolean | null = null;
      if (typeof userAnswer === 'boolean') uBool = userAnswer;
      else if (userAnswer === 'A' || userAnswer === 'true' || userAnswer === '正确') uBool = true;
      else if (userAnswer === 'B' || userAnswer === 'false' || userAnswer === '错误') uBool = false;
      const correct = uBool !== null && uBool === question.answer;
      return { score: correct ? fullScore : 0, isCorrect: correct };
    }
    case 'multiple': {
      const std = Array.isArray(question.answer) ? [...(question.answer as string[])].sort() : [];
      const usr = Array.isArray(userAnswer) ? [...(userAnswer as string[])].sort() : [];
      const correct = std.length > 0 && std.length === usr.length && std.every((v, i) => v === usr[i]);
      return { score: correct ? fullScore : 0, isCorrect: correct };
    }
    case 'fill': {
      // answer: string[][]，按空分组，含可接受答案；忽略首尾空格与大小写
      const blanks = Array.isArray(question.answer) ? (question.answer as string[][]) : [];
      const usrArr = Array.isArray(userAnswer) ? (userAnswer as string[]) : [];
      if (blanksEmpty(blanks)) return { score: 0, isCorrect: false };
      const perBlank = fullScore / blanks.length;
      let earned = 0;
      let allCorrect = true;
      blanks.forEach((acceptable, idx) => {
        const u = normalize(usrArr[idx]);
        const hit = acceptable.some((a) => normalize(a) === u && u !== '');
        if (hit) earned += perBlank;
        else allCorrect = false;
      });
      earned = Math.round(earned * 10) / 10;
      return { score: earned, isCorrect: allCorrect };
    }
    default:
      return { score: 0, isCorrect: false };
  }
}

function blanksEmpty(blanks: string[][]): boolean {
  return !Array.isArray(blanks) || blanks.length === 0;
}

function normalize(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim().toLowerCase();
}

export function isObjective(type: QuestionType): boolean {
  return type === 'single' || type === 'multiple' || type === 'judge' || type === 'fill';
}

// ===================== 试卷快照生成（三种组卷方式） =====================
function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed || 1;
  const rand = () => {
    // xorshift32，保证可复现
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface PaperBuildOptions {
  paperMode: 'fixed' | 'random';
  questionConfig: { type: QuestionType; count: number }[];
  seed: number;
}
/**
 * 根据组卷方式生成考生试卷快照。
 * - fixed（固定试卷）：题目与顺序与母版完全一致，所有考生同一套卷
 * - random（随机试卷）：按题型配置从题库随机抽题，题序与选项均乱序，每位考生不同试卷
 */
export function buildPaperSnapshot(questions: Question[], opts: PaperBuildOptions): PaperSnapshotItem[] {
  const seed = opts.seed || 1;
  let pool = [...questions];
  const isRandom = opts.paperMode === 'random';

  if (isRandom) {
    // 按题型配置从题库随机抽取（题库题量应大于配置题量）
    const picked: Question[] = [];
    for (const cfg of opts.questionConfig) {
      const sameType = pool.filter((q) => q.type === cfg.type);
      const shuffled = shuffleWithSeed(sameType, seed + cfg.count * 7 + cfg.type.length);
      picked.push(...shuffled.slice(0, Math.min(cfg.count, shuffled.length)));
    }
    if (picked.length > 0) pool = picked;
  }

  let ordered = pool.sort((a, b) => a.sort_order - b.sort_order);
  if (isRandom) {
    ordered = shuffleWithSeed(ordered, seed + 13);
  }

  return ordered.map((q, idx) => {
    let options: PaperSnapshotOption[] | null = q.options
      ? q.options.map((o) => ({ key: o.key, text: o.text, original_key: o.key }))
      : null;
    if (isRandom && options && (q.type === 'single' || q.type === 'multiple')) {
      // 打乱选项顺序后按新位置重新编号 A/B/C/D，original_key 保留母版 key
      const shuffled = shuffleWithSeed(options, seed + idx * 31 + 7);
      options = shuffled.map((o, i) => ({ ...o, key: String.fromCharCode(65 + i) }));
    }
    return { question_id: q.id, sort_order: idx, options };
  });
}

// ===================== 考生试卷快照（含题目完整副本，答案已映射到展示 key） =====================

export interface SnapshotQuestion {
  id: string;
  sort: number;
  type: QuestionType;
  content: string;
  options: { key: string; text: string }[] | null;
  answer: Question['answer'];
  analysis: string;
  score: number;
  difficulty: string;
  knowledge_point: string;
  source_document_id: string | null;
  source_document_name: string;
  source_location: string;
  source_excerpt: string;
}

/**
 * 基于试卷快照为每道题生成独立快照副本：
 * - options 使用乱序后的展示版本（key 已重编号）
 * - single/multiple 的 answer 由母版 original_key 映射到展示 key
 * - 此后阅卷、结果页、追溯全部以该快照为准，母版题目后续被修改也不受影响
 */
export function buildQuestionSnapshots(
  questions: Question[],
  snapshot: PaperSnapshotItem[]
): { questionId: string; snap: SnapshotQuestion }[] {
  const qMap = new Map(questions.map((q) => [q.id, q]));
  return snapshot.map((item) => {
    const q = qMap.get(item.question_id)!;
    let options: { key: string; text: string }[] | null = q.options ? [...q.options] : null;
    let answer = q.answer;

    if (item.options && (q.type === 'single' || q.type === 'multiple')) {
      const origToDisplay = new Map(item.options.map((o) => [o.original_key, o.key]));
      options = item.options.map((o) => ({ key: o.key, text: o.text }));
      if (q.type === 'single' && typeof q.answer === 'string') {
        answer = origToDisplay.get(q.answer) ?? q.answer;
      } else if (q.type === 'multiple' && Array.isArray(q.answer)) {
        answer = (q.answer as string[]).map((k) => origToDisplay.get(k) ?? k);
      }
    }

    return {
      questionId: q.id,
      snap: {
        id: q.id,
        sort: item.sort_order,
        type: q.type,
        content: q.content,
        options,
        answer,
        analysis: q.analysis,
        score: Number(q.score),
        difficulty: q.difficulty,
        knowledge_point: q.knowledge_point,
        source_document_id: q.source_document_id,
        source_document_name: q.source_document_name,
        source_location: q.source_location,
        source_excerpt: q.source_excerpt,
      },
    };
  });
}
