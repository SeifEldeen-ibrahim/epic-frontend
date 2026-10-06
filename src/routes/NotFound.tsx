import { Link } from 'react-router'
import { PageLayout } from '../ui'

export function NotFound() {
  return (
    <PageLayout title="Page not found" data-testid="not-found">
      <h1>Page not found</h1>
      <p>There is no page at this address.</p>
      <Link className="ui-link" to="/call">
        Go to the call page
      </Link>
    </PageLayout>
  )
}
