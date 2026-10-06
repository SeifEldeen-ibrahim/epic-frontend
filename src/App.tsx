import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { AdminPlaceholder } from './routes/admin/AdminPlaceholder'
import { LoginPlaceholder } from './routes/admin/LoginPlaceholder'
import { CallPage } from './routes/call/CallPage'
import { CheckPage } from './routes/call/CheckPage'
import { NotFound } from './routes/NotFound'

// Dev-only state fixtures for screenshots; compiled out of production builds.
const CallFixtures = import.meta.env.DEV
  ? lazy(() => import('./routes/call/CallFixtures').then((m) => ({ default: m.CallFixtures })))
  : null

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
      <Route path="/admin" element={<AdminPlaceholder />} />
      <Route path="/admin/login" element={<LoginPlaceholder />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
