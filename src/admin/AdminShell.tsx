import { NavLink, Outlet } from 'react-router'
import { useLogout, useSession } from '../api/auth'
import { APP_NAME, Button } from '../ui'
import { ShellChangesBar } from './ChangesBar'
import { adminCopy } from './copy'

interface NavItem {
  key: string
  to: string
  label: string
}

interface NavGroup {
  key: string
  label: string | null
  items: NavItem[]
}

const c = adminCopy.nav
const account: NavItem = { key: 'account', to: '/admin/account', label: c.account }

/** Header, grouped nav and logout around every signed-in staff page; the changes bar shows on
 * Setup pages when there are changes that aren't live yet. */
export function AdminShell() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data && data.state !== 'signed-out' ? data.user : null

  const groups: NavGroup[] =
    data?.state === 'must-change'
      ? [{ key: 'account', label: null, items: [account] }]
      : [
          { key: 'home', label: null, items: [{ key: 'home', to: '/admin', label: c.home }] },
          {
            key: 'daily',
            label: adminCopy.navGroups.daily,
            items: [
              { key: 'queue', to: '/admin/queue', label: c.queue },
              { key: 'follow-up', to: '/admin/follow-up', label: c.followUp },
              { key: 'calls', to: '/admin/calls', label: c.calls },
              { key: 'reports', to: '/admin/reports', label: c.reports },
            ],
          },
          {
            key: 'setup',
            label: adminCopy.navGroups.setup,
            items: [
              { key: 'knowledge', to: '/admin/knowledge', label: c.knowledge },
              { key: 'departments', to: '/admin/departments', label: c.departments },
              { key: 'forms', to: '/admin/forms', label: c.forms },
              { key: 'agents', to: '/admin/agents', label: c.agents },
              { key: 'versions', to: '/admin/versions', label: c.versions },
            ],
          },
          ...(user?.role === 'admin'
            ? [
                {
                  key: 'more',
                  label: adminCopy.navGroups.more,
                  items: [
                    { key: 'settings', to: '/admin/settings', label: c.settings },
                    { key: 'exports', to: '/admin/exports', label: c.exports },
                    { key: 'audit', to: '/admin/audit', label: c.audit },
                  ],
                },
              ]
            : []),
          { key: 'account', label: null, items: [account] },
        ]

  return (
    <div className="admin-shell" data-testid="admin-shell">
      <header className="admin-shell__header">
        <div className="admin-shell__header-inner">
          <span className="admin-shell__brand">{APP_NAME}</span>
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
        <div className="admin-shell__header-inner">
          <nav className="admin-nav" data-testid="admin-nav" aria-label={adminCopy.navLabel}>
            {groups.map((group) => (
              <div key={group.key} className="admin-nav__group" data-testid={`admin-nav-group-${group.key}`}>
                {group.label ? (
                  <span className="admin-nav__group-label" id={`admin-nav-${group.key}-label`}>
                    {group.label}
                  </span>
                ) : null}
                <ul className="admin-nav__list" aria-labelledby={group.label ? `admin-nav-${group.key}-label` : undefined}>
                  {group.items.map((item) => (
                    <li key={item.key}>
                      <NavLink
                        className="ui-link admin-nav__link"
                        to={item.to}
                        end={item.to === '/admin'}
                        data-testid={`admin-nav-${item.key}`}
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
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
        <ShellChangesBar />
        <Outlet />
      </main>
    </div>
  )
}
