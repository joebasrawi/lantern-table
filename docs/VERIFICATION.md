# Verification against the requested game

This audit separates implemented behavior from evidence of the complete player experience. It is not a release-readiness claim. The original request is a minimal, immersive, browser-based RPG for friends, with persistent asynchronous play, configurable rules and characters, and AI or human dungeon masters.

| Requested behavior | Current evidence | What remains unverified or incomplete |
| --- | --- | --- |
| Open a website, sign in, start playing | Live Railway password sign-in, campaign/character endpoints, hosted owner browser login and saved return; original Sites and standalone Access evidence also retained | Private accounts and password changes work on Railway. Email recovery and optional signup await sender configuration and live delivery verification. Independent Cloudflare custom-domain sign-in remains untested. |
| Play with friends | HTTP tests create separate member sessions, join via invitation and reject outsiders | Railway supports separately provisioned friend accounts; a separately provisioned tester has received access. The production Railway runtime passed the complete HTTP multiplayer suite locally with three password-authenticated identities. Actual play by a second person and two simultaneous hosted browsers remain unverified. |
| Leave and return to take a turn | Campaign aggregate and membership persist in Railway SQLite or Cloudflare D1; HTTP and independent local browser-session checks verify saved return | Hosted reload and campaign-list reopen preserved story and character resources. Real multi-device browser sessions remain untested. |
| Turn pacing and configurable absence handling | Wait mode, timed opt-in defense, and host-managed defense with a separate opt-in; unit and HTTP tests verify authorization and duplicate protection | Offline defense passed standalone scheduled Worker tests and an actual Railway interval test. Railway has its background processor enabled; the private Sites preview has no scheduler. The campaign list now shows member-specific next-action cues and unread events with automatic refresh. Outbound notifications remain unimplemented. |
| AI or human DM | Human action queue/DM Desk; live AI exploration, travel/encounter proposal and old-memory checks; engine-owned resources | Live assisted-draft API privacy and reviewed publication are tested. Browser switching from AI to human DM, human narration, and queued-action resolution passed. Assisted draft preview, preserving existing text, accepting/editing, and explicit publication passed in the hosted browser; contextual guidance now explains the required pending-action selection. AI narrative quality needs broader playtesting. |
| Simple and advanced rules | Quickplay and Tactical rules; tests for turns, ranges, dice, energy, healing, votes and advancement | These are original rules, not a complete D&D/5e ruleset. Tactical content is intentionally limited. |
| Customizable characters | Species/concept/stat assignment, editable roles and attributes, identity edits, custom portraits, progression and host-reviewed named ability templates; ownership and persistence tests | Custom ability effects are currently Strike, Mend and Guard. Arbitrary rules scripting remains unfinished. Generated portrait preview/save/reload passed with one real provider request; broader art-quality playtesting remains. |
| Any era or custom world | Host-editable campaign name, setting and premise between resolved actions; AI receives current world context; characters and ability appearance can be themed | Hosts can upload private scene artwork for any era; host/member permissions and unchanged gameplay are tested. Presets are fantasy artwork. Host-initiated scene preview/save is implemented; automatic backdrop updates after travel are not. |
| Visible characters, fast simple graphics | Compact WebP art and portrait atlas; private image uploads and optional generated portraits; 2D tactical grid | Desktop Adventure rendering and character dialogs were inspected; tactical grid interaction passed. Readable views were inspected at 390×844. Physical-phone interaction, measured real-user performance and comprehensive accessibility remain unverified. Local HTTP timings do not prove real-user performance. |
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

Font-cache fix deployment `dd6336be-e339-4d01-9a97-3ad5b5271f05` reached SUCCESS. The same font check that failed on the old deployment passed live: both preload URLs and all 12 emitted font assets now use public paths and return WOFF2 bytes. Saved campaign/character/private portrait recovery, origin protection, development-auth rejection and logout passed afterward. GitHub Actions run `34253724566` passed for public commit `e91cc8673626442787b27937c7b75d2e1a8e32dc`, including the new font check. This proves the broken font requests were fixed; it is not a measured real-user speed improvement.

## Editable campaign world — September 8, 2026

