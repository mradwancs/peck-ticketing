"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const passwordsMatch = password === confirmPassword;
  const canSubmit = password.length >= 6 && passwordsMatch && !busy && ready;

  useEffect(() => {
    // When arriving from the email link, Supabase should establish a recovery session.
    // We'll just check if a user is present; if not, show a clear message.
    (async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        setError(error.message);
        setReady(false);
        return;
      }

      if (!data.user) {
        setError(
          "This reset link is invalid or expired. Please request a new one."
        );
        setReady(false);
        return;
      }

      setReady(true);
    })();
  }, []);

  async function doResetPassword() {
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setSuccess("Password updated. Please sign in again.");

      // End the flow cleanly.
      await supabase.auth.signOut();

      setTimeout(() => {
        router.replace("/login");
      }, 800);
    } catch (err: any) {
      setError(err?.message ?? "Failed to update password.");
    } finally {
      setBusy(false);
    }
  }

  function goToForgot() {
    router.push("/forgot-password");
  }

  function goToLogin() {
    router.push("/login");
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        Set a new password
      </h1>

      {!ready ? (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0 }}>
            {error ?? "Checking reset link..."}
          </p>

          <button
            type="button"
            onClick={goToForgot}
            style={{ padding: 10 }}
          >
            Request a new reset link
          </button>

          <button
            type="button"
            onClick={goToLogin}
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
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <input
            type="password"
            placeholder="New password (6+ chars)"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 10 }}
          />

          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            autoComplete="new-password"
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{ padding: 10 }}
          />

          {!passwordsMatch && confirmPassword.length > 0 && (
            <p style={{ margin: 0 }}>Passwords do not match.</p>
          )}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={doResetPassword}
            style={{ padding: 10 }}
          >
            {busy ? "Updating..." : "Update password"}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={goToLogin}
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
      )}
    </div>
  );
}