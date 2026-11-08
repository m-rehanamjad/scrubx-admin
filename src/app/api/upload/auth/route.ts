import { NextResponse } from "next/server";
import { imagekit } from "@/lib/imagekit";
import { getSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/upload/auth
 * Generates secure, short-lived authentication parameters for client-side ImageKit uploads.
 * Restricted to authenticated staff and administrators.
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized: Authentication required to generate upload signatures." },
        { status: 401 }
      );
    }

    const user = session.user as typeof session.user & { banned?: boolean };
    if (user.banned) {
      return NextResponse.json(
        { error: "Forbidden: Account is suspended." },
        { status: 403 }
      );
    }

    const authParams = imagekit.getAuthenticationParameters();
    return NextResponse.json(authParams);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[ImageKit Auth Error]:", error);
    return NextResponse.json(
      { error: "Failed to generate upload authentication credentials." },
      { status: 500 }
    );
  }
}
