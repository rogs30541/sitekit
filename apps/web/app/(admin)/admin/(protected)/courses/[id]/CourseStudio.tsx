'use client';

import { useState } from 'react';
import type { AdminCourse } from './CourseSettingsForm';

const TABS = [
  { key: 'describe', label: '課程描述' },
  { key: 'pricing', label: '課程定價' },
  { key: 'chapters', label: '章節' },
  { key: 'community', label: '問答與公告' },
  { key: 'videos', label: '影片庫' },
] as const;
type Tab = (typeof TABS)[number]['key'];

/** 課程編輯分頁（對標 Power Course：課程描述／課程定價／章節／問與答・公告／其他） */
export function CourseStudio({ course, chapterCount, describe, pricing, chapters, community, videos }: { course: AdminCourse; chapterCount: number; describe: React.ReactNode; pricing: React.ReactNode; chapters: React.ReactNode; community: React.ReactNode; videos: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>('describe');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-2 py-0.5 ${course.isPublished ? 'bg-green-100 text-green-800' : 'bg-neutral-100'}`}>{course.isPublished ? '已發布' : '草稿（前台不顯示）'}</span>
        {course.product.hidden ? <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">列表中隱藏（可直接網址訪問）</span> : null}
        <span className="font-mono" style={{ color: 'var(--muted)' }}>
          /course/{course.slug}
        </span>
        <span style={{ color: 'var(--muted)' }}>章節 {chapterCount}</span>
      </div>
      <div className="flex flex-wrap gap-1 border-b text-xs" style={{ borderColor: 'var(--line)' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 ${tab === t.key ? 'border-b-2 border-black font-bold' : 'opacity-70'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className={tab === 'describe' ? '' : 'hidden'}>{describe}</div>
      <div className={tab === 'pricing' ? '' : 'hidden'}>{pricing}</div>
      <div className={tab === 'chapters' ? '' : 'hidden'}>{chapters}</div>
      <div className={tab === 'community' ? '' : 'hidden'}>{community}</div>
      <div className={tab === 'videos' ? '' : 'hidden'}>{videos}</div>
    </div>
  );
}
