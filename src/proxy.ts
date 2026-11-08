import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Inspect Better Auth session cookie presence (fast Edge check)
  const sessionCookie = getSessionCookie(request);

  // If visiting /login:
  if (pathname === "/login") {
    // Authenticated users are redirected away from login to dashboard
    if (sessionCookie) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // All other dashboard routes require active session authentication
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (Better Auth handler endpoints)
     * - _next/static (static JS/CSS assets)
     * - _next/image (image optimization files)
     * - favicon.ico, favicon.svg
     * - public asset directories (brand/, proofs/)
     * - static image file formats (.svg, .png, .jpg, .jpeg, .gif, .webp, .ico)
     */
    "/((?!api/auth|_next/static|_next/image|favicon\\.ico|favicon\\.svg|brand/|proofs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
