"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type TicketRow = {
  id: string;
  title: string;
  description: string;
  location: string | null;
  category: string;
  status: string;
  priority: string;
  requester_id: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;

  requester?: { email: string | null } | null;
  assignee?: { email: string | null } | null;
};

type ProfileRow = {
  id: string;
  role: string | null;
};

function emailToName(email: string) {
  const left = email.split("@")[0] ?? email;
  return left.replace(/[._-]+/g, " ").trim();
}

function statusBadgeStyle(status: string): React.CSSProperties {
  // More obvious pills (stronger background + border)
  if (status === "open") return { background: "#e0f2fe", border: "2px solid #0284c7" };
  if (status === "in_progress") return { background: "#ffedd5", border: "2px solid #f7fb0f" };
  if (status === "waiting_on_user") return { background: "#fef9c3", border: "2px solid #ca8a04" };
  if (status === "resolved") return { background: "#dcfce7", border: "2px solid #16a34a" };
  return { background: "#f3f4f6", border: "2px solid #6b7280" };
}

function priorityBadgeStyle(priority: string): React.CSSProperties {
  if (priority === "low") return { background: "#e5e7eb", border: "2px solid #6b7280" };
  if (priority === "normal") return { background: "#e0f2fe", border: "2px solid #0284c7" };
  if (priority === "high") return { background: "#ffedd5", border: "2px solid #ea580c" };
  if (priority === "urgent") return { background: "#fee2e2", border: "2px solid #dc2626" };
  return { background: "#f3f4f6", border: "2px solid #6b7280" };
}

function resolvedPillOverride(): React.CSSProperties {
  return {
    background: "#dcfce7", // soft green
    border: "2px solid #16a34a",
    color: "#166534",
    textDecoration: "line-through",
    opacity: 0.75,
  };
}

