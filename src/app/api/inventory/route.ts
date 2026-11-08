import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireStaffContext } from "@/server/auth";
import { inventoryService } from "@/server/services/inventory.service";
import { inventoryFilterSchema } from "@/server/validation/inventory";
import { AppError } from "@/server/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function handleApiError(err: unknown, context: string) {
  if (err instanceof AppError) {
    return NextResponse.json(
      {
        error: err.message,
        code: err.code,
        details: err.details,
      },
      { status: err.statusCode }
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid query parameters.",
        code: "VALIDATION_ERROR",
        fieldErrors: err.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  console.error(`[API Error - ${context}]:`, err);
  return NextResponse.json(
    {
      error: "An unexpected internal server error occurred.",
      code: "INTERNAL_SERVER_ERROR",
    },
    { status: 500 }
  );
}

/**
 * GET /api/inventory
 * Retrieves filtered, paginated catalog inventory and optional summary KPI statistics.
 * Requires at least staff privileges.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireStaffContext({ redirect: false });
    const searchParams = request.nextUrl.searchParams;

    const rawFilter = {
      q: searchParams.get("q") || undefined,
      categoryId: searchParams.get("categoryId") || undefined,
      status: (searchParams.get("status") as any) || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
      sortBy: (searchParams.get("sortBy") as any) || undefined,
      sortOrder: (searchParams.get("sortOrder") as any) || undefined,
    };

    const filter = await inventoryFilterSchema.parseAsync(rawFilter);
    const result = await inventoryService.getInventory(filter, admin);

    const includeSummary = searchParams.get("summary") === "true";
    let summary = undefined;
    if (includeSummary) {
      summary = await inventoryService.getInventorySummary(admin);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        ...(summary ? { summary } : {}),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return handleApiError(err, "GET /api/inventory");
  }
}
