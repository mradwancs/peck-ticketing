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

  function goToRequestAccount() {
    setError(null);
    router.push("/request-account");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    await doSignIn();
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "10vh auto",
        padding: 28,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        boxShadow: "0 8px 20px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <img src="/favicon.ico" alt="Peck IT Ticketing" style={{ width: 72 }} />
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12, color: "#111" }}>
        IT Support Login
      </h1>

      <p style={{ marginBottom: 16, color: "#444", fontSize: 12}}>
        Please sign in using your school email and the password provided to you. If you don't have an account, you can request one below.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 12 }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 12 }}
        />

        <button
          type="submit"
          disabled={busy || !email.trim() || password.length < 6}
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#1d4ed8")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#2563eb")}
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={goToRequestAccount}
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            color: "#111",
            fontWeight: 500,
            fontSize: 14,
            cursor: "pointer",
            transition: "background 0.15s ease background-color black",

          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#d0d4e0")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
        >
          Request an account
        </button>
      
        {error && <p>{error}</p>}
      </form>
    </div>
  );
}