Hosts can revise the campaign name, world/era and premise after resolving current play. Validation completes before mutation; unchanged or invalid fields are rejected, and saved location, journal, characters, settings and earlier events are preserved. A shared event records the revision. The existing narration context reads the updated world and premise.

Typecheck, lint, all 73 unit tests, the Railway build, font checks and multiplayer HTTP suite passed. New engine tests verify atomic validation, active-play restrictions, preserved data and updated narration context. HTTP checks verify host-only authorization, unchanged characters/journal, saved return, renamed list entries and rejected edits during a vote.

In a disposable local browser campaign, the host edited all three fields and saved. The settings dialog closed with a success notice and focus returned to Campaign settings. Shared history recorded the revision while the location and member’s 20/20 health stayed unchanged. Reloading and reopening World and premise displayed the saved values. No real campaign was edited. Hosted deployment verification is pending.

World-editor deployment `fc76c6d9-956d-4cff-945a-94adb6498fd7` reached SUCCESS. GitHub Actions run `34254399349` passed for public commit `623f569f49c25fad1067bac9c5f62658a4bf2c9b`. Hosted font preloads and all 12 font assets passed, followed by saved campaign/character/private portrait recovery, origin protection, development-auth rejection and logout. The editing mutation was verified locally with a disposable campaign; no production campaign world was changed.

## Human-DM onboarding and chat — September 8, 2026

Human/assisted campaign creation now skips the player-character builder. Characterless human/assisted hosts see a DM welcome and direct DM Desk action; creating a character remains optional. Party chat permits a characterless host, labels messages DM/Host according to mode, and still uses the existing membership guard. Non-host members without characters and all characterless player actions remain rejected.

Typecheck, lint, the Railway build, font assets and multiplayer HTTP checks passed. Added integration assertions verify a host message reaches another member, has the DM label, and creates neither a character nor pending action; characterless member chat and host player actions are rejected. No rules engine changes were made.

The local browser test created a human-led campaign from the normal New campaign form. It arrived directly at Adventure with no character-builder dialog, sent a Party chat message labeled “Draft tester (DM),” and opened DM Desk through the new welcome action. No live player message was sent. Hosted deployment verification is pending.

Characterless-DM deployment `28402cc5-2863-444e-8913-81303aa0dbd9` reached SUCCESS. GitHub Actions run `34265211405` passed for public commit `23647091172f7f35eea2460fb60e3049c8988f4a`, including the 73-test suite, both hosting builds, font checks and multiplayer integration. Hosted font assets and saved campaign/character/private portrait recovery passed, along with origin protection, development-auth rejection and logout. The DM creation/chat browser flow was tested locally with a disposable account; no production chat message was sent.

## Current release audit — September 8, 2026

The previous goal turn made progress: characterless human-DM onboarding and chat were implemented, browser-tested, published and verified after deployment. This audit rechecked source parity, remote CI and actual configuration rather than treating those prior statements as sufficient evidence.

The public and private checkouts have identical application, tests and configuration except intentionally sanitized hosting identity; the verification log has newer local deployment evidence. GitHub run `34265211405` confirms the current application passed 73 unit tests, typecheck, lint, both hosting builds, real-session multiplayer checks and font asset checks. The latest completed Railway deployment is recorded above. The requirements table covers the implemented private play loop and its remaining evidence limits; it does not claim full product completion.

Configuration inspection found no `RESEND_API_KEY`, `LANTERN_MAIL_FROM`, or enabled signup flag. The AI key and background-turn setting are configured. Thus actual signup/recovery delivery is an external integration dependency: an authorized sender/domain and private provider configuration are needed before live validation. No key values were printed or placed in source, and public signup was not enabled.

Remaining work from PRODUCT.md is preserved: live email onboarding/recovery, generated character art, richer rule content, notifications, account lifecycle and usage/billing controls, and comprehensive multi-device validation. The new editable builds/worlds and in-app attention cues address customization and asynchronous return but do not substitute for those requirements. The latest public source release should be used in place of the earlier downloaded snapshot.

Release `v0.2.0` packages public source `34ddf4d540c8a6f537ad921cef3ad152f0e7babc`, verified by successful GitHub run `34265607573`. The downloadable archive passed credential-pattern and ZIP integrity checks (SHA256 `33ea9222f32811d41b082a8f99f2ec1058a7a85243ae1016814493f05a230987`). The owner confirmed that no sending domain is owned yet; registration/recovery remain disabled while existing private accounts continue to work. No domain was purchased and no provider account or sending identity was invented.

