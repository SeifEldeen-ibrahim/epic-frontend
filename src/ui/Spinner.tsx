export interface SpinnerProps {
  label?: string
}

export function Spinner({ label = 'Loading' }: SpinnerProps) {
  return <span className="ui-spinner" role="status" aria-label={label} />
}
