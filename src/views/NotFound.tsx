'use client';

import Link from "next/link";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/shared/empty-state";

export default function NotFoundPage() {
  return (
    <div className="py-10">
      <EmptyState
        icon={<span className="text-[15px] font-semibold">404</span>}
        title="Page not found"
        description="The page you were looking for does not exist in this admin panel."
        action={
          <Button asChild>
            <Link href="/">Back to dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
