'use client';

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
}

const ToastContext = React.createContext<{
  toast: (options: ToastOptions) => void;
} | null>(null);

const ICONS: Record<ToastVariant, React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const ICON_STYLES: Record<ToastVariant, string> = {
  success: "text-emerald-600",
  error: "text-rose-600",
  info: "text-sky-600",
  warning: "text-amber-600",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback(
    (options: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const item: ToastItem = { id, variant: "success", ...options };
      setItems((prev) => [...prev.slice(-3), item]);
      window.setTimeout(() => dismiss(id), item.duration ?? 4200);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const Icon = ICONS[item.variant ?? "success"];
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.97 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-[0_12px_32px_-14px_rgba(13,20,36,0.32)]"
              >
                <Icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", ICON_STYLES[item.variant ?? "success"])} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink">{item.title}</p>
                  {item.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{item.description}</p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(item.id)}
                  className="rounded p-1 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                  aria-label="Dismiss notification"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
