import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdminContext } from "@/server/auth";
import { inventoryService } from "@/server/services/inventory.service";
import { adjustStockSchema } from "@/server/validation/inventory";
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
        error: "Validation failed.",
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
 * POST /api/inventory/adjust
 * Executes manual stock adjustment or restocking using transactional row locks.
 * Strictly requires administrator (admin or super_admin) privileges.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminContext();
    const body = await request.json();

    const input = await adjustStockSchema.parseAsync(body);
    const updated = await inventoryService.adjustStock(input, admin);

    return NextResponse.json({
      success: true,
      data: updated,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return handleApiError(err, "POST /api/inventory/adjust");
  }
}
