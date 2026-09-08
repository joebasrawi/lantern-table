## Railway hosting

For the Node container deployment with private accounts and persistent storage, see [Railway setup](docs/RAILWAY.md). This is independent of the original Sites preview; existing campaigns require an explicit data migration.

# Lantern Table

An open-source browser RPG for asynchronous groups, with AI, human, and assisted dungeon masters. The first playable build has private campaigns, invite links, persistent character sheets, a shared story feed, party chat, journal, party votes, and 8×8 tactical encounters.

## Run locally

Requires Node 22.13+ and pnpm. The project uses React, Vinext, a local Cloudflare D1 database, and private R2 portrait storage.

```sh
pnpm install
pnpm exec wrangler d1 migrations apply DB --local --config wrangler.local.json
pnpm dev
```

Open the URL printed by the development server. Local development includes three named test-player sessions, allowing separate browsers or profiles to act as different users. Sites also provides its own simulated sign-in. Local player sessions are compiled out of production.

AI credentials belong in an ignored `.env.local` file. The development launcher also supports the parent workspace's `.env.local`; it loads credentials only in the server process. The AI provider is never called from the browser. Hosted deployment uses secret runtime variables, not committed environment files.

## Play

1. Sign in, create a campaign, and choose a world and DM mode.
2. Create a character. Use a preset or describe a concept, then choose its mechanical role.
3. The host copies the invitation from campaign settings. Friends sign in and join through that link.
4. Explore in Adventure, discuss in Party Chat, and review discoveries in Journal.
5. Human DMs resolve submitted actions in DM Desk. Assisted mode can draft a response for review. AI mode narrates exploration and proposes travel, rest, and encounters for party approval.
6. Approve an AI-proposed encounter through a party vote, or let the host start one in DM Desk. Attack, use a power, defend, move, or heal when it is your turn.
7. Campaign changes persist in SQLite on Railway or D1 on Cloudflare, so everyone can leave and return. Open sessions refresh every seven seconds. Railway runs consented timed defensive actions in a background interval; standalone Cloudflare has a scheduled worker. The original Sites preview checks deadlines only while open. Unsent action drafts are saved separately on the current device.

## Rules

These are original rules, not a D&D 5e implementation. Quickplay uses a fixed +2 check modifier and no range restrictions. Tactical uses six attributes, attribute modifiers plus +2 training, weapon range, positioning, armor, and limited energy. The standard array is 15, 14, 13, 12, 10, 8. Four roles alter health, armor, and range. Rolls and resource changes are server-controlled.

A normal attack deals 5 damage; a power deals 8 for 1 energy. A natural 20 doubles damage. Defending adds 3 armor for the enemy phase. Healing kits restore up to 8 health and are consumed. Movement covers up to three tiles and spends the turn. Each surviving enemy makes a +3 attack for 4 damage during its phase. Enemy automation is intentionally simple in this first build. Completing combat awards 25 XP to each character. At 100 cumulative XP you can advance to level 2, at 300 to level 3, then 600 to level 4 (threshold: 50 × current level × (current level + 1)). The level cap is 10. Between resolved actions, a conscious character can choose +4 maximum health or +1 maximum energy in Abilities. Current resources stay unchanged until recovery; XP is cumulative and is not spent.

## Architecture

- `app/game.tsx`: responsive play interface and campaign flow.
- `lib/game/engine.ts`: deterministic validation, combat, policy and visibility rules.
- `lib/game/service.ts`: membership checks and optimistic writes with expiring turn locks.
- `lib/game/narrator.ts`: bounded OpenAI Responses API calls with structured output.
- `db/schema.ts` and `drizzle/`: versioned database schema.

A campaign is a versioned state aggregate. A mutation acquires a database lease, checks the expected version, applies the operation, and commits only if it still owns the lease. Recorded request IDs prevent duplicate application. AI failures release the lease without committing the action or spending character resources.

