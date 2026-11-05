# ScrubX Admin

Full-stack Next.js App Router admin panel. **Supabase is used only as PostgreSQL storage**. Better Auth owns passwords, sessions, cookies, bans and roles; Supabase Auth and the browser Supabase SDK are not used.

## Setup

Requires Node.js 22+ and a Supabase PostgreSQL project.

```bash
npm ci
cp .env.example .env.local
# Fill DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL locally.
npm run db:migrate
# Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD locally, then:
npm run admin:create
# Remove ADMIN_PASSWORD after bootstrap.
npm run dev -- --hostname 0.0.0.0
```

- Get the **transaction pooler connection URI** from Supabase → Connect (usually port 6543). Use a privileged server-only database user, URL-encode the password, and retain TLS. Prepared statements are disabled for pooler compatibility. `SUPABASE_DATABASE_URL` is accepted as an alternative to `DATABASE_URL`.
- Generate a secret with `openssl rand -base64 48`. Never prefix credentials with `NEXT_PUBLIC_`, commit `.env.local`, or put secrets in `store_settings`.
- `BETTER_AUTH_URL` must be the **exact browser-facing origin**, e.g. `https://admin.example.com`. For Arena, use the actual HTTPS preview origin, not `localhost`. Requests use relative URLs and need no browser access to a DB host.
- Migrations are applied in filename order inside transactions with an advisory lock and recorded in `scrubx_migrations`. Use this runner for a fresh project. If the initial SQL was already applied manually or through Supabase CLI, use that same migration workflow for the new migration rather than replaying the initial schema through this runner.
- `admin:create` hashes the password with Better Auth's own password hasher and atomically inserts the user/credential account. It refuses to overwrite an existing user. It is an operator-only command, not a web endpoint. There are no default credentials.
- No live Supabase credentials are included. The application cannot connect to your project until you configure the environment and run migrations.

## Authentication and authorization

- `/login`: email/password login; public registration is disabled for this admin application.
- `/api/auth/[...all]`: Better Auth's Next.js handler with the Drizzle PostgreSQL adapter, mapped to the existing `ba_*` tables from `database.md`.
- Roles: `admin` and `customer`. Every admin page checks the session on the server. **Every admin API independently rechecks the session, role and ban state**; UI checks are not the security boundary. A customer account has no admin access.
- Sessions expire after eight hours, use HTTP-only cookies, use secure cookies in production, and are revoked on sign-out. Cookies are not cached as a replacement for database authorization.
- Better Auth throttling uses `ba_rate_limit` so it works across serverless instances. Configure trusted proxy/IP forwarding for your deployment before launch; without a trusted client IP, Better Auth safely falls back to a shared per-path bucket. Do not blindly trust client-supplied forwarding headers. Add edge/WAF limits for all write APIs and periodically prune old rate-limit/session/verification rows.
- Mutation APIs enforce the configured origin (CSRF protection), JSON payload limits, allowlisted operations, Zod validation and parameterized queries. Public errors do not expose database credentials or SQL.
- All application tables enable RLS with **no public policies**, as required by `database.md`. Only privileged server connections may query them. The migration runner requires DDL privileges; use separate deployment credentials if appropriate.

## API and data flow

The existing screens now use a server-backed context, not localStorage. The provider initially fetches `GET /api/admin/state`, displays real loading/errors, and serializes writes. It reloads authoritative database state after successful writes; failures show an error banner and do not run success toasts or navigation. No mock catalogue, customers, orders, or payments are seeded. The only bootstrap rows are the six supported payment methods, all **disabled** until configured with real details.

`GET /api/admin/state` returns the normalized database projected into the existing UI's view models. It is private/no-store. Current lists/search/chart filters and pagination operate on this authenticated snapshot; for large stores, replace the snapshot with paginated per-resource reads and server-side aggregates before loading large datasets.

All writes are `POST /api/admin/<operation>` with JSON. Supported operations:

| Area | Operations |
|---|---|
| Catalogue | `saveProduct`, `deleteProduct`, `setProductStatus`, `saveCategory`, `deleteCategory`, `toggleCategoryStatus` |
| Fulfilment | `setOrderStatus`, `setOrderCourier`, `addOrderNote` |
| Payments | `approvePayment`, `rejectPayment`, `savePaymentMethod` |
| Inventory | `setVariantStock` |
| Configuration | `saveCoupon`, `deleteCoupon`, `saveEngravingOption`, `deleteEngravingOption`, `saveShippingMethod`, `deleteShippingMethod`, `updateSettings` |
| Customers | `addCustomerNote` |

Payload shapes are defined in `src/server/validation.ts`. Mutations return `{ "ok": true }`; errors return `{ "error": "..." }` with 400/401/403/404/409/413/415/500 as appropriate. These are admin management APIs, not a public storefront checkout or payment gateway.

### Data integrity

- Existing schema/migration follows `database.md`; the follow-up migration adds persistent auth throttling, auth indexes, disabled payment-method configuration, and mandatory order-item references.
- Money remains PostgreSQL `numeric`; historical order prices/totals are not rewritten when products change. UI compatibility mapping explicitly translates `pending` ↔ `pending_cod`, `paid` ↔ `approved`, and `awaiting_verification` ↔ `submitted`.
- Product writes are transactional, verify nested resource ownership, and use an `updatedAt` conflict check. Product deletion is soft. Removed variants are deactivated instead of deleting historical references; historical colors are retained.
- New variant initial stock is audited. Existing stock changes go through Inventory, with row locking, expected-stock conflict checks, reserved-stock validation, and an inventory movement attributed to the current admin. Reserved stock cannot be supplied by the browser.
- Payment review locks the order and payment, validates state and full payment amount, prevents duplicate review, records reviewer/time, and atomically moves the order to confirmed or awaiting payment.
- Order transitions are allowlisted. Shipping consumes reserved stock; cancellation releases reservations. These operations assume storefront checkout already reserved each order's stock. Imported orders without matching reservations must be reconciled first. Refund status does not automatically restock physical goods or initiate a financial refund.
- PostgreSQL constraints enforce nonnegative amounts, stock availability, generated line totals, order total consistency and the no-COD-with-engraving rule. Referenced configuration records should be deactivated, not deleted.
- The schema has one `estimated_days` value, so shipping saves the UI's maximum delivery days. Unsupported prototype controls (Kids gender, featured toggle, mock image picker, demo reset) were removed rather than inventing conflicting columns.

## Images and operational scope

Images are **not** stored in Supabase Storage. The product form accepts an existing HTTPS ImageKit URL and its real ImageKit file ID, which are saved in `product_images`. Upload/signing/deletion against ImageKit is not implemented in this database/auth integration; upload externally first. Keep customer logos private in ImageKit. Removing image metadata does not delete the underlying ImageKit file.

Notification toggles persist configuration only; no email/WhatsApp delivery worker is implemented. Password-reset email delivery, MFA, payment-deadline cancellation jobs, public checkout/reservations, and optional Phase 2 tables in `database.md` are separate integrations, not silently simulated here. Provision additional users/roles through a trusted operator workflow; no public role selection exists.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Tests run the SQL migrations in PGlite (real PostgreSQL compiled to WASM; only the unavailable `pgcrypto` extension declaration is skipped because UUID generation is built in), exercise Better Auth login/session/sign-out, registration/origin/password rejection, role checks, API validation, RLS and inventory/order constraints. They require no production credentials and do not prove connectivity to your hosted Supabase project.

Fonts are self-hosted via Fontsource, so builds do not need Google Fonts network access. For production: use HTTPS, a trusted proxy, database backups, log monitoring, least-privilege server credentials, and your deployment's secret manager.
