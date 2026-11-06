// 智能出题：SSE 流式生成试卷（管理员）
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import type { Difficulty, KnowledgeDocument, QuestionType } from '@/lib/types';
import { dedupeQuestions, generateQuestionBatch, isSimilarToAny, QUESTION_TYPE_LABEL } from '@/lib/generator';
import { splitIntoChunks } from '@/lib/docparse';
import { normalizePaperMode } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

const enc = new TextEncoder();
function sseEvent(data: Record<string, unknown>): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(data)}\n\n`);
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
  // 随机试卷：题库题量按配置的 2 倍生成（至少多 2 题），保证考生抽题有足够随机性
  const isRandomMode = normalizePaperMode(exam.paper_mode as string) === 'random';
  const questionConfig = rawConfig.map((c) =>
    isRandomMode ? { ...c, count: Math.max(c.count * 2, c.count + 2) } : c,
  );

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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(sseEvent(data));
        } catch {
          /* stream closed */
        }
      };

      try {
        await client
          .from('exams')
          .update({ generation_status: 'generating', generation_error: null, updated_at: new Date().toISOString() })
          .eq('id', id);

        // 清空旧题
        await client.from('questions').delete().eq('exam_id', id);

        let generated = 0;
        let sortOrder = 0;
        const docRefCount: Record<string, number> = {};
        const shortage: string[] = [];
        const existingContents: string[] = []; // 已入库题干，用于跨批次去重

        for (const task of tasks) {
          const type = task.type;
          const batchSize = 6; // 每批最多 6 题，控制单次生成稳定性
          let remaining = task.count;
          let batchIndex = 0;

          while (remaining > 0) {
            const batchCount = Math.min(batchSize, remaining);
            // 轮转采样材料，保证覆盖面
            const sampled: { title: string; text: string; docName: string }[] = [];
            for (let i = 0; i < Math.min(allChunks.length, 6); i++) {
              const c = allChunks[(batchIndex * 3 + i) % allChunks.length];
              sampled.push({ title: c.title, text: c.text.slice(0, 2200), docName: c.docName });
            }

            send({
              type: 'progress',
              message: `正在生成${QUESTION_TYPE_LABEL[type]}（第 ${batchIndex + 1} 批，共 ${batchCount} 题）…`,
              current: generated,
              total: totalPlanned,
            });

            try {
              const rawQuestions = await generateQuestionBatch(type, batchCount, task.score, task.difficulty, sampled);
              // 批内去重 + 与已入库题目跨批去重
              const questions = dedupeQuestions(rawQuestions).filter((q) => !isSimilarToAny(q.content, existingContents));
              if (questions.length < rawQuestions.length) {
                send({ type: 'progress', message: `已剔除 ${rawQuestions.length - questions.length} 道重复/相似题`, current: generated, total: totalPlanned });
              }
              for (const q of questions) {
                // 依据 source_location 关联文档
                const matchedDoc = parsedDocs.find((d) => q.source_location.includes(d.name.replace(/\.[^.]+$/, '')))
                  ?? parsedDocs.find((d) => sampled.some((s) => s.docName === d.name))
                  ?? parsedDocs[0];
                sortOrder += 1;
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
                  sort_order: sortOrder,
                });
                if (!insErr) {
                  generated += 1;
                  existingContents.push(q.content);
                  docRefCount[matchedDoc.id] = (docRefCount[matchedDoc.id] ?? 0) + 1;
                  send({ type: 'question', current: generated, total: totalPlanned, question: { type: q.type, content: q.content.slice(0, 60) } });
                }
              }
              remaining -= batchCount;
              batchIndex += 1;
            } catch (e) {
              const message = e instanceof Error ? e.message : '生成失败';
              send({ type: 'batch_error', message: `${QUESTION_TYPE_LABEL[type]}第 ${batchIndex + 1} 批生成失败：${message}` });
              shortage.push(`${QUESTION_TYPE_LABEL[type]}缺少 ${remaining} 题`);
              remaining = 0;
            }
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
        const { data: qs } = await client.from('questions').select('score').eq('exam_id', id);
        const totalScore = isRandomMode
          ? rawConfig.reduce((s, c) => s + c.count * c.score, 0)
          : (qs ?? []).reduce((s: number, q) => s + Number(q.score), 0);
        const completed = generated >= totalPlanned;
        await client
          .from('exams')
          .update({
            generation_status: completed ? 'success' : 'failed',
            generation_error: completed ? null : `题量不足：${shortage.join('；') || `实际 ${generated}/${totalPlanned}`}，请重新生成或在编辑页补充`,
            total_score: totalScore,
            confirmed_at: null, // 重新生成后固定试卷需重新确认
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        await writeLog({
          operatorType: 'admin',
          operatorId,
          operatorName,
          action: 'exam_generate',
          targetType: 'exam',
          targetId: id,
          detail: { planned: totalPlanned, generated, total_score: totalScore, shortage },
        });

        send({
          type: 'done',
          current: generated,
          total: totalPlanned,
          message: completed
            ? `出题完成，共生成 ${generated} 道题`
            : `出题结束，实际生成 ${generated}/${totalPlanned} 道题：${shortage.join('；')}，可重新生成或在试卷编辑中手动补充`,
        });
        controller.close();
      } catch (e) {
        const message = e instanceof Error ? e.message : '生成失败';
        await client
          .from('exams')
          .update({ generation_status: 'failed', generation_error: message, updated_at: new Date().toISOString() })
          .eq('id', id);
        send({ type: 'done', message: `生成失败：${message}`, current: 0, total: 0 });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
