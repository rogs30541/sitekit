import { Suspense } from 'react';
import { Section } from '@/components/Section';
import { ResetForm } from './ResetForm';

export const metadata = { title: '重設密碼', robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <Section title="重設密碼" group="(account)">
      <Suspense>
        <ResetForm />
      </Suspense>
    </Section>
  );
}
