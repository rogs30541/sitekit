import { type CanonicalContent, sanitizeHtml, slugify, toDate } from '../normalize';

/** RFC 4180 風格 CSV 解析（支援引號、逗號與換行在欄位內）。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/**
 * CSV 連接器。表頭欄位（不分大小寫）：
 * external_id, title, slug, body, excerpt, published_at, original_url, cover_url, author, tags（以 ; 分隔）, type
 */
export function fromCsv(text: string, source = 'csv'): CanonicalContent[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const col = (r: string[], name: string) => {
    const i = idx(name);
    return i >= 0 ? (r[i] ?? '').trim() : '';
  };
  if (idx('title') < 0) throw new Error('CSV must have a "title" column');
  return rows.slice(1).map((r, n) => {
    const title = col(r, 'title') || `row-${n + 1}`;
    const externalId = col(r, 'external_id') || String(n + 1);
    const body = col(r, 'body');
    return {
      source,
      externalId,
      type: col(r, 'type') || 'post',
      title,
      slug: slugify(col(r, 'slug') || title, `${source}-${externalId}`),
      body: body ? sanitizeHtml(body) : null,
      excerpt: col(r, 'excerpt') || null,
      coverUrl: col(r, 'cover_url') || null,
      author: col(r, 'author') || null,
      tags: col(r, 'tags') ? col(r, 'tags').split(';').map((t) => t.trim()).filter(Boolean) : [],
      publishedAt: toDate(col(r, 'published_at')),
      originalUrl: col(r, 'original_url') || null,
    };
  });
}
