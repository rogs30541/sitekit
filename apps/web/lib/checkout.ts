'use client';

export type CheckoutPayload = { provider: string; kind: 'redirect'; redirectUrl: string } | { provider: string; kind: 'form'; gatewayUrl: string; fields: Record<string, string> };
export interface PaymentMethod {
  id: string;
  label: string;
  testMode: boolean;
}

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  try {
    const r = await fetch('/api/payments/methods');
    return r.ok ? ((await r.json()) as PaymentMethod[]) : [];
  } catch {
    return [];
  }
}

/** 取金流 payload → form 類（藍新／綠界／統一）自動送出表單、redirect 類（LINE Pay／支付連／mock／free）直接導向。 */
export async function startCheckout(orderId: string, provider?: string): Promise<never> {
  const c = await fetch(`/api/payments/checkout/${orderId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(provider ? { provider } : {}) });
  const payload = (await c.json()) as CheckoutPayload & { message?: string };
  if (!c.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'checkout failed');
  if (payload.kind === 'form') {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = payload.gatewayUrl;
    for (const [k, v] of Object.entries(payload.fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = k;
      input.value = v;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  } else {
    window.location.href = payload.redirectUrl;
  }
  return new Promise<never>(() => undefined);
}