export default function MyTicketsPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("user");

  const isAdmin = useMemo(() => role === "admin", [role]);
  const isStaff = useMemo(() => role === "tech" || role === "admin", [role]);
  const isTech = useMemo(() => role === "tech", [role]);

  const isNarrow = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  }, []);


  const [tickets, setTickets] = useState<TicketRow[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);

  // Resolved section collapsed by default
  const [resolvedOpen, setResolvedOpen] = useState(false);

  // Map of profileId -> email (for cases where RLS blocks joins, e.g., teachers seeing assignee)
  const [emailsById, setEmailsById] = useState<Record<string, string>>({});

  // Create form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const run = async () => {
      setCheckingAuth(true);
      setError(null);

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) {
        setError(sessionErr.message);
        setCheckingAuth(false);
        return;
      }

      const user = sessionData.session?.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);
      setEmail(user.email ?? "");

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .single<ProfileRow>();

      setRole(profileErr ? "user" : profile?.role ?? "user");
      setCheckingAuth(false);
    };

    run();
  }, [router]);

  async function resolveEmailsForTicket(ticketId: string, ids: string[]) {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return;

    const { data, error } = await supabase.rpc("ticket_profile_emails", {
      _ticket_id: ticketId,
      _ids: unique,
    });

    if (error || !data) return;

    const map: Record<string, string> = {};
    for (const row of data as Array<{ id: string; email: string }>) {
      if (row?.id && row?.email) map[row.id] = row.email;
    }

    setEmailsById((prev) => ({ ...prev, ...map }));
  }

  async function loadTickets() {
    setLoadingTickets(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("tickets")
        .select(
          `
          id,title,description,location,category,status,priority,
          requester_id,assigned_to,created_at,updated_at,closed_at,
          requester:requester_id(email),
          assignee:assigned_to(email)
        `
        )
        .order("created_at", { ascending: false })
        .returns<TicketRow[]>();

      if (error) throw error;

      const rows = data ?? [];
      setTickets(rows);

      // If a teacher can't read assignee profiles, assignee join may be null.
      // Resolve assignee emails per-ticket using the safe RPC.
      const needsResolve = rows.filter((t) => t.assigned_to && !t.assignee?.email && !emailsById[t.assigned_to]);
      await Promise.all(needsResolve.map((t) => resolveEmailsForTicket(t.id, [t.assigned_to!])));
    } catch (err: any) {
      setError(err?.message ?? "Failed to load tickets.");
    } finally {
      setLoadingTickets(false);
    }
  }

  useEffect(() => {
    if (!checkingAuth) loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingAuth]);

  async function createTicket() {
    setCreating(true);
    setError(null);
    setCreateNotice(null);

    try {
      if (!userId) throw new Error("Not signed in.");
      const t = title.trim();
      const d = description.trim();
      if (!t) throw new Error("Title is required.");
      if (!d) throw new Error("Description is required.");

      const { error } = await supabase.from("tickets").insert({
        title: t,
        description: d,
        location: location.trim() || null,
        category: category || "Other",
        priority: priority || "normal",
        requester_id: userId,
      });

      if (error) throw error;

      setTitle("");
      setDescription("");
      setLocation("");
      setCategory("Other");
      setPriority("normal");

      setCreateNotice("Ticket created.");
      await loadTickets();
    } catch (err: any) {
      setError(err?.message ?? "Failed to create ticket.");
    } finally {
      setCreating(false);
    }
  }

  async function assignToMe(ticketId: string) {
    setError(null);
    setActionNotice(null);

    if (!isTech) {
      setError("Only tech can assign/unassign tickets.");
      return;
    }
    if (!userId) {
      setError("Not signed in.");
      return;
    }

    setUpdatingTicketId(ticketId);
    try {
      const { error } = await supabase.from("tickets").update({ assigned_to: userId }).eq("id", ticketId);
      if (error) throw error;

      setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, assigned_to: userId } : t)));
      setActionNotice("Assigned to you.");

      // ensure we can display assignee name immediately
      if (!emailsById[userId]) {
        await resolveEmailsForTicket(ticketId, [userId]);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to assign ticket.");
    } finally {
      setUpdatingTicketId(null);
    }
  }

  async function unassignFromMe(ticketId: string) {
    setError(null);
    setActionNotice(null);

    if (!isTech) {
      setError("Only tech can assign/unassign tickets.");
      return;
    }
    if (!userId) {
      setError("Not signed in.");
      return;
    }

    const ticket = tickets.find((x) => x.id === ticketId);
    if (!ticket) {
      setError("Ticket not found.");
      return;
    }
    if (ticket.assigned_to !== userId) {
      setError("You can only unassign tickets assigned to you.");
      return;
    }

    setUpdatingTicketId(ticketId);
    try {
      const { error } = await supabase.from("tickets").update({ assigned_to: null }).eq("id", ticketId);
      if (error) throw error;

      setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, assigned_to: null } : t)));
      setActionNotice("Unassigned.");
    } catch (err: any) {
      setError(err?.message ?? "Failed to unassign ticket.");
    } finally {
      setUpdatingTicketId(null);
    }
  }

  async function changeStatus(ticketId: string, newStatus: string) {
    if (newStatus === "resolved"){
        const ok = confirm("Are you sure you want to mark this ticket as resolved? \n\n This action CANNOT be undone. \n\n Please make absolutely sure that this ticket is resolved.");
        if (!ok) return;
    }
    setError(null);
    setActionNotice(null);

    if (!isTech) {
      setError("Only tech can change status.");
      return;
    }

    setUpdatingTicketId(ticketId);
    try {
      const { error } = await supabase.from("tickets").update({ status: newStatus }).eq("id", ticketId);
      if (error) throw error;

      setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t)));
      setActionNotice("Status updated.");
    } catch (err: any) {
      setError(err?.message ?? "Failed to update status.");
    } finally {
      setUpdatingTicketId(null);
    }
  }

  async function doSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const activeTickets = useMemo(() => {
    const rows = tickets.filter((t) => t.status !== "resolved");

    // Tech view: unassigned first, then newest
    if (isTech) {
      return [...rows].sort((a, b) => {
        const aUnassigned = a.assigned_to ? 0 : 1; // 1 means unassigned
        const bUnassigned = b.assigned_to ? 0 : 1;

        if (aUnassigned !== bUnassigned) return bUnassigned - aUnassigned;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }

    return rows;
  }, [tickets, isTech]);

  const resolvedTickets = useMemo(() => {
    const rows = tickets.filter((t) => t.status === "resolved");
    return [...rows].sort((a, b) => {
      const aTime = new Date(a.closed_at ?? a.updated_at).getTime();
      const bTime = new Date(b.closed_at ?? b.updated_at).getTime();
      return bTime - aTime;
    });
  }, [tickets]);

  function TicketCard({ t }: { t: TicketRow }) {
    const requesterEmail = t.requester?.email ?? null;
    const requesterLabel = requesterEmail ? emailToName(requesterEmail) : t.requester_id;

    const assigneeEmail = t.assignee?.email ?? (t.assigned_to ? emailsById[t.assigned_to] ?? null : null);
    const assigneeLabel = t.assigned_to
      ? assigneeEmail
        ? emailToName(assigneeEmail)
        : t.assigned_to
      : "Unassigned";

    const isMine = !!userId && t.assigned_to === userId;
    const isUnassigned = !t.assigned_to;
    const isAssignedToOther = !!t.assigned_to && !isMine;

    const rowUpdating = updatingTicketId === t.id;

    const cardStyle: React.CSSProperties = {
      border: "1px solid #ddd",
      borderRadius: 10,
      padding: 12,
      background: "#fff", // keep card color stable
      color: "#111",
      opacity: 1,
    };

    const assignmentBadgeStyle: React.CSSProperties = isMine
      ? { background: "#dcfce7", border: "2px solid #16a34a" } // green (assigned to you)
      : isAssignedToOther
      ? { background: "#dcfce7", border: "2px solid #16a34a" } // green (assigned)
      : { background: "#fef9c3", border: "2px solid #ca8a04" }; // yellow (unassigned)

    return (
      <div key={t.id} style={{
          ...cardStyle,
          cursor: "pointer",
          transition: "box-shadow 120ms ease, transform 120ms ease",
         }} onClick={() => router.push(`/tickets/${t.id}`)}
         onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
            e.currentTarget.style.transform = 'translateY(-1px)';
         }}
         onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.transform = 'none';
         }}
         >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900 }}>{t.title}</div>

            {/* Assignment badge (more obvious) */}
            <span
              style={{
                ...(t.status === "resolved" ? resolvedPillOverride() : assignmentBadgeStyle),
                padding: "2px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: 0.3,
              }}
            >
              {isMine ? "ASSIGNED TO YOU" : isAssignedToOther ? "ASSIGNED" : "UNASSIGNED"}
            </span>

            {/* Status badge (more obvious) */}
            <span
              style={{
                ...(t.status === "resolved" ? resolvedPillOverride() : statusBadgeStyle(t.status)),
                padding: "2px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: 0.3,
              }}
              title="Status"
            >
              {t.status}
            </span>

            {/* Priority badge (more obvious) */}
            <span
              style={{
                ...(t.status === "resolved" ? resolvedPillOverride() : priorityBadgeStyle(t.priority)),
                padding: "2px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: 0.3,
              }}
            >
              {t.priority}
            </span>
          </div>

          {/* Tech actions: NOT shown for resolved (read-only) */}
          {isTech && t.status !== "resolved" ? (
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Set status</span>
              <select
                value={t.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => changeStatus(t.id, e.target.value)}
                disabled={rowUpdating}
                style={{ padding: "6px 8px" }}
              >
                <option value="open">open</option>
                <option value="in_progress">in_progress</option>
                <option value="waiting_on_user">waiting_on_user</option>
                <option value="resolved">resolved</option>
              </select>

              {isMine ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    unassignFromMe(t.id);
                  }}
                  disabled={rowUpdating}
                  style={{ padding: "6px 10px" }}
                  title="Unassign (only you can unassign your own tickets)"
                >
                  {rowUpdating ? "Updating…" : "Unassign"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    assignToMe(t.id);
                  }}
                  disabled={rowUpdating}
                  style={{ padding: "6px 10px" }}
                  title={isUnassigned ? "Assign to me" : "Assign to me (take over)"}
                >
                  {rowUpdating ? "Updating…" : "Assign to me"}
                </button>
              )}
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{t.description}</div>

        <div style={{ marginTop: 10, opacity: 0.9, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>
            requester: <b>{requesterLabel}</b>
          </span>
          <span>
            Assigned to: <b>{assigneeLabel}</b>
          </span>
          <span>
            category: <b>{t.category}</b>
          </span>
          {t.location ? (
            <span>
              location: <b>{t.location}</b>
            </span>
          ) : null}
          <span>
            created: <b>{new Date(t.created_at).toLocaleString()}</b>
          </span>
        </div>

        {isStaff && requesterEmail ? (
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 12 }}>
            requester email: <b>{requesterEmail}</b>
          </div>
        ) : null}

        {isStaff && assigneeEmail ? (
          <div style={{ marginTop: 2, opacity: 0.75, fontSize: 12 }}>
            assignee email: <b>{assigneeEmail}</b>
          </div>
        ) : null}
      </div>
    );
  }

  if (checkingAuth) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>My Tickets</h1>

          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ opacity: 0.85 }}>
              Signed in as: <b>{email || "(no email)"}</b>
            </span>

            <span style={{ opacity: 0.85 }}>
              Role: <b>{role}</b>
            </span>

            {isAdmin ? (
              <span
                style={{
                  border: "2px solid #111",
                  padding: "2px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 900,
                  background: "#fff",
                }}
              >
                ADMIN
              </span>
            ) : null}

            <span style={{ opacity: 0.8 }}>{isStaff ? "(view: all tickets)" : "(view: your tickets only)"}</span>

            {isAdmin ? <span style={{ opacity: 0.75, fontSize: 12 }}>Admin is view-only (no edits/deletes)</span> : null}
            {isTech ? <span style={{ opacity: 0.75, fontSize: 12 }}>Tech can assign/unassign + update status</span> : null}
          </div>

          {error ? <div style={{ marginTop: 8, color: "crimson" }}>{error}</div> : null}
          {actionNotice ? <div style={{ marginTop: 8 }}>{actionNotice}</div> : null}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={loadTickets} disabled={loadingTickets}>
            {loadingTickets ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" onClick={doSignOut}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ marginTop: 20, border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Create a ticket</h2>

        <div style={{ display: "grid", gap: 10 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={{ padding: 10 }} />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            style={{ padding: 10, minHeight: 90 }}
          />

          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr", gap: 10 }}>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Room Number/Location (please specify if applicable)"
              style={{ padding: 10 }}
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{
                 padding: 10,
                 color: category ? "#000" : "#9ca3af", // grey when placeholder
                }}>
              <option value='' disabled>Category</option>
              <option value="Other" style={{ color: "#000" }}>Other</option>
              <option value="Classroom Tech" style={{ color: "#000" }}>Classroom Tech</option>
              <option value="Laptop" style={{ color: "#000" }}>Laptop</option>
              <option value="Internet" style={{ color: "#000" }}>Internet</option>
              <option value="Printer" style={{ color: "#000" }}>Printer</option>
              <option value="Account" style={{ color: "#000" }}>Account</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr", gap: 10 }}>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{
                 padding: 10,
                 color: priority ? "#000" : "#9ca3af", // grey when placeholder
                }}>
              <option value='' disabled>Priority</option>
              <option value="low" style={{ color: "#000" }}>low</option>
              <option value="normal" style={{ color: "#000" }}>normal</option>
              <option value="high" style={{ color: "#000" }}>high</option>
              <option value="urgent" style={{ color: "#000" }}>urgent</option>
            </select>

            <button
              type="button"
              onClick={createTicket}
              disabled={creating || !title.trim() || !description.trim() || !category || !priority}
              style={{ padding: 10 }}
            >
              {creating ? "Creating…" : "Submit ticket"}
            </button>
          </div>

          {createNotice ? <div>{createNotice}</div> : null}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {/* Active */}
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
          Active Tickets {loadingTickets ? "(loading…)" : `(${activeTickets.length})`}
        </h2>

        {activeTickets.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No active tickets.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {activeTickets.map((t) => (
              <TicketCard key={t.id} t={t} />
            ))}
          </div>
        )}

        {/* Resolved (collapsed by default) */}
        <div style={{ marginTop: 18 }}>
          <button
            type="button"
            onClick={() => setResolvedOpen((v) => !v)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              fontWeight: 900,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <span>
              Resolved Tickets {loadingTickets ? "(loading…)" : `(${resolvedTickets.length})`}
            </span>
            <span style={{ opacity: 0.75 }}>{resolvedOpen ? "▾" : "▸"}</span>
          </button>

          {resolvedOpen ? (
            resolvedTickets.length === 0 ? (
              <div style={{ marginTop: 10, opacity: 0.8 }}>No resolved tickets.</div>
            ) : (
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {resolvedTickets.map((t) => (
                  <TicketCard key={t.id} t={t} />
                ))}
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}