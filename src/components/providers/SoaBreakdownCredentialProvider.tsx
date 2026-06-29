"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type BreakdownCredentials = {
  bpcode: string;
  district: "LR" | "HR";
};

const LEGACY_STORAGE_KEY = "finance-soa-breakdown-credentials";

type CredentialContextValue = {
  credentials: BreakdownCredentials;
  showBreakdown: boolean;
  hasCredentials: boolean;
  viewBreakdown: (next: BreakdownCredentials) => void;
};

const defaultCredentials: BreakdownCredentials = {
  bpcode: "",
  district: "HR",
};

const CredentialContext = createContext<CredentialContextValue | null>(null);

export function SoaBreakdownCredentialProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [credentials, setCredentials] =
    useState<BreakdownCredentials>(defaultCredentials);
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  }, []);

  const viewBreakdown = useCallback((next: BreakdownCredentials) => {
    const normalized: BreakdownCredentials = {
      bpcode: next.bpcode.trim().toUpperCase(),
      district: next.district,
    };
    setCredentials(normalized);
    setShowBreakdown(true);
  }, []);

  const value = useMemo<CredentialContextValue>(
    () => ({
      credentials,
      showBreakdown,
      hasCredentials:
        showBreakdown && credentials.bpcode.trim().length > 0,
      viewBreakdown,
    }),
    [credentials, showBreakdown, viewBreakdown],
  );

  return (
    <CredentialContext.Provider value={value}>
      {children}
    </CredentialContext.Provider>
  );
}

export function useSoaBreakdownCredentials() {
  const context = useContext(CredentialContext);
  if (!context) {
    throw new Error(
      "useSoaBreakdownCredentials must be used inside SoaBreakdownCredentialProvider.",
    );
  }
  return context;
}
