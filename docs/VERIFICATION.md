# Verification against the requested game

This audit separates implemented behavior from evidence of the complete player experience. It is not a release-readiness claim. The original request is a minimal, immersive, browser-based RPG for friends, with persistent asynchronous play, configurable rules and characters, and AI or human dungeon masters.

| Requested behavior | Current evidence | What remains unverified or incomplete |
| --- | --- | --- |
| Open a website, sign in, start playing | Live Railway password sign-in, campaign/character endpoints, hosted owner browser login and saved return; original Sites and standalone Access evidence also retained | Private accounts and password changes work on Railway. Email recovery and optional signup await sender configuration and live delivery verification. Independent Cloudflare custom-domain sign-in remains untested. |
| Play with friends | HTTP tests create separate member sessions, join via invitation and reject outsiders | Railway supports separately provisioned friend accounts; a separately provisioned tester has received access. The production Railway runtime passed the complete HTTP multiplayer suite locally with three password-authenticated identities. Actual play by a second person and two simultaneous hosted browsers remain unverified. |
| Leave and return to take a turn | Campaign aggregate and membership persist in Railway SQLite or Cloudflare D1; HTTP and independent local browser-session checks verify saved return | Hosted reload and campaign-list reopen preserved story and character resources. Real multi-device browser sessions remain untested. |
| Turn pacing and configurable absence handling | Wait mode, timed opt-in defense, and host-managed defense with a separate opt-in; unit and HTTP tests verify authorization and duplicate protection | Offline defense passed standalone scheduled Worker tests and an actual Railway interval test. Railway has its background processor enabled; the private Sites preview has no scheduler. Notifications are not implemented. |
| AI or human DM | Human action queue/DM Desk; live AI exploration, travel/encounter proposal and old-memory checks; engine-owned resources | Live assisted-draft API privacy and reviewed publication are tested. Browser switching from AI to human DM, human narration, and queued-action resolution passed. Assisted draft preview, preserving existing text, accepting/editing, and explicit publication passed in the hosted browser; contextual guidance now explains the required pending-action selection. AI narrative quality needs broader playtesting. |
| Simple and advanced rules | Quickplay and Tactical rules; tests for turns, ranges, dice, energy, healing, votes and advancement | These are original rules, not a complete D&D/5e ruleset. Tactical content is intentionally limited. |
| Customizable characters | Species/concept/stat assignment, roles, identity edits, custom portraits, progression and host-reviewed named ability templates; ownership and persistence tests | Custom ability effects are currently Strike and Mend. Arbitrary rules scripting and AI portrait generation are unfinished. |
| Any era or custom world | Freeform campaign setting/premise; AI receives world context; characters and ability appearance can be themed | Hosts can upload private scene artwork for any era; host/member permissions and unchanged gameplay are tested. Presets are fantasy artwork. Automatic scene generation is not implemented. |
| Visible characters, fast simple graphics | Compact WebP art and portrait atlas; private image uploads; 2D tactical grid | Desktop Adventure rendering and character dialogs were inspected; tactical grid interaction passed. Readable views were inspected at 390×844. Physical-phone interaction, measured real-user performance and comprehensive accessibility remain unverified. Local HTTP timings do not prove real-user performance. |
| Minimal immersive interface | Adventure, Journal, Map, on-demand character/chat panels and host DM Desk are implemented | Desktop Adventure screenshot shows the minimal dark interface and artwork rendering without visible overlap. Journal, Map, character dialogs and DM Desk navigation passed; broader visual and interaction coverage remains. |
| Open-source project | MIT license, contribution guide, reproducible clean-source export and tested downloadable source snapshot; standalone build and hosting guide | Public source is available at https://github.com/joebasrawi/lantern-table. The previously supplied ZIP is a snapshot and does not automatically include later changes. Hosting portability supports Cloudflare and Railway with persistent SQLite/private images. |

## Evidence sources

