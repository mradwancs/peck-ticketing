"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

  requester?: { email: string | null; full_name: string | null } | null;
  assignee?: { email: string | null; full_name: string | null } | null;
};

type ProfileRow = {
  id: string;
  role: string | null;
};

type CommentRow = {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: { email: string | null; full_name: string | null } | null;
};

type EventRow = {
  id: string;
  ticket_id: string;
  actor_id: string;
  event_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor?: { email: string | null; full_name: string | null } | null;
};

const STATUS_OPTIONS = ["open", "in_progress", "waiting_on_user", "resolved"] as const;

function emailToName(email: string) {
  const left = email.split("@")[0] ?? email;
  return left.replace(/[._-]+/g, " ").trim();
}

function displayNameFromProfile(p?: { full_name: string | null; email: string | null } | null) {
  const full = (p?.full_name ?? "").trim();
  if (full) return full;

  const em = (p?.email ?? "").trim();
  if (em) return emailToName(em);

  return null;
}

function isUuidLike(s: string) {
  // "good enough" UUID check (keeps this lightweight)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const ticketId = params.id;
  const commentRef = useRef<HTMLTextAreaElement | null>(null);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("user");

  const isTech = useMemo(() => role === "tech", [role]);
  const isAdmin = useMemo(() => role === "admin", [role]);
  const isStaff = useMemo(() => role === "tech" || role === "admin", [role]);

  const [ticket, setTicket] = useState<TicketRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);

  // profileId -> { email, full_name } (used when joins are blocked + for history old/new mapping)
  const [profileById, setProfileById] = useState<
    Record<string, { email: string | null; full_name: string | null }>
  >({});

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);

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

  useEffect(() => {
    if (!checkingAuth) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingAuth]);

  function nameFromProfileId(id: string | null | undefined) {
    if (!id) return null;
    const p = profileById[id];
    const full = (p?.full_name ?? "").trim();
    if (full) return full;

    const em = (p?.email ?? "").trim();
    if (em) return emailToName(em);

    return null;
  }

  function formatWhoFromIdOrEmail(value: string | null | undefined) {
    if (!value) return "—";
    if (value.includes("@")) return emailToName(value);
    const byId = nameFromProfileId(value);
    return byId ?? value; // last-resort: show the id
  }

  function formatAssigneeValue(raw: string | null | undefined) {
    const v = (raw ?? "").trim();
    if (!v) return "unassigned";

    // Old/new values for assigned_changed are usually UUIDs
    if (isUuidLike(v)) return nameFromProfileId(v) ?? v;

    // If it’s somehow an email:
    if (v.includes("@")) return emailToName(v);

    return v;
  }

  function formatEvent(e: EventRow) {
    const oldV = (e.old_value ?? "").trim();
    const newV = (e.new_value ?? "").trim();

    switch (e.event_type) {
      case "ticket_created":
        return "Ticket created";
      case "status_changed":
        return `Status changed: ${oldV || "—"} → ${newV || "—"}`;
      case "assigned_changed":
        return `Assignee changed: ${formatAssigneeValue(oldV)} → ${formatAssigneeValue(newV)}`;
      case "ticket_closed":
        return "Ticket closed";
      default: {
        const field = e.field_name ? `${e.field_name}: ` : "";
        if (!oldV && !newV) return `${e.event_type}${field ? ` — ${field}` : ""}`.trim();
        return `${e.event_type}${field ? ` — ${field}` : ""}: ${oldV || "—"} → ${newV || "—"}`;
      }
    }
  }

  async function resolveProfilesForTicket(allIds: string[]) {
    const unique = Array.from(new Set(allIds.filter(Boolean)));
    if (unique.length === 0) return;

    const { data, error } = await supabase.rpc("ticket_profile_emails", {
      _ticket_id: ticketId,
      _ids: unique,
    });

    if (error || !data) return;

    const map: Record<string, { email: string | null; full_name: string | null }> = {};
    for (const row of data as Array<{ id: string; email: string | null; full_name: string | null }>) {
      if (!row?.id) continue;
      map[row.id] = { email: row.email ?? null, full_name: row.full_name ?? null };
    }

    setProfileById((prev) => ({ ...prev, ...map }));
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const { data: ticketData, error: ticketErr } = await supabase
        .from("tickets")
        .select(
          `
          id,title,description,location,category,status,priority,
          requester_id,assigned_to,created_at,updated_at,closed_at,
          requester:requester_id(email, full_name),
          assignee:assigned_to(email, full_name)
        `
        )
        .eq("id", ticketId)
        .single<TicketRow>();

      if (ticketErr) throw ticketErr;
      setTicket(ticketData);

      const { data: eventRows, error: eventsErr } = await supabase
        .from("ticket_events")
        .select(
          `
          id,ticket_id,actor_id,event_type,field_name,old_value,new_value,created_at,
          actor:actor_id(email, full_name)
        `
        )
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false })
        .returns<EventRow[]>();

      if (eventsErr) throw eventsErr;
      setEvents(eventRows ?? []);

      const { data: commentRows, error: commentsErr } = await supabase
        .from("ticket_comments")
        .select(
          `
          id,ticket_id,author_id,body,created_at,
          author:author_id(email, full_name)
        `
        )
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true })
        .returns<CommentRow[]>();

      if (commentsErr) throw commentsErr;
      setComments(commentRows ?? []);

      // Also resolve any ids that appear in assigned_changed old/new values
      const assignedChangeIds: string[] = [];
      for (const e of eventRows ?? []) {
        if (e.event_type !== "assigned_changed") continue;
        const o = (e.old_value ?? "").trim();
        const n = (e.new_value ?? "").trim();
        if (o && isUuidLike(o)) assignedChangeIds.push(o);
        if (n && isUuidLike(n)) assignedChangeIds.push(n);
      }

      const idsToResolve = [
        ...(eventRows ?? []).map((e) => e.actor_id),
        ...(commentRows ?? []).map((c) => c.author_id),
        ticketData.requester_id,
        ...(ticketData.assigned_to ? [ticketData.assigned_to] : []),
        ...assignedChangeIds,
      ];

      await resolveProfilesForTicket(idsToResolve);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load ticket.");
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(newStatus: string) {
    if (!isTech || !ticket) return;

    setUpdating(true);
    setError(null);
    setNotice(null);

    try {
      const { error } = await supabase.from("tickets").update({ status: newStatus }).eq("id", ticket.id);
      if (error) throw error;

      // Refresh everything so closed_at + history are always accurate
      await loadAll();
      setNotice("Status updated.");
    } catch (err: any) {
      setError(err?.message ?? "Failed to update status.");
    } finally {
      setUpdating(false);
    }
  }

  useEffect(() => {
    if (!ticket) return;

    const resolved = ticket.status === "resolved";
    const allowed = !resolved && (role === "tech" || ticket.requester_id === userId);

    if (allowed) {
      // slight delay avoids focusing before the textarea mounts
      setTimeout(() => commentRef.current?.focus(), 0);
    }
  }, [ticket?.id, ticket?.status, role, userId]);

  async function assignToMe() {
    if (!isTech || !ticket || !userId) return;

    setUpdating(true);
    setError(null);
    setNotice(null);

    try {
      const { error } = await supabase.from("tickets").update({ assigned_to: userId }).eq("id", ticket.id);
      if (error) throw error;

      await loadAll();
      setNotice("Assigned to you.");
    } catch (err: any) {
      setError(err?.message ?? "Failed to assign ticket.");
    } finally {
      setUpdating(false);
    }
  }

  async function unassignFromMe() {
    if (!isTech || !ticket || ticket.assigned_to !== userId) return;

    setUpdating(true);
    setError(null);
    setNotice(null);

    try {
      const { error } = await supabase.from("tickets").update({ assigned_to: null }).eq("id", ticket.id);
      if (error) throw error;

      await loadAll();
      setNotice("Unassigned.");
    } catch (err: any) {
      setError(err?.message ?? "Failed to unassign ticket.");
    } finally {
      setUpdating(false);
    }
  }

  async function postComment() {
    setError(null);
    setNotice(null);

    const body = commentBody.trim();
    if (!body) return;
    if (!userId) {
      setError("Not signed in.");
      return;
    }

    setPostingComment(true);
    try {
      const { error } = await supabase.from("ticket_comments").insert({
        ticket_id: ticketId,
        author_id: userId,
        body,
      });

      if (error) throw error;

      setCommentBody("");
      await loadAll();
      setNotice("Comment added.");
    } catch (err: any) {
      setError(err?.message ?? "Failed to add comment.");
    } finally {
      setPostingComment(false);
    }
  }

  if (checkingAuth || loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!ticket) return <div style={{ padding: 16 }}>Ticket not found.</div>;

  const requesterLabel =
    displayNameFromProfile(ticket.requester) ??
    nameFromProfileId(ticket.requester_id) ??
    ticket.requester_id;

  const assigneeLabel = ticket.assigned_to
    ? displayNameFromProfile(ticket.assignee) ??
      nameFromProfileId(ticket.assigned_to) ??
      ticket.assigned_to
    : "unassigned";

  const requesterEmail = ticket.requester?.email ?? profileById[ticket.requester_id]?.email ?? null;
  const assigneeEmail =
    ticket.assignee?.email ??
    (ticket.assigned_to ? profileById[ticket.assigned_to]?.email ?? null : null);

  const isMine = ticket.assigned_to === userId;
  const isResolved = ticket.status === "resolved";
  const resolvedAt = ticket.closed_at ? new Date(ticket.closed_at).toLocaleString() : null;

  // Your preference: if resolved, users should not be able to do anything (no comment / no staff actions)
  const canDoActions = !isResolved;

  // comment permission (RLS enforces too), but additionally: disable all actions if resolved
  const canComment = canDoActions && (isTech || ticket.requester_id === userId);

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
      <button onClick={() => router.back()} style={{ marginBottom: 12 }}>
        ← Back
      </button>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>{ticket.title}</h1>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            Signed in as <b>{email || "(no email)"}</b> — role <b>{role}</b>
            {isAdmin ? " (view-only)" : null}
          </div>
        </div>

        <button onClick={loadAll} disabled={loading || updating} style={{ height: 36 }}>
          Refresh
        </button>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", opacity: 0.9 }}>
        {!isResolved ? (
          <span>
            status: <b>{ticket.status}</b>
          </span>
        ) : null}

        {isResolved ? (
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              border: "1px solid #ddd",
              borderRadius: 999,
              padding: "2px 8px",
              opacity: 0.9,
            }}
          >
            RESOLVED
          </span>
        ) : null}

        {isResolved && resolvedAt ? (
          <span>
            resolved at: <b>{resolvedAt}</b>
          </span>
        ) : null}

        <span>
          priority: <b>{ticket.priority}</b>
        </span>
        <span>
          category: <b>{ticket.category}</b>
        </span>
      </div>

      <div style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{ticket.description}</div>

      <div style={{ marginTop: 16, display: "flex", gap: 14, flexWrap: "wrap", opacity: 0.9 }}>
        <span>
          requester: <b>{requesterLabel}</b>
        </span>
        <span>
          assignee: <b>{assigneeLabel}</b>
        </span>
        {ticket.location ? (
          <span>
            location: <b>{ticket.location}</b>
          </span>
        ) : null}
        <span>
          created: <b>{new Date(ticket.created_at).toLocaleString()}</b>
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

      {/* Staff actions (disabled entirely if resolved, per your preference) */}
      {isStaff ? (
        <div style={{ marginTop: 20, borderTop: "1px solid #ddd", paddingTop: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Staff actions</h2>

          {!canDoActions ? (
            <div style={{ marginTop: 8, opacity: 0.75, fontSize: 12 }}>
              This ticket is resolved. No further actions allowed.
            </div>
          ) : isTech ? (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
              {!isResolved ? (
                <select
                  value={ticket.status}
                  onChange={(e) => changeStatus(e.target.value)}
                  disabled={updating}
                  style={{ padding: 8 }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : null}

              {isMine ? (
                <button onClick={unassignFromMe} disabled={updating}>
                  Unassign
                </button>
              ) : (
                <button onClick={assignToMe} disabled={updating}>
                  Assign to me
                </button>
              )}
            </div>
          ) : (
            <div style={{ opacity: 0.75, marginTop: 8 }}>Admin is view-only.</div>
          )}
        </div>
      ) : null}

      {/* Comments (disabled entirely if resolved, per your preference) */}
      <div style={{ marginTop: 22, borderTop: "1px solid #ddd", paddingTop: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Comments</h2>

        {canComment ? (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <textarea
              ref={commentRef}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Add a comment…"
              style={{ padding: 10, minHeight: 80 }}
              disabled={postingComment}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={postComment} disabled={postingComment || !commentBody.trim()}>
                {postingComment ? "Posting…" : "Post comment"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
            {isResolved ? "(This ticket is resolved — comments are disabled.)" : "(You can’t comment on this ticket.)"}
          </div>
        )}

        {comments.length === 0 ? (
          <div style={{ marginTop: 12, opacity: 0.75 }}>No comments yet.</div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {comments.map((c) => {
              const whoLabel =
                displayNameFromProfile(c.author) ??
                nameFromProfileId(c.author_id) ??
                c.author_id;

              return (
                <div key={c.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800 }}>{whoLabel}</div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>{new Date(c.created_at).toLocaleString()}</div>
                  </div>
                  <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{c.body}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* History */}
      <div style={{ marginTop: 22, borderTop: "1px solid #ddd", paddingTop: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>History</h2>

        {events.length === 0 ? (
          <div style={{ marginTop: 12, opacity: 0.75 }}>No history yet.</div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {events.map((e) => {
              const whoLabel =
                displayNameFromProfile(e.actor) ??
                nameFromProfileId(e.actor_id) ??
                e.actor_id;

              return (
                <div key={e.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800 }}>{whoLabel}</div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>{new Date(e.created_at).toLocaleString()}</div>
                  </div>
                  <div style={{ marginTop: 6 }}>{formatEvent(e)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error ? <div style={{ marginTop: 12, color: "crimson" }}>{error}</div> : null}
      {notice ? <div style={{ marginTop: 12 }}>{notice}</div> : null}
    </div>
  );
}