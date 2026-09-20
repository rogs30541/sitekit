import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv } from 'node:crypto';
import type { Order, OrderItem, User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

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

/** ezPay 電子發票：付款成功後開立（B2C、應稅 5%、電子發票不列印）。未啟用或未設定即略過。 */
@Injectable()
export class InvoiceService {
  private readonly log = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async issueForOrder(order: OrderForInvoice) {
    const cfg = await this.settings.ezpay();
    if (!cfg.enabled || !cfg.configured || order.amount <= 0) return null;
    const existing = await this.prisma.invoice.findFirst({ where: { orderId: order.id, status: 'issued' } });
    if (existing) return existing;

    const totalAmt = order.amount;
    const amt = Math.round(totalAmt / 1.05);
    const taxAmt = totalAmt - amt;
    const names = order.items.map((i) => i.name);
    const params: Record<string, string | number> = {
      RespondType: 'JSON',
      Version: '1.5',
      TimeStamp: Math.floor(Date.now() / 1000),
      MerchantOrderNo: order.merchantOrderNo,
      Status: '1',
      Category: 'B2C',
      BuyerName: order.user.displayName || order.user.email || '消費者',
      BuyerEmail: order.user.email,
      PrintFlag: 'N',
      CarrierType: '2',
      CarrierNum: order.user.email,
      TaxType: '1',
      TaxRate: 5,
      Amt: amt,
      TaxAmt: taxAmt,
      TotalAmt: totalAmt,
      ItemName: names.join('|'),
      ItemCount: order.items.map((i) => i.qty).join('|'),
      ItemUnit: order.items.map(() => '式').join('|'),
      ItemPrice: order.items.map((i) => i.unitPrice).join('|'),
      ItemAmt: order.items.map((i) => i.unitPrice * i.qty).join('|'),
    };
    try {
      const res = await fetch(cfg.apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ MerchantID_: cfg.merchantId, PostData_: ezpayEncrypt(toQuery(params), cfg.hashKey, cfg.hashIv) }).toString(),
      });
      const data = (await res.json()) as { Status: string; Message?: string; Result?: string | Record<string, unknown> };
      const result = typeof data.Result === 'string' ? (JSON.parse(data.Result) as Record<string, unknown>) : (data.Result ?? {});
      const ok = data.Status === 'SUCCESS';
      const row = await this.prisma.invoice.create({
        data: {
          orderId: order.id,
          provider: 'ezpay',
          number: ok ? String(result.InvoiceNumber ?? '') : null,
          status: ok ? 'issued' : 'failed',
          amount: totalAmt,
          payload: { status: data.Status, message: data.Message, result } as Prisma.InputJsonValue,
        },
      });
      if (!ok) this.log.warn(`ezPay issue failed for ${order.merchantOrderNo}: ${data.Status} ${data.Message ?? ''}`);
      return row;
    } catch (e) {
      this.log.error(`ezPay issue error for ${order.merchantOrderNo}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  /** 退款時作廢已開立發票（best-effort）。 */
  async invalidateForOrder(orderId: string, reason = '訂單退款') {
    const cfg = await this.settings.ezpay();
    const inv = await this.prisma.invoice.findFirst({ where: { orderId, status: 'issued', number: { not: null } } });
    if (!inv || !cfg.configured) return null;
    const params = { RespondType: 'JSON', Version: '1.0', TimeStamp: Math.floor(Date.now() / 1000), InvoiceNumber: inv.number as string, InvalidReason: reason };
    try {
      const res = await fetch(cfg.apiUrl.replace('invoice_issue', 'invoice_invalid'), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ MerchantID_: cfg.merchantId, PostData_: ezpayEncrypt(toQuery(params), cfg.hashKey, cfg.hashIv) }).toString(),
      });
      const data = (await res.json()) as { Status: string; Message?: string };
      if (data.Status === 'SUCCESS') return this.prisma.invoice.update({ where: { id: inv.id }, data: { status: 'invalid' } });
      this.log.warn(`ezPay invalidate failed for ${inv.number}: ${data.Status} ${data.Message ?? ''}`);
      return null;
    } catch (e) {
      this.log.error(`ezPay invalidate error: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }
}
