import { isClinicSimUnavailable, useClinicDepartments, useClinicProviders, type ClinicDepartment } from '../../api/clinicSim'
import { DataTable, type Column } from '../../admin/DataTable'
import { adminCopy } from '../../admin/copy'
import { EmptyState, ErrorState } from '../../ui'

const c = adminCopy.clinicSim

/** Read-only: each department and the providers who work in it. */
export function ClinicSimDepartments() {
  const deps = useClinicDepartments()
  const provs = useClinicProviders()
  const columns: Column<ClinicDepartment>[] = [
    { key: 'department', header: c.departments.cols.department, cell: (d) => d.name },
    {
      key: 'providers',
      header: c.departments.cols.providers,
      cell: (d) => {
        const names = (provs.data ?? []).filter((p) => p.department_id === d.id).map((p) => p.display_name)
        return names.length ? (
          <ul className="admin-plain-list">
            {names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : (
          <span className="admin-muted">{c.departments.none}</span>
        )
      },
    },
  ]
  if (deps.isPending || provs.isPending) {
    return <DataTable name="clinic-departments" caption={c.departments.caption} columns={columns} loading />
  }
  const error = deps.error ?? provs.error
  if (error || !deps.data) {
    return (
      <ErrorState
        message={isClinicSimUnavailable(error) ? c.unreachable : c.departments.error}
        onRetry={() => {
          void deps.refetch()
          void provs.refetch()
        }}
        data-testid={isClinicSimUnavailable(error) ? 'clinic-unreachable' : 'clinic-departments-error'}
      />
    )
  }
  if (deps.data.length === 0) return <EmptyState title={c.departments.empty} data-testid="clinic-departments-empty" />
  return <DataTable name="clinic-departments" caption={c.departments.caption} columns={columns} rows={deps.data} rowKey={(d) => String(d.id)} />
}
