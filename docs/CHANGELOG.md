# Release history

## v0.3.0 — Portraits and campaign management

Private-playtest release. These are original roleplaying rules, not a full D&D/5e implementation.

- Generate a character portrait preview from saved appearance and world information, then choose whether to save it. Generation has a separate persistent image allowance and per-account concurrency protection. It is opt-in for self-hosted installations.
- Hosts can grant/remove equipment; players can transfer their own items. Healing kits retain their combat effect. Custom gear is descriptive.
- Offer the host role to an existing member, who can accept or decline. Acceptance changes DM access and replaces the invitation link.
- Leave a campaign and rejoin with a valid invitation to restore the same character and resources. Archived characters are excluded from active play and normal views. This is not data deletion.
- Configure enemy health, armor, attack bonus and damage within validated bounds.
- Limit AI narration requests across the server with a persistent UTC-day allowance. Request-count safeguards are not dollar budgets.
- Reduce generated stylesheet size while preserving the existing interface.

Validation: 90 unit tests; typechecking and lint; standalone and Railway production builds; password-authenticated multiplayer HTTP checks; browser equipment, handoff, departure/return and real portrait preview/save/reload checks. The live Railway deployment passed saved-campaign, authentication, private-image and font checks. See [verification](VERIFICATION.md) for exact scope and limitations.

Still incomplete: live email signup/recovery delivery, outbound notifications, account deletion, generated scenes, broader rules/content, and comprehensive multi-device/accessibility validation. Public source availability does not mean public registration or production-readiness claims.

## v0.2.0 — Customization and asynchronous play

Editable character builds and campaign worlds, in-app attention cues, human DMs without a required character, saved action drafts, and font delivery fixes.

## v0.1.0 — First playable release

Initial MIT-licensed public source release with persistent browser campaigns, original Quickplay/Tactical rules, AI/human/assisted DMs, private Railway accounts and portable hosting instructions.
