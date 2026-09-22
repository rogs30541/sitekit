import { OrdersView } from '../orders/OrdersView';

export const dynamic = 'force-dynamic';

/** 課程訂單（與電商訂單各自獨立） */
export default async function AdminCourseOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  return <OrdersView scope="course" status={status} />;
}
