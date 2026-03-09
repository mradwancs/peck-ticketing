"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

const ACCOUNT_REQUEST_REQUESTER_ID =
  process.env.NEXT_PUBLIC_ACCOUNT_REQUEST_REQUESTER_ID ?? "";

export default function RequestAccountPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitRequest() {
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const trimmedName = fullName.trim();
      const trimmedEmail = email.trim();
      const trimmedNote = note.trim();

      if (!ACCOUNT_REQUEST_REQUESTER_ID) {
        throw new Error(
          "Account request requester ID is not configured. Set NEXT_PUBLIC_ACCOUNT_REQUEST_REQUESTER_ID."
        );
      }

      const descriptionLines = [
        `Requested account for: ${trimmedName}`,
        `Email: ${trimmedEmail}`,
      ];

      if (trimmedNote) {
        descriptionLines.push(`Note: ${trimmedNote}`);
      }

      const { error: insertError } = await supabase.from("tickets").insert({
        title: "Account request",
        description: descriptionLines.join("\n"),
        location: "N/A",
        category: "account",
        status: "open",
        priority: "medium",
        requester_id: ACCOUNT_REQUEST_REQUESTER_ID,
        assigned_to: null,
      });

      if (insertError) throw insertError;

      setSuccess("Your request was submitted. IT will review it.");
      setFullName("");
      setEmail("");
      setNote("");
    } catch (err: any) {
      setError(err?.message ?? "Failed to submit account request.");
    } finally {
      setBusy(false);
    }
  }

  function goBackToLogin() {
    setError(null);
    router.push("/login");
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        Request an Account
      </h1>

      <p style={{ marginBottom: 16, color: "#444" }}>
        Accounts are available for school staff only. Requests are reviewed by
        IT.
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        <input
          type="text"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          style={{ padding: 10 }}
        />

        <input
          type="email"
          placeholder="School email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10 }}
        />

        <textarea
          placeholder="Optional note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          style={{ padding: 10, resize: "vertical" }}
        />

        <button
          type="button"
          disabled={busy || !fullName.trim() || !email.trim()}
          onClick={submitRequest}
          style={{ padding: 10 }}
        >
          {busy ? "Submitting..." : "Submit request"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={goBackToLogin}
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

        {error && <p>{error}</p>}
        {success && <p>{success}</p>}
      </div>
    </div>
  );
}