'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RefundRequestButton({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        const reason = window.prompt('退款原因（選填）') ?? '';
        setBusy(true);
        await fetch(`/api/orders/${encodeURIComponent(orderNo)}/refund-request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) });
        setBusy(false);
        router.refresh();
      }}
      className="rounded border px-2 py-1 text-xs disabled:opacity-50"
      style={{ borderColor: 'var(--line)' }}
    >
      申請退款
    </button>
  );
}
