export function PageTitle({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="display text-[2rem] md:text-[2.6rem]">{title}</h1>
        {sub && <p className="mt-2 max-w-[60ch] text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Section({ title, aside, children, id }: { title: string; aside?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section className="mb-10" id={id}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="heading text-xl">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children, icon, action }: { children: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-5 py-8 text-center text-muted">
      {icon && <div className="text-muted/70">{icon}</div>}
      <p className="max-w-[46ch]">{children}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}