## Verification

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm test:integration # development server must be running; creates isolated test campaigns
node tests/host-pace-integration.mjs # host-managed turns and separate player consent
node tests/abilities-integration.mjs # proposal approval, combat and owner permissions
node tests/progression-integration.mjs # combat-earned XP, advancement and saved reload
node tests/scene-integration.mjs # private scene artwork and host permissions
node tests/portrait-integration.mjs # private portrait access and ownership
node tests/assisted-integration.mjs # one live AI draft, human review, privacy and stale reply checks; incurs provider usage
node tests/ai-memory.mjs # one live AI turn recalling an older discovery; incurs provider usage
node tests/ai-smoke.mjs # one live AI turn; incurs provider usage
node tests/ai-progression.mjs # two AI turns and two-player approvals; incurs provider usage
pnpm build
```

Lint covers authored application, rules, persistence, test, and configuration code. Generated UI library files are retained unmodified. Unit and HTTP integration tests cover ability budget, turn ownership, resources, range, privacy, voting, persistent reloads, membership, stale writes, concurrency and idempotency. Browser verification covers hosted owner login and saved return, desktop and 390-pixel views, local draft reload/submission, and an asynchronous human-DM loop in independent local sessions. See [browser playtest](docs/BROWSER_PLAYTEST.md) for exact evidence and limits; physical devices and two independent hosted browsers remain unverified.

## Hosting and open-source status

MIT-licensed source is published at [joebasrawi/lantern-table](https://github.com/joebasrawi/lantern-table). The current private deployment runs on Railway with its own accounts, persistent SQLite and private image storage; see [Railway setup](docs/RAILWAY.md). Password changes are live. Email recovery and optional verified-email registration are implemented but need a configured sender and live delivery verification. The initial hosted preview uses Sites, D1 and Sign in with ChatGPT. Site access policy applies before campaign invitations: a private Site invitation does not itself grant a friend access to the Site. A standalone Workers build with verified Cloudflare Access identity is available; see [self-hosting](docs/SELF_HOSTING.md). Its live custom-domain sign-in has not been tested. Wider-audience deployment is not complete.

## Still to build

This is the first playable milestone, not the finished platform. See `docs/PRODUCT.md` for the complete goal and `docs/VERIFICATION.md` for current evidence and verification gaps.

- Semantic recall and archival beyond the current keyword-based history search, richer AI encounter direction, and expanded custom ability effects beyond the two validated templates.
- Generated portraits, expanded equipment and rule content. Character identity, concept, and preset portrait can already be edited.
- Notifications, simultaneous combat, delegation, co-hosts and host transfers; the Railway deadline processor is already deployed. DM/rule/voting changes are already staged until current play finishes.
- Broader tactical maps, world map editing, voice/ambience, additional genre artwork.
- Live verification of self-hosted identity, account lifecycle, provider choice/local models, provider-neutral hosting, cost/billing controls and public release.
- Multi-device browser and accessibility testing before claiming release readiness.

## Artwork

Original AI-generated 2D illustrations are included as compact WebP assets. See `docs/ART.md` for provenance. No official D&D logos, rulebooks, or proprietary art are included.


## AI progression

The AI can propose travel, a safe rest, or an encounter. A proposal is stored as a party decision with a validated mechanical effect. The engine applies it only after the configured vote passes; declining a proposal changes no resources. Narrative location text alone cannot move the party. A host can cancel a stuck decision, and a human host does not need a player character to resolve a host-decides vote.


## Settings and recovery

The host can edit scheduling during an encounter or decision. Changing the pace or deadline starts a fresh timer; unrelated edits preserve it. Changing DM mode, rules, or voting policy during active play queues those fields until the encounter, decision and pending actions have resolved. This preserves the rules under which current actions were taken. Queued settings survive reloads and can be withdrawn by saving the original choices.

When an AI-led party is defeated, the encounter ends without awarding experience and a recovery vote appears. Health and energy remain depleted until the party approves recovery. A human-led campaign leaves consequences and recovery to its DM.

## Custom portraits

The character editor accepts JPG, PNG, and still WebP artwork up to 512 KB and 2048 pixels per side. Uploads are stored privately on the Railway volume or in R2 on Cloudflare. Every image request checks campaign membership; only the character owner can attach or clear their artwork. Choosing a preset again removes access to the previous image. Portrait changes preserve all gameplay values. Replaced objects currently remain in private storage; automatic orphan cleanup is pending.

## Custom abilities

Hosts can choose “Custom concepts + approved abilities” in settings. Each player can propose up to three named abilities (pending proposals count toward the limit) from their Abilities tab. Strike uses the normal power attack: 8 damage, the role's attack roll and range, and 1 energy. Mend restores up to 6 of the acting character's own health for 1 energy. Both spend the combat turn. Appearance text can describe magic, technology, or another theme; it cannot add mechanics.

The host reviews proposals in DM Desk, including AI-led campaigns. Pending or removed abilities cannot be used. Players can remove their own abilities; the host can decline or revoke them. Ability changes wait until all encounters, decisions and pending actions are resolved. Changing the creation policy does not remove already-approved abilities, just as it does not replace existing character species. Use host revocation for that. Arbitrary scripted powers, new effect types, and AI ability adjudication remain future work.

## Earlier-session recall

The AI context now combines recent story events with up to six relevant excerpts from older saved events. It ranks literal words in the current action, with a small location boost, favoring rarer matches. Relevant journal entries can be retrieved regardless of age, with unfinished quests prioritized. Recent and recalled text have separate size limits. Approved ability names and fixed effects are included as character context.

Recall uses saved event text rather than an AI-written replacement summary and requires no additional AI request. Event kinds and timestamps distinguish a player's attempted action from established narration. The prompt directs the model to prefer current engine state and later facts. Private player notes, DM-only notes, and party chat are not included.

This is keyword retrieval, not semantic memory: synonyms, indirect references and languages with different word boundaries may miss relevant history. It cannot recover events that were never saved and does not remove the campaign storage limit. Local tests cover older discoveries, old journal entries, text limits and privacy; a live AI turn also recalled an exact established phrase beyond the previous 32-event window.

## Host-managed pacing

With host-managed pacing and defensive absence actions enabled, the host can resolve the acting player's turn as a normal defensive action. This requires a separate opt-in from that player in their character's Notes tab; existing consent to timed defense does not grant it. The host action is recorded in the shared story and uses the same turn and enemy-phase rules as a player choosing Defend. Saved versions and request IDs prevent duplicate advancement. Without the relevant policy or consent, play waits for the player.

## Assisted-DM review

AI-assisted mode shows generated narration in a separate, unpublished preview. The host chooses whether to use it in the editor, can revise the text, and must explicitly publish. Generating a draft does not resolve actions, create discoveries, apply proposals or change resources. A changed story, selected action or DM mode invalidates an in-flight draft; unrelated chat/private notes do not. Server validation rejects replies to actions already resolved elsewhere. Resting also waits until pending party decisions are resolved.

A live API integration test verified draft privacy, unchanged shared state, reviewed publication and stale-reply rejection. The hosted browser playtest verified preview, acceptance, editing and explicit publication; see docs/BROWSER_PLAYTEST.md.

## Campaign scene artwork

The host can upload a landscape JPG, PNG or still WebP in campaign settings, up to 512 KB and 2048 pixels per side. It replaces the default harbor or abstract backdrop, allowing the visual setting to fit a different era. Scene reads check campaign membership and only the host can change or restore the backdrop, even if the host has no player character. Changing artwork does not change location, discoveries, resources or turns. Update the image manually when appropriate; automatic scene generation is not implemented.

Scene and portrait objects share private R2 storage with separate key prefixes. The previous scene URL stops working after removal or replacement. Unreferenced old objects currently remain in storage. Failed upload responses now check the saved state before deleting a new object, so a response failure after a successful save cannot delete the active image.

## Change your character build

In your character’s Abilities tab, open “Change role and attributes.” Choose a role and reassign the six standard scores; picking a score swaps it with the attribute currently using it. The preview shows health and armor after saving. Build changes are available only outside encounters, party decisions, and pending actions, and unconscious characters must recover first.

The server preserves identity, level, XP, earned health/energy capacity, inventory and approved abilities. A role change adjusts base health and armor, and existing combat rules use the new role’s attack attribute and range. It never restores current health or energy. Health above a lower maximum is lost and changing back does not restore it. The change appears in shared campaign history and persists on return. Equipment descriptions are retained; new gear is not granted when switching roles.

## Find your next turn

The adventure list shows member-specific attention cues for a combat turn, an unanswered party vote, host decisions, pending human-DM work, and proposed abilities. Waiting states distinguish a saved vote or action from something you still need to do. New-event counts reflect the campaign’s explicit Mark read state. The list refreshes every 15 seconds while visible and when returning to the tab; it retains the last successful list during a temporary connection failure. These are in-app status cues, not email or push notifications.
