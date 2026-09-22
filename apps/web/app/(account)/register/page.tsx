import Link from 'next/link';
import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { OAuthButtons } from '@/components/OAuthButtons';
import { Section } from '@/components/Section';

export const metadata = { title: '註冊', robots: { index: false } };

export default function RegisterPage() {
  return (
    <Section title="註冊" group="(account)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        只需 Email 與密碼即可註冊；姓名、電話、地址等資料在購買課程或下單時再填寫。前台會員與後台管理員完全分離，前台註冊不會取得任何管理權限。
      </p>
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
      <Suspense>
        <OAuthButtons />
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
