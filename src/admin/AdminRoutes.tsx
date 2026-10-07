import { Navigate, Route, Routes } from 'react-router'
import { AccountPage } from '../routes/admin/AccountPage'
import { AuditPage } from '../routes/admin/AuditPage'
import { CallDetailPage } from '../routes/admin/CallDetailPage'
import { CallsPage } from '../routes/admin/CallsPage'
import { ExportsPage } from '../routes/admin/ExportsPage'
import { FollowUpPage } from '../routes/admin/FollowUpPage'
import { LoginPage } from '../routes/admin/LoginPage'
import { QueuePage } from '../routes/admin/QueuePage'
import { ReportsPage } from '../routes/admin/ReportsPage'
import { SettingsPage } from '../routes/admin/SettingsPage'
import { NotFound } from '../routes/NotFound'
import './admin.css'
import { AdminShell } from './AdminShell'
import { RequireAuth } from './RequireAuth'
import { RequireRole } from './RequireRole'

/** Everything under /admin. Paths are relative to the /admin/* route in App. */
export function AdminRoutes() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AdminShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="queue" replace />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="follow-up" element={<FollowUpPage />} />
        <Route path="calls" element={<CallsPage />} />
        <Route path="calls/:callId" element={<CallDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route
          path="exports"
          element={
            <RequireRole allow={['admin']}>
              <ExportsPage />
            </RequireRole>
          }
        />
        <Route
          path="audit"
          element={
            <RequireRole allow={['admin']}>
              <AuditPage />
            </RequireRole>
          }
        />
        <Route
          path="settings"
          element={
            <RequireRole allow={['admin']}>
              <SettingsPage />
            </RequireRole>
          }
        />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
