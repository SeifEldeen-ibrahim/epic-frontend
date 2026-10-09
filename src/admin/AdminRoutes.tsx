import { Route, Routes } from 'react-router'
import { AccountPage } from '../routes/admin/AccountPage'
import { AgentEditorPage } from '../routes/admin/AgentEditorPage'
import { AgentsPage } from '../routes/admin/AgentsPage'
import { AuditPage } from '../routes/admin/AuditPage'
import { CallDetailPage } from '../routes/admin/CallDetailPage'
import { ClinicSimPage } from '../routes/admin/ClinicSimPage'
import { CallsPage } from '../routes/admin/CallsPage'
import { DepartmentsPage } from '../routes/admin/DepartmentsPage'
import { ExportsPage } from '../routes/admin/ExportsPage'
import { FollowUpPage } from '../routes/admin/FollowUpPage'
import { FormBuilderPage } from '../routes/admin/FormBuilderPage'
import { FormsPage } from '../routes/admin/FormsPage'
import { HomePage } from '../routes/admin/HomePage'
import { KnowledgePage } from '../routes/admin/KnowledgePage'
import { LanguageDetailPage } from '../routes/admin/LanguageDetailPage'
import { LanguagesPage } from '../routes/admin/LanguagesPage'
import { LoginPage } from '../routes/admin/LoginPage'
import { QueuePage } from '../routes/admin/QueuePage'
import { ReportsPage } from '../routes/admin/ReportsPage'
import { SettingsPage } from '../routes/admin/SettingsPage'
import { VersionDetailPage } from '../routes/admin/VersionDetailPage'
import { VersionsPage } from '../routes/admin/VersionsPage'
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
        <Route index element={<HomePage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="follow-up" element={<FollowUpPage />} />
        <Route path="calls" element={<CallsPage />} />
        <Route path="calls/:callId" element={<CallDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route
          path="agents/new"
          element={
            <RequireRole allow={['admin']}>
              <AgentEditorPage />
            </RequireRole>
          }
        />
        <Route path="agents/:name" element={<AgentEditorPage />} />
        <Route path="forms" element={<FormsPage />} />
        <Route
          path="forms/new"
          element={
            <RequireRole allow={['admin']}>
              <FormBuilderPage />
            </RequireRole>
          }
        />
        <Route path="forms/:name" element={<FormBuilderPage />} />
        <Route path="versions" element={<VersionsPage />} />
        <Route path="versions/:seq" element={<VersionDetailPage />} />
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
        <Route
          path="languages"
          element={
            <RequireRole allow={['admin']}>
              <LanguagesPage />
            </RequireRole>
          }
        />
        <Route
          path="languages/:code"
          element={
            <RequireRole allow={['admin']}>
              <LanguageDetailPage />
            </RequireRole>
          }
        />
        <Route
          path="clinic-sim"
          element={
            <RequireRole allow={['admin']}>
              <ClinicSimPage />
            </RequireRole>
          }
        />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
