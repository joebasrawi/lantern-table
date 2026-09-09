# Browser turn notifications — implementation in progress

Railway supports explicit browser opt-in, encrypted Web Push delivery and a
notification-only service worker. This feature requires persistent VAPID keys and
`LANTERN_PUSH_ENABLED=true`; production rollout verification is recorded separately
in VERIFICATION.md. No subscription is created until a player turns notifications on.
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

## Delivery and browser support

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
3. The sender uses web-push 3.6.7 for VAPID signing and AES-128-GCM encryption,
   with a fetch transport that rejects redirects and aborts after eight seconds.
   Each message contains only a campaign ID; the worker displays generic text.
   Provider 404/410 removes the subscription, 429/5xx/network failures retry with
   backoff, and other rejection statuses stop that cue. Retry-After is respected
   with a one-day ceiling. Raw provider responses and subscription secrets are not
   logged. The browser notification tag and provider topic replace repeated cues.
4. The existing Railway minute interval now sends notifications independently of
   timed combat. A tick claims at most ten messages and stops starting new work
   after thirty seconds. `LANTERN_PUSH_PAUSED=true` temporarily pauses sends while
   preserving subscriptions. Normal closing of a game tab preserves its opt-in;
   signing out removes it. A provider accepting a message does not prove that the
   operating system displayed it; system settings can suppress delivery.
5. Safari on this Mac granted permission and registered a real subscription on a
   disposable local site. After the game tab was closed, another player submitted
   an action and the background sender recorded one provider-accepted delivery.
   Reopening preserved the opt-in; Turn off removed the subscription and queue.
   The actual macOS notification banner and a notification click were not observed.
   Physical phones, other browser providers and broader device coverage remain
   unverified. The in-app browser denied permission and showed the expected feedback.

## Operator setup

Generate a key pair once with `node -e "console.log(require('web-push').generateVAPIDKeys())"`
in a trusted private terminal. Set `LANTERN_VAPID_PUBLIC_KEY` and
`LANTERN_VAPID_PRIVATE_KEY` as private Railway variables, then set
`LANTERN_PUSH_ENABLED=true`. Keep the private key out of source and logs.
`LANTERN_VAPID_SUBJECT` may be an operator contact HTTPS URL or mailto address;
when omitted, the app uses its configured HTTPS `LANTERN_ORIGIN`. No purchased
custom domain is required. Preserve the pair across deployments; rotating keys
requires clearing old subscriptions and asking browsers to opt in again.

Existing account deletion and session revocation remove subscriptions automatically.
The account database, outbox and VAPID keys are part of the operator's private backup.
Cloudflare hosting currently returns notifications unavailable; this sender uses
Railway's persistent SQLite and minute background processor.

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

Six sender tests verify valid configuration, recipient decryption of real encrypted
requests, non-following redirects, provider failure classification, Retry-After,
revoked memberships/sessions, batch limits, overlapping ticks and late responses.
The HTTP test harness explicitly pauses outbound push delivery and uses disposable
keys, so routine CI never contacts a browser provider.
