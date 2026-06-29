"use client";

import { useEffect, useState } from "react";

export function useSlowLoadingMessage(isLoading: boolean): string | null {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setMessage(null);
      return;
    }

    const t1 = setTimeout(() => setMessage("This may take a moment..."), 4000);
    const t2 = setTimeout(
      () => setMessage("Still loading. Billing system is busy. Please wait."),
      12000,
    );

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isLoading]);

  return message;
}
