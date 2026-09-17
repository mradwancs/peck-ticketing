"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submitRequest() {
    setBusy(true);
    setError(null);

    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) throw new Error("Email is required.");

      const { data, error } = await supabase.rpc("request_password_reset", {
        p_email: cleanEmail,
      });

      if (error) throw error;

      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message ?? "Failed to submit request.");
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
        Password Reset Request
      </h1>

      <p style={{ opacity: 0.7, marginBottom: 16 }}>
        For IT/Admin use only. For help signing in, please contact IT support.
      </p>

      {submitted ? (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0 }}>
            Request sent to IT. You’ll receive instructions soon.
          </p>

          <button type="button" onClick={goBack} style={{ padding: 10 }}>
            Back to login
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0 }}>
            Enter the email address associated with your account to request a password reset.
          </p>

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
            onClick={submitRequest}
            style={{ padding: 10 }}
          >
            {busy ? "Submitting..." : "Submit request"}
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