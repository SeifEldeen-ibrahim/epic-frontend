/** A unified text diff as plain text (never HTML): added/removed lines coloured by tokens.
 * Prose wraps; long YAML lines scroll inside the view's own container. */
export function DiffView({ diff, testId }: { diff: string; testId: string }) {
  const lines = diff.split('\n')
  return (
    <div className="admin-diff" role="region" aria-label="Changes" tabIndex={0} data-testid={testId}>
      <pre className="admin-diff__pre">
        {lines.map((line, i) => {
          const kind =
            line.startsWith('+++') || line.startsWith('---')
              ? 'meta'
              : line.startsWith('@@')
                ? 'hunk'
                : line.startsWith('+')
                  ? 'add'
                  : line.startsWith('-')
                    ? 'del'
                    : 'ctx'
          return (
            <span key={i} className={`admin-diff__line admin-diff__line--${kind}`}>
              {kind === 'add' ? <span className="admin-sr-only">added: </span> : null}
              {kind === 'del' ? <span className="admin-sr-only">removed: </span> : null}
              {line}
              {'\n'}
            </span>
          )
        })}
      </pre>
    </div>
  )
}
