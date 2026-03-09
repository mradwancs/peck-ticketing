"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function ChangePasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const userId = session?.user?.id;
        if (!userId) {
          router.replace("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("must_change_password")
          .eq("id", userId)
          .single();

        if (profileError) throw profileError;

        setMustChangePassword(Boolean(profile?.must_change_password));
      } catch (err: any) {
        setError(err?.message ?? "Failed to load account information.");
      } finally {
        setCheckingSession(false);
      }
    }

    loadUser();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setError(null);
    setSuccess(null);

    const trimmedPassword = password.trim();
    const trimmedConfirmPassword = confirmPassword.trim();

    if (trimmedPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const userId = session?.user?.id;
      if (!userId) {
        throw new Error("You must be signed in to change your password.");
      }

      const { error: updateAuthError } = await supabase.auth.updateUser({
        password: trimmedPassword,
      });

      if (updateAuthError) throw updateAuthError;

      const { error: updateProfileError } = await supabase
        .from("profiles")
        .update({
          must_change_password: false,
          password_changed_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updateProfileError) throw updateProfileError;

      setSuccess("Password changed successfully. Redirecting...");
      setPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        router.replace("/my-tickets");
      }, 1000);
    } catch (err: any) {
      setError(err?.message ?? "Failed to change password.");
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return (
      <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        Change Password
      </h1>

      <p style={{ marginBottom: 16, color: "#444" }}>
        {mustChangePassword
          ? "You need to choose a new password before continuing."
          : "You can update your password here at any time."}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          type="password"
          placeholder="New password"
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

        <button
          type="submit"
          disabled={busy || password.trim().length < 6 || confirmPassword.trim().length < 6}
          style={{ padding: 10 }}
        >
          {busy ? "Saving..." : "Save new password"}
        </button>

        {!mustChangePassword && (
          <button
            type="button"
            disabled={busy}
            onClick={() => router.push("/my-tickets")}
            style={{
              padding: 10,
              background: "transparent",
              border: "none",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Back to my tickets
          </button>
        )}

        {error && <p>{error}</p>}
        {success && <p>{success}</p>}
      </form>
    </div>
  );
}