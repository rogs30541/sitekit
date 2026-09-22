#!/usr/bin/env node
/**
 * 匯入「產圖模板風格」資料夾 → AI 工作站模板庫（AiTemplate），走 OPS 路徑（Bearer OPS_TOKEN），本機與線上皆可用。
 *
 *   node scripts/import-image-templates.mjs "<資料夾>" [--api http://localhost:4000] [--token <OPS_TOKEN>] [--dry]
 *
 * 資料夾需含：產圖模板對應清單.md、<編號>_<中文名>_<key>.jpg（成品圖＝模板封面）、模板資料清單/表單欄位_*.md、模板資料清單/Prompt提示詞_*.md
 * 每組模板 → key、名稱、分類（A 商品展示…E 門市售後）、說明（用途＋比例）、封面圖、系統提示詞（英文 Prompt＋負面提示詞＋套用注意事項）、
 * 表單欄位（型別／必填／選項／placeholder；key 取 Prompt 變數對照表的英文變數名）、預設尺寸（1:1→1024x1024、2:3→1024x1536）。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const API = opt('--api', process.env.API ?? 'http://localhost:4000');
const TOKEN = opt('--token', process.env.OPS_TOKEN ?? '');
const DRY = args.includes('--dry');
/** --static-covers <siteUrl>：封面改指向 web 的 /templates/<key>.jpg（隨程式部署、不怕儲存空間清空） */
const STATIC = opt('--static-covers', '');
if (!folder || !existsSync(folder)) {
  console.error('用法：node scripts/import-image-templates.mjs "<資料夾>" [--api URL] [--token OPS_TOKEN] [--dry]');
  process.exit(1);
}
const CATEGORY = { A: '商品展示', B: '促銷優惠', C: '品牌社群', D: '活動招生', E: '門市售後' };
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());

/* ---------- 1. 對應清單：編號／中文名／key／成品圖／比例／用途／必填欄位 ---------- */
const listMd = read(join(folder, '產圖模板對應清單.md'));
const templates = [];
for (const line of listMd.split('\n')) {
  const m = line.match(/^\| ([A-E]\d{2}) \| (.+?) \| `([a-z0-9-]+)` \| `([^`]+\.jpg)` \| `[^`]+` \| ([\d:]+) \| (.+?) \| (.+?) \|$/);
  if (!m) continue;
  const [, code, name, key, jpg, ratio, usage, required] = m;
  templates.push({ code, name, key, jpg, ratio, usage, requiredText: required, category: CATEGORY[code[0]] ?? 'general', sortOrder: Number(code.slice(1)) });
}
if (templates.length !== 20) console.warn(`警告：對應清單解析到 ${templates.length} 組（預期 20）`);

/* ---------- 2. 表單欄位：每組模板的欄位表 ---------- */
const listDir = join(folder, '模板資料清單');
const formMd = readdirSync(listDir)
  .filter((f) => f.startsWith('表單欄位_') && f.endsWith('.md'))
  .map((f) => read(join(listDir, f)))
  .join('\n');
const promptMd = readdirSync(listDir)
  .filter((f) => f.startsWith('Prompt提示詞_') && f.endsWith('.md'))
  .map((f) => read(join(listDir, f)))
  .join('\n');

const sectionOf = (md, key) => {
  const re = new RegExp(`^## [A-E]\\d{2} .*\`${key}\`[^\\n]*\\n([\\s\\S]*?)(?=^## [A-E]\\d{2} |(?![\\s\\S]))`, 'm');
  const m = md.match(re);
  return m ? m[1] : '';
};
const codeBlockAfter = (sec, heading) => {
  const i = sec.indexOf(heading);
  if (i < 0) return '';
  const m = sec.slice(i).match(/```text\n([\s\S]*?)\n```/);
  return m ? m[1].trim() : '';
};
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[（(].*?[)）]/g, '')
    .replace(/[^a-z0-9一-鿿]+/g, '_')
    .replace(/^_|_$/g, '');

