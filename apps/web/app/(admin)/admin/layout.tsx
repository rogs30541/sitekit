export const metadata = { title: '後台工作站', robots: { index: false, follow: false } };

/** 後台獨立 layout：之後在此掛角色守衛與獨立 chunk 切分。 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-dashed p-4" style={{ borderColor: 'var(--line)' }}>
      <p className="mb-3 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
        後台工作站（僅管理員）
      </p>
      {children}
    </div>
  );
}