## Host-defined enemy combat values — September 8, 2026

Hosts can set bounded health, armor, attack bonus and damage when creating encounters. Values persist on enemy records; enemy turns use the saved attack bonus and damage. Old records without those fields use the existing +3/4 defaults. AI proposals still use the standard profile. Player target details expose the values, and XP remains 25 per completed encounter rather than scaling automatically with custom difficulty.

Typecheck, lint, all 76 unit tests, the Railway build, font checks and multiplayer HTTP suite passed. New unit checks cover actual custom damage, negative bonuses and misses, legacy defaults, invalid bounds/types/counts and atomic rejection. The HTTP suite verifies host permission, invalid-stat rejection and shared persistent values. An initial integration-test ordering error was corrected before the successful rerun; no application workaround was needed.

In a disposable local browser campaign, the host expanded Enemy combat values, set two Clockwork sentinels to 37 health, 17 armor, +6 attack and 9 damage, and started the encounter. Adventure showed both enemies with 37 health and the selected target’s complete configured values. The host had no player character and could not take the player’s combat turn. No real campaign was changed. Hosted deployment verification is pending.

Custom-enemy deployment `b23e801e-7b74-4d4c-9682-bf492122c82a` reached SUCCESS. GitHub Actions run `34266308319` passed for public commit `e03110f1828a8f22b907619b4fbef0c87b589eb8`. Hosted font assets, saved campaign/character/private portrait recovery, origin protection, development-auth rejection and logout passed afterward. New encounters were exercised only with disposable local campaigns; no production encounter was started.


### Scoped stylesheet generation

Restricted Tailwind source discovery to the application directory, excluding unused generated components. Production build passed. CSS decreased from 147,096 to 21,820 raw bytes (85.2%); local gzip decreased from 24,864 to 5,760 bytes. These are asset sizes, not measured page-speed improvements. Browser checks against the production build confirmed campaign list, Adventure, tactical grid, selected enemy controls, and character dialog rendering. No gameplay behavior changed.

Deployment verification: Railway `0be883a0-a0e9-4a1e-8ade-cd07411c6098` succeeded for public source `630f87426a05bb70cb74cc994fd95a5b483e9458`. GitHub Actions run `34267255646` passed all checks. Live CSS `/_next/static/css/index.BLPn0rAg.css` is 21,820 bytes, versus the previous live 147,096 bytes. Live font integration passed both preloads and all 12 font assets. Saved-campaign regression passed login, character/campaign persistence, exact private portrait bytes, origin protection, local-auth rejection, and logout. Disposable browser-test server stopped.


### Persistent server-wide AI allowance

Added a default 100-request UTC-day allowance shared by AI and assisted narration, configurable through LANTERN_AI_DAILY_LIMIT (0 pauses). SQLite-backed unit checks prove competing reservations cannot exceed a cap, persistence across a fresh process, safe allowance changes, invalid configuration rejection, and rollover without resetting on an older timestamp. All 78 unit tests, typecheck, lint and Railway build passed. Multiplayer HTTP checks with a placeholder key and AI paused verify 429 and exact unchanged campaign state/version after a rolled action; existing human-DM and multiplayer checks pass. No paid provider call was needed. The first HTTP fixture used an invalid attribute name; correcting it to intelligence exercised the intended path successfully. This is a request-count safeguard, not comprehensive billing/token accounting.

Deployment `9a64896b-e1b9-4ce8-b870-90b5630dc899` succeeded on Railway for public source `9d3b0d3caecfc61b0e65b747f051040d2fac202f`. GitHub Actions `34267837259` passed all checks, including both hosting builds and the paused-AI HTTP regression. Live font and saved-campaign integration passed after deployment. The quota boundary itself was exercised on disposable local storage, not by exhausting the production allowance; no new paid AI request was made in this change.


### Editable equipment and party item transfers

