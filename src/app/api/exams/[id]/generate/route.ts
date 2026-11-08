// 智能出题：SSE 流式生成试卷（管理员）
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import type { Difficulty, KnowledgeDocument, QuestionType } from '@/lib/types';
import { dedupeQuestions, generateQuestionBatch, isSimilarToAny, QUESTION_TYPE_LABEL } from '@/lib/generator';
import { splitIntoChunks } from '@/lib/docparse';
import { MIN_QUESTION_COUNT_PER_TYPE, normalizePaperMode, RANDOM_PAPER_POOL_MULTIPLIER } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

const enc = new TextEncoder();
function sseEvent(event: string, data: Record<string, unknown>): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  let operatorId = '';
  let operatorName = '';
  try {
    const admin = await requireAdmin();
    operatorId = admin.user_id;
    operatorName = admin.user_name;
  } catch {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
  }
  const { id } = await ctx.params;
  const client = getSupabaseClient();

  const { data: exam, error: qErr } = await client.from('exams').select('*').eq('id', id).single();
  if (qErr || !exam) return new Response(JSON.stringify({ error: '考试不存在' }), { status: 404 });
  if (exam.generation_status === 'generating') {
    return new Response(JSON.stringify({ error: '正在生成中，请勿重复发起' }), { status: 409 });
  }
  if (!['draft', 'pending'].includes(exam.status as string)) {
    return new Response(JSON.stringify({ error: '考试已发布，不能重新生成试卷' }), { status: 400 });
  }

  const documentIds = (exam.document_ids as string[]) ?? [];
  const contentScope = (exam.content_scope as { docId: string; chapters: string[] }[] | null) ?? [];
  const rawConfig = (exam.question_config as { type: QuestionType; count: number; score: number; difficulty: { easy: number; medium: number; hard: number } }[]) ?? [];
  if (rawConfig.length === 0 || rawConfig.some((config) => config.count < MIN_QUESTION_COUNT_PER_TYPE)) {
    return new Response(
      JSON.stringify({ error: `每个启用题型至少配置 ${MIN_QUESTION_COUNT_PER_TYPE} 道题，多选题没有额外题量门槛` }),
      { status: 400 },
    );
  }

  // 随机试卷：题库题量按配置的 3 倍生成，保证考生抽题有足够随机性
  const isRandomMode = normalizePaperMode(exam.paper_mode as string) === 'random';
  const questionConfig = rawConfig.map((config) => {
    if (!isRandomMode) return config;
    const difficulty = config.difficulty ?? { easy: 0, medium: config.count, hard: 0 };
    return {
      ...config,
      count: config.count * RANDOM_PAPER_POOL_MULTIPLIER,
      difficulty: {
        easy: difficulty.easy * RANDOM_PAPER_POOL_MULTIPLIER,
        medium: difficulty.medium * RANDOM_PAPER_POOL_MULTIPLIER,
        hard: difficulty.hard * RANDOM_PAPER_POOL_MULTIPLIER,
      },
    };
  });

  const { data: docs, error: dErr } = await client.from('documents').select('*').in('id', documentIds);
  if (dErr || !docs || docs.length === 0) {
    return new Response(JSON.stringify({ error: '知识文档不存在' }), { status: 400 });
  }
  const parsedDocs = (docs as KnowledgeDocument[]).filter((d) => d.parse_status === 'success' && d.content_text);
  if (parsedDocs.length === 0) {
    return new Response(JSON.stringify({ error: '所选文档均未解析成功，无法出题' }), { status: 400 });
  }

  // 组卷材料：按文档 -> 章节范围过滤 -> 切块
  interface MaterialChunk {
    title: string;
    text: string;
    docName: string;
    docId: string;
  }
  const allChunks: MaterialChunk[] = [];
  for (const doc of parsedDocs) {
    const scopeEntry = contentScope.find((s) => s.docId === doc.id);
    let chapters = Array.isArray(doc.chapters) ? doc.chapters : [];
    if (scopeEntry && scopeEntry.chapters.length > 0) {
      chapters = chapters.filter((c) => scopeEntry.chapters.includes(c.title));
    }
    const text = doc.content_text ?? '';
    if (!text) continue;
    const chunks = splitIntoChunks(text, chapters.length > 0 ? chapters : null);
    for (const c of chunks) {
      allChunks.push({ title: c.title, text: c.text, docName: doc.name, docId: doc.id });
    }
  }
  if (allChunks.length === 0) {
    return new Response(JSON.stringify({ error: '选定内容范围内没有可用文本' }), { status: 400 });
  }

  // 将题型配置展开为 (题型 × 难度) 任务列表
  interface GenTask {
    type: QuestionType;
    count: number;
    score: number;
    difficulty: Difficulty | 'mixed';
  }
  const tasks: GenTask[] = [];
  for (const spec of questionConfig) {
    const diff = spec.difficulty ?? { easy: 0, medium: spec.count, hard: 0 };
    const diffSum = (diff.easy || 0) + (diff.medium || 0) + (diff.hard || 0);
    if (diffSum === spec.count) {
      if (diff.easy > 0) tasks.push({ type: spec.type, count: diff.easy, score: spec.score, difficulty: 'easy' });
      if (diff.medium > 0) tasks.push({ type: spec.type, count: diff.medium, score: spec.score, difficulty: 'medium' });
      if (diff.hard > 0) tasks.push({ type: spec.type, count: diff.hard, score: spec.score, difficulty: 'hard' });
    } else {
      tasks.push({ type: spec.type, count: spec.count, score: spec.score, difficulty: 'mixed' });
    }
  }
  const totalPlanned = tasks.reduce((s, t) => s + t.count, 0);
  const targetByType = Object.fromEntries(questionConfig.map((config) => [config.type, config.count])) as Partial<Record<QuestionType, number>>;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let streamClosed = false;
      const send = (event: string, data: Record<string, unknown>) => {
        if (streamClosed) return;
        try {
          controller.enqueue(sseEvent(event, data));
        } catch {
          streamClosed = true;
        }
      };
      const close = () => {
        if (streamClosed) return;
        try {
          controller.close();
        } catch {
          /* stream already closed */
        }
        streamClosed = true;
      };
      // 长耗时 LLM 调用期间保持 SSE 连接活跃，避免代理层因无数据超时断开。
      const heartbeat = setInterval(() => send('heartbeat', { at: new Date().toISOString() }), 15000);

      try {
        const { error: statusError } = await client
          .from('exams')
          .update({ generation_status: 'generating', generation_error: null, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (statusError) throw new Error(`更新出题状态失败：${statusError.message}`);

        // 清空旧题
        const { error: deleteError } = await client.from('questions').delete().eq('exam_id', id);
        if (deleteError) throw new Error(`清理旧试题失败：${deleteError.message}`);

        let generated = 0;
        let sortOrder = 0;
        const docRefCount: Record<string, number> = {};
        const shortage: string[] = [];
        const generatedByType: Partial<Record<QuestionType, number>> = {};
        const completedTypes = new Set<QuestionType>();
        const existingContents: string[] = []; // 已入库题干，用于跨批次去重
        for (const config of questionConfig) generatedByType[config.type] = 0;

        send('start', {
          total: totalPlanned,
          targets: targetByType,
          message: `智能出题任务已启动，计划生成 ${totalPlanned} 道题`,
        });

        for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
          const task = tasks[taskIndex];
          const type = task.type;
          const batchSize = 6; // 每批最多 6 题，控制单次生成稳定性
          let remaining = task.count;
          let round = 0;
          let consecutiveEmptyRounds = 0;
          const maxRounds = Math.max(6, Math.ceil(task.count / batchSize) + 5);

          // 以实际成功入库数扣减 remaining；少返回、去重或插入失败都会触发补题。
          while (remaining > 0 && round < maxRounds && consecutiveEmptyRounds < 3) {
            round += 1;
            // 小批次适度超额请求，为格式清洗和相似题去重预留余量。
            const requestCount = Math.min(batchSize, Math.max(remaining, Math.ceil(remaining * 1.5)));
            // 每轮偏移采样材料，降低补题与已生成题目重复的概率。
            const sampled: { title: string; text: string; docName: string }[] = [];
            for (let i = 0; i < Math.min(allChunks.length, 6); i++) {
              const c = allChunks[(taskIndex * 5 + round * 3 + i) % allChunks.length];
              sampled.push({ title: c.title, text: c.text.slice(0, 2200), docName: c.docName });
            }

            send('progress', {
              type,
              generated: generatedByType[type] ?? 0,
              detail: `第 ${round} 轮生成中，本轮请求 ${requestCount} 题，尚缺 ${remaining} 题`,
              current: generated,
              total: totalPlanned,
            });

            try {
              const rawQuestions = await generateQuestionBatch(
                type,
                requestCount,
                task.score,
                task.difficulty,
                sampled,
                existingContents,
              );
              // 批内去重 + 与已入库题目跨批去重
              const questions = dedupeQuestions(rawQuestions).filter((q) => !isSimilarToAny(q.content, existingContents));
              const discarded = rawQuestions.length - questions.length;
              let insertedThisRound = 0;
              let insertFailures = 0;

              for (const q of questions) {
                if (insertedThisRound >= remaining) break;
                // 依据 source_location 关联文档
                const matchedDoc = parsedDocs.find((d) => q.source_location.includes(d.name.replace(/\.[^.]+$/, '')))
                  ?? parsedDocs.find((d) => sampled.some((s) => s.docName === d.name))
                  ?? parsedDocs[0];
                const nextSortOrder = sortOrder + 1;
                const { error: insErr } = await client.from('questions').insert({
                  exam_id: id,
                  type: q.type,
                  content: q.content,
                  options: q.options,
                  answer: q.answer,
                  analysis: q.analysis,
                  score: task.score,
                  difficulty: q.difficulty,
                  knowledge_point: q.knowledge_point,
                  source_document_id: matchedDoc.id,
                  source_document_name: matchedDoc.name,
                  source_location: q.source_location,
                  source_excerpt: q.source_excerpt,
                  sort_order: nextSortOrder,
                });
                if (!insErr) {
                  sortOrder = nextSortOrder;
                  generated += 1;
                  insertedThisRound += 1;
                  generatedByType[type] = (generatedByType[type] ?? 0) + 1;
                  existingContents.push(q.content);
                  docRefCount[matchedDoc.id] = (docRefCount[matchedDoc.id] ?? 0) + 1;
                } else {
                  insertFailures += 1;
                }
              }

              remaining -= insertedThisRound;
              consecutiveEmptyRounds = insertedThisRound > 0 ? 0 : consecutiveEmptyRounds + 1;
              const notes = [
                `本轮成功入库 ${insertedThisRound} 题`,
                discarded > 0 ? `去重淘汰 ${discarded} 题` : '',
                insertFailures > 0 ? `写入失败 ${insertFailures} 题` : '',
                remaining > 0 ? `继续补充 ${remaining} 题` : '该批次已补齐',
              ].filter(Boolean).join('，');
              send('progress', {
                type,
                generated: generatedByType[type] ?? 0,
                detail: notes,
                current: generated,
                total: totalPlanned,
              });
            } catch (e) {
              const message = e instanceof Error ? e.message : '生成失败';
              consecutiveEmptyRounds += 1;
              const retrying = round < maxRounds && consecutiveEmptyRounds < 3;
              send('batch_error', {
                type,
                generated: generatedByType[type] ?? 0,
                message: `${QUESTION_TYPE_LABEL[type]}第 ${round} 轮失败：${message}${retrying ? '；将自动重试补题' : ''}`,
                retrying,
              });
            }
          }

          if (remaining > 0) shortage.push(`${QUESTION_TYPE_LABEL[type]}缺少 ${remaining} 题`);
          const typeTarget = targetByType[type] ?? 0;
          const typeGenerated = generatedByType[type] ?? 0;
          if (!completedTypes.has(type) && typeGenerated >= typeTarget) {
            completedTypes.add(type);
            send('type_done', { type, count: typeGenerated, total: typeTarget });
          }
        }

        // 更新文档使用次数
        for (const [docId, cnt] of Object.entries(docRefCount)) {
          const doc = parsedDocs.find((d) => d.id === docId);
          if (doc) {
            await client.from('documents').update({ usage_count: (doc.usage_count ?? 0) + cnt }).eq('id', docId);
          }
        }

        // 汇总总分：随机试卷按抽题配置计算卷面总分；固定试卷为题库全部题目合计
        const { data: qs, error: scoreError } = await client.from('questions').select('score').eq('exam_id', id);
        if (scoreError) throw new Error(`汇总试卷分值失败：${scoreError.message}`);
        const totalScore = isRandomMode
          ? rawConfig.reduce((s, c) => s + c.count * c.score, 0)
          : (qs ?? []).reduce((s: number, q) => s + Number(q.score), 0);
        const completed = shortage.length === 0 && generated === totalPlanned;
        const { error: finishError } = await client
          .from('exams')
          .update({
            generation_status: completed ? 'success' : 'failed',
            generation_error: completed ? null : `题量不足：${shortage.join('；') || `实际 ${generated}/${totalPlanned}`}，请重新生成或在编辑页补充`,
            total_score: totalScore,
            confirmed_at: null, // 重新生成后固定试卷需重新确认
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        if (finishError) throw new Error(`保存出题结果失败：${finishError.message}`);

        await writeLog({
          operatorType: 'admin',
          operatorId,
          operatorName,
          action: 'exam_generate',
          targetType: 'exam',
          targetId: id,
          detail: { planned: totalPlanned, generated, total_score: totalScore, shortage },
        });

        send('done', {
          generated,
          total: totalPlanned,
          success: completed,
          errors: shortage,
          message: completed
            ? `出题完成，共生成 ${generated} 道题`
            : `出题结束，实际生成 ${generated}/${totalPlanned} 道题：${shortage.join('；')}，可重新生成或在试卷编辑中手动补充`,
        });
        close();
      } catch (e) {
        const message = e instanceof Error ? e.message : '生成失败';
        await client
          .from('exams')
          .update({ generation_status: 'failed', generation_error: message, updated_at: new Date().toISOString() })
          .eq('id', id);
        send('done', { message: `生成失败：${message}`, generated: 0, total: totalPlanned, success: false, errors: [message] });
        close();
      } finally {
        clearInterval(heartbeat);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
