import type { Metadata } from "next";
import { Suspense } from "react";
import LoginPage from "@/views/Login";

export const metadata: Metadata = {
  title: "Admin Sign In",
  description: "Secure administrator sign-in for ScrubX Pakistan.",
};

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
