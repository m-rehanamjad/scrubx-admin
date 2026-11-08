import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireStaffContext } from "@/server/auth";
import { inventoryService } from "@/server/services/inventory.service";
import { inventoryMovementFilterSchema } from "@/server/validation/inventory";
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
 * GET /api/inventory/movements
 * Retrieves paginated audit history of inventory movements.
 * Requires at least staff privileges.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireStaffContext({ redirect: false });
    const searchParams = request.nextUrl.searchParams;

    const rawFilter = {
      variantId: searchParams.get("variantId") || undefined,
      productId: searchParams.get("productId") || undefined,
      orderId: searchParams.get("orderId") || undefined,
      reason: (searchParams.get("reason") as any) || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
    };

    const filter = await inventoryMovementFilterSchema.parseAsync(rawFilter);
    const result = await inventoryService.getMovements(filter, admin);

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return handleApiError(err, "GET /api/inventory/movements");
  }
}
