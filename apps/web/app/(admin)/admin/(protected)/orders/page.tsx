import { OrdersView } from './OrdersView';

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; shipping?: string }> }) {
  const { status, shipping } = await searchParams;
  return <OrdersView scope="shop" status={status} shipping={shipping} />;
}
