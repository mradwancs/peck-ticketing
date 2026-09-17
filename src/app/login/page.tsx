"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Sign in failed.";
}

function EyeIcon({ passwordVisible }: { passwordVisible: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
      {passwordVisible ? <path d="m4 4 16 16" /> : null}
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function routeAfterAuth(userId: string) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", userId)
      .single();

    if (profileError) throw new Error(profileError.message);
    router.replace(
      profile?.must_change_password ? "/change-password" : "/my-tickets"
    );
  }

  async function doSignIn() {
    setBusy(true);
    setError(null);

    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
      if (signInError) throw signInError;

      const userId = data.session?.user?.id;
      if (!userId) throw new Error("No session returned after sign in.");
      await routeAfterAuth(userId);
    } catch (caughtError: unknown) {
      setError(errorMessage(caughtError));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!busy) await doSignIn();
  }

  return (
    <main className={styles.page}>
      <section className={styles.loginCard} aria-labelledby="login-heading">
        <div className={styles.logoWrap}>
          <Image
            src="/favicon.ico"
            alt="Peck IT Ticketing"
            width={72}
            height={72}
          />
        </div>

        <h1 id="login-heading">IT Support Login</h1>
        <p className={styles.intro}>
          Please sign in using your school email and password. If you don&apos;t have an account, you can request one below.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label>
            <span>Email</span>
            <input
              type="email"
              placeholder="name@school.org"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            <span>Password</span>
            <div className={styles.passwordField}>
              <input
                type={passwordVisible ? "text" : "password"}
                placeholder="Password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={passwordVisible ? "Hide password" : "Show password"}
                aria-pressed={passwordVisible}
                title={passwordVisible ? "Hide password" : "Show password"}
              >
                <EyeIcon passwordVisible={passwordVisible} />
              </button>
            </div>
          </label>

          <button
            type="submit"
            className={styles.primaryButton}
            disabled={busy || !email.trim() || password.length < 6}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy}
            onClick={() => {
              setError(null);
              router.push("/request-account");
            }}
          >
            Request an account
          </button>

          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
