import type { PaymentProvider } from '@sitekit/shared';
import { ecpayGateway } from './ecpay';
import { linepayGateway } from './linepay';
import { newebpayGateway } from './newebpay';
import { payuniGateway } from './payuni';
import { pchomepayGateway } from './pchomepay';
import type { Gateway } from './types';

/** 外部金流商註冊表（mock／free 由 PaymentsService 自己處理） */
export const GATEWAYS: Partial<Record<PaymentProvider, Gateway>> = {
  newebpay: newebpayGateway,
  payuni: payuniGateway,
  ecpay: ecpayGateway,
  linepay: linepayGateway,
  pchomepay: pchomepayGateway,
};

export const isGatewayProvider = (p: string): p is keyof typeof GATEWAYS => p in GATEWAYS;

export * from './types';
