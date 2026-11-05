'use client';

import * as React from "react";
import { StoreProvider } from "@/data/store";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <ToastProvider>
        <TooltipProvider delayDuration={200}>
          {children}
        </TooltipProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
