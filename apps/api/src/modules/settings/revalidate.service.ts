import { Body, Controller, Injectable, Logger, Post } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';

/**
 * 發佈即清快取（on-demand ISR revalidation）：
 * 內容發佈／選單／站台設定／商品課程變更後，通知 web 清掉整站 ISR 快取，管理員不必等 60 秒。
 * - api → POST `<site.url>/sitekit-internal/revalidate`，帶 `x-sitekit-token`（時間戳＋HMAC(SESSION_SECRET)，120 秒有效）
 * - web 沒有 SESSION_SECRET 時會回呼 `POST /api/internal/revalidate/verify` 驗 token（不需在 web 多設環境變數）
 * - 去抖 300ms 合併連續寫入；失敗只記 warn（web 未起、或 Workers 版沒有這條路徑都不影響寫入）
 */
@Injectable()
export class RevalidateService {
  private readonly log = new Logger('Revalidate');
  private timer: NodeJS.Timeout | null = null;
  private reasons = new Set<string>();
  /** 由 SettingsModule 的 factory 注入（避免 Settings ↔ Revalidate 循環依賴） */
  constructor(private readonly siteUrl: () => Promise<string>) {}

  token(ts = Date.now()) {
    return `${ts}.${createHmac('sha256', env.SESSION_SECRET).update(`revalidate:${ts}`).digest('base64url')}`;
  }
  verify(token: string) {
    const [ts, sig] = String(token ?? '').split('.');
    if (!ts || !sig || !/^\d+$/.test(ts)) return false;
    if (Math.abs(Date.now() - Number(ts)) > 120_000) return false;
    const expect = this.token(Number(ts)).split('.')[1];
    return sig.length === expect.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
  }
  /** 任何會影響前台輸出的寫入後呼叫；fire-and-forget */
  trigger(reason: string) {
    this.reasons.add(reason);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const why = [...this.reasons].join(',');
      this.reasons.clear();
      void this.send(why);
    }, 300);
  }
  private async send(reason: string) {
    let site = '';
    try {
      site = await this.siteUrl();
      const r = await fetch(`${site}/sitekit-internal/revalidate`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sitekit-token': this.token() }, body: JSON.stringify({ reason }), signal: AbortSignal.timeout(5000) });
      if (!r.ok) this.log.warn(`revalidate ${site} → ${r.status}（${reason}）`);
    } catch (e) {
      this.log.warn(`revalidate ${site || '(site.url 未知)'} 失敗：${e instanceof Error ? e.message : String(e)}（${reason}）`);
    }
  }
}

/** web 端沒有共享密鑰時用來驗 token（公開端點，只回 ok 布林） */
@Controller('internal/revalidate')
export class RevalidateController {
  constructor(private readonly reval: RevalidateService) {}
  @Post('verify')
  verify(@Body() body: { token?: string }) {
    return { ok: this.reval.verify(String(body?.token ?? '')) };
  }
}
