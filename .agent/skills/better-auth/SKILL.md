---
name: better-auth
description: >-
  Enforce Better Auth for session management, user roles, authentication flows,
  and secure route protection across Next.js 16 App Router Server Actions,
  Route Handlers, and Middleware.
---

# Better Auth Implementation Skill for Next.js App Router

This skill enforces standards and code patterns for integrating **Better Auth** with Next.js App Router and PostgreSQL (via Supabase / Drizzle ORM).

---

## 1. Core Architecture Principles

1. **Self-Hosted on PostgreSQL**: Better Auth stores users, sessions, accounts, and verification tokens directly in our PostgreSQL database using dedicated tables prefixed with `ba_`:
   - `ba_user`
   - `ba_session`
   - `ba_account`
   - `ba_verification`
2. **Server-Side Session Validation**: Always validate user sessions in React Server Components and Server Actions using `auth.api.getSession({ headers: await headers() })`. Never rely solely on client-side state for authorization.
3. **Role-Based Access Control (RBAC)**: All admin routes and mutation actions must verify `session.user.role === 'admin'`.
4. **Cookie Security**: Enforce `httpOnly`, `sameSite: "lax"`, and `secure: true` in production.

---

## 2. Server Configuration (`src/lib/auth.ts`)

Configure the Better Auth server instance using the Drizzle PostgreSQL adapter:

```typescript
// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.baUser,
      session: schema.baSession,
      account: schema.baAccount,
      verification: schema.baVerification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Optional: set to true in production
  },
  user: {
    modelName: "baUser",
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "customer",
        input: false, // Prevent users from self-assigning role
      },
    },
  },
  session: {
    modelName: "baSession",
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes cache
    },
  },
  account: {
    modelName: "baAccount",
  },
  verification: {
    modelName: "baVerification",
  },
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ],
});

export type Session = typeof auth.$Infer.Session;
```

---

## 3. Client Instance (`src/lib/auth-client.ts`)

Provide a strongly typed React client for login, logout, and reactive session state:

```typescript
// src/lib/auth-client.ts
"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
});

export const { useSession, signIn, signOut, signUp } = authClient;
```

---

## 4. API Route Handler (`src/app/api/auth/[...all]/route.ts`)

Expose Better Auth API endpoints via Next.js App Router Route Handler:

```typescript
// src/app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth.handler);
```

---

## 5. Middleware Protection (`src/middleware.ts`)

Protect admin routes (`/`, `/products`, `/orders`, `/inventory`, `/settings`, etc.) from unauthenticated or non-admin access:

```typescript
// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that do not require authentication
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/brand") ||
    pathname.startsWith("/products") && request.method === "GET" // If public catalogue exists
  ) {
    return NextResponse.next();
  }

  // Fast check: inspect better-auth session cookie presence
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

---

## 6. Server-Side Protection in Server Components & Actions

Always verify the session on the server before serving protected data or executing mutations:

### Helper: `src/lib/auth-guard.ts`
```typescript
// src/lib/auth-guard.ts
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export async function requireAuth() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();

  if (session.user.role !== "admin") {
    redirect("/unauthorized");
  }

  return session;
}
```

### Usage in Server Actions:
```typescript
// src/actions/products.ts
"use server";

import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/db";
import { products } from "@/db/schema";
import { revalidatePath } from "next/cache";

export async function updateProductStatusAction(productId: string, status: "draft" | "active" | "archived") {
  // 1. Verify admin session
  const session = await requireAdmin();

  // 2. Execute mutation
  await db.update(products)
    .set({ status, updatedAt: new Date() })
    .where(eq(products.id, productId));

  // 3. Revalidate cache
  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);

  return { success: true };
}
```

---

## 7. Environment Variables Required

```env
# Better Auth
BETTER_AUTH_SECRET="<generate-using-openssl-rand-hex-32>"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```
