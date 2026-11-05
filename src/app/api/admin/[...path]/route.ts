import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdmin, checkOrigin, HttpError } from "@/server/access";
import { getSnapshot } from "@/server/snapshot";
import { mutate } from "@/server/mutations";
import { schemas, type Operation } from "@/server/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
function failure(error: unknown) {
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  if (error instanceof SyntaxError)
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const cause =
    error && typeof error === "object" && "cause" in error
      ? error.cause
      : error;
  const code =
    cause && typeof cause === "object" && "code" in cause ? cause.code : "";
  if (["23505", "23503", "23514", "40001", "40P01"].includes(String(code)))
    return NextResponse.json(
      {
        error:
          "The change conflicts with existing data or database constraints. Reload and retry; deactivate records referenced by orders rather than deleting them.",
      },
      { status: 409 },
    );
  console.error(
    "Admin API failed",
    error instanceof Error ? error.name : "Unknown error",
  );
  return NextResponse.json(
    {
      error:
        "Unable to complete the request. Check server configuration and try again.",
    },
    { status: 500 },
  );
}
export async function GET(request: Request, context: Context) {
  try {
    await requireAdmin(request.headers);
    const { path } = await context.params;
    if (path.join("/") !== "state")
      throw new HttpError(404, "Endpoint not found.");
    return NextResponse.json(await getSnapshot(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAdmin(request.headers);
    checkOrigin(request);
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new HttpError(415, "Expected application/json.");
    const { path } = await context.params;
    const operation = path.join("/");
    if (!Object.hasOwn(schemas, operation))
      throw new HttpError(404, "Endpoint not found.");
    const raw = await request.text();
    if (raw.length > 1024 * 1024)
      throw new HttpError(413, "Request too large.");
    await mutate(operation as Operation, JSON.parse(raw), session.user.id);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
