import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { AdminApiError } from '../../api/admin'
import { useChangePassword, useSession } from '../../api/auth'
import { adminCopy } from '../../admin/copy'
import { APP_NAME, Button, Notice, TextField } from '../../ui'

const c = adminCopy.account
const MIN_LENGTH = 12

interface FieldErrors {
  current?: string
  next?: string
  confirm?: string
}

function serverMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 429) return c.tooMany
    if (error.detail && /current/i.test(error.detail) && !/\s/.test(error.detail)) return c.wrongCurrent
    if (error.detail && /\s/.test(error.detail)) return error.detail
  }
  return c.failed
}

/** Password change; also the only page a must-change user can reach. */
export function AccountPage() {
  const { data } = useSession()
  const change = useChangePassword()
  const navigate = useNavigate()
  const forced = data?.state === 'must-change'
  const user = data && data.state !== 'signed-out' ? data.user : null
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [done, setDone] = useState(false)

  useEffect(() => {
    document.title = `${c.title} · ${APP_NAME}`
  }, [])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const found: FieldErrors = {}
    if (!current) found.current = c.currentRequired
    if (next.length < MIN_LENGTH) found.next = c.tooShort
    if (confirm !== next) found.confirm = c.mismatch
    setErrors(found)
    setDone(false)
    if (Object.keys(found).length > 0) return
    const wasForced = forced
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          setCurrent('')
          setNext('')
          setConfirm('')
          setDone(true)
          if (wasForced) navigate('/admin', { replace: true })
        },
      },
    )
  }

  return (
    <section className="admin-page" data-testid="admin-account">
      <h1>{c.heading}</h1>
      {forced ? (
        <div data-testid="account-forced">
          <Notice>{c.forced}</Notice>
        </div>
      ) : null}
      {user ? (
        <p className="admin-muted">
          {c.signedInAs} {user.email}
        </p>
      ) : null}
      {done ? (
        <div data-testid="account-success" role="status">
          <Notice tone="info">{c.success}</Notice>
        </div>
      ) : null}
      <form className="admin-form" onSubmit={onSubmit} noValidate>
        <TextField
          label={c.current}
          type="password"
          autoComplete="current-password"
          data-testid="account-current"
          value={current}
          error={errors.current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <TextField
          label={c.next}
          hint={c.nextHint}
          type="password"
          autoComplete="new-password"
          data-testid="account-new"
          value={next}
          error={errors.next}
          onChange={(e) => setNext(e.target.value)}
        />
        <TextField
          label={c.confirm}
          type="password"
          autoComplete="new-password"
          data-testid="account-confirm"
          value={confirm}
          error={errors.confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {change.isError ? (
          <div data-testid="account-error" role="alert">
            <Notice>{serverMessage(change.error)}</Notice>
          </div>
        ) : null}
        <Button type="submit" data-testid="account-submit" disabled={change.isPending}>
          {change.isPending ? c.submitting : c.submit}
        </Button>
      </form>
    </section>
  )
}