for (const t of templates) {
  const fsec = sectionOf(formMd, t.key);
  const psec = sectionOf(promptMd, t.key);
  if (!fsec || !psec) console.warn(`警告：${t.code} 缺表單或 Prompt 段落`);
  // 變數對照：中文欄位 → 英文變數
  const varMap = new Map();
  const vi = psec.indexOf('### 四、變數對照表');
  if (vi >= 0) {
    for (const line of psec.slice(vi).split('\n').slice(3)) {
      if (!line.startsWith('|')) break;
      const [vars, field] = cells(line);
      const en = vars.match(/\{([a-z0-9_]+)\}/i)?.[1];
      const label = field.replace(/[（(].*?[)）]/g, '').trim();
      if (en && label && !varMap.has(label)) varMap.set(label, en);
    }
  }
  // 欄位表
  const fields = [];
  const seen = new Set();
  for (const line of fsec.split('\n')) {
    const c = cells(line);
    if (c.length < 6 || !/^\d+$/.test(c[0])) continue;
    const [, rawLabel, req, type, optCell, ph] = c;
    const label = rawLabel.replace(/（.*?）/g, '').replace(/\*\*/g, '').trim();
    const required = req.includes('✅');
    let kind = 'text';
    if (type.includes('多行')) kind = 'textarea';
    else if (type.includes('下拉')) kind = 'select';
    else if (type.includes('圖片')) kind = 'image';
    let key = kind === 'image' ? 'reference_images' : label.includes('自由補充') ? 'free_notes' : (varMap.get(label) ?? varMap.get(label.replace(/／/g, '/')));
    if (!key) key = slugify(label) || `field_${fields.length + 1}`;
    if (seen.has(key)) key = `${key}_${fields.length + 1}`;
    seen.add(key);
    const f = { key, label, type: kind, required: kind === 'image' ? false : required };
    const placeholder = ph.replace(/^—/, '').replace(/[（(].*?[)）]/g, '').trim();
    if (placeholder && placeholder !== '—') f.placeholder = placeholder;
    if (kind === 'select') {
      const def = optCell.match(/預設[值]?[：「]?\s*[「"]?([^」"）)\s]+)/)?.[1];
      // 選項來源：變數對照表範例值「A／B（預設：A）」
      const opts = new Set();
      const vline = psec.split('\n').find((l) => l.startsWith('|') && l.includes(`| ${label}`));
      const ex = vline ? cells(vline)[2] : '';
      for (const o of ex.replace(/[（(].*?[)）]/g, '').split(/[／/、,]/).map((s) => s.trim()).filter(Boolean)) opts.add(o);
      if (def) opts.add(def);
      f.options = [...opts];
      if (def) f.placeholder = `預設：${def}`;
    }
    if (kind === 'image') f.placeholder = '最多 4 張、每張 10MB（商品／服務照片作為參考圖）';
    fields.push(f);
  }
  // 系統提示詞：英文 Prompt＋負面提示詞＋注意事項（供模型）
  const en = codeBlockAfter(psec, '### 二、通用 Prompt（English）');
  const neg = codeBlockAfter(psec, '### 五、負面提示詞');
  const notesIdx = psec.indexOf('### 六、套用注意事項');
  const notes = notesIdx >= 0 ? psec.slice(notesIdx).split('\n').slice(1).filter((l) => l.startsWith('- ')).map((l) => l.slice(2)).join('\n') : '';
  t.systemPrompt = [en, neg ? `Negative prompt (avoid): ${neg}` : '', 'Fill each {variable} from the user fields below (Chinese field labels map to the variables; free_notes may override any visual instruction). If a variable is not provided, choose a sensible default that keeps the same layout, palette and typography hierarchy. Reference images, when provided, define the actual product/service appearance and must be reproduced faithfully.', notes ? `套用注意事項：\n${notes}` : ''].filter(Boolean).join('\n\n').slice(0, 8000);
  t.inputFields = fields;
  t.defaultSize = t.ratio === '1:1' ? '1024x1024' : '1024x1536';
  t.description = `${t.usage}（${t.ratio}；必填：${t.requiredText}）`.slice(0, 500);
  const jpgPath = join(folder, t.jpg);
  t.coverBase64 = existsSync(jpgPath) ? readFileSync(jpgPath).toString('base64') : null;
  if (!t.coverBase64) console.warn(`警告：${t.code} 找不到成品圖 ${t.jpg}`);
}

/* ---------- 3. 匯入 ---------- */
if (DRY) {
  for (const t of templates) console.log(`${t.code} ${t.name} [${t.category}] ${t.defaultSize} 欄位 ${t.inputFields.map((f) => `${f.key}${f.required ? '*' : ''}:${f.type}`).join(', ')} prompt ${t.systemPrompt.length} 字 cover ${t.coverBase64 ? 'ok' : '無'}`);
  process.exit(0);
}
if (!TOKEN) {
  console.error('缺 OPS_TOKEN（--token 或環境變數）');
  process.exit(1);
}
let ok = 0;
for (const t of templates) {
  const r = await fetch(`${API}/api/ops/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ action: 'upsert_image_template', params: { key: t.key, name: `${t.code} ${t.name}`, category: t.category, description: t.description, systemPrompt: t.systemPrompt, inputFields: t.inputFields, defaultSize: t.defaultSize, costPoints: 0, highCostPoints: 0, isActive: true, sortOrder: t.sortOrder, ...(STATIC ? { coverUrl: `${STATIC.replace(/\/$/, '')}/templates/${t.key}.jpg` } : { coverBase64: t.coverBase64, coverMime: 'image/jpeg' }) } }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.ok) {
    ok++;
    console.log(`✓ ${t.code} ${t.name} → ${j.data?.created ? '新增' : '更新'} ${j.data?.coverUrl ?? ''}`);
  } else console.error(`✗ ${t.code} ${t.name}：${j.error ?? j.message ?? r.status}`);
}
console.log(`完成：${ok}/${templates.length}`);
process.exit(ok === templates.length ? 0 : 1);
