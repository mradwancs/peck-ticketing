"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Signing you in...");

  useEffect(() => {
    async function run() {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        setMsg("Could not complete sign-in. Go back and try logging in again.");
        return;
      }

      const user = data.user;

      // Ensure profiles row exists (RLS allows inserting/upserting own row)
      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            email: user.email ?? null,
            full_name: user.user_metadata?.full_name ?? null,
          },
          { onConflict: "id" }
        );

      if (upsertError) {
        setMsg(`Signed in, but profile creation failed: ${upsertError.message}`);
        return;
      }

      router.replace("/my-tickets");
    }

    run();
  }, [router]);

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <p>{msg}</p>
    </div>
  );
}