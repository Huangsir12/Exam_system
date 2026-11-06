// 参考名单：批量导入（管理员）。前端解析 CSV/Excel 后提交 JSON
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, writeLog } from '@/lib/auth';
import { fail, isValidPhone, ok, withErrorHandling } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

interface ImportRow {
  name?: string;
  phone?: string;
}

/** 解析 CSV/TSV 文本为 {name, phone} 行，自动跳过表头 */
function parseCsvText(text: string): ImportRow[] {
  const rows: ImportRow[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const cells = line.split(/[,，\t;；]/).map((c) => c.trim().replace(/^["']|["']$/g, ''));
    if (cells.length < 2) continue;
    const [name, phone] = cells;
    // 跳过表头行
    if ((name === '姓名' || name.toLowerCase() === 'name') && (phone === '手机号' || phone.toLowerCase() === 'phone')) continue;
    rows.push({ name, phone });
  }
  return rows;
}

export const POST = withErrorHandling(async (request: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  // 同时支持 JSON rows 与 CSV 文件直传
  let rows: ImportRow[] = [];
  let mode: 'skip' | 'update' = 'skip';
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    const m = form.get('mode');
    if (m === 'update') mode = 'update';
    if (!(file instanceof File)) return fail('未接收到导入文件');
    const text = await file.text();
    rows = parseCsvText(text);
  } else {
    const body = (await request.json()) as { rows?: ImportRow[]; mode?: 'skip' | 'update' };
    rows = Array.isArray(body.rows) ? body.rows : [];
    if (body.mode === 'update') mode = 'update';
  }
  if (rows.length === 0) return fail('没有可导入的数据');
  if (rows.length > 5000) return fail('单次最多导入 5000 条');

  const client = getSupabaseClient();
  const { data: existing } = await client.from('candidates').select('id, phone, name').eq('exam_id', id);
  const existingByPhone = new Map((existing ?? []).map((c) => [c.phone as string, c]));

  const errors: { row: number; name: string; phone: string; reason: string }[] = [];
  const toInsert: { exam_id: string; name: string; phone: string; import_batch: string }[] = [];
  const toUpdate: { id: string; name: string }[] = [];
  const seenPhones = new Set<string>();
  const batch = `import-${Date.now()}`;

  rows.forEach((row, idx) => {
    const rowNo = idx + 1;
    const name = (row.name ?? '').trim();
    const phone = (row.phone ?? '').trim();
    if (!name) {
      errors.push({ row: rowNo, name, phone, reason: '姓名为空' });
      return;
    }
    if (!phone) {
      errors.push({ row: rowNo, name, phone, reason: '手机号为空' });
      return;
    }
    if (!isValidPhone(phone)) {
      errors.push({ row: rowNo, name, phone, reason: '手机号格式错误' });
      return;
    }
    if (seenPhones.has(phone)) {
      errors.push({ row: rowNo, name, phone, reason: '文件内手机号重复' });
      return;
    }
    seenPhones.add(phone);
    const dup = existingByPhone.get(phone);
    if (dup) {
      if (mode === 'update' && (dup.name as string) !== name) {
        toUpdate.push({ id: dup.id as string, name });
      }
      return; // skip 模式直接跳过
    }
    toInsert.push({ exam_id: id, name, phone, import_batch: batch });
  });

  if (toInsert.length > 0) {
    const { error } = await client.from('candidates').insert(toInsert);
    if (error) throw new Error(`导入失败: ${error.message}`);
  }
  for (const u of toUpdate) {
    const { error } = await client.from('candidates').update({ name: u.name }).eq('id', u.id);
    if (error) throw new Error(`更新失败: ${error.message}`);
  }

  await writeLog({
    operatorType: 'admin',
    operatorId: admin.user_id,
    operatorName: admin.user_name,
    action: 'candidate_import',
    targetType: 'exam',
    targetId: id,
    detail: { total: rows.length, imported: toInsert.length, updated: toUpdate.length, errors: errors.length, mode },
  });

  return ok({
    imported: toInsert.length,
    updated: toUpdate.length,
    skipped: rows.length - toInsert.length - toUpdate.length - errors.length,
    errors,
  });
});
