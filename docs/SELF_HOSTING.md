# Run Lantern Table in your own Cloudflare account

This deployment uses your Workers, D1, private R2 bucket, and Cloudflare Access application. It does not require Sites or Sign in with ChatGPT. It is a group-hosted deployment option, not yet a provider-neutral Docker distribution or public consumer account system.

## Configure your account

1. Install dependencies with `pnpm install`, then authenticate Wrangler with `pnpm exec wrangler login`.
2. Create storage with `pnpm exec wrangler d1 create lantern-table` and `pnpm exec wrangler r2 bucket create lantern-table-portraits`.
3. Copy `wrangler.standalone.example.json` to `wrangler.standalone.json`. Set the returned D1 database ID and your bucket name. The real configuration is ignored by Git. Do not put API secrets in it.
4. Choose a hostname in your Cloudflare account, such as `play.example.com`. Add `"routes": [{"pattern": "play.example.com", "custom_domain": true}]` to your configuration, substituting your real hostname. Keep the alternative Workers and preview URLs disabled. See [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
5. In Cloudflare Zero Trust, create a self-hosted Access application covering that entire hostname. Configure the identity provider and an Allow policy for your players. Set `ACCESS_ISSUER` to `https://YOUR-TEAM.cloudflareaccess.com` without a trailing slash, and `ACCESS_AUDIENCE` to that application's audience tag. Cover `/api/*` as well as the main page. The Worker independently verifies the token signature, issuer, audience, expiry and player claims, as required by [Cloudflare's JWT validation guidance](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## Build and publish your configured deployment

```sh
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.standalone.json
pnpm build:standalone
pnpm exec wrangler deploy --config dist/server/wrangler.json
pnpm exec wrangler deploy --config dist/scheduler/wrangler.json
pnpm exec wrangler secret put OPENAI_API_KEY --config dist/server/wrangler.json
```

The commands above create or change resources in your account. Run them when you are ready to publish. The secret prompt keeps the provider key out of source and browser assets. Human DM games work without an AI key; AI and assisted narration need one. Every build replaces `dist`, so rebuild with `pnpm build:standalone` immediately before deploying that configuration. The normal `pnpm build` is for Sites.

Sign in through your chosen hostname. Invite a second permitted Access user to a campaign and confirm that their character, turn and portrait persist after signing out and back in. A campaign invitation does not grant access through your group's Access policy. Sign out uses `/cdn-cgi/access/logout`.

Player IDs combine the Access issuer and signed subject, so changing a display email does not change ownership. Existing Sites campaign identities do not automatically migrate. Account migration, provider-neutral storage and identity adapters, account deletion, public self-service registration, and hosted billing controls remain unfinished.

## Local verification without an account

```sh
pnpm test
LANTERN_STANDALONE_CONFIG=wrangler.standalone.example.json pnpm build:standalone
pnpm exec wrangler dev --config dist/server/wrangler.json --port 3001
# In another terminal:
node tests/standalone-integration.mjs
```

The example configuration supports local build and rejection tests only. It cannot provide a real sign-in. Unit tests use generated signing keys to exercise accepted and rejected identities; production uses only the configured team's remote public keys. No development cookie or Sites identity-header fallback exists in standalone mode.

Verified locally: standalone compilation and Worker startup, cryptographic identity checks, rejection of forged headers, disabled local sessions, and protected portrait requests. A real account deployment, Access sign-in/logout flow and authenticated multiplayer on a custom domain have not been tested. Do not infer those from the local checks.

## Offline defensive turns

The standalone build also emits a separate `dist/scheduler` Worker configured to run every minute. Deploy both Workers as shown above. The scheduler shares only the game's D1 binding; it needs neither a player session nor an AI key. Ordinary HTTP requests to it return 404. The separate Worker avoids coupling background execution to the web asset router.

On each run it selects up to 10 expired combat turns with timed pace, defensive absence policy and explicit consent from the acting character. It acquires the same versioned lease as player actions, applies one defensive action, and starts the next turn's full timer. A simultaneous player action or overlapping scheduler cannot apply the stale turn twice. Campaigns whose players did not consent are excluded, so they cannot hold up the batch. Queued settings apply when play finishes. Decisions still wait for the configured agreement rule; their deadlines do not cast votes or skip players.

This is a bounded first scheduler, with a JSON query over campaign state. Large installations will need an indexed deadline queue and capacity planning. Failed work remains saved at its previous version and is retried on later runs. Check Worker logs for processing failures. Removing the scheduler's cron or deployment disables background actions; open clients continue their normal checks. Notifications and arbitrary AI actions while players are away are not included.

To verify the actual scheduled Worker locally using an isolated database:

```sh
pnpm test
pnpm exec wrangler d1 migrations apply DB --local --config wrangler.standalone.example.json --persist-to .wrangler/scheduler-test
LANTERN_STANDALONE_CONFIG=wrangler.standalone.example.json pnpm build:standalone
pnpm exec wrangler dev --config dist/scheduler/wrangler.json --port 3001 --persist-to .wrangler/scheduler-test
# In another terminal:
node tests/scheduler-integration.mjs
```

The integration test calls the local runtime's scheduled-event endpoint with no browser session and verifies the saved result in D1. It has passed. Actual Cloudflare cron delivery on a deployed account remains unverified. See [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) for deployment and scheduling behavior.
