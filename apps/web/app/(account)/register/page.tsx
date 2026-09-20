import Link from 'next/link';
import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { Section } from '@/components/Section';

export const metadata = { title: '註冊', robots: { index: false } };

export default function RegisterPage() {
  return (
    <Section title="註冊" group="(account)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        第一位註冊者會自動成為超級管理員。
      </p>
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
      <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
        已有帳號？{' '}
        <Link href="/login" className="underline">
          登入
        </Link>
      </p>
    </Section>
  );
}
