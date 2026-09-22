import { CouponsView } from '../coupons/CouponsView';

export const dynamic = 'force-dynamic';

export default function AdminCourseCouponsPage() {
  return <CouponsView scope="course" />;
}
