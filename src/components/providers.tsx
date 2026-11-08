'use client';

import * as React from "react";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <TooltipProvider delayDuration={200}>
        {children}
      </TooltipProvider>
    </ToastProvider>
  );
}