Implemented host grants/removals and owner-only transfers through persistent campaign mutations. Unit tests prove item conservation, usable transferred healing kits, host authorization, invalid/stale indices and names, carrying limits, conscious recipients, and blocking during shared unresolved play without partial state changes. Narration context includes bounded current inventory. All 81 unit tests passed; typecheck, lint and Railway build passed. Multiplayer HTTP checks verify forbidden player grants/foreign-inventory transfers, saved recipient inventory, request-id retry without duplication and stale-version rejection.

Browser checks on a disposable production build granted custom equipment, transferred a healing kit, reloaded after server restart with persisted history/inventory, and removed selected equipment. The final grant/removal feedback was visible and keyboard focus returned to Item name; expanded DM controls remained open. Initial test-fixture mistakes (encounter turn field and missing sort comparator) were corrected; no engine behavior was relaxed for the tests. Custom gear remains descriptive and does not constitute expanded weapon/armor rules.

Deployment `3c03d4b5-50d9-41bf-8210-6fff24740774` succeeded on Railway for public source `e4b940aaa4bd2a1f6f9595c2b69189e426b3eb22`. GitHub Actions `34269128195` passed typecheck, lint, 81 tests, both builds, fonts and multiplayer HTTP checks. Live login, saved campaign/character, private portrait, origin protections, logout, both font preloads and all 12 font assets passed after deployment. Browser mutations used disposable local campaigns; production player inventories were not modified for verification. Temporary browser tabs and servers were closed.


### Accepted campaign host handoff

Added offer/accept/cancel workflow restricted to current host and nominated existing member. Host identity, invitation rotation, shared state, history and version save atomically under the existing campaign lease. Three unit cases cover acceptance, private/shared note boundaries, unauthorized/nonmember/self/duplicate nominations, cancellation and unresolved-play blocks. All 84 unit tests, typecheck, lint, and Railway build passed. Multiplayer HTTP checks verify old-host API denial, new-host privileges without a character, saved membership, private-note filtering, old invitation rejection/new invitation acceptance, and idempotent acceptance retaining the same new invitation.

Two separately authenticated browser origins verified host nomination, nominee attention cue, Adventure review prompt, explicit acceptance, newly enabled campaign controls, and former-host return without DM Desk. The shared journal preserved the handoff. No production campaign authority changed during these tests. Temporary browser tabs and test servers were closed. This does not implement campaign departure or account deletion.

Railway deployment `c22df017-bcad-46d1-93d1-7143a917ead1` succeeded for public source `b2425d2fbc5e620c4bc46079063d508a54b7f6d4`. GitHub Actions `34270146770` passed all checks including 84 tests, both builds and multiplayer HTTP verification. Live login, saved campaign/character, private portrait, origin protections and logout passed; both font preloads and all 12 font assets returned valid files. Existing production campaign host assignments were not changed for testing.


### Confirmed campaign departure and character return

Added a confirmed leave route, host-handoff prerequisite, archived-character storage excluded from all sanitized views, and transactional membership joins/departures. Returning through a valid invitation restores the same build and current resources. Departure/restoration wait for shared unresolved play. Archived characters no longer participate in votes, initiative, rests, or active party context. New/returning characters choose an unoccupied position.

All 87 unit tests passed, along with typecheck, lint, and Railway build. Unit coverage verifies damaged/spent resource preservation, private archive filtering even for hosts, active vote denominator, unresolved-play guards and distinct positions after turnover. Multiplayer HTTP checks prove access revocation/list removal, host rejection, confirmation requirement, blocked rejoin without accidental membership, concurrent rejoin without duplicates, exact restored build except a necessary free position, and stale leave rejection after return. Existing transaction rollback tests and guarded membership batching support atomicity; no production membership was changed for verification.

A disposable browser session left via Campaign settings, returned to the list without the campaign, and rejoined via an invitation with Returning Scout restored and shared departure/return history visible. This exposed a stale create-character welcome message and departure toast on rejoin; the final UI clears the toast and selects a welcome message based on the returned character. Typecheck/lint/build passed after that copy-state correction. No account or historical data erasure is claimed.

