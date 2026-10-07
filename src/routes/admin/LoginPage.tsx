import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { AdminApiError } from '../../api/admin'
import { useLogin, useSession } from '../../api/auth'
import { adminCopy } from '../../admin/copy'
import { Button, Notice, PageLayout, TextField } from '../../ui'

const FALLBACK = '/admin'
const c = adminCopy.login

/** Only same-origin /admin paths (never the login page itself) are allowed as a post-login target. */
function safeNext(next: string | null): string {
  if (!next) return FALLBACK
  try {
    const url = new URL(next, window.location.origin)
    if (url.origin !== window.location.origin) return FALLBACK
    const path = url.pathname
    if (path !== '/admin' && !path.startsWith('/admin/')) return FALLBACK
    if (path === '/admin/login') return FALLBACK
    return path + url.search + url.hash
  } catch {
    return FALLBACK
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 429) return c.tooMany
    if (error.status === 401) return error.detail && /\s/.test(error.detail) ? error.detail : c.invalid
  }
  return c.failed
}

/** Staff sign-in. Lives outside the shell and renders before the session check resolves. */
export function LoginPage() {
  const session = useSession()
  const login = useLogin()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (session.data?.state === 'signed-in') return <Navigate to={safeNext(params.get('next'))} replace />
  if (session.data?.state === 'must-change') return <Navigate to="/admin/account" replace />

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate({ email: email.trim(), password })
  }

  return (
    <PageLayout title={c.title} data-testid="admin-login">
      <h1>{c.heading}</h1>
      <form className="admin-form" onSubmit={onSubmit}>
        <TextField
          label={c.email}
          type="email"
          name="email"
          autoComplete="username"
          required
          data-testid="login-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={c.password}
          type="password"
          name="password"
          autoComplete="current-password"
          required
          data-testid="login-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {login.isError ? (
          <div data-testid="login-error" role="alert">
            <Notice>{errorMessage(login.error)}</Notice>
          </div>
        ) : null}
        <Button type="submit" data-testid="login-submit" disabled={login.isPending}>
          {login.isPending ? c.submitting : c.submit}
        </Button>
      </form>
    </PageLayout>
  )
}
