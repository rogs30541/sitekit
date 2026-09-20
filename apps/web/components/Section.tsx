export function Section({ title, group, children }: { title: string; group: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-6" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        路由分組 {group}
      </p>
      <h1 className="mt-1 text-2xl font-bold">{title}</h1>
      <div className="mt-4 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