Railway deployment `f4023602-cce6-4f68-85d4-c15b11b6d8cb` succeeded for public source `50aec53b02c49720c14fb32c75d6e44df708f46b`. GitHub Actions `34271305193` passed all checks, including 87 tests, both builds and multiplayer HTTP verification. Live login, saved campaign/character, private portrait, origin protections and logout passed, along with both font preloads and all 12 font files. Production membership and characters were not changed by these checks. The disposable browser tab and test servers were closed.


### Generated character portrait previews

Implemented authenticated own-character image generation, bounded public-description prompts, per-account generation leases, a separate persistent UTC-day image allowance, and optional preview/use controls in Profile. Unit tests cover note exclusion, request parameters, invalid/oversized provider responses, pauses, daily limits, lock ownership and expired-lease replacement. All 90 unit tests, typecheck, lint, Railway build and multiplayer HTTP checks passed. HTTP checks reject anonymous users, nonmembers, wrong origins and paused generation without changing campaign state.

One real provider request using the already-authorized project key and gpt-image-1-mini produced an Android explorer portrait in a disposable local campaign. The browser displayed the preview, saved it through the existing upload flow, reloaded, and displayed the saved portrait in Character. The resulting JPEG was 85,205 bytes. HTTP checks confirmed identical bytes for player and host, anonymous rejection, and unchanged 20 health/3 energy. No production character artwork was changed. Current official image API/model documentation was consulted for JPEG compression and model parameters. This is synchronous temporary-preview generation, not a persistent background image queue or generated scene feature.

Railway deployment `9485fa1d-33ff-4f2f-80d1-139e4e093bb1` succeeded for public feature source `36ee6ab3ba461a9cda84f0de91438c3d688c6764`. GitHub Actions `34272719672` passed all checks including 90 tests and both builds. The first upload terminated with a Railway connection error and no new deployment; the subsequent upload succeeded. Portrait generation is enabled on Railway with a 10-request UTC-day allowance and gpt-image-1-mini. The live authenticated campaign reports the feature enabled. Live fonts, login, saved campaign/character, private portrait bytes, origin protections and logout passed. The one paid generation was exercised through the disposable local production build with the same authorized project key; no second paid generation or production character change was made for the hosted smoke check. Temporary browser tabs and the credential-bearing test process were closed.


### Read acknowledgement regression — 2026-09-08

Read acknowledgement now identifies the last loaded adventure event. A stale legacy request without an event boundary is rejected; an older event boundary cannot regress saved read progress. The notice clears only after a successful save, and returning to the list does not acknowledge events implicitly. Typecheck, lint, Railway build, font checks and the complete local production-runtime multiplayer suite passed, including new assertions for intervening events, invalid boundaries and out-of-order acknowledgements. A disposable browser player opened and left a two-unread-event campaign, verified both remained unread, reopened, explicitly marked read and verified the badge cleared on return. Railway deployment verification follows separately.


### Guard support ability — 2026-09-08

Added a third host-reviewed custom effect: Guard grants another conscious character +3 armor through the next enemy phase, consumes 1 energy and a combat turn, and has range 3 in Tactical (no distance limit in Quickplay). Protection shares the existing Defend state, does not stack and never changes base armor. The combat UI offers eligible teammates and displays protected characters in turn order.

All 93 unit tests passed, including deterministic hit prevention/expiry, self/enemy/downed/out-of-range/energy/unapproved/stacking rejection without mutation, Tactical boundary and Quickplay distance. Typecheck, lint, Railway build, fonts and the complete production-runtime HTTP multiplayer suite passed. HTTP verifies host approval, invalid-target rollback, duplicate-request single energy spend and shared persistence. A disposable browser player used Drone barrier on Captain Vale, observed the next character’s turn and +3 armor, then reloaded and confirmed saved protection. Desktop selector layout was inspected. This does not claim full D&D rules compatibility or broad combat balancing. Deployment verification follows separately.


### Downed final initiative slot — 2026-09-08

Reproduced a combat bug before changing the engine: skipping a downed character at the end of initiative wrapped to index zero without resolving enemies or advancing the round. Two new regression cases failed against the prior source. Advance now skips unavailable slots before checking the round boundary, preserving exactly one enemy phase when the last conscious party turn ends. Existing post-enemy skipping still selects a conscious character after enemy damage.

