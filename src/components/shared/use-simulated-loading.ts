import { useEffect, useState } from "react";

/**
 * Simulates a short data fetch so loading states are visible while the
 * prototype swaps between pages. Purely cosmetic — data is local.
 */
export function useSimulatedLoading(delay = 350, deps: unknown[] = []) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => setLoading(false), delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return loading;
}
