import { useConfigState } from '../../api/config'
import { AdminPage } from '../../admin/DataTable'
import { KnowledgeSection } from './KnowledgeSection'

/** /admin/departments: where callers can be sent (the routing section, in the admin's words). */
export function DepartmentsPage() {
  const q = useConfigState()
  return (
    <AdminPage page="departments">
      <KnowledgeSection section="routing" canEdit={q.data?.can_edit ?? false} problems={q.data?.draft_problems ?? []} />
    </AdminPage>
  )
}
