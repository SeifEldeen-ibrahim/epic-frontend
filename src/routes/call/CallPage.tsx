import { Notice, PageLayout } from '../../ui'

export function CallPage() {
  return (
    <PageLayout title="Call" data-testid="call-page">
      <h1>Talk to the EPIC voice agent</h1>
      <p>Calls are recorded.</p>
      <Notice>Use fictional details only — this is a test line.</Notice>
      <p>Calling opens with the talking demo.</p>
    </PageLayout>
  )
}
