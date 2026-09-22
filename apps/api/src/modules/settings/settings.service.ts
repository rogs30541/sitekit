import { Injectable } from '@nestjs/common';
import { PAYMENT_PROVIDERS, SETTING_KEYS, type PaymentProvider } from '@sitekit/shared';
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

  /** 結帳可選的付款方式：`payment.methods` 逗號清單（依序）；空＝只用 `payment.provider`。過濾未知值與 none。 */
  async paymentMethods(): Promise<Exclude<PaymentProvider, 'none'>[]> {
    const raw = await this.get(SETTING_KEYS.paymentMethods, 'PAYMENT_METHODS');
    const list = raw ? raw.split(',').map((s) => s.trim()) : [await this.paymentProvider()];
    const valid = new Set<string>(PAYMENT_PROVIDERS);
    return [...new Set(list.filter((p) => p && p !== 'none' && valid.has(p)))] as Exclude<PaymentProvider, 'none'>[];
  }

  /** 各金流商設定：DB 優先、環境變數備援。testMode 預設 true（未明確設 false 一律走測試環境）。 */
  async gateway(provider: PaymentProvider): Promise<{ provider: PaymentProvider; testMode: boolean; configured: boolean; merchantId: string; hashKey: string; hashIv: string; gatewayUrl?: string }> {
    const bool = (v: string) => v !== 'false' && v !== '0';
    const cfg = async (idKey: string, keyKey: string, ivKey: string, testKey: string, envPrefix: string) => {
      const [merchantId, hashKey, hashIv, test] = await Promise.all([
        this.get(idKey, `${envPrefix}_MERCHANT_ID`),
        this.get(keyKey, `${envPrefix}_HASH_KEY`),
        this.get(ivKey, `${envPrefix}_HASH_IV`),
        this.get(testKey, `${envPrefix}_TEST_MODE`, 'true'),
      ]);
      return { provider, testMode: bool(test), merchantId, hashKey, hashIv, configured: !!(merchantId && hashKey && (hashIv || provider === 'linepay' || provider === 'pchomepay')) };
    };
    switch (provider) {
      case 'newebpay': {
        const c = await cfg(SETTING_KEYS.newebpayMerchantId, SETTING_KEYS.newebpayHashKey, SETTING_KEYS.newebpayHashIv, SETTING_KEYS.newebpayTestMode, 'NEWEBPAY');
        const gatewayUrl = await this.get(SETTING_KEYS.newebpayGatewayUrl, 'NEWEBPAY_API_URL');
        return { ...c, gatewayUrl: gatewayUrl || undefined };
      }
      case 'payuni':
        return cfg(SETTING_KEYS.payuniMerchantId, SETTING_KEYS.payuniHashKey, SETTING_KEYS.payuniHashIv, SETTING_KEYS.payuniTestMode, 'PAYUNI');
      case 'ecpay':
        return cfg(SETTING_KEYS.ecpayMerchantId, SETTING_KEYS.ecpayHashKey, SETTING_KEYS.ecpayHashIv, SETTING_KEYS.ecpayTestMode, 'ECPAY');
      case 'linepay': {
        const [merchantId, hashKey, test] = await Promise.all([this.get(SETTING_KEYS.linepayChannelId, 'LINEPAY_CHANNEL_ID'), this.get(SETTING_KEYS.linepayChannelSecret, 'LINEPAY_CHANNEL_SECRET'), this.get(SETTING_KEYS.linepayTestMode, 'LINEPAY_TEST_MODE', 'true')]);
        return { provider, testMode: bool(test), merchantId, hashKey, hashIv: '', configured: !!(merchantId && hashKey) };
      }
      case 'pchomepay': {
        const [merchantId, hashKey, test] = await Promise.all([this.get(SETTING_KEYS.pchomepayAppId, 'PCHOMEPAY_APP_ID'), this.get(SETTING_KEYS.pchomepayAppSecret, 'PCHOMEPAY_APP_SECRET'), this.get(SETTING_KEYS.pchomepayTestMode, 'PCHOMEPAY_TEST_MODE', 'true')]);
        return { provider, testMode: bool(test), merchantId, hashKey, hashIv: '', configured: !!(merchantId && hashKey) };
      }
      default:
        return { provider, testMode: true, merchantId: '', hashKey: '', hashIv: '', configured: provider === 'mock' };
    }
  }

  /** 相容舊呼叫：藍新設定 */
  async newebpay() {
    const c = await this.gateway('newebpay');
    return { ...c, gatewayUrl: c.gatewayUrl ?? (c.testMode ? 'https://ccore.newebpay.com/MPG/mpg_gateway' : 'https://core.newebpay.com/MPG/mpg_gateway') };
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

  /** 產圖供應商：mock（本機）／openai／gemini（Claude 不產圖）；金鑰 openai.apiKey／gemini.apiKey 或 env */
  async ai() {
    const [providerRaw, openaiKey, geminiKey, imageModel] = await Promise.all([
      this.get(SETTING_KEYS.aiProvider, 'AI_PROVIDER', ''),
      this.get(SETTING_KEYS.openaiApiKey, 'OPENAI_API_KEY'),
      this.get(SETTING_KEYS.geminiApiKey, 'GEMINI_API_KEY'),
      this.get(SETTING_KEYS.aiImageModel, 'AI_IMAGE_MODEL', ''),
    ]);
    const provider = providerRaw || (openaiKey ? 'openai' : geminiKey ? 'gemini' : 'mock');
    const model = imageModel || (provider === 'gemini' ? 'gemini-2.5-flash-image' : 'gpt-image-1');
    return { provider, openaiKey, geminiKey, imageModel: model, platformKeyConfigured: provider === 'gemini' ? !!geminiKey : !!openaiKey, keyFor: (p: string) => (p === 'gemini' ? geminiKey : p === 'openai' ? openaiKey : '') };
  }

  async bunny() {
    const [libraryId, signingKey] = await Promise.all([
      this.get(SETTING_KEYS.bunnyLibraryId, 'BUNNY_LIBRARY_ID'),
      this.get(SETTING_KEYS.bunnySigningKey, 'BUNNY_SIGNING_KEY'),
    ]);
    return { libraryId, signingKey, configured: !!(libraryId && signingKey) };
  }
}
