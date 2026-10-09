import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
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

/** Header around every signed-in staff page: a 4-item menu (Home, then Daily work / Setup / More
 * as dropdowns; one Menu button on phones), the user and Sign out. The changes bar shows on Setup
 * pages when there are changes that aren't live yet. */
export function AdminShell() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data && data.state !== 'signed-out' ? data.user : null
  const location = useLocation()
  const [open, setOpen] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({})
  const topId = useId()

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
          {
            key: 'more',
            label: adminCopy.navGroups.more,
            items: [
              ...(user?.role === 'admin'
                ? [
                    { key: 'settings', to: '/admin/settings', label: c.settings },
                    { key: 'languages', to: '/admin/languages', label: c.languages },
                    { key: 'exports', to: '/admin/exports', label: c.exports },
                    { key: 'audit', to: '/admin/audit', label: c.audit },
                  ]
                : []),
              account,
            ],
          },
        ]

  // Close every menu when the page changes (render-time reset; no effect needed).
  const [path, setPath] = useState(location.pathname)
  if (path !== location.pathname) {
    setPath(location.pathname)
    setOpen(null)
    setMenuOpen(false)
  }

  useEffect(() => {
    if (open === null && !menuOpen) return
    const onPointer = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpen(null)
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open, menuOpen])

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape') return
    if (open !== null) {
      const key = open
      setOpen(null)
      triggers.current[key]?.focus()
      e.stopPropagation()
    } else if (menuOpen) {
      setMenuOpen(false)
      menuButton.current?.focus()
      e.stopPropagation()
    }
  }

  const isActive = (group: NavGroup) =>
    group.items.some((i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`))

  return (
    <div className="admin-shell" data-testid="admin-shell">
      <header className="admin-shell__header">
        <div className="admin-shell__header-inner admin-shell__bar">
          <span className="admin-shell__brand">{APP_NAME}</span>
          <nav ref={navRef} className="admin-nav" data-testid="admin-nav" aria-label={adminCopy.navLabel} onKeyDown={onKeyDown}>
            <button
              ref={menuButton}
              type="button"
              className="admin-nav__menu-button"
              aria-expanded={menuOpen}
              aria-controls={topId}
              onClick={() => {
                setOpen(null)
                setMenuOpen((v) => !v)
              }}
              data-testid="admin-nav-menu"
            >
              {adminCopy.menu}
              <span aria-hidden="true" className="admin-nav__caret">
                ▾
              </span>
            </button>
            <ul id={topId} className={['admin-nav__top', menuOpen ? 'admin-nav__top--open' : ''].filter(Boolean).join(' ')}>
              {groups.map((group) => {
                if (group.label === null) {
                  return group.items.map((item) => (
                    <li key={item.key} className="admin-nav__item" data-testid={`admin-nav-group-${group.key}`}>
                      <NavLink className="admin-nav__top-link" to={item.to} end={item.to === '/admin'} data-testid={`admin-nav-${item.key}`}>
                        {item.label}
                      </NavLink>
                    </li>
                  ))
                }
                const expanded = open === group.key
                const listId = `${topId}-${group.key}`
                const active = isActive(group)
                return (
                  <li
                    key={group.key}
                    className={['admin-nav__item', 'admin-nav__group', active ? 'admin-nav__group--active' : ''].filter(Boolean).join(' ')}
                    data-testid={`admin-nav-group-${group.key}`}
                    data-active={active || undefined}
                  >
                    <button
                      ref={(el) => {
                        triggers.current[group.key] = el
                      }}
                      type="button"
                      className="admin-nav__trigger"
                      aria-expanded={expanded}
                      aria-controls={listId}
                      onClick={() => setOpen(expanded ? null : group.key)}
                      data-testid={`admin-nav-trigger-${group.key}`}
                    >
                      {group.label}
                      {active ? <span className="admin-sr-only"> {adminCopy.currentSection}</span> : null}
                      <span aria-hidden="true" className="admin-nav__caret">
                        ▾
                      </span>
                    </button>
                    <ul id={listId} className="admin-nav__list" hidden={!expanded}>
                      {group.items.map((item) => (
                        <li key={item.key}>
                          <NavLink className="admin-nav__link" to={item.to} end={item.to === '/admin'} data-testid={`admin-nav-${item.key}`}>
                            {item.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}
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
        <ShellChangesBar />
        <Outlet />
      </main>
    </div>
  )
}
