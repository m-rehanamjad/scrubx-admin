import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinimumRole } from "@/lib/auth-guard";

export async function GET() {
  const results: { test: string; status: "PASS" | "FAIL"; detail?: string }[] = [];

  const testEmail = "admin@scrubx.pk";
  const validPassword = process.env.ADMIN_PASSWORD || "Admin@ScrubX2026!";
  const invalidPassword = "WrongPassword999!";

  let activeCookie = "";

  // --------------------------------------------------------------------------
  // TEST 1: Admin Login with Valid Credentials
  // --------------------------------------------------------------------------
  try {
    const res = await auth.api.signInEmail({
      body: {
        email: testEmail,
        password: validPassword,
      },
      asResponse: true,
    });

    const setCookie = res.headers.get("set-cookie") || "";
    const body = (await res.json()) as { token?: string; user?: { role?: string; email?: string } };

    activeCookie = setCookie;

    const ok =
      res.status === 200 &&
      Boolean(body?.user) &&
      body?.user?.email === testEmail &&
      body?.user?.role === "super_admin" &&
      setCookie.includes("better-auth.session_token");

    results.push({
      test: "1. Admin Login with Valid Credentials",
      status: ok ? "PASS" : "FAIL",
      detail: `Role: ${body?.user?.role}, Status: ${res.status}`,
    });
  } catch (err: unknown) {
    results.push({
      test: "1. Admin Login with Valid Credentials",
      status: "FAIL",
      detail: (err as Error).message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST 2: Rejection of Invalid Credentials
  // --------------------------------------------------------------------------
  try {
    const res = await auth.api.signInEmail({
      body: {
        email: testEmail,
        password: invalidPassword,
      },
      asResponse: true,
    });

    const ok = res.status !== 200;
    results.push({
      test: "2. Rejection of Invalid Credentials",
      status: ok ? "PASS" : "FAIL",
      detail: `Status: ${res.status}`,
    });
  } catch {
    results.push({
      test: "2. Rejection of Invalid Credentials",
      status: "PASS",
      detail: "Correctly thrown / rejected",
    });
  }

  // --------------------------------------------------------------------------
  // TEST 3: Session Persistence & Server-Side Validation
  // --------------------------------------------------------------------------
  try {
    const rawCookie = activeCookie.split(";")[0];
    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: rawCookie,
      }),
    });

    const ok =
      Boolean(session?.session) &&
      session?.user?.email === testEmail &&
      session?.user?.role === "super_admin";

    results.push({
      test: "3. Session Persistence & PostgreSQL Retrieval",
      status: ok ? "PASS" : "FAIL",
      detail: `Session User: ${session?.user?.email}, Role: ${session?.user?.role}`,
    });
  } catch (err: unknown) {
    results.push({
      test: "3. Session Persistence & PostgreSQL Retrieval",
      status: "FAIL",
      detail: (err as Error).message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST 4: Role-Based Authorization Guard Logic
  // --------------------------------------------------------------------------
  const rbacOk =
    hasMinimumRole("super_admin", "super_admin") === true &&
    hasMinimumRole("super_admin", "admin") === true &&
    hasMinimumRole("super_admin", "staff") === true &&
    hasMinimumRole("admin", "super_admin") === false &&
    hasMinimumRole("admin", "admin") === true &&
    hasMinimumRole("admin", "staff") === true &&
    hasMinimumRole("staff", "admin") === false &&
    hasMinimumRole("staff", "staff") === true &&
    hasMinimumRole(undefined, "staff") === false;

  results.push({
    test: "4. Role-Based Access Control (RBAC) Hierarchy",
    status: rbacOk ? "PASS" : "FAIL",
  });

  // --------------------------------------------------------------------------
  // TEST 5: Public Registration Blocked (Internal Admin Hardening)
  // --------------------------------------------------------------------------
  try {
    const res = await auth.api.signUpEmail({
      body: {
        email: "hacker@example.com",
        password: "Password123!",
        name: "Intruder",
      },
      asResponse: true,
    });

    results.push({
      test: "5. Public Sign-Up Disabled",
      status: res.status !== 200 ? "PASS" : "FAIL",
      detail: `Status: ${res.status}`,
    });
  } catch {
    results.push({
      test: "5. Public Sign-Up Disabled",
      status: "PASS",
      detail: "Public registration blocked (disableSignUp=true)",
    });
  }

  // --------------------------------------------------------------------------
  // TEST 6: Logout & Session Revocation
  // --------------------------------------------------------------------------
  try {
    const rawCookie = activeCookie.split(";")[0];
    await auth.api.signOut({
      headers: new Headers({
        cookie: rawCookie,
      }),
      asResponse: true,
    });

    const checkSession = await auth.api.getSession({
      headers: new Headers({
        cookie: rawCookie,
      }),
    });

    results.push({
      test: "6. Logout & Session Revocation",
      status: !checkSession ? "PASS" : "FAIL",
      detail: checkSession ? "Session still active" : "Session revoked cleanly",
    });
  } catch (err: unknown) {
    results.push({
      test: "6. Logout & Session Revocation",
      status: "FAIL",
      detail: (err as Error).message,
    });
  }

  const allPassed = results.every((r) => r.status === "PASS");

  return NextResponse.json(
    {
      success: allPassed,
      totalTests: results.length,
      passed: results.filter((r) => r.status === "PASS").length,
      failed: results.filter((r) => r.status === "FAIL").length,
      results,
    },
    { status: allPassed ? 200 : 500 }
  );
}
