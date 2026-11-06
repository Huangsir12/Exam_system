import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ===================== 系统表（勿删） =====================
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
});

// ===================== 管理员 =====================
export const admins = pgTable(
  "admins",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    username: varchar("username", { length: 64 }).notNull().unique(),
    password_hash: text("password_hash").notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("admins_username_idx").on(table.username)]
);

// ===================== 会话（自建认证） =====================
export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    token: varchar("token", { length: 128 }).notNull().unique(),
    user_type: varchar("user_type", { length: 16 }).notNull(), // admin | candidate
    user_id: varchar("user_id", { length: 36 }).notNull(), // admin.id 或 candidate.id
    user_name: varchar("user_name", { length: 64 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sessions_token_idx").on(table.token),
    index("sessions_user_idx").on(table.user_type, table.user_id),
  ]
);

// ===================== 短信验证码 =====================
export const verificationCodes = pgTable(
  "verification_codes",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    phone: varchar("phone", { length: 20 }).notNull(),
    code: varchar("code", { length: 8 }).notNull(),
    used: boolean("used").default(false).notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("verification_codes_phone_idx").on(table.phone)]
);

// ===================== 登录/操作频率限制 =====================
export const rateLimits = pgTable(
  "rate_limits",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    key: varchar("key", { length: 128 }).notNull(), // 如 login:admin:admin / sms:13800000000
    count: integer("count").default(0).notNull(),
    window_start: timestamp("window_start", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("rate_limits_key_idx").on(table.key)]
);

// ===================== 知识文档 =====================
export const documents = pgTable(
  "documents",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    file_key: varchar("file_key", { length: 512 }).notNull(), // 对象存储 key
    file_type: varchar("file_type", { length: 16 }).notNull(), // pdf/docx/txt/md
    file_size: integer("file_size").notNull().default(0),
    parse_status: varchar("parse_status", { length: 16 }).notNull().default("pending"), // pending/parsing/success/failed
    parse_error: text("parse_error"),
    content_text: text("content_text"), // 解析后的全文
    chapters: jsonb("chapters"), // [{ title, level, start, end, excerpt }]
    usage_count: integer("usage_count").notNull().default(0),
    uploaded_by: varchar("uploaded_by", { length: 64 }).notNull().default(""),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("documents_parse_status_idx").on(table.parse_status),
    index("documents_created_at_idx").on(table.created_at),
  ]
);

// ===================== 考试 =====================
export const exams = pgTable(
  "exams",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").default(""),
    status: varchar("status", { length: 16 }).notNull().default("draft"), // draft/pending/published/ended/archived
    start_time: timestamp("start_time", { withTimezone: true }),
    end_time: timestamp("end_time", { withTimezone: true }),
    duration_minutes: integer("duration_minutes").notNull().default(60),
    total_score: numeric("total_score", { precision: 8, scale: 1 }).notNull().default("100"),
    pass_score: numeric("pass_score", { precision: 8, scale: 1 }).notNull().default("60"),
    max_attempts: integer("max_attempts").notNull().default(1),
    paper_mode: varchar("paper_mode", { length: 16 }).notNull().default("fixed"), // fixed=固定试卷(需管理员确认)/random=随机试卷(题库抽题)
    confirmed_at: timestamp("confirmed_at", { withTimezone: true }), // 固定试卷的管理员确认时间
    question_order: varchar("question_order", { length: 16 }).notNull().default("fixed"), // fixed/random
    option_shuffle: boolean("option_shuffle").notNull().default(false),
    result_visibility: varchar("result_visibility", { length: 16 }).notNull().default("manual"), // immediate/after_end/manual
    show_answer: boolean("show_answer").notNull().default(true),
    show_analysis: boolean("show_analysis").notNull().default(true),
    show_source: boolean("show_source").notNull().default(true),
    result_published: boolean("result_published").notNull().default(false),
    document_ids: jsonb("document_ids").notNull().default(sql`'[]'::jsonb`), // [docId]
    content_scope: jsonb("content_scope").default(sql`'[]'::jsonb`), // [{docId, chapters:[title]}]，空=全文
    question_config: jsonb("question_config").notNull().default(sql`'[]'::jsonb`), // [{type,count,score,order,difficulty:{easy,medium,hard}}]
    generation_status: varchar("generation_status", { length: 16 }).notNull().default("none"), // none/generating/success/failed
    generation_error: text("generation_error"),
    created_by: varchar("created_by", { length: 64 }).notNull().default(""),
    published_at: timestamp("published_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("exams_status_idx").on(table.status),
    index("exams_created_at_idx").on(table.created_at),
  ]
);

