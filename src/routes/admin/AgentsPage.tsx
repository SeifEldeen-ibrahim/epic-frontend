import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAgents, useConfigState, useSaveEntryAgent, type AgentSummary } from '../../api/config'
import { AdminPage, CellLink, DataTable, SelectField, type Column } from '../../admin/DataTable'
import { adminCopy } from '../../admin/copy'
import { Button, EmptyState, ErrorState, StatusBadge } from '../../ui'

const c = adminCopy.agents

/** /admin/agents: every agent (switchboard and clinic included) and who answers new calls. */
export function AgentsPage() {
  const q = useAgents()
  const state = useConfigState()
  const saveEntry = useSaveEntryAgent()
  const navigate = useNavigate()
  const canEdit = state.data?.can_edit ?? false
  // undefined = not touched; '' = "Nobody yet".
  const [entryPick, setEntry] = useState<string | undefined>(undefined)
  const entry = entryPick ?? q.data?.entry_agent ?? ''

  const columns: Column<AgentSummary>[] = [
    {
      key: 'name',
      header: c.name,
      link: true,
      cell: (a) => (
        <CellLink to={`/admin/agents/${a.name}`} label={`${a.title} (${a.name})`}>
          {a.name}
        </CellLink>
      ),
    },
    { key: 'title', header: c.title, cell: (a) => a.title },
    { key: 'voice', header: c.voice, cell: (a) => a.voice },
    { key: 'tools', header: c.tools, cell: (a) => <span className="admin-wrap">{a.tools.join(', ')}</span> },
    { key: 'calls', header: c.takesCallsFor, cell: (a) => (a.takes_calls_for.length ? a.takes_calls_for.join(', ') : adminCopy.dash) },
    {
      key: 'status',
      header: c.status,
      cell: (a) => (
        <span className="admin-actions">
          <StatusBadge tone={a.archived ? 'warning' : 'ok'}>{a.archived ? c.archived : c.active}</StatusBadge>
          {a.entry ? <StatusBadge tone="ok">{c.entry}</StatusBadge> : null}
        </span>
      ),
    },
  ]

  let body
  if (q.isPending) body = <DataTable name="agents" caption={adminCopy.pages.agents} columns={columns} loading />
  else if (!q.data) body = <ErrorState message={c.error} onRetry={() => void q.refetch()} data-testid="agents-error" />
  else if (q.data.agents.length === 0)
    body = (
      <EmptyState title={c.empty} data-testid="agents-empty">
        <p>{c.emptyBody}</p>
        {canEdit ? (
          <span className="admin-actions">
            <Button onClick={() => navigate('/admin/agents/new')} data-testid="agents-empty-new">
              {c.createFirst}
            </Button>
          </span>
        ) : null}
      </EmptyState>
    )
  else
    body = (
      <>
        <div className="admin-panel admin-actions admin-entry" data-testid="agents-entry">
          <SelectField
            label={c.entryLabel}
            value={entry}
            onChange={setEntry}
            options={[
              { value: '', label: c.entryNone },
              ...q.data.agents.filter((a) => !a.archived).map((a) => ({ value: a.name, label: `${a.title} (${a.name})` })),
            ]}
            testId="agents-entry-select"
          />
          {canEdit ? (
            <Button
              variant="secondary"
              disabled={saveEntry.isPending || entry === (q.data.entry_agent ?? '')}
              onClick={() => saveEntry.mutate(entry || null, { onSuccess: () => setEntry(undefined) })}
              data-testid="agents-entry-save"
            >
              {c.entrySave}
            </Button>
          ) : null}
        </div>
        <DataTable name="agents" caption={adminCopy.pages.agents} columns={columns} rows={q.data.agents} rowKey={(a) => a.name} />
      </>
    )
  return (
    <AdminPage
      page="agents"
      actions={
        canEdit ? (
          <Button onClick={() => navigate('/admin/agents/new')} data-testid="agents-new">
            {c.newAgent}
          </Button>
        ) : null
      }
    >
      {body}
    </AdminPage>
  )
}
