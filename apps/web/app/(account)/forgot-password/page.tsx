import Link from 'next/link';
import { Section } from '@/components/Section';
import { ForgotForm } from './ForgotForm';
import { t } from '@/lib/i18n';

export const metadata = { title: '忘記密碼', robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <Section title={t('忘記密碼')} group="(account)">
      <ForgotForm />
      <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/login" className="underline">
          {t('回登入')}
        </Link>
      </p>
    </Section>
  );
}
