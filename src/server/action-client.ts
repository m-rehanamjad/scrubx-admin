import { z } from "zod";
import { getCurrentAdmin, assertRole, type AdminContext } from "./auth.ts";
import type { AdminRole } from "../db/schema/index.ts";
import { toActionError } from "./errors.ts";
import type { ActionResponse } from "./types.ts";

export interface ActionConfig<TInput> {
  /**
   * Optional Zod schema to parse and validate incoming payload.
   */
  schema?: z.ZodType<TInput>;

  /**
   * Minimum required role hierarchy level.
   * Defaults to 'staff'. Set to null to allow unauthenticated invocations.
   */
  requiredRole?: AdminRole | null;
}

/**
 * Creates a type-safe, protected Server Action wrapper.
 *
 * Guarantees:
 * 1. Automatic session authentication & role hierarchy verification.
 * 2. Automatic input parsing and field error formatting via Zod.
 * 3. Consistent, sanitized ActionResponse<T> with zero database secret leaks.
 */
export function createSafeAction<TInput, TOutput>(
  config: ActionConfig<TInput>,
  handler: (params: { input: TInput; admin: AdminContext }) => Promise<TOutput>
): (input: TInput) => Promise<ActionResponse<TOutput>> {
  return async (rawInput: TInput): Promise<ActionResponse<TOutput>> => {
    try {
      // 1. Authorization
      let admin: AdminContext = {
        id: "anonymous",
        email: "anonymous@scrubx.pk",
        name: "Anonymous User",
        role: "staff",
      };

      if (config.requiredRole !== null) {
        const requiredRole = config.requiredRole ?? "staff";
        admin = await getCurrentAdmin();
        assertRole(admin, [requiredRole]);
      }

      // 2. Input Validation
      let parsedInput: TInput = rawInput;
      if (config.schema) {
        parsedInput = await config.schema.parseAsync(rawInput);
      }

      // 3. Handler Execution
      const result = await handler({ input: parsedInput, admin });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const serialized = toActionError(error);
      return {
        success: false,
        error: serialized.error,
        code: serialized.code,
        fieldErrors: serialized.fieldErrors,
      };
    }
  };
}
