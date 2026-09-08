# Railway deployment

Lantern Table supports a Node 24 container on Railway. This deployment uses SQLite and private image files on a Railway volume, rather than Cloudflare D1/R2. Existing Sites and standalone Cloudflare targets remain available. Railway must run exactly one replica with a persistent volume mounted at `/data`; do not enable autoscaling or service sleep for this configuration. Back up the volume before changing database structure or account configuration.

## Build and run

The root Dockerfile installs the pinned dependencies and builds with `pnpm build:railway`. `railway.json` selects that Dockerfile and checks `/api/health`. `vinext start` binds to `0.0.0.0` and Railway's `PORT`. Mount the volume before the first deployment. `/api/health` checks storage without returning game data.

Configure these Railway service variables:

- `LANTERN_DATA_DIR=/data`
- `LANTERN_ORIGIN=https://YOUR-RAILWAY-DOMAIN` (exact origin, no trailing slash)
- `LANTERN_ACCOUNTS`: the private account configuration described below
- `OPENAI_API_KEY`: a runtime secret, never a Docker build argument
- `OPENAI_MODEL=gpt-5.4-mini` or another supported OpenAI text model
- `LANTERN_AI_DAILY_LIMIT=100` for the shared UTC-day narration allowance; 0 pauses AI narration
- Optional portrait and scene previews: `LANTERN_PORTRAITS_ENABLED=true`, `LANTERN_SCENES_ENABLED=true`, `LANTERN_PORTRAIT_DAILY_LIMIT=10`, and `OPENAI_IMAGE_MODEL=gpt-image-1-mini`
- `LANTERN_BACKGROUND_TURNS=true` to enable the one-minute deadline worker

