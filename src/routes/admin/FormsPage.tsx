import { useNavigate } from 'react-router'
import { useConfigState, useForms, type FormSummary } from '../../api/config'
import { AdminPage, CellLink, DataTable, type Column } from '../../admin/DataTable'
import { adminCopy, label } from '../../admin/copy'
import { Button, EmptyState, ErrorState, StatusBadge } from '../../ui'

const c = adminCopy.forms

/** /admin/forms: the intake forms agents can fill (form builder). */
export function FormsPage() {
  const q = useForms()
  const state = useConfigState()
  const navigate = useNavigate()
  const canEdit = state.data?.can_edit ?? false
  const columns: Column<FormSummary>[] = [
    {
      key: 'name',
      header: adminCopy.agents.name,
      link: true,
      cell: (f) => (
        <CellLink to={`/admin/forms/${f.name}`} label={`${f.title} (${f.name})`}>
          {f.name}
        </CellLink>
      ),
    },
    { key: 'title', header: c.title, cell: (f) => f.title },
    { key: 'fields', header: c.fieldsCount, cell: (f) => f.fields },
    { key: 'used', header: c.usedBy, cell: (f) => (f.used_by.length ? f.used_by.join(', ') : adminCopy.dash) },
    {
      key: 'status',
      header: adminCopy.config.status,
      cell: (f) => (
        <span className="admin-actions">
          <StatusBadge tone={f.status === 'APPROVED' ? 'ok' : 'warning'}>{label(f.status.toLowerCase())}</StatusBadge>
          {f.archived ? <StatusBadge tone="warning">{adminCopy.agents.archived}</StatusBadge> : null}
        </span>
      ),
    },
  ]
  let body
  if (q.isPending) body = <DataTable name="forms" caption={adminCopy.pages.forms} columns={columns} loading />
  else if (!q.data) body = <ErrorState message={c.error} onRetry={() => void q.refetch()} data-testid="forms-error" />
  else if (q.data.forms.length === 0)
    body = (
      <EmptyState title={c.empty} data-testid="forms-empty">
        <p>{c.emptyBody}</p>
        {canEdit ? (
          <Button onClick={() => navigate('/admin/forms/new')} data-testid="forms-empty-build">
            {c.build}
          </Button>
        ) : null}
      </EmptyState>
    )
  else body = <DataTable name="forms" caption={adminCopy.pages.forms} columns={columns} rows={q.data.forms} rowKey={(f) => f.name} />
  return (
    <AdminPage
      page="forms"
      actions={
        canEdit ? (
          <Button onClick={() => navigate('/admin/forms/new')} data-testid="forms-new">
            {c.newForm}
          </Button>
        ) : null
      }
    >
      {body}
    </AdminPage>
  )
}
