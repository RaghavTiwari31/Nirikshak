import clsx from 'clsx'
import { LogOut } from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { NAV_ROUTES, type NavRoute } from '@/routes'
import { useAuth } from '@/store/auth'
import { BrandMark } from './BrandMark'
import { Tooltip } from './Tooltip'
import { PageLoading } from './ui'

const GROUPS: NavRoute['group'][] = ['Supervise', 'Analyse', 'Operate']

export function AppLayout() {
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface max-md:w-[72px]">
        <div className="flex items-center gap-3 px-6 pt-7 pb-6 max-md:px-5">
          <BrandMark size={32} />
          <div className="max-md:hidden">
            <p className="text-[15px] leading-tight font-semibold tracking-tight">Nirikshak</p>
            <p className="text-xs text-muted">SOC supervision</p>
          </div>
        </div>

        <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-2" aria-label="Main">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted/80 max-md:hidden">
                {group}
              </p>
              <div className="space-y-0.5">
                {NAV_ROUTES.filter((r) => r.group === group).map(({ path, label, description, icon: Icon }) => (
                  <Tooltip key={path} content={<><b className="font-semibold">{label}</b><br />{description}</>}>
                    <NavLink
                      to={path}
                      aria-label={label}
                      className={({ isActive }) =>
                        clsx(
                          'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                          isActive
                            ? 'bg-accent-soft font-semibold text-ink before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-accent'
                            : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            size={18}
                            strokeWidth={isActive ? 2.1 : 1.75}
                            className={isActive ? 'text-accent-ink' : 'text-muted'}
                          />
                          <span className="max-md:hidden">{label}</span>
                        </>
                      )}
                    </NavLink>
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="m-3 flex items-center gap-3 rounded-2xl bg-surface-2/70 px-4 py-3.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white max-md:hidden"
            aria-hidden="true"
          >
            {(user?.display_name ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 max-md:hidden">
            <p className="truncate text-sm font-medium">{user?.display_name}</p>
            <p className="text-xs capitalize text-muted">{user?.role}</p>
          </div>
          <Tooltip content="Sign out">
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <LogOut size={17} />
            </button>
          </Tooltip>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-y-auto">
        {/* Pages are code-split; the chrome stays put while a page chunk loads. */}
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
