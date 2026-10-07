import { useEffect } from 'react'
import { Link } from 'react-router'
import { APP_NAME } from '../ui'
import { adminCopy } from './copy'

export function Forbidden() {
  useEffect(() => {
    document.title = `${adminCopy.forbidden.title} · ${APP_NAME}`
  }, [])
  return (
    <section className="admin-page" data-testid="forbidden">
      <h1>{adminCopy.forbidden.title}</h1>
      <p className="admin-muted">{adminCopy.forbidden.body}</p>
      <Link className="ui-link" to="/admin/queue">
        {adminCopy.forbidden.link}
      </Link>
    </section>
  )
}
