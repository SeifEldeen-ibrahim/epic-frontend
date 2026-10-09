import { useId } from 'react'
import { useSearchParams } from 'react-router'
import { AdminPage } from '../../admin/DataTable'
import { adminCopy } from '../../admin/copy'
import { ClinicSimAppointments } from './ClinicSimAppointments'
import { ClinicSimDepartments } from './ClinicSimDepartments'
import { ClinicSimPatients } from './ClinicSimPatients'

const c = adminCopy.clinicSim
const TABS = ['patients', 'appointments', 'departments'] as const
type Tab = (typeof TABS)[number]

/** /admin/clinic-sim (admins only): the practice clinic's patients, appointments and departments. */
export function ClinicSimPage() {
  const [params, setParams] = useSearchParams()
  const tabsId = useId()
  const raw = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : TABS[0]
  const select = (t: Tab) => setParams({ tab: t }, { replace: true })

  return (
    <AdminPage page="clinic-sim">
      <div className="admin-tabs" role="tablist" aria-label={adminCopy.pages['clinic-sim']} id={tabsId} data-testid="clinic-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            className="admin-tab"
            onClick={() => select(t)}
            data-testid={`clinic-tab-${t}`}
          >
            {c.tabs[t]}
          </button>
        ))}
      </div>
      <div className="admin-tabs-select">
        <label className="ui-field__label" htmlFor={`${tabsId}-select`}>
          {adminCopy.pages['clinic-sim']}
        </label>
        <select id={`${tabsId}-select`} className="ui-input" value={tab} onChange={(e) => select(e.target.value as Tab)} data-testid="clinic-tab-select">
          {TABS.map((t) => (
            <option key={t} value={t}>
              {c.tabs[t]}
            </option>
          ))}
        </select>
      </div>
      <div role="tabpanel" className="admin-section" aria-label={c.tabs[tab]} data-testid={`clinic-panel-${tab}`}>
        <h2>{c.tabs[tab]}</h2>
        {tab === 'patients' ? <ClinicSimPatients /> : null}
        {tab === 'appointments' ? <ClinicSimAppointments /> : null}
        {tab === 'departments' ? <ClinicSimDepartments /> : null}
      </div>
    </AdminPage>
  )
}