// ===================== 试题（试卷母版） =====================
export const questions = pgTable(
  "questions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    exam_id: varchar("exam_id", { length: 36 }).notNull().references(() => exams.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 16 }).notNull(), // single/multiple/judge/fill/essay
    content: text("content").notNull(),
    options: jsonb("options"), // [{key:'A',text:'...'}]，填空题存空配置 [{key:'1'}]
    answer: jsonb("answer").notNull(), // single:'A' multiple:['A','B'] judge:true fill:[['答案1','可接受1'],['空2']] essay:{reference:'',points:[]}
    analysis: text("analysis").default(""),
    score: numeric("score", { precision: 6, scale: 1 }).notNull().default("5"),
    difficulty: varchar("difficulty", { length: 16 }).notNull().default("medium"), // easy/medium/hard
    knowledge_point: varchar("knowledge_point", { length: 255 }).default(""),
    source_document_id: varchar("source_document_id", { length: 36 }),
    source_document_name: varchar("source_document_name", { length: 255 }).default(""),
    source_location: varchar("source_location", { length: 255 }).default(""), // 章节/页码
    source_excerpt: text("source_excerpt").default(""), // 知识原文摘录
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("questions_exam_id_idx").on(table.exam_id),
    index("questions_exam_sort_idx").on(table.exam_id, table.sort_order),
  ]
);

// ===================== 参考人员名单 =====================
export const candidates = pgTable(
  "candidates",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    exam_id: varchar("exam_id", { length: 36 }).notNull().references(() => exams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    import_batch: varchar("import_batch", { length: 36 }).default(""),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("candidates_exam_id_idx").on(table.exam_id),
    index("candidates_phone_idx").on(table.phone),
    uniqueIndex("candidates_exam_phone_idx").on(table.exam_id, table.phone),
  ]
);

// ===================== 答题记录（考生试卷） =====================
export const attempts = pgTable(
  "attempts",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    exam_id: varchar("exam_id", { length: 36 }).notNull().references(() => exams.id, { onDelete: "cascade" }),
    candidate_id: varchar("candidate_id", { length: 36 }).notNull().references(() => candidates.id, { onDelete: "cascade" }),
    candidate_name: varchar("candidate_name", { length: 64 }).notNull().default(""), // 快照：名单移除后仍可追溯
    candidate_phone: varchar("candidate_phone", { length: 20 }).notNull().default(""), // 快照
    attempt_no: integer("attempt_no").notNull().default(1),
    status: varchar("status", { length: 16 }).notNull().default("in_progress"), // in_progress/submitted/grading/completed
    grading_status: varchar("grading_status", { length: 16 }).notNull().default("none"), // none/pending/completed
    paper_snapshot: jsonb("paper_snapshot").notNull().default(sql`'[]'::jsonb`), // [{question_id, sort_order, options(乱序后,含original_key)}]
    started_at: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    deadline_at: timestamp("deadline_at", { withTimezone: true }).notNull(),
    submitted_at: timestamp("submitted_at", { withTimezone: true }),
    duration_seconds: integer("duration_seconds"), // 答题用时（秒）
    objective_score: numeric("objective_score", { precision: 8, scale: 1 }).default("0"),
    subjective_score: numeric("subjective_score", { precision: 8, scale: 1 }).default("0"),
    total_score: numeric("total_score", { precision: 8, scale: 1 }).default("0"),
    is_passed: boolean("is_passed"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("attempts_exam_id_idx").on(table.exam_id),
    index("attempts_candidate_id_idx").on(table.candidate_id),
    index("attempts_status_idx").on(table.status),
    uniqueIndex("attempts_exam_candidate_no_idx").on(table.exam_id, table.candidate_id, table.attempt_no),
  ]
);

// ===================== 答题明细 =====================
export const attemptAnswers = pgTable(
  "attempt_answers",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    attempt_id: varchar("attempt_id", { length: 36 }).notNull().references(() => attempts.id, { onDelete: "cascade" }),
    question_id: varchar("question_id", { length: 36 }).notNull().references(() => questions.id, { onDelete: "cascade" }),
    question_snapshot: jsonb("question_snapshot").notNull(), // 题目完整快照（含答案/解析/来源，阅卷与追溯依据）
    user_answer: jsonb("user_answer"), // single:'A'(展示key) multiple:['A'] judge:true fill:['空1','空2'] essay:'...'
    marked: boolean("marked").notNull().default(false),
    saved_at: timestamp("saved_at", { withTimezone: true }), // 最近保存时间
    score: numeric("score", { precision: 6, scale: 1 }),
    is_correct: boolean("is_correct"),
    grader_comment: text("grader_comment").default(""),
    graded_by: varchar("graded_by", { length: 64 }).default(""),
    graded_at: timestamp("graded_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("attempt_answers_attempt_id_idx").on(table.attempt_id),
    index("attempt_answers_question_id_idx").on(table.question_id),
    uniqueIndex("attempt_answers_attempt_question_idx").on(table.attempt_id, table.question_id),
  ]
);

// ===================== 操作日志 =====================
export const operationLogs = pgTable(
  "operation_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    operator_type: varchar("operator_type", { length: 16 }).notNull().default("admin"), // admin/candidate/system
    operator_id: varchar("operator_id", { length: 36 }).default(""),
    operator_name: varchar("operator_name", { length: 64 }).notNull().default(""),
    action: varchar("action", { length: 64 }).notNull(), // publish_exam/edit_question/import_candidates/grade/export...
    target_type: varchar("target_type", { length: 32 }).default(""),
    target_id: varchar("target_id", { length: 36 }).default(""),
    detail: jsonb("detail"), // { before, after, note }
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("operation_logs_created_at_idx").on(table.created_at),
    index("operation_logs_target_idx").on(table.target_type, table.target_id),
  ]
);
