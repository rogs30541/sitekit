import { readFile } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SETTING_KEYS } from '@sitekit/shared';
import { SettingsService } from '../settings/settings.service';

export interface PutResult {
  /** 公開可讀網址（local＝<site>/api/assets/<key>；s3＝<publicUrl>/<key>） */
  url: string;
  key: string;
  driver: 'local' | 's3';
}

const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };
export const extFromMime = (mime: string) => MIME_EXT[mime.split(';')[0].trim().toLowerCase()] ?? 'bin';

/**
 * 物件儲存抽象：local（STORAGE_DIR，經 /api/assets 靜態服務）或 s3（Cloudflare R2／AWS S3 相容，SigV4 PUT，免 SDK）。
 * 由 settings `storage.driver` 決定；R2 設定：s3.endpoint（https://<accountid>.r2.cloudflarestorage.com）、s3.bucket、s3.accessKeyId、s3.secretAccessKey、s3.publicUrl（自訂網域或 r2.dev）。
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  readonly localDir = resolve(process.env.STORAGE_DIR ?? resolve(process.cwd(), 'storage'));

  constructor(private readonly settings: SettingsService) {}

  async config() {
    const [driver, endpoint, bucket, region, accessKeyId, secretAccessKey, publicUrl] = await Promise.all([
      this.settings.get(SETTING_KEYS.storageDriver, 'STORAGE_DRIVER', 'local'),
      this.settings.get(SETTING_KEYS.s3Endpoint, 'S3_ENDPOINT'),
      this.settings.get(SETTING_KEYS.s3Bucket, 'S3_BUCKET'),
      this.settings.get(SETTING_KEYS.s3Region, 'S3_REGION', 'auto'),
      this.settings.get(SETTING_KEYS.s3AccessKeyId, 'S3_ACCESS_KEY_ID'),
      this.settings.get(SETTING_KEYS.s3SecretAccessKey, 'S3_SECRET_ACCESS_KEY'),
      this.settings.get(SETTING_KEYS.s3PublicUrl, 'S3_PUBLIC_URL'),
    ]);
    const s3Ready = !!(endpoint && bucket && accessKeyId && secretAccessKey);
    return { driver: driver === 's3' && s3Ready ? ('s3' as const) : ('local' as const), s3Ready, endpoint: endpoint.replace(/\/$/, ''), bucket, region, accessKeyId, secretAccessKey, publicUrl: publicUrl.replace(/\/$/, '') };
  }

  /** 寫入物件；key 例：ai/xxx.png、media/<sha1>.jpg */
  async put(key: string, bytes: Buffer, contentType: string): Promise<PutResult> {
    const cfg = await this.config();
    if (cfg.driver === 's3') {
      await this.s3Put(cfg, key, bytes, contentType);
      const base = cfg.publicUrl || `${cfg.endpoint}/${cfg.bucket}`;
      return { url: `${base}/${key}`, key, driver: 's3' };
    }
    const file = resolve(this.localDir, key);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    const site = await this.settings.siteUrl();
    return { url: `${site}/api/assets/${key}`, key, driver: 'local' };
  }

  /** AWS SigV4（path-style；R2 與 S3 皆可） */
  private async s3Put(cfg: Awaited<ReturnType<StorageService['config']>>, key: string, body: Buffer, contentType: string) {
    const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const date = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256').update(body).digest('hex');
    const headers: Record<string, string> = { host: url.host, 'content-type': contentType, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((k) => `${k}:${headers[k].trim()}\n`)
      .join('');
    const canonicalRequest = ['PUT', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${date}/${cfg.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const hmac = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest();
    const kSigning = hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, date), cfg.region), 's3'), 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` },
      body: new Uint8Array(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.log.error(`s3 put ${key} failed: ${res.status} ${text.slice(0, 200)}`);
      throw new Error(`s3 put failed: ${res.status}`);
    }
  }

  /** 下載遠端檔案（只收 image/*；上限 10MB），回 bytes 與 mime。 */
  async fetchRemote(src: string, maxBytes = 10 * 1024 * 1024): Promise<{ bytes: Buffer; mime: string } | null> {
    try {
      const res = await fetch(src, { redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'SiteKit-Migrator/1.0' } });
      if (!res.ok) return null;
      const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!mime.startsWith('image/')) return null;
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > maxBytes) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) return null;
      return { bytes: buf, mime };
    } catch {
      return null;
    }
  }

  /** 讀取本站資產或遠端圖片：local 驅動的 /api/assets/<key> 直接讀磁碟（不經 HTTP、不依賴 web 是否在線），其餘走 fetchRemote。 */
  async fetchAsset(src: string, maxBytes = 10 * 1024 * 1024): Promise<{ bytes: Buffer; mime: string } | null> {
    const m = String(src).match(/\/api\/assets\/(.+)$/);
    if (m) {
      try {
        const key = decodeURIComponent(m[1]).replace(/\.\./g, '');
        const file = resolve(this.localDir, key);
        if (file.startsWith(this.localDir)) {
          const bytes = await readFile(file);
          if (bytes.length <= maxBytes) return { bytes, mime: mimeFromExt(key) };
        }
      } catch {
        /* fall through */
      }
    }
    return this.fetchRemote(src, maxBytes);
  }

  static keyFor(prefix: string, src: string, mime: string) {
    return `${prefix}/${createHash('sha1').update(src).digest('hex')}.${extFromMime(mime)}`;
  }
}

export function mimeFromExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' } as Record<string, string>)[ext] ?? 'application/octet-stream';
}
