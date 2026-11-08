import { z } from "zod";

export const engravingTypeEnumSchema = z.enum(["name", "logo"]);

export const createEngravingOptionSchema = z
  .object({
    type: engravingTypeEnumSchema.default("name"),
    name: z.string().trim().min(2, "Engraving name must be at least 2 characters").max(100),
    description: z.string().max(255).optional().nullable(),
    price: z.number().min(0, "Price cannot be negative").default(0),
    maxCharacters: z.number().int().positive("Max characters must be a positive integer").optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => data.type !== "name" || (data.maxCharacters != null && data.maxCharacters > 0),
    { message: "Text engraving requires a positive maximum character limit", path: ["maxCharacters"] }
  );

export const updateEngravingOptionSchema = z.object({
  id: z.string().uuid("Invalid engraving option ID"),
  type: engravingTypeEnumSchema.optional(),
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().max(255).optional().nullable(),
  price: z.number().min(0).optional(),
  maxCharacters: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const toggleEngravingOptionStatusSchema = z.object({
  id: z.string().uuid("Invalid engraving option ID"),
  isActive: z.boolean(),
});

export const deleteEngravingOptionSchema = z.object({
  id: z.string().uuid("Invalid engraving option ID"),
});

export const engravingOptionFilterSchema = z.object({
  type: engravingTypeEnumSchema.optional(),
  isActive: z.boolean().optional(),
});

export type EngravingType = z.infer<typeof engravingTypeEnumSchema>;
export type CreateEngravingOptionInput = z.input<typeof createEngravingOptionSchema>;
export type CreateEngravingOptionOutput = z.output<typeof createEngravingOptionSchema>;
export type UpdateEngravingOptionInput = z.input<typeof updateEngravingOptionSchema>;
export type UpdateEngravingOptionOutput = z.output<typeof updateEngravingOptionSchema>;
export type EngravingOptionFilter = z.infer<typeof engravingOptionFilterSchema>;