- `tests/integration.mjs`: membership, privacy, stale writes, concurrent mutations, idempotency, human-DM flow, votes, reloads and settings handoff.
- `tests/progression-integration.mjs`, `tests/abilities-integration.mjs`, `tests/portrait-integration.mjs`, `tests/scene-integration.mjs`, `tests/host-pace-integration.mjs`: persistence and authorization for each complete feature flow.
- `tests/scheduler.test.mjs` and `tests/scheduler-integration.mjs`: consent, bounded processing, overlapping runs, failed saves and actual scheduled execution against local D1.
- `tests/access-auth.test.mjs` and `tests/standalone-integration.mjs`: signed identity validation and absence of test-session/header bypasses in standalone mode.
- `tests/ai-smoke.mjs`, `tests/ai-progression.mjs`, `tests/ai-memory.mjs`, `tests/assisted-integration.mjs`: opt-in paid live-provider checks. These are separate from the unit count.
- `tests/context.test.mjs`: older-history retrieval, bounded excerpts and exclusion of private notes/chat.
- `README.md` and `docs/SELF_HOSTING.md`: implemented rules, current limitations and deployment instructions.

The owner explicitly authorized browser testing. The hosted desktop run is documented in BROWSER_PLAYTEST.md. It used one existing signed-in owner session; fresh owner sign-in subsequently passed, but second-player access, multi-device behavior, and mobile accessibility remain unverified.

Broader roadmap items in PRODUCT.md, such as billing, voice/ambience and expanded content, are distinct from evidence for the current playable flow. They remain documented work; this audit does not silently substitute them for missing verification of the requested core experience.

## Railway deployment

A separate Railway deployment now supports Node 24, persistent SQLite and private images on a mounted volume, private provisioned accounts, and the shared deadline processor. See RAILWAY.md. The local production runtime passed authenticated HTTP creation/reload/portrait checks and a server-restart persistence check. Its actual interval processed one seeded consented expired turn. The hosted Railway service passed login, campaign/character creation, portrait upload/read, origin rejection, local-auth rejection, and logout. Sites campaign migration remains pending. A separate tester account was provisioned and authenticated successfully; it could not read the owner’s campaign before joining. Its login and invitation were emailed at the owner’s request. Actual play by a second person remains unverified.

## Railway multiplayer verification — 2026-09-07

`pnpm build:railway` followed by `node tests/railway-multiplayer.mjs` passed against the production Node runtime on localhost. The runner provisions three disposable accounts with independent random passwords and identities, creates isolated temporary storage, starts the built server, runs the shared integration suite through real login cookies, revokes sessions and removes test storage. It does not use real player accounts, production campaigns, or the AI provider.

Verified invitation joining, outsider rejection, host-only settings, private player/DM notes, pending actions and human-DM resolution, idempotent retries, stale/concurrent writes, unanimous voting, combat turn ownership, shared chat, custom profile edits without resource changes, host decisions without a character, and deferred rules handoff. A player logs out, is rejected with the revoked cookie, signs in again with a new cookie, and recovers the saved encounter turn and narration. All sessions are revoked at the end.

The same runner is now included after the Railway build in the repository CI workflow; this local run passed, but no remote CI run is claimed. This is production-runtime HTTP evidence, not a substitute for browser interaction or independent human playtesting.

### Hosted Railway browser and mobile view evidence

The September 7–8 browser run passed owner password sign-in, campaign-list reopen, and display of saved character, narration and pending vote. Settled 390×844 screenshots showed readable Adventure, Journal, Map, DM Desk and character views, with matching document/viewport width and an in-bounds character dialog. See BROWSER_PLAYTEST.md for the initial viewport capture artifact and the limits of this evidence. Physical devices, mobile combat/keyboard use, comprehensive accessibility and two independent hosted browsers remain unverified.

## Password changes — implementation under verification

Railway now has a signed-in password-change form linked from the campaign list. It requires the current password and matching new passwords of 12–200 characters, checks the request origin, reuses authentication attempt limits, conditionally updates the stored hash and revokes every session in one transaction. Provisioning preserves existing password hashes on later startups. A concurrent login cannot create a session using a hash replaced during password verification.

The 56-test suite passed with added checks for anonymous/cross-origin rejection, wrong current password, short/mismatched passwords, session revocation, old-password rejection, new-password login and persistence in a fresh process with the original provisioning environment. The production HTTP multiplayer test now also exercises password change and campaign recovery. Its updated run, final build and deployment verification are still pending; this entry does not claim the change is live.

