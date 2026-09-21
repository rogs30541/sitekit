export function Section({ title, children }: { title: string; group?: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-6" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="mt-4 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
