"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Step = "email" | "code";

function isSafeRelativePath(path: string | null): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//");
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = isSafeRelativePath(searchParams.get("next"))
    ? searchParams.get("next")!
    : "/soa-breakdown";
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestCode = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setMessage(data.message || "If this address is authorized, a login code has been sent.");
      setStep("code");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Incorrect code. Please try again.");
        return;
      }

      router.push(nextPath);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <header className="mb-10">
        <h1 className="text-2xl font-bold tracking-tight">Serendra Finance</h1>
        <p className="mt-2 text-sm text-gray-500">
          {step === "email"
            ? "Sign in with your authorized email address."
            : `Enter the 6-digit code sent to ${email}.`}
        </p>
      </header>

      {step === "email" ? (
        <form onSubmit={requestCode} className="space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
              placeholder="you@example.com"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting || !email.trim()}
            className="w-full cursor-pointer bg-black py-3 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-300"
          >
            {isSubmitting ? "Sending…" : "Send Code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-4">
          {message && <p className="text-sm text-gray-500">{message}</p>}

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Login Code
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              className="border border-gray-300 bg-white px-3 py-2 text-center text-lg tracking-[0.5em] text-black focus:border-black focus:outline-none"
              placeholder="000000"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting || code.length !== 6}
            className="w-full cursor-pointer bg-black py-3 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-300"
          >
            {isSubmitting ? "Verifying…" : "Verify"}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
              setMessage(null);
            }}
            className="w-full cursor-pointer text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600"
          >
            Use a different email
          </button>
        </form>
      )}
    </main>
  );
}
