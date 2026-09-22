/**
 * AI 圖片供應商抽象層：平台金鑰／BYOK 走同一介面，換模型不動業務邏輯。
 * - mock：本機／CI 用，產生 SVG 佔位圖，不花錢
 * - openai：Images API（b64_json）
 */
export interface ImageRequest {
  prompt: string;
  size: string;
  quality: 'standard' | 'high';
  apiKey?: string;
  model?: string;
  /** 參考圖（商品／服務照片）：OpenAI 走 images/edits 多圖輸入；mock 忽略 */
  referenceImages?: { bytes: Buffer; mime: string }[];
}
export interface ImageResult {
  bytes: Buffer;
  mime: string;
  ext: string;
  costTwd?: number | null;
}
export interface ImageProvider {
  readonly name: string;
  generate(req: ImageRequest): Promise<ImageResult>;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export class MockImageProvider implements ImageProvider {
  readonly name = 'mock';
  async generate(req: ImageRequest): Promise<ImageResult> {
    await new Promise((r) => setTimeout(r, 800));
    const [w, h] = req.size.split('x').map(Number);
    const lines = req.prompt.replace(/\s+/g, ' ').match(/.{1,28}/g)?.slice(0, 8) ?? [];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w || 1024}" height="${h || 1024}" viewBox="0 0 ${w || 1024} ${h || 1024}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0f2fe"/><stop offset="1" stop-color="#fce7f3"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<text x="48" y="80" font-family="sans-serif" font-size="28" fill="#111">mock · ${esc(req.quality)} · ${esc(req.size)}</text>
${lines.map((l, i) => `<text x="48" y="${140 + i * 40}" font-family="sans-serif" font-size="30" fill="#333">${esc(l)}</text>`).join('\n')}
</svg>`;
    return { bytes: Buffer.from(svg, 'utf8'), mime: 'image/svg+xml', ext: 'svg', costTwd: 0 };
  }
}

export class OpenAiImageProvider implements ImageProvider {
  readonly name = 'openai';
  async generate(req: ImageRequest): Promise<ImageResult> {
    if (!req.apiKey) throw new Error('OpenAI API key is not configured');
    const refs = (req.referenceImages ?? []).slice(0, 4);
    let res: Response;
    if (refs.length) {
      // 參考圖：images/edits（multipart，image[] 多張），模型依參考圖重現商品外觀
      const form = new FormData();
      form.append('model', req.model ?? 'gpt-image-1');
      form.append('prompt', req.prompt);
      form.append('size', req.size);
      form.append('quality', req.quality === 'high' ? 'high' : 'medium');
      form.append('n', '1');
      refs.forEach((r, i) => form.append('image[]', new Blob([new Uint8Array(r.bytes)], { type: r.mime }), `ref${i}.${r.mime.includes('png') ? 'png' : r.mime.includes('webp') ? 'webp' : 'jpg'}`));
      res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { authorization: `Bearer ${req.apiKey}` }, body: form });
    } else {
      res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { authorization: `Bearer ${req.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: req.model ?? 'gpt-image-1', prompt: req.prompt, size: req.size, quality: req.quality === 'high' ? 'high' : 'medium', n: 1 }),
      });
    }
    const data = (await res.json()) as { data?: { b64_json?: string }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(`openai ${res.status}: ${data.error?.message ?? 'request failed'}`);
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('openai returned no image');
    return { bytes: Buffer.from(b64, 'base64'), mime: 'image/png', ext: 'png', costTwd: null };
  }
}

export function getProvider(name: string): ImageProvider {
  return name === 'openai' ? new OpenAiImageProvider() : new MockImageProvider();
}
