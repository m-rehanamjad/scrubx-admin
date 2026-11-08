# ScrubX Admin — Authentication & Authorization Context

> **Permanent AI Context Documentation**  
> *Last Updated: November 2026*

---

## 1. Authentication Engine: Better Auth

ScrubX Admin utilizes **Better Auth** (`better-auth` v1.7.x) self-hosted on PostgreSQL with Drizzle ORM.

### Architectural Principles
- **PostgreSQL Self-Hosted:** All credentials, sessions, and accounts reside in dedicated tables (`ba_user`, `ba_session`, `ba_account`, `ba_verification`) in the Supabase PostgreSQL database. No external SaaS auth vendor is used.
- **Strictly Internal Admin Portal:** Public registration is disabled via `emailAndPassword: { enabled: true, disableSignUp: true }`. Users cannot self-register through API or client interfaces.
- **Role-Based Access Control (RBAC):** Native support for three administrative tiers (`SUPER_ADMIN`, `ADMIN`, `STAFF`) through the Better Auth `admin()` plugin.

---

## 2. Core Authentication Files

| File | Purpose |
|---|---|
| [`src/lib/auth.ts`](file:///home/rehan/Downloads/scrubX-admin/src/lib/auth.ts) | Better Auth server configuration with Drizzle adapter and RBAC |
| [`src/lib/auth-client.ts`](file:///home/rehan/Downloads/scrubX-admin/src/lib/auth-client.ts) | React client SDK (`useSession`, `signIn.email`, `signOut`, `adminClient`) |
| [`src/lib/auth-guard.ts`](file:///home/rehan/Downloads/scrubX-admin/src/lib/auth-guard.ts) | Server-side security guards for Server Actions and RSCs |
| [`src/middleware.ts`](file:///home/rehan/Downloads/scrubX-admin/src/middleware.ts) | Edge middleware route protection inspecting session cookies |
| [`src/app/api/auth/[...all]/route.ts`](file:///home/rehan/Downloads/scrubX-admin/src/app/api/auth/[...all]/route.ts) | Next.js App Router Route Handler for Better Auth endpoints |
| [`src/app/api/auth/verify/route.ts`](file:///home/rehan/Downloads/scrubX-admin/src/app/api/auth/verify/route.ts) | Complete programmatic auth test suite endpoint |
| [`src/app/login/page.tsx`](file:///home/rehan/Downloads/scrubX-admin/src/app/login/page.tsx) | Server Component container for `/login` with Suspense |
| [`src/views/Login.tsx`](file:///home/rehan/Downloads/scrubX-admin/src/views/Login.tsx) | Client login form matching ScrubX design language |
| [`src/scripts/create-admin.ts`](file:///home/rehan/Downloads/scrubX-admin/src/scripts/create-admin.ts) | CLI provisioning script using `better-auth/crypto` password hashing |

---

## 3. Session & Cookie Lifecycle

- **Cookie Name:** `better-auth.session_token` (HTTP) / `__Secure-better-auth.session_token` (HTTPS in production).
- **Session Duration:** 7 days (`60 * 60 * 24 * 7`).
- **Update Frequency:** Session refreshed in PostgreSQL every 24 hours.
- **Cookie Cache:** Cached for 5 minutes (`maxAge: 300`) to avoid redundant database reads on consecutive requests.
- **SameSite / Security:** `sameSite: "lax"`, `httpOnly: true`, `secure: true` in production.

---

## 4. Route Protection & Authorization

### A. Edge Route Protection ([`src/middleware.ts`](file:///home/rehan/Downloads/scrubX-admin/src/middleware.ts))
Uses `getSessionCookie(request)` from `better-auth/cookies` for zero-latency Edge checks:
- Unauthenticated requests to any dashboard route are redirected to `/login?from=<pathname>`.
- Authenticated requests to `/login` are automatically redirected to `/`.
- Public assets (`/brand`, `/products`, `/proofs`, static files) and `/api/auth` bypass middleware.

### B. Server-Side Protection ([`src/lib/auth-guard.ts`](file:///home/rehan/Downloads/scrubX-admin/src/lib/auth-guard.ts))
Edge cookies can only check presence; Server Actions and Server Components re-verify database authenticity and enforce role permissions:
```typescript
import { requireAdmin, requireSuperAdmin } from "@/lib/auth-guard";

// For product creation, stock adjustment, payment verification
const adminSession = await requireAdmin();

// For store settings, managing staff accounts
const superAdminSession = await requireSuperAdmin();
```

### C. Role Hierarchy
```typescript
export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "STAFF";

const ROLE_HIERARCHY: Record<AdminRole, number> = {
  SUPER_ADMIN: 3,
  ADMIN: 2,
  STAFF: 1,
};
```
- `SUPER_ADMIN`: Full store access + staff management + store settings.
- `ADMIN`: Catalog, orders, inventory, customers, payment verification, coupons.
- `STAFF`: Read-only access to catalog and orders; order status updates.

---

## 5. Administrator Provisioning

Because public registration is disabled, admin accounts are created via server script:

```bash
# Provision default admin (admin@scrubx.pk / Admin@ScrubX2026!)
npm run auth:seed-admin

# Provision custom admin account
ADMIN_EMAIL="manager@scrubx.pk" \
ADMIN_NAME="Store Manager" \
ADMIN_PASSWORD="CustomSecurePassword123!" \
ADMIN_ROLE="ADMIN" \
npm run auth:seed-admin
```
The script uses `hashPassword` from `better-auth/crypto` (scrypt/argon2 algorithm) and creates records in `ba_user` and `ba_account`.

---

## 6. Verification Status

All 6 core authentication capabilities were verified against the live Supabase PostgreSQL database:
- Admin login with valid credentials: **PASS** (Status 200, role `SUPER_ADMIN`)
- Rejection of invalid credentials: **PASS** (Status 401)
- Session persistence via cookie: **PASS** (Verified from PostgreSQL)
- RBAC hierarchy check: **PASS**
- Public registration blocked: **PASS** (Status 400 rejected)
- Logout & session revocation: **PASS** (Database session invalidated)

---

## 7. Environment Variables Required

Configured in `.env.local` (and documented in `.env.example`):
```env
# Better Auth Secret (minimum 32 random characters)
BETTER_AUTH_SECRET="17f75554cdebbee61b5ca2302d9c636a05f834859ddb54538c9f43642e2158bc"

# Better Auth URLs
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## 8. Remaining Authentication Work
- Build a Staff Management UI page for `SUPER_ADMIN` to invite/manage staff members and change roles.
- Implement a password change flow in `/settings`.
- Add audit logging on administrative actions linked to `session.user.id`.