### Password-change clean-build validation

Source `0330a9b` was reconstructed outside Documents from the previously verified source archive plus its committed patch; every file except the intentionally sanitized hosting metadata matched its Git blob. A fresh frozen-lockfile dependency installation passed typecheck, lint, all 56 unit tests, the Railway production build, and the full HTTP multiplayer runner including password change, session revocation, fresh login and preserved campaign access.

The original dependency installation is unreliable: its linter binary failed to execute and its build later failed loading React JSX exports. The independently installed, identical locked versions passed. Further local validation should use the clean checkout until the original installation is replaced. Railway deployment `49132925-0923-4217-9040-28a2aac22118` was dispatched from the verified clean source; hosted completion is being checked.

### Password-change Railway deployment verified

Deployment `49132925-0923-4217-9040-28a2aac22118` reached SUCCESS on September 8, 2026. The hosted saved-campaign check passed owner login, existing character and private portrait recovery, origin protection, rejection of development authentication and logout. The authenticated `/api/auth?password` form returned 200 with current/new/confirmation fields and no-store caching; anonymous access redirected to login. No production password was changed. The password-changing mutation and restart persistence were verified using disposable local accounts on the same built source. Self-service signup and email recovery remain unimplemented.

## Email recovery implementation awaiting sender setup

The recovery flow is implemented in source and tested with a fake mail API: hashed single-use expiring tokens, replacement links, concurrent reset consumption, existing-session revocation, password-change invalidation, rate limits, origin checks and failed delivery cleanup. The feature clears the account's prior login lockout on successful recovery. All 57 unit tests, typecheck, lint, Railway build and multiplayer HTTP checks passed in the clean validation checkout. No email service variables were present on Railway when inspected. Sender selection, live delivery, hosted deployment of this update, and browser reset completion remain pending. No real password-recovery email was sent.

## Unsent action drafts

Action text, roll checkbox and selected attribute now persist in browser local storage, keyed by player identity and campaign. The UI distinguishes an unsent device-local draft from a submitted campaign action. Drafts older than 30 days are ignored on load. Storage failures preserve the current in-memory text and display that it is not saved. The composer is disabled while a submission is resolving; failed submissions preserve the draft and successful submissions clear it. This is not cross-device draft synchronization.

The clean Railway build passed typecheck and lint. A disposable local browser account entered an action, enabled a check, selected intelligence and reloaded: all three values returned with the draft status. Sending the action cleared the composer; a second reload showed the persisted action/check in campaign history and an empty composer waiting for the human DM. Browser state was inspected through the actual UI. Hosted deployment verification remains pending.

### Draft deployment

Railway deployment `453d3a80-e3c7-4c3e-ac87-5e89ea7f57fa` reached SUCCESS with source `7cfd60b`. Hosted login, recovery of the existing campaign/character/private portrait, origin protection, development-auth rejection and logout passed after deployment. Draft interaction was verified in the local browser against the production build; no live campaign action was submitted for this check. Recovery code is included but remains unavailable without sender configuration.

## Draft submission race checks

A successful submission now clears only the draft snapshot that was submitted. New writes have distinct revisions, even if their text is identical. The completion handler checks the current in-memory snapshot and reads persisted storage before clearing, preserving a newer draft written in another tab before its storage event arrives. This is a best-effort browser-storage check, not a transactional cross-device draft service.

Three regression tests cover same-tab replacement, a simulated other-tab write with a delayed storage event, identical-text replacement, player/campaign isolation, normal clearing and unavailable storage. All 60 tests, typecheck, lint and Railway build passed in the clean checkout. This follow-up has not yet been verified on the hosted service.

Draft-race fix deployment `3e68bb02-d02d-43af-acff-c48112d9949f` reached SUCCESS. The hosted saved-campaign smoke test passed afterward. Source `3c21f8b` was packaged into `lantern-table-source-3c21f8b.zip`; all 165 files matched their committed blobs except intentionally sanitized hosting metadata, and archive integrity/credential-pattern checks passed. Cross-tab race behavior is covered by regression tests, not a claim of two independent hosted browser playtesting.

