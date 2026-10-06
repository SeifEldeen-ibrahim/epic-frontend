import { useHealth } from '../../api/health'
import { PageLayout } from '../../ui'
import { StatusCard } from './StatusCard'

export function AdminPlaceholder() {
  const health = useHealth()
  return (
    <PageLayout title="Admin" data-testid="admin-placeholder">
      <h1>Staff area</h1>
      <p>Staff pages arrive with the admin site.</p>
      <StatusCard
        isLoading={health.isPending}
        error={health.error}
        data={health.data}
        onRetry={() => void health.refetch()}
      />
    </PageLayout>
  )
}