Deploy with the Railway CLI from this directory. Use `railway up --detach`, then check the returned deployment until healthy. See [Railway CLI deployment](https://docs.railway.com/cli/deploying) and [persistent volumes](https://docs.railway.com/guides/volumes).

## Private accounts

Railway uses its own private email/password accounts, not Sign in with ChatGPT. Public signup is disabled by default; optional verified-email registration is described below. The operator can provision a private player with:

```sh
node scripts/provision-account.mjs player@example.com 'Player name' /PRIVATE/NEW/DIRECTORY
```

The script writes a randomly generated password to `login.txt` and a salted scrypt hash plus account identity to `account.json`, both with owner-only file permissions. Never commit these files. Securely give the login details to the intended player. Set `LANTERN_ACCOUNTS` to a JSON array containing all provisioned account records; preserve each existing ID. Upload the hashed configuration through Railway's private environment-variable controls, not a public file. The server stores those accounts in the volume. Provisioning initializes the password only when an account is first inserted; subsequent startups may update its email/name but do not overwrite its saved password. Editing the password hash in LANTERN_ACCOUNTS is no longer a password-reset mechanism. Removing an entry from the environment does not delete its existing database account.

Sessions are random opaque tokens; only their SHA-256 hashes are stored. Cookies use HttpOnly, SameSite=Lax, and Secure on HTTPS. Login checks the configured origin, enforces bounded form bodies and rate limits, and uses scrypt verification. Cloudflare/Sites identity headers and local test cookies cannot authenticate to this build. Campaign and image membership checks remain in the shared game service.

Self-service registration and password-reset email delivery are not enabled on the hosted private deployment. Their source integrations are described below; full account management and account deletion remain incomplete. Signed-in players can choose Change password from the campaign list, enter their current password and a new password of 12–200 characters, and then sign in again. Changing a password revokes all existing sessions. Operator provisioning is required for additional players. Do not email the AI provider key or reuse the host's login for friends. Campaign invitations grant campaign membership only after the recipient signs in with a provisioned account.

## Storage and background turns

The adapter preserves the shared engine's conditional version writes and transactional campaign/member creation. SQLite uses WAL, foreign keys, and a busy timeout. Images keep ownership metadata and are replaced atomically within the private volume; only authorized image routes read them. Unreferenced image cleanup remains limited as in the original host.

Root instrumentation starts a guarded 60-second timer when background turns are enabled. It calls the same lease-based deadline processor as Cloudflare. Only timed defensive turns with the acting player's explicit consent advance. This is a single-container timer, not a durable job queue. Downtime delays processing until startup; it never authorizes extra AI actions or casts party votes.

## Verification and migration limits

Unit coverage includes adapter transaction rollback and stale writes, private image round trips and path validation, valid/invalid login, CSRF origin checks, session expiry/logout, and login throttling. The local production HTTP check creates and reloads a campaign/character, uploads and reads a private portrait, rejects unauthenticated/test-cookie access, and signs out. Re-running against the same ID after server restart confirmed persistence. A seeded expired turn advanced exactly once through the running Node production timer.

Existing Sites campaigns are not automatically copied. Sites/Cloudflare and Railway identities are different, and migration must map owners/members and copy images together with campaign state. The original private site remains intact. The Railway verification campaign is a separate new campaign. Public open-source distribution remains MIT; credentials and game data are excluded from source.

Hosted verification also passed one live AI exploration response with unchanged character health. The landing page and email/password sign-in page were inspected in the browser. Authenticated gameplay on Railway was exercised through its production HTTP API; the earlier full browser playtest applies to the original Sites deployment.

Production redeployment persistence passed: the same campaign, character, and portrait remained readable after replacing the running container. A second provisioned account authenticated and was rejected from the owner’s campaign before invitation-based joining. A real two-person play session remains to be tested.

### Reproduce multiplayer checks

Run `pnpm build:railway`, then `node tests/railway-multiplayer.mjs`. The runner uses three disposable password accounts and temporary SQLite storage on localhost:3017, verifies the shared multiplayer integration flow including logout/re-login recovery, and cleans up afterward. Override `TEST_PORT` if needed. No production credentials or paid AI calls are used. The repository CI workflow runs this check after its Railway build.

## Email recovery integration (not yet enabled on the hosted service)

The source supports Resend's [Send Email API](https://resend.com/docs/api-reference/emails/send-email) through `RESEND_API_KEY` and `LANTERN_MAIL_FROM`. Configure a sender authorized by your email provider, with `LANTERN_ORIGIN` set to the public HTTPS origin. These secrets belong only in server environment settings. No browser or repository key is needed. No live email service is configured yet; sender selection and delivery verification remain pending.

The Forgot password page explains that recovery is unavailable when these settings are absent. When configured, it accepts a player's existing account email and returns the same confirmation for known and unknown addresses. Only existing accounts receive mail. Links expire after 30 minutes; requesting another replaces the previous link. Opening a link does not consume it. A successful reset atomically changes the password, clears that account's sign-in lockout, revokes sessions and consumes the link. Changing the password separately invalidates outstanding reset links. Database storage contains only token hashes; reset pages use no-store caching, no external assets and no-referrer policy. Infrastructure logs must redact the reset URL query because it contains a bearer credential.

Request limits are three emails per address per 15 minutes and twenty requests globally per minute; reset submissions are limited to 100 per minute. Mail requests have a ten-second timeout. Failed delivery invalidates its issued token and logs a generic error without the recipient or token. Delivery is not queued or retried by the app. These limits are intended for the private playtest and need reconsideration before a large public launch.

`tests/recovery.test.mjs` uses an intercepted mail API, with no external emails, to check tokens, expiry, replacement, concurrency, session revocation, old-password rejection, rate limiting, origin protection and provider failure. Live delivery and browser completion remain unverified. Optional verified-email signup is implemented as described below and remains disabled until mail is configured.

## Optional verified-email registration (not enabled on the private deployment)

`LANTERN_SIGNUP_ENABLED=true`, `RESEND_API_KEY`, and `LANTERN_MAIL_FROM` together enable registration and show Create an account on the sign-in page. Missing either mail setting, or an absent/false signup flag, closes both registration endpoints. The source implements this flow; real mail delivery and hosted signup remain unverified.

A visitor requests an email verification link, then chooses a display name and password only after opening that link. No account or password is stored before mailbox proof. Verification tokens are stored as hashes, expire after 30 minutes, are replaced by a newer request, and can create only one account. Merely opening a link does not consume it. Completion creates a random account identity, consumes the registration and asks the player to sign in normally. It does not create sessions automatically or add campaign memberships. Existing accounts receive the same registration confirmation but are never overwritten.

Signup email requests are limited to three per email per 15 minutes and twenty globally per minute. Verification submissions are limited to 100 per minute. Mail failure invalidates its link and logs only a generic error. Verification pages use no-store/no-referrer and no external assets; deployment logs must redact the `verify` URL parameter. This integration uses the same configured sender as recovery. Live sender verification, deliverability and broader public-launch usage controls must be addressed before enabling open registration.


## Portrait generation and campaign membership

Portrait and scene previews share a separate image request allowance and the same runtime OpenAI credential. Generation is disabled unless explicitly enabled. Preview/save behavior, supported output parameters, timeout limits and billing boundaries are documented in the [README](../README.md#generated-character-portraits). Failed or discarded generations can still consume provider usage.

Accepted host handoffs change permissions and rotate campaign invitations in a single saved update. Members can leave and later restore their archived character with a valid invitation; hosts must hand off first. Departure retains history and archived character data in SQLite. Archived characters are omitted from normal views and user-facing exports, including host exports. Back up the full volume to preserve all accounts, sessions, memberships, archives and private image files; the JSON campaign export alone is not a full server backup.
