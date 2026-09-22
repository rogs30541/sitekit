'use client';

import { useState } from 'react';
import { Section } from '@/components/Section';

/** 密碼保護的銷售頁：輸入後以 ?pw= 重新載入（伺服器端比對雜湊） */
export function PasswordGate({ title, wrong }: { title: string; wrong: boolean }) {
  const [pw, setPw] = useState('');
  return (
    <Section title={title} group="(shop)">
      <form
        className="max-w-sm space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          window.location.search = `?pw=${encodeURIComponent(pw)}`;
        }}
      >
        <p className="text-sm">此銷售頁需要密碼才能查看。</p>
        <input type="password" className="w-full rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="請輸入密碼" />
        {wrong ? <p className="text-xs text-red-700">密碼錯誤</p> : null}
        <button type="submit" className="rounded bg-black px-4 py-1.5 text-sm text-white">
          進入
        </button>
      </form>
    </Section>
  );
}
