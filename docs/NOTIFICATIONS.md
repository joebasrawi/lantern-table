# Browser turn notifications — implementation in progress

Notifications are not yet available in the hosted game. An authenticated Railway
subscription API, explicit browser opt-in dialog and notification-only service
worker are implemented in source. Provider delivery and a scheduled sender are
not connected; production remains disabled.
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
outbox. The subscription API creates these tables when used. Registration is disabled
unless the operator explicitly enables push and configures both VAPID keys. The queue only selects subscribed campaign members who have
an actionable cue. Ordinary saves preserve the existing delivery status. Resolved
work disappears; a different cue replaces an old item and invalidates its delivery
claim. Malformed campaign state cannot send an alert or block healthy campaigns.

Each claim checks current membership, host ownership and game state again. A
120-second lease prevents two workers from claiming the same item concurrently.
Failed delivery backs off, with at most five attempts per cue. A late response cannot
acknowledge a replacement claim or turn. Subscription removal, account deletion, session revocation and
membership removal cascade pending work. Registration binds to a verified active
login session. Expired or legacy unbound subscriptions are removed before refresh
and claim. Signing in again with an existing session cookie revokes that browser’s
previous session and subscription, including when switching accounts. Operators must keep SQLite foreign keys
enabled, as the existing Railway storage adapter does.

The queue provides at-least-once delivery attempts, not exactly-once notifications:
a process can crash after a provider accepts a message but before recording success.
The service worker uses a stable campaign notification tag to replace retries.
Messages always show generic text, never provider-supplied story content. A browser may still receive an alert just after someone
resolves the turn. Opening the game must always load current authorized state.

## Required next integration

1. Subscription API implemented: authenticated GET configuration and POST
   subscribe/status/remove, exact Origin checks, a streamed 4 KiB body limit,
   valid P-256 keys, supported HTTPS provider destinations, eight browsers per
   account and no cross-account takeover. Removal still works with push disabled.
   Destination support is currently Google FCM, Mozilla production push and Apple
   push subdomains. Unsupported providers fail closed. No provider requests occur
   during registration. Integrate this API with explicit browser opt-in.
2. Browser opt-in dialog implemented in the lobby, using the existing visual style.
   It requests permission only on Turn on, reports denied permission, and permits
   unsubscribe. Existing subscriptions can be turned off while delivery is paused.
   Setup carries the expected player identity; a changed sign-in is rejected.
   Login replacement, logout, password resets, session revocation and deletion
   invalidate session-bound subscriptions. Verify actual granted-permission
   subscription and unsubscribe on supported browsers before enabling production.
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

Five additional unit tests verify subscription key/endpoint validation, ownership,
limits, request controls and deletion races. The Railway multiplayer HTTP suite
exercises the real route with independent login cookies, registration, status,
foreign-origin rejection, cross-account takeover/removal rejection and unsubscribe.
These are API tests with disposable subscriptions; they do not send push messages.

Provider references: [Mozilla push endpoints](https://mozilla-services.github.io/autopush-rs/)
and [Apple Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).

Local browser verification: a disposable signed-in account opened the notification
dialog, displayed the explicit Turn on control, and received clear blocked-permission
feedback when the in-app browser denied the request. Escape closed the dialog and
returned focus to its trigger. No browser permission grant, actual subscription or
provider delivery was claimed. Service-worker tests cover generic content, stable
replacement tags and same-origin click handling. Session tests cover expiry,
sign-out, re-registration and switching accounts through the real auth handlers.
