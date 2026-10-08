import type { ChangeItem, ChangeNames } from '../api/config'
import { groupChanges, type ChangeLine } from './changeLabels'
import { adminCopy } from './copy'

const v = adminCopy.versions

function Line({ line }: { line: ChangeLine }) {
  if (line.listAdded || line.listRemoved) {
    return (
      <li className="admin-change">
        <span className="admin-change__label">{line.label}:</span>{' '}
        <span className="admin-change__values">
          {line.listAdded?.length ? <span>{v.listAdded(line.listAdded.join(', '))}</span> : null}
          {line.listRemoved?.length ? <span>{v.listRemoved(line.listRemoved.join(', '))}</span> : null}
        </span>
      </li>
    )
  }
  if (line.kind !== 'changed') {
    const value = line.kind === 'added' ? line.after : line.before
    return (
      <li className="admin-change">
        <span className="admin-change__label">
          {line.label}
          {line.long ? null : ':'}
        </span>{' '}
        {line.long ? <p className="admin-change__block">{value}</p> : <span className="admin-change__values">{value}</span>}
      </li>
    )
  }
  if (line.long) {
    return (
      <li className="admin-change">
        <span className="admin-change__label">{line.label}</span>
        <div className="admin-change__pair">
          <div>
            <span className="admin-change__side">{v.before}</span>
            <p className="admin-change__block">{line.before}</p>
          </div>
          <div>
            <span className="admin-change__side">{v.after}</span>
            <p className="admin-change__block">{line.after}</p>
          </div>
        </div>
      </li>
    )
  }
  return (
    <li className="admin-change">
      <span className="admin-change__label">{line.label}:</span>{' '}
      <span className="admin-change__values">
        <span>{line.before}</span>
        <span aria-hidden="true"> → </span>
        <span className="admin-sr-only"> {v.changedTo} </span>
        <span>{line.after}</span>
      </span>
    </li>
  )
}

/** "What changed", grouped by page and item, in the edit forms' own labels (no colours). */
export function ChangeList({
  changes,
  names,
  tools,
  headingLevel = 2,
  testId,
}: {
  changes: readonly ChangeItem[]
  names: ChangeNames
  tools: Record<string, string>
  headingLevel?: 2 | 3
  testId: string
}) {
  const groups = groupChanges(changes, { names, tools })
  const H = headingLevel === 2 ? 'h2' : 'h3'
  const Hi = headingLevel === 2 ? 'h3' : 'h4'
  return (
    <div className="admin-changes" data-testid={testId}>
      {groups.map((g) => (
        <section key={g.area} className="admin-panel admin-changes__group" data-testid={`change-area-${g.area}`}>
          <H className="admin-changes__area">{g.title}</H>
          {g.items.map((it) => (
            <div key={it.key} className="admin-changes__item">
              {it.title === g.title ? null : (
              <Hi className="admin-changes__title">
                {it.title}
                {it.kind === 'added' || it.kind === 'removed' ? (
                  <span className="admin-changes__kind"> — {it.kind === 'added' ? v.added : v.removed}</span>
                ) : null}
              </Hi>
              )}
              <ul className="admin-changes__lines">
                {it.lines.map((l) => (
                  <Line key={l.key} line={l} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
