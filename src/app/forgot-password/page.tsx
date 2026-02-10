"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function sendResetEmail() {
    setBusy(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (error) throw error;

      // Always show success to avoid email enumeration
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? "Failed to send reset email.");
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    router.push("/login");
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        Reset password
      </h1>

      {sent ? (
        <>
          <p style={{ marginBottom: 16 }}>
            If an account exists for that email, a password reset link has been
            sent.
          </p>

          <button
            type="button"
            onClick={goBack}
            style={{ padding: 10 }}
          >
            Back to login
          </button>
        </>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 10 }}
          />

          <button
            type="button"
            disabled={busy || !email.trim()}
            onClick={sendResetEmail}
            style={{ padding: 10 }}
          >
            {busy ? "Sending..." : "Send reset link"}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={goBack}
            style={{
              padding: 10,
              background: "transparent",
              border: "none",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Back to login
          </button>

          {error && <p style={{ margin: 0 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}