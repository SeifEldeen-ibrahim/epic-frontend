# Component-specific documentation

Only document frontend implementation details here: local internals, generated artifacts,
migration mechanics, or operational notes that do not define product behavior.

Shared product requirements, architecture decisions, feature plans and project memory belong in the
`epic` control repository at `../DOCS/`, `../planning/` and `../memory/`. Do not duplicate
them here.

## Clinic session swap (`src/routes/call/useCall.ts`)

- A `session_swap` call event (or a live status with `pending_session_seq`, seen by the status
  poll, a status check, or a failed/disconnected peer) starts one swap per seq: a second
  `RTCPeerConnection` with the same mic tracks (no new `getUserMedia`, tracks never stopped), a
  new offer to `POST /api/calls/{id}/sessions`, then the answer is applied and the old peer's
  handlers are nulled and it is closed. The screen stays On call; nothing visible changes.
- Per-peer guards: a peer's handlers act only while it is the current peer or the pending peer
  of the swap, on the same call. Stale or duplicate seqs, a swap in progress, and a crisis are
  ignored; a failed seq is not retried.
- What ends the call: never a swap failure (409/503/15 s deadline/exception just drop the pending
  peer and check the status). A 404 on the answer, an ended status, or (for a failed current
  peer) a live status without a pending swap ends it via the normal paths; the server ends the
  call itself if the swap is not answered within 15 s. End, crisis and pagehide abort the swap
  request and close both peers.
