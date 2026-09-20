import { Injectable } from '@nestjs/common';
import { SETTING_KEYS } from '@sitekit/shared';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

const TTL_MS = 30_000;

/** settings 表為主、環境變數為備援的設定讀取（度哥 apiSettings 模式）。後台改設定不必重新部署。 */
@Injectable()
export class SettingsService {
  private cache: { at: number; map: Map<string, string> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async all(): Promise<Map<string, string>> {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.map;
    const rows = await this.prisma.setting.findMany();
    this.cache = { at: Date.now(), map: new Map(rows.map((r) => [r.key, r.value])) };
    return this.cache.map;
  }

  invalidate() {
    this.cache = null;
  }

  /** DB 有值優先；否則讀環境變數；再否則回預設。 */
  async get(key: string, envKey?: string, def = ''): Promise<string> {
    const v = (await this.all()).get(key);
    if (v !== undefined && v !== '') return v;
    if (envKey && process.env[envKey]) return process.env[envKey] as string;
    return def;
  }

  async siteUrl(): Promise<string> {
    return (await this.get(SETTING_KEYS.siteUrl, 'FRONTEND_URL', env.FRONTEND_URL)).replace(/\/$/, '');
  }

  async paymentProvider(): Promise<string> {
    return this.get(SETTING_KEYS.paymentProvider, 'PAYMENT_PROVIDER', 'none');
  }

  async newebpay() {
    const [merchantId, hashKey, hashIv, gatewayUrl] = await Promise.all([
      this.get(SETTING_KEYS.newebpayMerchantId, 'NEWEBPAY_MERCHANT_ID'),
      this.get(SETTING_KEYS.newebpayHashKey, 'NEWEBPAY_HASH_KEY'),
      this.get(SETTING_KEYS.newebpayHashIv, 'NEWEBPAY_HASH_IV'),
      this.get(SETTING_KEYS.newebpayGatewayUrl, 'NEWEBPAY_API_URL', 'https://ccore.newebpay.com/MPG/mpg_gateway'),
    ]);
    return { merchantId, hashKey, hashIv, gatewayUrl, configured: !!(merchantId && hashKey && hashIv) };
  }

  async ezpay() {
    const [enabled, merchantId, hashKey, hashIv, apiUrl] = await Promise.all([
      this.get(SETTING_KEYS.ezpayEnabled, 'EZPAY_ENABLED', 'false'),
      this.get(SETTING_KEYS.ezpayMerchantId, 'EZPAY_MERCHANT_ID'),
      this.get(SETTING_KEYS.ezpayHashKey, 'EZPAY_HASH_KEY'),
      this.get(SETTING_KEYS.ezpayHashIv, 'EZPAY_HASH_IV'),
      this.get(SETTING_KEYS.ezpayApiUrl, 'EZPAY_INVOICE_URL', 'https://cinv.ezpay.com.tw/Api/invoice_issue'),
    ]);
    return { enabled: enabled === 'true', merchantId, hashKey, hashIv, apiUrl, configured: !!(merchantId && hashKey && hashIv) };
  }

  async bunny() {
    const [libraryId, signingKey] = await Promise.all([
      this.get(SETTING_KEYS.bunnyLibraryId, 'BUNNY_LIBRARY_ID'),
      this.get(SETTING_KEYS.bunnySigningKey, 'BUNNY_SIGNING_KEY'),
    ]);
    return { libraryId, signingKey, configured: !!(libraryId && signingKey) };
  }
}
