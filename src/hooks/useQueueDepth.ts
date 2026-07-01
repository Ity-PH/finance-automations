"use client";

import { useEffect, useRef, useState } from "react";

export function useQueueDepth(isLoading: boolean): number | null {
  const [depth, setDepth] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setDepth(null);
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      startTimerRef.current = null;
      intervalRef.current = null;
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch("/api/soa-breakdown/queue", {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { depth: number };
          setDepth(data.depth);
        }
      } catch {
        // Queue depth is best-effort loading context only.
      }
    };

    startTimerRef.current = setTimeout(() => {
      poll();
      intervalRef.current = setInterval(poll, 3000);
    }, 2000);

    return () => {
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLoading]);

  return depth;
}
