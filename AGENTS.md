# 项目上下文

## 项目概览

**智能考试系统**（一期）：组织内部考核平台。核心业务闭环：管理员上传知识文档（PDF/DOCX/TXT/MD）→ LLM 智能组卷 → 审核发布 → 名单内考生在线考试 → 客观题自动阅卷 + 简答题人工阅卷 → 成绩按规则公开 → 多维统计与 CSV 导出 → 操作日志留痕。

- **两类角色**：管理员（账号密码登录，分超级 `super`/普通 `normal` 两级，仅超管可管理管理员账号）、考生（姓名 + 手机号登录，无需验证码；名单外用户可登录但看不到任何考试，考试详情/开考由服务端名单校验拦截 403）
- **会话隔离**：管理员与考生使用独立 cookie（`exam_admin_session` / `exam_candidate_session`），同一浏览器双角色并存互不顶号；`/api/auth/me` 返回 `{admin, candidate}` 双角色状态
- **两种组卷模式**：固定试卷 `fixed`（全员同卷，生成后需管理员确认 `confirmed_at` 才能发布，题目变更自动重置确认）/ 随机试卷 `random`（按配置 2 倍生成题库，考生 start 时随机抽题 + 题序选项乱序）；历史值 uniform/shuffle→fixed、random_equal→random，读取侧用 `normalizePaperMode` 兼容
- **五种题型**：单选 single / 多选 multiple / 判断 judge / 填空 fill / 简答 essay

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **数据库**: Supabase（PostgREST，service_role_key 服务端访问，全表 RLS 无 policy，anon 完全阻断）
- **LLM**: doubao-seed-2-0-pro（出题，SSE 流式输出）
- **存储**: S3Storage（知识文档原件），FetchClient（文档解析）
- **图表**: recharts

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本（预置，勿改）
├── src/
│   ├── app/                # 页面路由与 API
│   │   ├── page.tsx              # 入口（按登录态分流）
│   │   ├── login/                # 考生登录（姓名+手机号）
│   │   ├── exams/                # 考生端：考试列表/详情/答题/结果
│   │   ├── admin/                # 管理端：登录/总览/文档/考试/日志
│   │   └── api/                  # 39 个 API 路由（见下）
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── components/         # status-badge 等业务组件
│   ├── lib/                # 核心业务库
│   │   ├── api.ts          # ok()/fail() 统一响应 {code, data|message}、withErrorHandling
│   │   ├── auth.ts         # requireAdmin/requireCandidate/createSession/writeLog/rateLimit
│   │   ├── types.ts        # 业务类型与常量（EXAM_STATUS/QUESTION_TYPES 等）
│   │   ├── generator.ts    # LLM 出题：splitIntoChunks/buildPrompt/sanitizeQuestion/dedupeQuestions
│   │   ├── grading.ts      # 评分 + 试卷快照 buildPaperSnapshot（fixed/random + original_key 映射）
│   │   └── docparse.ts     # 文档解析：FetchClient + 章节切分
│   ├── storage/database/shared/schema.ts  # 11 张表定义（drizzle pgTable）
│   └── server.ts           # 自定义服务端入口
├── AGENTS.md / DESIGN.md   # 工程规范 / 设计规范（墨青档案室风格）
└── package.json
```

## 核心业务设计（改动前必读）

1. **答案结构统一**：single=`"A"`；multiple=`["A","C"]`；judge=`boolean`；fill=`string[][]`（按空分组，多空可接受答案）；essay=`{reference, points[]}`。options 统一 `[{key, text}]`。
2. **试卷快照**：`attempts.paper_snapshot` 存题序+选项序+original_key 映射；`attempt_answers.question_snapshot` 存题目完整快照（含映射后答案）。历史试卷不受后续改题/删文档影响。
3. **评分**：单选/判断精确匹配；多选全对才得分；填空按空匹配（忽略首尾空格/大小写，多空均分）；简答人工阅卷（0~满分 + 评语）。
4. **幂等**：重复交卷返回 `duplicated:true`；同考生同考试恢复 in_progress attempt；开始考试有事务保护。
5. **开考保护**：published/ongoing/ended/archived 状态禁止 PATCH/DELETE 题目与重新生成；成绩修正走阅卷通道 `/api/exams/[id]/grading/grade`。
6. **名单安全**：列表手机号脱敏（maskPhone）；导出含明文但写 operation_logs；删除名单人员不删其成绩记录（attempts 存 candidate_name/phone 快照）。
7. **权限**：所有 API 服务端校验 session + 角色；考生只能访问本人 attempt（按 phone 匹配）。

## API 路由地图

- **auth**: `admin/login` `candidate/login` `logout` `me`
- **admin**: `admin/overview` `admin/logs` `admin/admins(GET/POST，仅超管)` `admin/admins/[id](PATCH/DELETE，仅超管)`
- **documents**: `GET/POST documents` `upload` `[id](GET/DELETE)` `[id]/parse` `[id]/download`
- **exams**: `GET/POST exams` `[id](GET/PATCH/DELETE)` `[id]/generate(SSE)` `validate` `confirm` `publish` `publish-results` `archive` `questions(GET/POST)` `questions/reorder` `candidates(GET/POST/DELETE)` `candidates/import` `candidates/[cid](PATCH/DELETE)` `results` `stats` `grading(GET)` `grading/grade(POST)` `export?kind=results|candidates`
- **questions**: `[id](PATCH/DELETE)` `[id]/regenerate(POST)`
- **考生**: `my/exams` `my/exams/[id]` `attempts/start` `attempts/[id](GET)` `answer(POST)` `submit(POST)` `result` `detail`

## 测试账号与数据

- 超级管理员：`admin` / `Admin@123456`（可管理管理员账号）
- 普通管理员：`huangliangliang` / `hll123456`（黄亮亮，无管理员管理权限）
- 考生（演示考试"信息安全制度考核（一期）"名单内）：张三 `13800138001`、李四 `13800138002`、王五 `13800138003`
- 考生登录：仅需姓名 + 手机号（`verification_codes` 表已停用，保留未删）

## 数据库变更规范

- 修改 `src/storage/database/shared/schema.ts` 后执行 `coze-coding-ai db upgrade` 同步；禁止直接手写 SQL 改表结构。
- 所有表 RLS 启用且无 policy；仅服务端通过 `getSupabaseClient()`（service_role_key）访问，权限校验全部在 API 层。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**
- 视觉规范见 `DESIGN.md`：墨青主色 #24313F、纸白背景 #FAFAF9、朱砂点睛 #B3372B；Noto Sans SC 正文 + Noto Serif SC 标题大数字；克制动效（150-250ms ease-out）。
