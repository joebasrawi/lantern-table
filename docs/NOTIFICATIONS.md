# Browser turn notifications — implementation in progress

Notifications are not yet available in the hosted game. No subscription endpoint,
permission prompt, service worker, delivery provider or scheduled sender is enabled.
The Railway application continues to use in-app attention cues. This work does not
require signup email delivery or purchasing a domain.

## Implemented server foundation

`lib/game/notification-cue.ts` derives a stable reason to notify from committed game
state. Combat cues identify the encounter and round/initiative slot. Decision cues
identify the vote and host-versus-party policy. Human and assisted DM cues identify
the first unresolved action in a batch. Ability-review and host-handoff cues follow
the same visibility rules as the campaign list. Character creation does not trigger
an alert. Cues and labels contain no campaign title, story, chat, character names or
private notes.

`lib/railway/notification-queue.ts` defines an opt-in subscription table and durable
outbox. These tables are not created in the running application yet. A future
registration handler must authenticate the user, validate the subscription and
insert it explicitly. The queue only selects subscribed campaign members who have
an actionable cue. Ordinary saves preserve the existing delivery status. Resolved
work disappears; a different cue replaces an old item and invalidates its delivery
claim. Malformed campaign state cannot send an alert or block healthy campaigns.

Each claim checks current membership, host ownership and game state again. A
120-second lease prevents two workers from claiming the same item concurrently.
Failed delivery backs off, with at most five attempts per cue. A late response cannot
acknowledge a replacement claim or turn. Subscription removal, account deletion and
membership removal cascade pending work. Operators must keep SQLite foreign keys
enabled, as the existing Railway storage adapter does.

The queue provides at-least-once delivery attempts, not exactly-once notifications:
a process can crash after a provider accepts a message but before recording success.
The eventual service worker must use a stable per-subscription/campaign notification
tag to replace retries. A browser may still receive an alert just after someone
resolves the turn. Opening the game must always load current authorized state.

## Required next integration

1. Add an authenticated, same-origin, size-limited subscription API with browser
   ownership, subscription-count limits, unsubscribe and validated push-service
   endpoints. Never accept arbitrary destinations for server-side requests.
2. Add explicit per-browser opt-in. Request permission only from the user's action;
   explain unsupported or denied permission and allow unsubscribing. Handle a shared
   browser switching accounts without retaining another account's subscription.
3. Configure persistent VAPID keys privately, encrypt provider payloads with the
   established Web Push library, and handle invalid subscriptions and retryable
   provider failures. Do not log endpoint secrets or private keys.
4. Connect a bounded scheduled sender independent of timed combat. Use short generic
   messages, stable tags and same-origin navigation. Subscribe only after explicit
   opt-in; do not send an unsolicited test to existing players.
5. Verify authenticated API controls, real browser subscription/unsubscribe, a turn
   while the tab is closed, expiry/revocation, membership and account deletion,
   and notification clicks that reload current state. Real device support remains
   unverified until exercised.

Nine focused tests cover cue identity/privacy, role visibility, deduplication,
committed-state rechecks, cascading revocation, lease recovery, stale responses,
bounded retries, corrupted-state isolation and independent database connections.
These tests prove the queue behavior, not end-to-end browser delivery.
