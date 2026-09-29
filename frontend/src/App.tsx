import { lazy, Suspense, type ComponentType } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router'
import { AppLayout } from '@/components/AppLayout'
import { PageLoading } from '@/components/ui'
import { WakeGate } from '@/components/WakeGate'
import { LoginPage } from '@/pages/LoginPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { NAV_ROUTES } from '@/routes'
import { useAuth } from '@/store/auth'

// Route-level code splitting: each page (and the charting library, which only chart pages
// import) is fetched when first visited, so the login screen and shell load fast.
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}

const CommandCentrePage = page(() => import('@/pages/overview/CommandCentrePage'), 'CommandCentrePage')
const EntitiesPage = page(() => import('@/pages/entities/EntitiesPage'), 'EntitiesPage')
const EntityProfilePage = page(() => import('@/pages/entities/EntityProfilePage'), 'EntityProfilePage')
const ReviewQueuePage = page(() => import('@/pages/review/ReviewQueuePage'), 'ReviewQueuePage')
const NegativeSpacePage = page(() => import('@/pages/negative/NegativeSpacePage'), 'NegativeSpacePage')
const BenchmarksPage = page(() => import('@/pages/benchmarks/BenchmarksPage'), 'BenchmarksPage')
const TrendsPage = page(() => import('@/pages/trends/TrendsPage'), 'TrendsPage')
const ValidationLabPage = page(() => import('@/pages/validation/ValidationLabPage'), 'ValidationLabPage')
const IngestPage = page(() => import('@/pages/ingest/IngestPage'), 'IngestPage')
const SignalLibraryPage = page(() => import('@/pages/signals/SignalLibraryPage'), 'SignalLibraryPage')
const AuditRunsPage = page(() => import('@/pages/audit/AuditRunsPage'), 'AuditRunsPage')
const BriefingPage = page(() => import('@/pages/briefing/BriefingPage'), 'BriefingPage')

// Built pages; any other nav route shows its placeholder.
const PAGES: Record<string, ComponentType> = {
  '/overview': CommandCentrePage,
  '/entities': EntitiesPage,
  '/review': ReviewQueuePage,
  '/negative-space': NegativeSpacePage,
  '/benchmarks': BenchmarksPage,
  '/trends': TrendsPage,
  '/validation': ValidationLabPage,
  '/ingest': IngestPage,
  '/signals': SignalLibraryPage,
  '/audit': AuditRunsPage,
}

function RequireAuth() {
  const token = useAuth((s) => s.token)
  return token ? <Outlet /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <WakeGate>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          {/* The briefing is a standalone printable page, outside the app chrome. */}
          <Route
            path="/briefing/:code"
            element={
              <Suspense fallback={<PageLoading />}>
                <BriefingPage />
              </Suspense>
            }
          />
          <Route element={<AppLayout />}>
            {NAV_ROUTES.map((route) => {
              const Page = PAGES[route.path]
              return (
                <Route
                  key={route.path}
                  path={route.path}
                  element={Page ? <Page /> : <PlaceholderPage route={route} />}
                />
              )
            })}
            <Route path="/entities/:code" element={<EntityProfilePage />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Route>
        </Route>
      </Routes>
    </WakeGate>
  )
}
