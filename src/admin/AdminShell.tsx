import { NavLink, Outlet } from 'react-router'
import { useLogout, useSession } from '../api/auth'
import { APP_NAME, Button } from '../ui'
import { adminCopy } from './copy'

interface NavItem {
  key: string
  to: string
  label: string
}

const c = adminCopy.nav
const account: NavItem = { key: 'account', to: '/admin/account', label: c.account }

/** Header, wrapping nav and logout around every signed-in staff page. */
export function AdminShell() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data && data.state !== 'signed-out' ? data.user : null

  const items: NavItem[] =
    data?.state === 'must-change'
      ? [account]
      : [
          { key: 'queue', to: '/admin/queue', label: c.queue },
          { key: 'follow-up', to: '/admin/follow-up', label: c.followUp },
          { key: 'calls', to: '/admin/calls', label: c.calls },
          { key: 'reports', to: '/admin/reports', label: c.reports },
          { key: 'knowledge', to: '/admin/knowledge', label: c.knowledge },
          { key: 'agents', to: '/admin/agents', label: c.agents },
          { key: 'forms', to: '/admin/forms', label: c.forms },
          { key: 'versions', to: '/admin/versions', label: c.versions },
          ...(user?.role === 'admin'
            ? [
                { key: 'exports', to: '/admin/exports', label: c.exports },
                { key: 'audit', to: '/admin/audit', label: c.audit },
                { key: 'settings', to: '/admin/settings', label: c.settings },
              ]
            : []),
          account,
        ]

  return (
    <div className="admin-shell" data-testid="admin-shell">
      <header className="admin-shell__header">
        <div className="admin-shell__header-inner">
          <span className="admin-shell__brand">{APP_NAME}</span>
          <nav className="admin-nav" data-testid="admin-nav" aria-label={adminCopy.navLabel}>
            <ul className="admin-nav__list">
              {items.map((item) => (
                <li key={item.key}>
                  <NavLink className="ui-link admin-nav__link" to={item.to} data-testid={`admin-nav-${item.key}`}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="admin-shell__user">
            {user ? <span className="admin-shell__who">{user.display_name}</span> : null}
            <Button
              variant="secondary"
              data-testid="admin-logout"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              {logout.isPending ? adminCopy.loggingOut : adminCopy.logout}
            </Button>
          </div>
        </div>
        {logout.isError ? (
          <div className="admin-shell__header-inner">
            <p className="admin-shell__alert" role="alert">
              {adminCopy.logoutError}
            </p>
          </div>
        ) : null}
      </header>
      <main className="admin-shell__main">
        <Outlet />
      </main>
    </div>
  )
}
