import type { NavRoute } from '@/routes'

export function PlaceholderPage({ route }: { route: NavRoute }) {
  const Icon = route.icon
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{route.group}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{route.label}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">{route.description}</p>
      </header>
      <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-surface/60 p-10 text-center">
        <Icon size={28} strokeWidth={1.5} className="text-accent-ink" />
        <p className="text-sm">This view is built in {route.phase}.</p>
        <p className="text-xs text-muted">The shell, routing, auth and API wiring are in place.</p>
      </div>
    </div>
  )
}
