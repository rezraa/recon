# Data Source Handling Standards

This project aggregates job listings from third-party APIs. These standards define how we handle external data responsibly and ensure our integrations remain sustainable.

All contributors and automated agents **must** follow these rules.

---

## Content Integrity

- **Never modify job descriptions.** Descriptions are stored exactly as received from the source API, byte-for-byte. The `description_raw` field is immutable.
- **XSS sanitization only.** A separate `description_html` field strips dangerous tags (`<script>`, `<iframe>`, event handlers) for safe rendering. Visible text, formatting, and links are preserved exactly.
- **Highlight at render time.** Skill matching and keyword highlighting are applied via CSS overlay in the UI — never by modifying stored content.

## Attribution

- **Always link to the source platform's listing page.** Every job listing's primary link (`source_url`) points to where the source platform hosts that listing — not to the employer directly. This ensures sources receive traffic for the data they provide.
- **Use follow links.** Attribution links are standard HTML anchors (follow by default). Never add `rel="nofollow"` to source attribution links.
- **Show all sources.** When the same job appears from multiple sources, display every source as a clickable text link. No source is hidden or deprioritized by deduplication. Users decide which link to follow.
- **Text attribution only.** Source names are displayed as plain text. Company names use text with letter avatars (first-letter colored circles).

## No Images or Logos

- **Never display company logos.** Employer logos are trademarked assets. Display company names as text only.
- **Never display source platform logos.** Use source names as text links for attribution.
- **No image fields in the data schema.** The `RawJobListing` schema intentionally excludes logo/image URLs. The `raw_data` JSONB field (which may contain logo URLs from the original API response) is never returned to the frontend.

## Rate Limits

- **Respect documented limits.** Each source's rate limits are encoded in `SOURCE_CONFIGS` and enforced automatically before every API call.
- **Pre-check before every request.** The pipeline calls `canMakeRequest()` and skips the source for that run if the quota is exhausted — no wasted calls, no surprise overages.
- **Track usage in Redis.** Hourly, daily, and monthly counters with TTL ensure limits are never exceeded across restarts.
- **Err conservative.** When a source's limits are unclear, configure well below any stated threshold.
- **Rate limit config is developer-controlled.** These values live in code (`SOURCE_CONFIGS`), not in user-facing settings. Users see source health status only.

## Credential Handling

- **User-provided API keys are encrypted at rest.** Keys are encrypted with AES-256-GCM before storage in the `sources.config` JSONB field. Decrypted only when needed to make API calls. The encryption key (`ENCRYPTION_KEY`) lives in `.env` — the one place where infrastructure secrets belong.
- **User-provided API keys go to the database only.** Stored encrypted in the `sources.config` JSONB field — never in `.env` as plaintext, never in environment variables, never in source code.
- **Never log credentials.** API keys (plaintext or encrypted) must not appear in console output, structured logs, or error messages.
- **Never return credentials in API responses.** The `GET /api/sources` endpoint returns `isConfigured: boolean` — never the key itself, never the encrypted value.
- **Validate server-side.** Key validation happens in API routes, never in client-side code.
- **Tamper detection.** AES-256-GCM's authentication tag ensures encrypted values cannot be modified without detection. Decryption with a wrong key or tampered ciphertext throws an error rather than returning garbage.

## Adding New Sources

Before integrating a new job data source:

1. **Read the source's API terms** completely
2. **Verify the API is intended for third-party use** — use published APIs, never scrape
3. **Configure rate limits** conservatively in `SOURCE_CONFIGS`
4. **Set `source_url`** to the source platform's listing page, not the employer's apply URL
5. **Set `descriptionPolicy: 'no_modify'`** (default for all sources)
6. **No logos or images** — text attribution only
7. **Add integration tests** that verify: source URL domain, no image fields, description integrity

## Automated Enforcement

These standards are enforced by code, not just documentation:

| Standard | Enforcement Mechanism |
|----------|----------------------|
| Description integrity | `description_raw` field is write-once, never transformed |
| Source attribution links | `source_url` validated against source platform domain in integration tests |
| No images in schema | `RawJobListing` Zod schema has no image fields; tests assert absence |
| `raw_data` not exposed | Frontend API excludes `raw_data` from responses |
| Rate limits | `canMakeRequest()` pre-check with Redis counters |
| Credentials not exposed | API routes return `isConfigured` boolean, never key values |
| Credentials encrypted at rest | AES-256-GCM encryption via `src/lib/encryption.ts`; tests verify round-trip, wrong-key rejection, and tamper detection |

---

*These are engineering standards for responsible data handling, not legal advice.*
