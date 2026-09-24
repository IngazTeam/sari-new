# AI configuration and application deployment

Provider credentials and model price cards are configured at `/admin/ai-settings`.
Missing or unreadable provider keys must not prevent the application from starting:
administrators need the running application to repair those settings.

`preflight:ai-deployment` validates the budget tables, subscription query and the
enabled $100 global daily policy. It reads provider metadata without decrypting
credentials and reports missing price cards without blocking deployment.
Database, schema and budget-policy failures remain deployment errors.

`preflight:ai-budget` remains the stricter provider/price readiness check.
Runtime credential decryption, origin validation and paid-request budget checks
remain mandatory. Deployment readiness does not assert AI availability.
Environment provider keys are optional fallbacks; core database, JWT and field
encryption configuration is still required.

The super-admin settings page reports unreadable OpenAI/ZahyPi keys without
returning credentials or raw errors. Administrators can save replacement keys
without decrypting the old values. They are encrypted with the configured field
key. An explicitly selected ZahyPi provider with a saved admin key takes priority
over an older one-click connector. Existing connector records are preserved.

After deployment, sign in as a super-admin, save the required keys, configure
approved model prices and test the connection. No database restore, credential
deletion, encryption-key rotation or price insertion is part of this change.
