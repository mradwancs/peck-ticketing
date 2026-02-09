"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function routeAfterAuth(userId: string) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", userId)
      .single();

    if (profileError) throw new Error(profileError.message);

    if (profile?.must_change_password) {
      router.replace("/change-password");
    } else {
      router.replace("/my-tickets");
    }
  }

  async function doSignIn() {
    setBusy(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      const userId = data.session?.user?.id;
      if (!userId) throw new Error("No session returned after sign in.");

      await routeAfterAuth(userId);
    } catch (err: any) {
      setError(err?.message ?? "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  function goToCreateAccount() {
    setError(null);
    router.push("/create-account");
  }

  function goToForgotPassword() {
    setError(null);
    router.push("/forgot-password");
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        IT Support Login
      </h1>

      <div style={{ display: "grid", gap: 10 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10 }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10 }}
        />

        <button
          type="button"
          disabled={busy || !email.trim() || password.length < 6}
          onClick={doSignIn}
          style={{ padding: 10 }}
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={goToCreateAccount}
          style={{ padding: 10 }}
        >
          Create account
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={goToForgotPassword}
          style={{
            padding: 10,
            background: "transparent",
            border: "none",
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          Forgot password?
        </button>

        {error && <p>{error}</p>}
      </div>
    </div>
  );
}   