## Independent-session browser loop verified

See BROWSER_PLAYTEST.md for the September 8 local two-origin test. Independent host/player sessions completed browser login, shared campaign open, player action submission, host polling update, player logout, human-DM response while the player was away, and fresh player login/reopen with saved narration and catch-up count. The player had no DM Desk navigation. This improves the UI evidence beyond the earlier HTTP suite; hosted same-origin multi-browser play and physical devices remain unverified.

## Verified-email signup implementation

The source now supports optional signup with email verification before name/password selection. `tests/signup.test.mjs` intercepts the mail API and verifies disabled/unconfigured states, hashed proof tokens, no account before verification, one account under concurrent completion, expiry, token replacement/replay rejection, account preservation, no implicit campaign membership, successful password login, rate limits, cross-origin rejection and provider-failure cleanup. All 61 tests, typecheck, lint, Railway build and multiplayer HTTP checks passed in the clean checkout.

This signup update is committed but not yet deployed. No real registration email was sent, and the private Railway signup setting remains unchanged. Sender configuration, delivery verification and browser completion remain outstanding. Email recovery has the same external sender dependency.

### Closed-registration deployment verified

Deployment `fa5a3a11-1842-45fd-bf8e-3788d2d546e0` succeeded with source `97a7d78`, including optional signup code. Post-deploy checks passed existing owner authentication and saved campaign/character/portrait access. Signup returned 503 with “Registration is closed,” recovery returned 503 with its unconfigured explanation, and the sign-in page did not offer Create an account. Public registration was not enabled and no messages were sent.

The private playable milestone is available. Enabling and verifying real email onboarding/recovery requires the owner's sender/domain and email-service setup; the outstanding sender question has not been answered. This is an external integration dependency, not a claim that the full product or public release is complete. Broader physical-device/accessibility checks and public-launch roadmap work remain recorded above.

## Selected-state accessibility

Controls for world, character creation mode, portraits, character sections, journal filters/entries, party votes, movement mode, enemy targets and pending DM actions now expose their selection through `aria-pressed`. Main campaign navigation already used `aria-current`; error alerts and visible keyboard focus styling were present. No visual layout or rules changed.

Typecheck, lint and Railway build passed. In the local production browser, the campaign dialog exposed Fantasy as selected. Starting from its Close button, Tab/Tab/Space selected Science fiction; the accessibility tree reported the new state and updated campaign fields. Escape closed the dialog and focus returned to New campaign. No campaign was created during this check. This verifies a representative keyboard/selection flow, not comprehensive screen-reader or WCAG conformance.

Railway deployment `08ea0b96-6acc-4d8f-a17a-840b394f51e2` reached SUCCESS with source `28fec66`. The hosted saved-campaign check passed login, campaign/character persistence, private portrait recovery, origin protection, development-auth rejection and logout. Keyboard selection behavior was verified locally as described above; no production campaign action was submitted.

## Public source release — September 8, 2026

The MIT-licensed source is published at https://github.com/joebasrawi/lantern-table with fresh history. The 167-file export was checked against local committed blobs, excluding intentionally sanitized hosting identity; no account files, database, environment secrets or private Git history were included. Public documentation omits tester names and corrects stale portrait-storage and assisted-browser descriptions. The public commit includes the deployed gameplay and authentication implementation. GitHub Actions runs typecheck, lint, unit tests, both hosting builds and the Railway multiplayer HTTP suite; its first remote result is being verified. Public source availability does not enable public registration or complete the broader product roadmap.

Public commit `320fec25e7553ef04ee2c358f0b1a211f7a4981b` passed GitHub Actions run `34251483529`: frozen installation, typecheck, lint, all 61 unit tests, standalone build, Railway build and password-authenticated multiplayer HTTP verification. The public repository reports PUBLIC visibility and MIT licensing. The public checkout is maintained separately from the private historical checkout to prevent publishing private hosting metadata or old history.

## Character build changes — September 8, 2026

Players can change their role and reassign the standard attribute array through an expandable editor in their own Abilities tab. The server rejects changes during encounters, decisions, pending actions, or unconsciousness. Role changes preserve earned vitality/focus capacity and all other progress; health is clamped to the new maximum without restoring resources. Identity, possessions and approved abilities remain unchanged. Shared history records the new build.

