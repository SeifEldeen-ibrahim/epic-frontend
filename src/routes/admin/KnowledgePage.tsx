import { useId } from 'react'
import { useSearchParams } from 'react-router'
import { useConfigState, type KnowledgeSection as Section } from '../../api/config'
import { AdminPage } from '../../admin/DataTable'
import { adminCopy } from '../../admin/copy'
import { KnowledgeSection } from './KnowledgeSection'

const c = adminCopy.config
/** In setup order; departments (the routing section) have their own page. */
const ORDER: readonly Section[] = c.knowledgeOrder

/** /admin/knowledge: what the assistant knows, section by section, in setup order. */
export function KnowledgePage() {
  const q = useConfigState()
  const [params, setParams] = useSearchParams()
  const tabsId = useId()
  const raw = params.get('section')
  const section: Section = (ORDER as readonly string[]).includes(raw ?? '') ? (raw as Section) : ORDER[0]
  const select = (s: Section) => setParams({ section: s }, { replace: true })

  return (
    <AdminPage page="knowledge">
      <div className="admin-tabs" role="tablist" aria-label={adminCopy.pages.knowledge} id={tabsId} data-testid="knowledge-tabs">
        {ORDER.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={s === section}
            className="admin-tab"
            onClick={() => select(s)}
            data-testid={`knowledge-tab-${s}`}
          >
            {c.sections[s]}
          </button>
        ))}
      </div>
      <div className="admin-tabs-select">
        <label className="ui-field__label" htmlFor={`${tabsId}-select`}>
          {adminCopy.pages.knowledge}
        </label>
        <select id={`${tabsId}-select`} className="ui-input" value={section} onChange={(e) => select(e.target.value as Section)} data-testid="knowledge-section-select">
          {ORDER.map((s) => (
            <option key={s} value={s}>
              {c.sections[s]}
            </option>
          ))}
        </select>
      </div>
      <div role="tabpanel" className="admin-section" aria-label={c.sections[section]}>
        <h2>{c.sections[section]}</h2>
        <KnowledgeSection key={section} section={section} canEdit={q.data?.can_edit ?? false} problems={q.data?.draft_problems ?? []} />
      </div>
    </AdminPage>
  )
}
