"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function CreateAccountPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const passwordsMatch = password === confirmPassword;
  const canSubmit =
    email.trim().length > 0 &&
    fullName.trim().length > 0 &&
    password.length >= 6 &&
    confirmPassword.length >= 6 &&
    passwordsMatch &&
    !busy;

  async function doCreateAccount() {
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const cleanEmail = email.trim();
      const cleanName = fullName.trim();

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
          },
        },
      });

      if (error) throw error;

      // If email confirmations are ON, there may be no session yet.
      // If confirmations are OFF, they may be signed in immediately.
      if (data.session) {
        // If they were auto-signed-in, sign them out so the flow returns to login cleanly.
        await supabase.auth.signOut();
      }

      setSuccess(
        "Account created. If email verification is enabled, check your email to verify your account, then sign in."
      );

      // Kick them back to login after a short moment.
      setTimeout(() => {
        router.replace("/login");
      }, 800);
    } catch (err: any) {
      setError(err?.message ?? "Create account failed.");
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
        Create account
      </h1>

      <div style={{ display: "grid", gap: 10 }}>
        <input
          type="email"
          placeholder="School email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10 }}
        />

        <input
          type="text"
          placeholder="Full name"
          value={fullName}
          autoComplete="name"
          onChange={(e) => setFullName(e.target.value)}
          style={{ padding: 10 }}
        />

        <input
          type="password"
          placeholder="Password (6+ chars)"
          value={password}
          autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10 }}
        />

        <input
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          autoComplete="new-password"
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={{ padding: 10 }}
        />

        {!passwordsMatch && confirmPassword.length > 0 && (
          <p style={{ margin: 0 }}>Passwords do not match.</p>
        )}

        <button type="button" disabled={!canSubmit} onClick={doCreateAccount} style={{ padding: 10 }}>
          {busy ? "Creating..." : "Create account"}
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
        {success && <p style={{ margin: 0 }}>{success}</p>}
      </div>
    </div>
  );
}