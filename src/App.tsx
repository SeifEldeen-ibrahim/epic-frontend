import { Navigate, Route, Routes } from 'react-router'
import { AdminPlaceholder } from './routes/admin/AdminPlaceholder'
import { LoginPlaceholder } from './routes/admin/LoginPlaceholder'
import { CallPage } from './routes/call/CallPage'
import { NotFound } from './routes/NotFound'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/call" replace />} />
      <Route path="/call" element={<CallPage />} />
      <Route path="/admin" element={<AdminPlaceholder />} />
      <Route path="/admin/login" element={<LoginPlaceholder />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
