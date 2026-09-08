# Contributing

Keep the interface minimal and the rules authoritative. Never commit credentials, local campaign data, or generated build output. New game mechanics need server validation and tests for stale or unauthorized actions. A displayed setting must work; label partial capabilities honestly.

Before proposing changes, run the unit tests, typecheck, authored-code lint, and production build. Run HTTP integration tests against a development server when changing persistence, auth, or action handling. AI smoke tests make a paid API request and are separate from the default suite.

See docs/PRODUCT.md for intended scope and README.md for current limitations.
