"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CalendarDays, Eye, EyeOff, Lock, Mail } from "lucide-react";

export default function AuthPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session) {
        router.replace("/");
      } else {
        setCheckingSession(false);
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    if (password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setError(error.message);
          return;
        }

        router.replace("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          setError(error.message);
          return;
        }

        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setMessage(
            "Account created successfully. Check your email to confirm your account, then sign in."
          );
          setMode("signin");
          setPassword("");
        }
      }
    } catch (err: any) {
      setError(
        err?.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f4f0]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[#711f2d] border-t-transparent" />
          <p className="text-sm text-[#77706a]">
            Loading DAYFRAME...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f4f0] text-[#171514]">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* LEFT */}
        <section className="relative hidden overflow-hidden bg-[#711f2d] lg:flex">
          <div className="absolute inset-0">
            <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full border border-white/10" />
            <div className="absolute -right-40 bottom-[-100px] h-[500px] w-[500px] rounded-full border border-white/10" />
            <div className="absolute left-1/3 top-1/3 h-40 w-40 rounded-full bg-white/5 blur-3xl" />
          </div>

          <div className="relative flex w-full flex-col justify-between p-12 xl:p-16">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
                <CalendarDays size={22} />
              </div>

              <div>
                <div className="text-xl font-bold tracking-tight">
                  DAYFRAME
                </div>
                <div className="text-xs text-white/60">
                  Your life, in view.
                </div>
              </div>
            </div>

            <div className="max-w-xl">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
                A calmer way to plan
              </p>

              <h1 className="text-5xl font-semibold leading-[1.05] tracking-[-0.04em] xl:text-6xl">
                Put your
                <br />
                life in view.
              </h1>

              <p className="mt-6 max-w-md text-sm leading-7 text-white/65">
                Organise college, work, deadlines, meetings and
                personal plans in one simple calendar.
              </p>
            </div>

            <div className="text-xs text-white/40">
              DAYFRAME • Personal planning workspace
            </div>
          </div>
        </section>

        {/* RIGHT */}
        <section className="flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#711f2d] text-white">
                  <CalendarDays size={22} />
                </div>

                <div>
                  <div className="text-xl font-bold tracking-tight">
                    DAYFRAME
                  </div>
                  <div className="text-xs text-[#8c837c]">
                    Your life, in view.
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#9a9189]">
                {mode === "signin" ? "Welcome back" : "Get started"}
              </p>

              <h2 className="text-3xl font-semibold tracking-[-0.03em]">
                {mode === "signin"
                  ? "Sign in to DAYFRAME"
                  : "Create your account"}
              </h2>

              <p className="mt-3 text-sm leading-6 text-[#827a74]">
                {mode === "signin"
                  ? "Continue managing your schedule."
                  : "Create your personal planning workspace."}
              </p>
            </div>

            <div className="mb-6 grid grid-cols-2 rounded-xl border border-[#e6dfd8] bg-[#eee9e4] p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError("");
                  setMessage("");
                }}
                className={`rounded-lg py-2.5 text-sm font-semibold transition ${
                  mode === "signin"
                    ? "bg-white text-[#711f2d] shadow-sm"
                    : "text-[#766f69]"
                }`}
              >
                Sign in
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError("");
                  setMessage("");
                }}
                className={`rounded-lg py-2.5 text-sm font-semibold transition ${
                  mode === "signup"
                    ? "bg-white text-[#711f2d] shadow-sm"
                    : "text-[#766f69]"
                }`}
              >
                Create account
              </button>
            </div>

            {error && (
              <div className="mb-5 rounded-xl border border-[#e6b7b7] bg-[#fff5f5] px-4 py-3 text-sm leading-5 text-[#9d2929]">
                {error}
              </div>
            )}

            {message && (
              <div className="mb-5 rounded-xl border border-[#c9ddd3] bg-[#f3faf6] px-4 py-3 text-sm leading-5 text-[#26704f]">
                {message}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#746c66]">
                  Email
                </label>

                <div className="relative">
                  <Mail
                    size={17}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9b928b]"
                  />

                  <input
                    type="email"
                    value={email}
                    onChange={(e) =>
                      setEmail(e.target.value)
                    }
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="h-12 w-full rounded-xl border border-[#e1dad3] bg-white pl-11 pr-4 text-sm outline-none transition placeholder:text-[#aaa19a] focus:border-[#711f2d] focus:ring-2 focus:ring-[#711f2d]/10"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#746c66]">
                  Password
                </label>

                <div className="relative">
                  <Lock
                    size={17}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9b928b]"
                  />

                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    placeholder="Enter your password"
                    autoComplete={
                      mode === "signin"
                        ? "current-password"
                        : "new-password"
                    }
                    className="h-12 w-full rounded-xl border border-[#e1dad3] bg-white pl-11 pr-12 text-sm outline-none transition placeholder:text-[#aaa19a] focus:border-[#711f2d] focus:ring-2 focus:ring-[#711f2d]/10"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (value) => !value
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#8e857e] transition hover:bg-[#f5f1ed] hover:text-[#711f2d]"
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-[#711f2d] text-sm font-semibold text-white transition hover:bg-[#5d1925] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? "Please wait..."
                  : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
              </button>
            </form>

            <p className="mt-7 text-center text-xs leading-5 text-[#99908a]">
              Your DAYFRAME events are private to your
              account.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}