import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { CallPage } from './routes/call/CallPage'
import { CheckPage } from './routes/call/CheckPage'
import { NotFound } from './routes/NotFound'
import { Spinner } from './ui'

// Dev-only state fixtures for screenshots; compiled out of production builds.
const CallFixtures = import.meta.env.DEV
  ? lazy(() => import('./routes/call/CallFixtures').then((m) => ({ default: m.CallFixtures })))
  : null
const AdminFixtures = import.meta.env.DEV
  ? lazy(() => import('./admin/fixtures/AdminFixtures').then((m) => ({ default: m.AdminFixtures })))
  : null

// The staff area is its own chunk so callers never download it.
const AdminRoutes = lazy(() => import('./admin/AdminRoutes').then((m) => ({ default: m.AdminRoutes })))

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/call" replace />} />
      <Route path="/call" element={<CallPage />} />
      <Route path="/call/check" element={<CheckPage />} />
      {import.meta.env.DEV && CallFixtures ? (
        <Route
          path="/call/fixtures/:state?"
          element={
            <Suspense fallback={null}>
              <CallFixtures />
            </Suspense>
          }
        />
      ) : null}
      {import.meta.env.DEV && AdminFixtures ? (
        <Route
          path="/admin/fixtures/:view?"
          element={
            <Suspense fallback={null}>
              <AdminFixtures />
            </Suspense>
          }
        />
      ) : null}
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<Spinner label="Loading staff area" />}>
            <AdminRoutes />
          </Suspense>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
