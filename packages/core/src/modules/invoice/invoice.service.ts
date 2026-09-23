import { BadRequestException, Injectable, Logger } from '../../compat';
import { createCipheriv } from 'node:crypto';
import type { Order, OrderItem, User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { SETTING_KEYS } from '@sitekit/shared';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { ecpayInvoiceCall } from './ecpay-invoice';
import { AMEGO_CARRIER, amegoCall } from './amego-invoice';

/** ezPay 專用：手動 PKCS7（block 32）再 AES-256-CBC（移植自度哥 utils/newebpay.ts） */
export function ezpayEncrypt(data: string, hashKey: string, hashIv: string): string {
  const blockSize = 32;
  const len = Buffer.byteLength(data, 'utf8');
  const pad = blockSize - (len % blockSize);
  const padded = data + String.fromCharCode(pad).repeat(pad);
  const cipher = createCipheriv('aes-256-cbc', hashKey, hashIv);
  cipher.setAutoPadding(false);
  return cipher.update(padded, 'utf8', 'hex') + cipher.final('hex');
}
const toQuery = (p: Record<string, string | number>) =>
  Object.entries(p)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

type OrderForInvoice = Order & { items: OrderItem[]; user: Pick<User, 'email' | 'displayName'> };

/** 訂單上的發票需求（結帳時填） */
export interface InvoiceRequest {
  type: 'personal' | 'mobile' | 'citizen' | 'company' | 'donate';
  carrierNum?: string | null;
  taxId?: string | null;
  title?: string | null;
  loveCode?: string | null;
}

/**
 * 電子發票：ezPay（藍新）或綠界 B2C；設定 `invoice.provider`＝none|ezpay|ecpay、`invoice.issueTiming`＝paid|manual。
 * 載具：personal（Email／會員載具）、mobile（手機條碼）、citizen（自然人憑證）、company（統編＋抬頭，B2B）、donate（愛心碼）。
 */
@Injectable()
export class InvoiceService {
  private readonly log = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
  ) {}

  async config() {
    const g = (k: string, e?: string, d = '') => this.settings.get(k, e, d);
    const [provider, timing, ez, ezTest, ecId, ecKey, ecIv, ecTest, amTax, amKey] = await Promise.all([
      g(SETTING_KEYS.invoiceProvider, 'INVOICE_PROVIDER', ''),
      g(SETTING_KEYS.invoiceIssueTiming, 'INVOICE_ISSUE_TIMING', 'paid'),
      this.settings.ezpay(),
      g(SETTING_KEYS.ezpayTestMode, 'EZPAY_TEST_MODE', 'true'),
      g(SETTING_KEYS.ecpayInvoiceMerchantId, 'ECPAY_INVOICE_MERCHANT_ID'),
      g(SETTING_KEYS.ecpayInvoiceHashKey, 'ECPAY_INVOICE_HASH_KEY'),
      g(SETTING_KEYS.ecpayInvoiceHashIv, 'ECPAY_INVOICE_HASH_IV'),
      g(SETTING_KEYS.ecpayInvoiceTestMode, 'ECPAY_INVOICE_TEST_MODE', 'true'),
      g(SETTING_KEYS.amegoTaxId, 'AMEGO_TAX_ID'),
      g(SETTING_KEYS.amegoAppKey, 'AMEGO_APP_KEY'),
    ]);
    // 相容舊設定：ezpay.enabled=true 且未設 invoice.provider → ezpay
    const eff = provider || (ez.enabled ? 'ezpay' : 'none');
    const ezTestMode = ezTest !== 'false';
    const ezApi = ez.apiUrl && !ez.apiUrl.includes('cinv.ezpay') && !ez.apiUrl.includes('inv.ezpay') ? ez.apiUrl : ezTestMode ? 'https://cinv.ezpay.com.tw/Api/invoice_issue' : 'https://inv.ezpay.com.tw/Api/invoice_issue';
    return {
      provider: eff as 'none' | 'ezpay' | 'ecpay' | 'amego',
      timing: timing === 'manual' ? 'manual' : 'paid',
      ezpay: { ...ez, testMode: ezTestMode, apiUrl: ezApi, ready: !!(ez.merchantId && ez.hashKey && ez.hashIv) },
      ecpay: { merchantId: ecId, hashKey: ecKey, hashIv: ecIv, testMode: ecTest !== 'false', ready: !!(ecId && ecKey && ecIv) },
      /** 光貿：測試與正式同網址，用測試公司統編／App Key 即為測試 */
      amego: { taxId: amTax, appKey: amKey, ready: !!(amTax && amKey), testMode: amTax === '12345678' },
    };
  }

  /** 驗證結帳填的發票資訊 */
  validateRequest(r: InvoiceRequest | undefined | null): InvoiceRequest {
    const type = r?.type ?? 'personal';
    if (type === 'mobile' && !/^\/[0-9A-Z.+-]{7}$/.test(r?.carrierNum ?? '')) throw new BadRequestException('手機條碼格式錯誤（/ 開頭共 8 碼）');
    if (type === 'citizen' && !/^[A-Z]{2}\d{14}$/.test(r?.carrierNum ?? '')) throw new BadRequestException('自然人憑證條碼格式錯誤（2 英文＋14 數字）');
    if (type === 'company' && !/^\d{8}$/.test(r?.taxId ?? '')) throw new BadRequestException('統一編號需為 8 碼數字');
    if (type === 'donate' && !/^\d{3,7}$/.test(r?.loveCode ?? '')) throw new BadRequestException('愛心碼需為 3–7 碼數字');
    return { type, carrierNum: r?.carrierNum ?? null, taxId: r?.taxId ?? null, title: r?.title ?? null, loveCode: r?.loveCode ?? null };
  }

  /** 付款成功時呼叫（issueTiming=paid 才自動開） */
  async issueForOrder(order: OrderForInvoice) {
    const cfg = await this.config();
    if (cfg.provider === 'none' || cfg.timing !== 'paid') return null;
    return this.issue(order, 'auto').catch((e) => {
      this.log.warn(`invoice auto issue failed for ${order.merchantOrderNo}: ${e instanceof Error ? e.message : e}`);
      return null;
    });
  }

  /** 開立（後台按鈕／OPS／自動）：冪等，已開立直接回傳 */
  async issue(order: OrderForInvoice, actor: string) {
    const cfg = await this.config();
    if (cfg.provider === 'none') throw new BadRequestException('尚未設定電子發票供應商');
    if (order.status !== 'paid' || order.amount <= 0) throw new BadRequestException('只有已付款且金額大於 0 的訂單可開立');
    const existing = await this.prisma.invoice.findFirst({ where: { orderId: order.id, status: 'issued' } });
    if (existing) return existing;
    const req: InvoiceRequest = { type: (order.invoiceType as InvoiceRequest['type']) || 'personal', carrierNum: order.invoiceCarrierNum, taxId: order.invoiceTaxId, title: order.invoiceTitle, loveCode: order.invoiceLoveCode };
    const r = cfg.provider === 'ecpay' ? await this.issueEcpay(order, req, cfg.ecpay) : cfg.provider === 'amego' ? await this.issueAmego(order, req, cfg.amego) : await this.issueEzpay(order, req, cfg.ezpay);
    const row = await this.prisma.invoice.create({ data: { orderId: order.id, provider: cfg.provider, number: r.ok ? r.number : null, invoiceDate: r.ok ? r.date : null, randomCode: r.ok ? r.random : null, status: r.ok ? 'issued' : 'failed', amount: order.amount, payload: { actor, ...r.raw } as Prisma.InputJsonValue } });
    if (!r.ok) throw new BadRequestException(`發票開立失敗：${r.message}`);
    return row;
  }

  private async issueEzpay(order: OrderForInvoice, req: InvoiceRequest, cfg: Awaited<ReturnType<InvoiceService['config']>>['ezpay']) {
    if (!cfg.ready) return { ok: false, message: 'ezPay 未設定', raw: {} } as const;
    const totalAmt = order.amount;
    const amt = Math.round(totalAmt / 1.05);
    const taxAmt = totalAmt - amt;
    const params: Record<string, string | number> = {
      RespondType: 'JSON',
      Version: '1.5',
      TimeStamp: Math.floor(Date.now() / 1000),
      MerchantOrderNo: order.merchantOrderNo,
      Status: '1',
      Category: req.type === 'company' ? 'B2B' : 'B2C',
      BuyerName: req.type === 'company' ? (req.title || '公司') : order.user.displayName || order.user.email || '消費者',
      BuyerEmail: order.user.email,
      PrintFlag: req.type === 'company' ? 'Y' : 'N',
      TaxType: '1',
      TaxRate: 5,
      Amt: amt,
      TaxAmt: taxAmt,
      TotalAmt: totalAmt,
      ItemName: order.items.map((i) => i.name).join('|'),
      ItemCount: order.items.map((i) => i.qty).join('|'),
      ItemUnit: order.items.map(() => '式').join('|'),
      ItemPrice: order.items.map((i) => i.unitPrice).join('|'),
      ItemAmt: order.items.map((i) => i.unitPrice * i.qty).join('|'),
    };
    if (req.type === 'company') params.BuyerUBN = req.taxId ?? '';
    else if (req.type === 'mobile') {
      params.CarrierType = '0';
      params.CarrierNum = req.carrierNum ?? '';
    } else if (req.type === 'citizen') {
      params.CarrierType = '1';
      params.CarrierNum = req.carrierNum ?? '';
    } else if (req.type === 'donate') {
      params.LoveCode = req.loveCode ?? '';
    } else {
      params.CarrierType = '2';
      params.CarrierNum = order.user.email;
    }
    try {
      const res = await fetch(cfg.apiUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ MerchantID_: cfg.merchantId, PostData_: ezpayEncrypt(toQuery(params), cfg.hashKey, cfg.hashIv) }).toString() });
      const data = (await res.json()) as { Status: string; Message?: string; Result?: string | Record<string, unknown> };
      const result = typeof data.Result === 'string' ? (JSON.parse(data.Result) as Record<string, unknown>) : (data.Result ?? {});
      const ok = data.Status === 'SUCCESS';
      return { ok, number: String(result.InvoiceNumber ?? ''), date: String(result.CreateTime ?? '').slice(0, 10), random: String(result.RandomNum ?? ''), message: `${data.Status} ${data.Message ?? ''}`.trim(), raw: { status: data.Status, message: data.Message, result } };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e), raw: {} } as const;
    }
  }

  private async issueEcpay(order: OrderForInvoice, req: InvoiceRequest, cfg: Awaited<ReturnType<InvoiceService['config']>>['ecpay']) {
    if (!cfg.ready) return { ok: false, message: '綠界電子發票未設定', raw: {} } as const;
    const data: Record<string, unknown> = {
      RelateNumber: order.merchantOrderNo.slice(0, 30),
      CustomerName: req.type === 'company' ? (req.title || '公司') : order.user.displayName || '消費者',
      CustomerEmail: order.user.email,
      Print: req.type === 'company' ? '1' : '0',
      Donation: req.type === 'donate' ? '1' : '0',
      LoveCode: req.type === 'donate' ? req.loveCode : '',
      CarrierType: req.type === 'mobile' ? '3' : req.type === 'citizen' ? '2' : req.type === 'personal' ? '1' : '',
      CarrierNum: req.type === 'mobile' || req.type === 'citizen' ? req.carrierNum : '',
      TaxType: '1',
      SalesAmount: order.amount,
      InvType: '07',
      Items: order.items.map((i, k) => ({ ItemSeq: k + 1, ItemName: i.name.slice(0, 100), ItemCount: i.qty, ItemWord: '式', ItemPrice: i.unitPrice, ItemTaxType: '1', ItemAmount: i.unitPrice * i.qty })),
    };
    if (req.type === 'company') data.CustomerIdentifier = req.taxId;
    if (req.type === 'company') data.CustomerAddr = order.shippingAddress ?? '';
    // 運費／折扣讓總額對齊：以「其他」品項補差額
    const itemsSum = order.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const diff = order.amount - itemsSum;
    if (diff !== 0) (data.Items as unknown[]).push({ ItemSeq: order.items.length + 1, ItemName: diff > 0 ? '運費' : '折扣', ItemCount: 1, ItemWord: '式', ItemPrice: diff, ItemTaxType: '1', ItemAmount: diff });
    try {
      const r = await ecpayInvoiceCall<{ InvoiceNo?: string; InvoiceDate?: string; RandomNumber?: string }>({ ...cfg, path: '/B2CInvoice/Issue', data });
      return { ok: r.ok, number: r.data?.InvoiceNo ?? '', date: r.data?.InvoiceDate ?? '', random: r.data?.RandomNumber ?? '', message: `${r.rtnCode} ${r.rtnMsg}`.trim(), raw: { rtnCode: r.rtnCode, rtnMsg: r.rtnMsg, data: r.data } };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e), raw: {} } as const;
    }
  }

  /** 光貿（Amego）B2C／B2B：/json/f0401，金額含稅；打統編時 TaxAmount 5%（DetailVat 預設含稅） */
  private async issueAmego(order: OrderForInvoice, req: InvoiceRequest, cfg: Awaited<ReturnType<InvoiceService['config']>>['amego']) {
    if (!cfg.ready) return { ok: false, message: '光貿未設定（統編／App Key）', raw: {} } as const;
    const company = req.type === 'company';
    const items = order.items.map((i) => ({ Description: i.name.slice(0, 256), Quantity: i.qty, Unit: '式', UnitPrice: i.unitPrice, Amount: i.unitPrice * i.qty, Remark: '', TaxType: 1 }));
    const itemsSum = items.reduce((s, i) => s + i.Amount, 0);
    const diff = order.amount - itemsSum;
    if (diff !== 0) items.push({ Description: diff > 0 ? '運費' : '折扣', Quantity: 1, Unit: '式', UnitPrice: diff, Amount: diff, Remark: '', TaxType: 1 });
    const total = order.amount;
    const taxAmount = company ? Math.round(total - total / 1.05) : 0;
    const data: Record<string, unknown> = {
      OrderId: order.merchantOrderNo.slice(0, 40),
      BuyerIdentifier: company ? req.taxId : '0000000000',
      BuyerName: company ? (req.title || req.taxId) : (order.user.displayName || '消費者'),
      BuyerAddress: order.shippingAddress ?? '',
      BuyerTelephoneNumber: order.shippingPhone ?? '',
      BuyerEmailAddress: order.user.email,
      MainRemark: '',
      CarrierType: req.type === 'mobile' ? AMEGO_CARRIER.mobile : req.type === 'citizen' ? AMEGO_CARRIER.citizen : req.type === 'personal' ? AMEGO_CARRIER.member : '',
      CarrierId1: req.type === 'mobile' || req.type === 'citizen' ? req.carrierNum : req.type === 'personal' ? order.user.email : '',
      CarrierId2: req.type === 'mobile' || req.type === 'citizen' ? req.carrierNum : req.type === 'personal' ? order.user.email : '',
      NPOBAN: req.type === 'donate' ? req.loveCode : '',
      ProductItem: items,
      SalesAmount: company ? total - taxAmount : total,
      FreeTaxSalesAmount: 0,
      ZeroTaxSalesAmount: 0,
      TaxType: 1,
      TaxRate: '0.05',
      TaxAmount: taxAmount,
      TotalAmount: total,
    };
    try {
      const r = await amegoCall({ taxId: cfg.taxId, appKey: cfg.appKey, path: '/json/f0401', data });
      const ok = r.code === 0;
      const date = r.invoice_time ? new Date(r.invoice_time * 1000 + 8 * 3600_000).toISOString().slice(0, 10) : '';
      return { ok, number: r.invoice_number ?? '', date, random: r.random_number ?? '', message: `${r.code} ${r.msg}`.trim(), raw: { code: r.code, msg: r.msg, invoice_number: r.invoice_number, invoice_time: r.invoice_time, random_number: r.random_number } };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e), raw: {} } as const;
    }
  }

  /** 作廢（退款自動／後台／OPS） */
  async invalidateForOrder(orderId: string, reason = '訂單退款') {
    const cfg = await this.config();
    const inv = await this.prisma.invoice.findFirst({ where: { orderId, status: 'issued', number: { not: null } } });
    if (!inv) return null;
    try {
      if (inv.provider === 'amego') {
        if (!cfg.amego.ready) return null;
        const r = await amegoCall({ taxId: cfg.amego.taxId, appKey: cfg.amego.appKey, path: '/json/f0501', data: [{ CancelInvoiceNumber: inv.number, CancelReason: reason.slice(0, 20) }] });
        if (r.code !== 0) {
          this.log.warn(`amego invalidate failed for ${inv.number}: ${r.code} ${r.msg}`);
          return null;
        }
      } else if (inv.provider === 'ecpay') {
        if (!cfg.ecpay.ready) return null;
        const r = await ecpayInvoiceCall({ ...cfg.ecpay, path: '/B2CInvoice/Invalid', data: { InvoiceNo: inv.number, InvoiceDate: inv.invoiceDate ?? '', Reason: reason.slice(0, 20) } });
        if (!r.ok) {
          this.log.warn(`ecpay invalidate failed for ${inv.number}: ${r.rtnCode} ${r.rtnMsg}`);
          return null;
        }
      } else {
        if (!cfg.ezpay.ready) return null;
        const params = { RespondType: 'JSON', Version: '1.0', TimeStamp: Math.floor(Date.now() / 1000), InvoiceNumber: inv.number as string, InvalidReason: reason };
        const res = await fetch(cfg.ezpay.apiUrl.replace('invoice_issue', 'invoice_invalid'), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ MerchantID_: cfg.ezpay.merchantId, PostData_: ezpayEncrypt(toQuery(params), cfg.ezpay.hashKey, cfg.ezpay.hashIv) }).toString() });
        const data = (await res.json()) as { Status: string; Message?: string };
        if (data.Status !== 'SUCCESS') {
          this.log.warn(`ezPay invalidate failed for ${inv.number}: ${data.Status} ${data.Message ?? ''}`);
          return null;
        }
      }
      return this.prisma.invoice.update({ where: { id: inv.id }, data: { status: 'invalid', invalidAt: new Date() } });
    } catch (e) {
      this.log.error(`invalidate error: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  list(status?: string) {
    return this.prisma.invoice.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 300, include: { order: { select: { merchantOrderNo: true, amount: true, invoiceType: true, invoiceTaxId: true, user: { select: { email: true } } } } } });
  }
}