All 96 unit tests passed, including repeated rounds with a downed final slot, middle-slot skipping without an early enemy phase, and defeat of the last conscious character. Typecheck, lint, Railway build and the complete production-runtime HTTP multiplayer/font suite passed. The new HTTP scenario uses normal character creation and configured enemy attacks to knock out the slowest character, then verifies the survivor’s next action triggers the next enemy phase, persists defeat, and remains idempotent on retry. Deployment verification follows separately.


### Contextual in-game rules guide — 2026-09-08

Added a How to play dialog beside Character and Party chat. It describes active Quickplay/Tactical checks and attack ranges, current DM mode, voting policy, scheduling/absence consent, submitted versus local unsent state, recovery and character growth. Ability descriptions reuse the same fixed-effect definitions as character and combat UI. No game-state mutation is required to read the guide.

Typecheck, lint and Railway build passed. A disposable player opened the dialog, expanded a section with Tab/Enter, and inspected the desktop layout. While it remained open, a separately authenticated host changed the campaign from human/Tactical/wait to assisted/Quickplay/12-hour deadline with consent-based Defend, majority voting and custom abilities. The guide updated through normal polling; expanded Quickplay combat text showed +2 checks and unrestricted attack distance. Escape closed the dialog and restored focus to How to play. This is limited keyboard/desktop evidence, not comprehensive accessibility or phone validation.


### Generated scene artwork — 2026-09-08

Host-only scene generation uses the shared bounded image provider path, existing persistent per-account lease and global daily image allowance. Prompt data is restricted to saved world and location. It returns a landscape preview without saving it, rechecks host membership and unchanged world/location after provider completion, and uses the existing private scene upload for explicit saving. Frontend previews reset when their world/location changes. Portrait preview behavior shares the generalized artwork component.

Typecheck, lint, all 98 unit tests, Railway build, font checks and the complete HTTP multiplayer suite passed. Added unit coverage verifies bounded public scene prompt data and landscape output parameters. HTTP verifies anonymous/foreign-origin/nonmember/nonhost rejection, host-only feature visibility and paused shared allowance without state mutation. Existing portrait tests remain passing. Output metadata fixtures do not claim full decoder validation.

One real authorized image request generated a 1536×1024 JPEG for a disposable science-fiction Station campaign (`9a3e1cdc-05b3-48b7-8c1b-ddeebf6a3b18`). The host browser inspected the preview, confirmed it had not been saved, chose Use generated scene, then reloaded and visually verified the illustrated station backdrop. Saved image size was 133235 bytes. Host and player fetched identical bytes; anonymous access returned 401. Location, events and character resources exactly matched the pre-save state. The credential-bearing local test process was stopped and the temporary browser tab closed. No production character/campaign was changed and no second provider request was needed. API parameters were checked against https://developers.openai.com/api/docs/models/gpt-image-1-mini . Broader art quality, interrupted-job resumability and automatic scene updates remain unverified or incomplete.


### Account session controls — 2026-09-08

Added Railway Account page and password-confirmed revocation of other sessions. It reports only a count of other unexpired sessions, preserves the current token, and exposes no session identifiers. Revocation uses existing origin/body/password/rate checks and transactionally revalidates the current session/password before deleting only the acting account’s other sessions. Existing sign-in/password page styling is shared without changing their content.

Typecheck, lint, 99 unit tests, Railway build and production-runtime HTTP multiplayer/font checks passed. New session tests cover anonymous and foreign-origin rejection, wrong-password non-revocation, no token disclosure, current-session preservation, other-account isolation, unchanged account/campaign rows and repeat requests. Two independent local browser origins signed into the same disposable account; Account showed one other session, password-confirmed revocation changed it to none, and reloading the second origin returned to the signed-out landing page. The account page layout was inspected. This is session control, not account deletion or a comprehensive account lifecycle.


### Railway account deletion — 2026-09-08

Implemented password-and-DELETE confirmation, reviewed membership fingerprint, shared-campaign blocking and solo-campaign deletion. Account/session/reset/registration records and archived private characters/read markers are removed transactionally. Active affected leases and stale account/password/session or membership snapshots reject the operation before commit; rollback preserves earlier campaign updates in the same deletion transaction. Surviving shared story and referenced shared art are retained. Deleted IDs block environment reprovisioning and late campaign/member inserts.

