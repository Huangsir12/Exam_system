// 全局类型定义（与数据库 snake_case 对齐）

export type QuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'essay';

export type ExamStatus = 'draft' | 'pending' | 'published' | 'ongoing' | 'ended' | 'archived';

/** 组卷模式：fixed=固定试卷（全员同卷，需管理员确认后发布）；random=随机试卷（题库抽题，考生开始时生成） */
export type PaperMode = 'fixed' | 'random';

export type ResultVisibility = 'immediate' | 'after_end' | 'manual';

export type ParseStatus = 'pending' | 'parsing' | 'success' | 'failed';

export type GenerationStatus = 'none' | 'generating' | 'success' | 'failed';

export type AttemptStatus = 'in_progress' | 'submitted' | 'grading' | 'completed';

export interface QuestionOption {
  key: string;
  text: string;
}

/** answer 结构：
 * single: "A"
 * multiple: ["A","C"]
 * judge: true | false
 * fill: [["答案1","可接受答案"],["空2答案"]]  （按空分组）
 * essay: { reference: string; points: string[] }
 */
export type QuestionAnswer = string | string[] | boolean | string[][] | { reference: string; points: string[] };

export interface Question {
  id: string;
  exam_id: string;
  type: QuestionType;
  content: string;
  options: QuestionOption[] | null;
  answer: QuestionAnswer;
  analysis: string;
  score: string;
  difficulty: 'easy' | 'medium' | 'hard';
  knowledge_point: string;
  source_document_id: string | null;
  source_document_name: string;
  source_location: string;
  source_excerpt: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface QuestionConfigItem {
  type: QuestionType;
  count: number;
  score: number;
  difficulty: { easy: number; medium: number; hard: number };
}

export interface DocumentChapter {
  title: string;
  level: number;
  start: number;
  end: number;
  excerpt: string;
}

export interface KnowledgeDocument {
  id: string;
  name: string;
  file_key: string;
  file_type: string;
  file_size: number;
  parse_status: ParseStatus;
  parse_error: string | null;
  content_text: string | null;
  chapters: DocumentChapter[] | null;
  usage_count: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  status: ExamStatus;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  total_score: string;
  pass_score: string;
  max_attempts: number;
  paper_mode: PaperMode;
  question_order: 'fixed' | 'random';
  option_shuffle: boolean;
  confirmed_at: string | null; // 固定试卷的管理员确认时间
  result_visibility: ResultVisibility;
  show_answer: boolean;
  show_analysis: boolean;
  show_source: boolean;
  result_published: boolean;
  document_ids: string[];
  content_scope: { docId: string; chapters: string[] }[] | null;
  question_config: QuestionConfigItem[];
  generation_status: GenerationStatus;
  generation_error: string | null;
  created_by: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Candidate {
  id: string;
  exam_id: string;
  name: string;
  phone: string;
  import_batch: string | null;
  created_at: string;
}

export interface PaperSnapshotOption extends QuestionOption {
  original_key: string; // 乱序前母版中的选项 key
}

export interface PaperSnapshotItem {
  question_id: string;
  sort_order: number;
  options: PaperSnapshotOption[] | null; // 乱序后的选项（含原始 key 映射，用于答案判定）
}

export interface Attempt {
  id: string;
  exam_id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_phone: string;
  attempt_no: number;
  status: AttemptStatus;
  grading_status: 'none' | 'pending' | 'completed';
  paper_snapshot: PaperSnapshotItem[];
  started_at: string;
  deadline_at: string;
  submitted_at: string | null;
  duration_seconds: number | null;
  objective_score: string | null;
  subjective_score: string | null;
  total_score: string | null;
  is_passed: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface AttemptAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  question_snapshot: Question;
  user_answer: string | string[] | boolean | null;
  marked: boolean;
  score: string | null;
  is_correct: boolean | null;
  grader_comment: string;
  graded_by: string;
  graded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperationLog {
  id: string;
  operator_type: string;
  operator_id: string;
  operator_name: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface SessionInfo {
  id: string;
  token: string;
  user_type: 'admin' | 'candidate';
  user_id: string;
  user_name: string;
  phone: string | null;
  expires_at: string;
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  fill: '填空题',
  essay: '简答题',
};

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  draft: '草稿',
  pending: '待发布',
  published: '未开始',
  ongoing: '进行中',
  ended: '已结束',
  archived: '已归档',
};

/** 考生视角的考试状态 */
export type CandidateExamStatus =
  | 'not_started'
  | 'available'
  | 'in_progress'
  | 'submitted'
  | 'grading'
  | 'completed'
  | 'expired';

export const CANDIDATE_EXAM_STATUS_LABELS: Record<CandidateExamStatus, string> = {
  not_started: '未开始',
  available: '可考试',
  in_progress: '进行中',
  submitted: '已提交',
  grading: '阅卷中',
  completed: '已完成',
  expired: '已过期',
};

export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone || '';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/** 安全格式化日期时间（string | null） */
export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleString('zh-CN', { hour12: false });
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export const QUESTION_TYPES: QuestionType[] = ['single', 'multiple', 'judge', 'fill', 'essay'];
export const EXAM_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  PUBLISHED: 'published',
  ONGOING: 'ongoing',
  ENDED: 'ended',
  ARCHIVED: 'archived',
} as const satisfies Record<string, ExamStatus>;
export const DOCUMENT_STATUS = {
  PENDING: 'pending',
  PARSING: 'parsing',
  SUCCESS: 'success',
  FAILED: 'failed',
} as const satisfies Record<string, ParseStatus>;
export const GENERATION_STATUS = {
  NONE: 'none',
  GENERATING: 'generating',
  SUCCESS: 'success',
  FAILED: 'failed',
} as const satisfies Record<string, GenerationStatus>;

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

export const PAPER_MODE_LABELS: Record<PaperMode, string> = {
  fixed: '固定试卷',
  random: '随机试卷',
};

/** 兼容历史数据：uniform/shuffle 归入 fixed，random_equal 归入 random */
export function normalizePaperMode(mode: string | null | undefined): PaperMode {
  return mode === 'random' || mode === 'random_equal' ? 'random' : 'fixed';
}

export const RESULT_VISIBILITY_LABELS: Record<ResultVisibility, string> = {
  immediate: '提交后立即公开',
  after_end: '考试结束后公开',
  manual: '管理员手动发布',
};

export const PARSE_STATUS_LABELS: Record<ParseStatus, string> = {
  pending: '等待解析',
  parsing: '解析中',
  success: '解析成功',
  failed: '解析失败',
};

export const GENERATION_STATUS_LABELS: Record<GenerationStatus, string> = {
  none: '未生成',
  generating: '生成中',
  success: '已生成',
  failed: '生成失败',
};
