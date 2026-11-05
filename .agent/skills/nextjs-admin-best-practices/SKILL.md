---
name: nextjs-admin-best-practices
description: >-
  Enforce React Server Components (RSC), efficient server-side data fetching with Drizzle ORM,
  Server Actions, strict TypeScript typing, error boundaries, and optimistic UI for Next.js 16
  admin panels.
---

# Next.js 16 Admin Best Practices Skill

This skill enforces enterprise architecture patterns for Next.js 16 App Router e-commerce admin applications.

---

## 1. React Server Components (RSC) Architecture

1. **Server Components by Default**:
   - Every file in `src/app/` is an RSC unless marked with `'use client'`.
   - Never add `'use client'` to page containers (`page.tsx`) or layouts (`layout.tsx`).
   - Page containers fetch data directly from PostgreSQL via Drizzle ORM and pass plain JSON serializable props to client widgets.

2. **Push `'use client'` to the Leaves**:
   - Only add `'use client'` to specific interactive widgets (modals, dropdown menus, form submit buttons, filter bars).
   - Keep data-heavy tables as Server Components where possible, isolating only row actions or search inputs into client boundaries.

```
app/orders/
├── page.tsx             [Server Component - queries Drizzle directly]
├── loading.tsx          [Server Component - instant skeleton matching grid]
├── error.tsx            ['use client' - error boundary with reset button]
└── _components/
    ├── orders-table.tsx [Server Component - renders static cells]
    ├── status-select.tsx['use client' - dropdown triggering Server Action]
    └── search-filter.tsx['use client' - syncs search params to URL]
```

---

## 2. Server-Side Data Fetching (No Internal `fetch()`)

In Next.js App Router, Server Components run directly in Node.js on the server:
- **DO NOT** make HTTP `fetch()` calls to internal API routes (e.g. `fetch('/api/products')`). That adds unnecessary network latency, duplicate serialization, and DNS roundtrips.
- **DO** call database query helpers directly using Drizzle ORM:

```typescript
// src/app/products/page.tsx (Server Component)
import { db } from "@/db";
import { products, productVariants, productCategories } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ProductsTable } from "./_components/products-table";

export default async function ProductsPage() {
  const allProducts = await db.query.products.findMany({
    orderBy: [desc(products.createdAt)],
    with: {
      category: true,
      variants: {
        with: {
          inventory: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <ProductsTable products={allProducts} />
    </div>
  );
}
```

---

## 3. Mutations via Server Actions (`'use server'`)

All form submissions, status toggles, stock adjustments, and record deletions MUST use Server Actions:

### Pattern: Typed Result with Zod Validation
```typescript
// src/actions/categories.ts
"use server";

import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/db";
import { productCategories } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const createCategorySchema = z.object({
  name: z.string().min(2, "Category name must be at least 2 characters"),
  slug: z.string().min(2),
  parentId: z.string().uuid().optional().nullable(),
  description: z.string().optional(),
});

export type ActionState<T = void> =
  | { success: true; data: T; error?: never }
  | { success: false; error: string; data?: never };

export async function createCategoryAction(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const validated = createCategorySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    parentId: formData.get("parentId") || null,
    description: formData.get("description"),
  });

  if (!validated.success) {
    return {
      success: false,
      error: validated.error.errors[0]?.message || "Invalid input data",
    };
  }

  try {
    await db.insert(productCategories).values(validated.data);
    revalidatePath("/categories");
    return { success: true, data: undefined };
  } catch (err: any) {
    if (err.code === "23505") {
      return { success: false, error: "A category with this slug or name already exists." };
    }
    return { success: false, error: "Failed to create category. Please try again." };
  }
}
```

---

## 4. Client-Side Form Integration (React 19)

Pair Server Actions with React 19's `useActionState` and `useFormStatus`:

```tsx
// src/components/create-category-dialog.tsx
"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { createCategoryAction } from "@/actions/categories";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Create Category"}
    </Button>
  );
}

export function CreateCategoryDialog({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction] = useActionState(createCategoryAction, null);
  const { toast } = useToast();

  useEffect(() => {
    if (state?.success) {
      toast({ title: "Category created successfully", variant: "success" });
      onSuccess();
    } else if (state?.error) {
      toast({ title: "Error", description: state.error, variant: "error" });
    }
  }, [state, toast, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {/* Inputs */}
      <SubmitButton />
    </form>
  );
}
```

---

## 5. Strict TypeScript Standards

1. **Zero `any`**: Derive all data structures from database models or Zod schemas:
   ```typescript
   import type { products, productVariants } from "@/db/schema";

   export type ProductWithVariants = typeof products.$inferSelect & {
     variants: (typeof productVariants.$inferSelect)[];
   };
   ```
2. **Next.js 16 Page Props Typing**: Dynamic route parameters and query search parameters MUST be typed as Promises:
   ```typescript
   interface PageProps {
     params: Promise<{ id: string }>;
     searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
   }

   export default async function Page({ params, searchParams }: PageProps) {
     const { id } = await params;
     const { page, q } = await searchParams;
     // ...
   }
   ```

---

## 6. URL-Driven State for Admin Filtering & Pagination

Store table filters, pagination numbers, and search terms directly in the URL search params so URLs are bookmarkable, shareable, and refresh-safe:

```typescript
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function TableSearchInput({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleSearch(term: string) {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set("q", term);
      params.set("page", "1"); // Reset to page 1
    } else {
      params.delete("q");
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <input
      defaultValue={defaultValue}
      onChange={(e) => handleSearch(e.target.value)}
      placeholder="Search..."
    />
  );
}
```

---

## 7. Error Handling & Loading Skeletons

- **`error.tsx`**: Must be placed in route subdirectories to isolate failures to that route segment rather than taking down the entire dashboard shell.
- **`loading.tsx`**: Stream layout immediately with Tailwind skeleton cards and table rows while RSC data resolves.