Image cleanup preserves active references, removes known private/solo assets, retries failures via durable queue state, and checks deletion before/after uploads so an in-flight upload cannot restore a file. The background cleanup retry is independent of timed-turn enablement. Legacy unreferenced files without owner metadata, external backups and provisioning configuration remain operator responsibilities, as documented.

Typecheck, lint, 103 unit tests and Railway build passed; the full production-runtime multiplayer/font suite also passed. Four focused deletion tests cover confirmation/password/origin checks, stale membership fingerprints, solo/archived/private image deletion, shared image/history preservation, other-account isolation, reset/registration removal, full transaction rollback around active leases, failed cleanup retry, in-flight uploads, late inserts and restart with the original provisioning environment.

A browser host deleted a disposable solo campaign (`fabab277-3143-4545-abbd-f5f4d572784d`) with its account. The old password and another existing session were rejected; the independent player account remained authenticated. The warning page was visually inspected. After the final membership-fingerprint and completion-page changes, a fresh disposable browser account completed the final form and reached Account deleted. Both browser tabs were closed. No production account was deleted. Deployment verification follows separately.


## Notification queue foundation (not enabled)

Added stable, private-content-free turn/decision/DM cue identities and a Railway SQLite outbox with membership and current-state rechecks, delivery leases, stale-response protection, bounded retries and cascading revocation. Nine focused tests exercise these behaviors, including independent database connections. The browser opt-in API, service worker, provider delivery and scheduled integration are still missing; no hosted notifications are sent. See [NOTIFICATIONS.md](NOTIFICATIONS.md) for the remaining integration and evidence requirements.

Local validation: all 112 unit tests, TypeScript and lint passed for this change. No browser-delivery test or production deployment is claimed.


## Browser subscription API (not enabled on production)

The Railway `/api/notifications` route now authenticates the player and supports configuration, subscribe, status and remove. Registration validates HTTPS push destinations and P-256 encryption keys, requires exact Origin and bounded JSON, limits each account to eight subscriptions, and rejects cross-account takeover. Revocation remains usable when delivery is disabled. Five new unit tests and the production-build HTTP multiplayer suite verify ownership, body/origin controls, deletion races and actual authenticated route behavior. All 117 unit tests, local typecheck/lint, Railway build, HTTP multiplayer and font checks passed. No provider message was sent. Browser UI, session/logout revocation and scheduled delivery remain unfinished; deployment and actual browser delivery are not claimed.


## Browser notification controls and session revocation (not enabled on production)

Added the lobby opt-in dialog and notification-only service worker. The browser dialog was inspected with a disposable local account: opening, explicit Turn on, denied-permission feedback, Escape dismissal and restored trigger focus passed. The in-app browser denied permission, so real subscription/granted-permission and push delivery remain unverified. The worker displays generic content, stable campaign tags and same-origin click handling without caching game data. Subscriptions now reference a verified login session; sign-out, account switching, session revocation and expiry invalidate them. A player-identity check rejects setup begun under another login. Five additional unit tests bring the suite to 122 passing tests. Typecheck, lint, Railway build and actual HTTP multiplayer/font checks passed. The provider sender and background integration are still missing; production push is disabled and these changes are not deployed.


## Web Push sender and Safari provider verification

Connected encrypted Web Push delivery to the Railway minute processor independently of combat pacing. Requests have an eight-second abort, reject redirects, retain messages for ten minutes, and use stable replacement topics. Each tick is bounded to ten claims and thirty seconds before starting further requests. Six sender tests cover recipient decryption of a real Web Push request, valid VAPID configuration, provider rejection/retry handling, revoked subscriptions, batch/concurrency limits and stale replies. All 128 tests, typecheck, lint, the Railway build and HTTP multiplayer/font checks passed locally. Routine HTTP tests pause outbound pushes.

Safari granted notification permission for a disposable local account and displayed its subscription as on. The game tab was closed before another test player submitted an action. The background sender then recorded one successful provider acceptance, with one attempt. Reopening preserved the opt-in; Turn off removed the subscription and queued row. The macOS notification banner itself was not observed, so visible display and actual notification-click navigation are not claimed. The test tab was closed and servers stopped. Railway rollout verification follows separately.
