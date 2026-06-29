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
  unitNo?: string;
};

const STORAGE_KEY = "finance-soa-breakdown-credentials";

type CredentialContextValue = {
  credentials: BreakdownCredentials;
  hasCredentials: boolean;
  isHydrated: boolean;
  saveCredentials: (next: BreakdownCredentials) => void;
};

const defaultCredentials: BreakdownCredentials = {
  bpcode: "",
  district: "HR",
  unitNo: "",
};

const CredentialContext = createContext<CredentialContextValue | null>(null);

export function SoaBreakdownCredentialProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [credentials, setCredentials] =
    useState<BreakdownCredentials>(defaultCredentials);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<BreakdownCredentials>;
        setCredentials({
          bpcode: parsed.bpcode?.trim() ?? "",
          district: parsed.district === "LR" ? "LR" : "HR",
          unitNo: parsed.unitNo?.trim() ?? "",
        });
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsHydrated(true);
  }, []);

  const saveCredentials = useCallback((next: BreakdownCredentials) => {
    const normalized: BreakdownCredentials = {
      bpcode: next.bpcode.trim().toUpperCase(),
      district: next.district,
      unitNo: next.unitNo?.trim() ?? "",
    };
    setCredentials(normalized);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }, []);

  const value = useMemo<CredentialContextValue>(
    () => ({
      credentials,
      hasCredentials: credentials.bpcode.trim().length > 0,
      isHydrated,
      saveCredentials,
    }),
    [credentials, isHydrated, saveCredentials],
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
