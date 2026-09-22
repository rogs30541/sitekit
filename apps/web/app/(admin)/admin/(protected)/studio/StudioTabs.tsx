'use client';

import { useState } from 'react';

const TABS = [
  { key: 'command', label: '指令台' },
  { key: 'images', label: '產圖' },
  { key: 'manage', label: '模板與任務管理' },
] as const;

export function StudioTabs({ command, images, manage }: { command: React.ReactNode; images: React.ReactNode; manage: React.ReactNode }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('command');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 border-b text-xs" style={{ borderColor: 'var(--line)' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 ${tab === t.key ? 'border-b-2 border-black font-bold' : 'opacity-70'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className={tab === 'command' ? '' : 'hidden'}>{command}</div>
      <div className={tab === 'images' ? '' : 'hidden'}>{images}</div>
      <div className={tab === 'manage' ? '' : 'hidden'}>{manage}</div>
    </div>
  );
}