Typecheck, lint, all 65 unit tests, the Railway build and multiplayer HTTP tests passed. Four new unit tests cover preserved progression/injuries, repeated role changes without healing, forged values, invalid budgets, unchanged builds, identity isolation and active-play restrictions. HTTP checks cover own-character enforcement, no-character rejection, ignored forged resources, request retry idempotency, blocked changes during a vote and persistent reload.

A disposable local browser character changed Wayfinder to Arcanist and Intelligence 8 to 15. The editor swapped Charisma 15 to 8 and previewed 16/16 health. After Save build and browser reload, the character showed the new role and scores, 16/16 health, unchanged 3/3 energy, and a saved shared-history event. The expanded desktop editor was visually inspected. No real player character was changed; hosted deployment verification is pending.

Build-editor deployment `ffea4d9f-6897-434f-a061-a7976b226c66` reached SUCCESS. The hosted saved-campaign check passed login, character/campaign persistence, private portrait recovery, origin protection, development-auth rejection and logout. Public source commit `7180e058995bd9b6fae47e5c19f529634f75704e` passed GitHub Actions run `34252380998`, including both hosting builds and the multiplayer HTTP suite. The build-changing browser mutation was tested locally with a disposable character; no production character build was changed.

## Returning-player campaign attention — September 8, 2026

Campaign summaries now expose a member-specific label and action-needed flag. The calculation covers combat ownership, voted/unvoted party decisions, host-decides votes including hosts without characters, human/assisted DM queues, ability review, onboarding, and recovery. It returns no private text. The list refreshes every 15 seconds while visible and on focus/visibility return, with overlapping requests prevented and late responses ignored after leaving the list.

Typecheck, lint, all 70 unit tests, the Railway build and multiplayer HTTP checks passed. Five new unit tests exercise attention precedence, vote zero handling, characterless hosts, unconscious recovery votes, privacy and read-only behavior. HTTP checks verify member-filtered lists, no private notes/action text/invite in summaries, DM attention, pending votes and combat ownership.

A local browser host stayed on the campaign list while a separately authenticated player session submitted an action through HTTP. Without navigation or reload, the visible list changed from “Ready to guide the adventure · 2 new events” to “Resolve player actions · 3 new events” after the refresh interval. The desktop row layout was visually inspected. This verifies in-app refresh, not email delivery or background push notifications. Hosted deployment verification is pending.

Campaign-attention deployment `db714132-7389-4f55-84fe-f290a2d2f004` reached SUCCESS. GitHub Actions run `34253147015` passed for public commit `a793d9c27a302b6f508bae147e304c0083fbdeaf`, including 70 unit tests, both hosting builds and multiplayer HTTP checks. The hosted check confirmed typed member-specific attention labels without raw state or invitation fields, then passed saved campaign/character/portrait recovery, origin protection, development-auth rejection and logout. No live campaign action was submitted. A transient Railway status response decoding error was retried against the same deployment, which then reported SUCCESS; no duplicate deployment was created.

## Font asset loading regression — September 8, 2026

A live-page audit found both font preloads returning 404. Inline font CSS and preloads contained absolute paths from the development machine. Vinext caches downloaded font CSS with absolute paths and rewrites the current cache-directory prefix during build; copying a cache from another directory into Docker left the old prefix unreplaced. The Docker ignore file now excludes `.vinext` so the container creates its own font cache.

The new `tests/font-integration.mjs` reads the page’s actual preload and inline CSS URLs, requires same-origin public asset paths, fetches every emitted font, and checks WOFF2 bytes rather than accepting a fallback HTML response. It reproduced the hosted failure before the fix. Against the existing local production build, both preloads and all 12 font files passed. The font check is now part of the Railway multiplayer runner and therefore remote CI. Lint and the complete multiplayer runner passed locally; the application source and rules were unchanged. Hosted fix verification is pending.

The audit also measured local build artifacts: the main game chunk was about 115 KB before transfer compression and the two artwork files together about 264 KB. These artifact sizes do not establish real-user load time or mobile responsiveness; no general speed claim is made from them.
