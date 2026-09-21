import Link from 'next/link';
import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { OAuthButtons } from '@/components/OAuthButtons';
import { Section } from '@/components/Section';

export const metadata = { title: '登入', robots: { index: false } };

export default function LoginPage() {
  return (
    <Section title="登入" group="(account)">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
      <Suspense>
        <OAuthButtons />
      </Suspense>
      <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
        還沒有帳號？{' '}
        <Link href="/register" className="underline">
          註冊
        </Link>
        {' · '}
        <Link href="/forgot-password" className="underline">
          忘記密碼
        </Link>
      </p>
    </Section>
  );
}
