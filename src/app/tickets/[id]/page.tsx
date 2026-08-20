"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

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

const STATUS_OPTIONS = [
  "open",
  "in_progress",
  "waiting_on_user",
  "resolved",
] as const;

function emailToName(email: string) {
  const left = email.split("@")[0] ?? email;
  return left.replace(/[._-]+/g, " ").trim();
}

function displayNameFromProfile(
  profile?: { full_name: string | null; email: string | null } | null
) {
  const fullName = (profile?.full_name ?? "").trim();
  if (fullName) return fullName;

  const email = (profile?.email ?? "").trim();
  return email ? emailToName(email) : null;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const ticketId = params.id;

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");

  const isTech = useMemo(() => role === "tech", [role]);
  const isAdmin = useMemo(() => role === "admin", [role]);
  const isStaff = useMemo(
    () => role === "tech" || role === "admin",
    [role]
  );

  const [ticket, setTicket] = useState<TicketRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
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

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) {
        setError(sessionError.message);
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

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .single<ProfileRow>();

      setRole(profileError ? "user" : profile?.role ?? "user");
      setCheckingAuth(false);
    };

    run();
  }, [router]);

  useEffect(() => {
    if (!checkingAuth) loadAll();
    // loadAll intentionally runs after authentication finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingAuth]);

  function nameFromProfileId(id: string | null | undefined) {
    if (!id) return null;
    const profile = profileById[id];
    const fullName = (profile?.full_name ?? "").trim();
    if (fullName) return fullName;

    const profileEmail = (profile?.email ?? "").trim();
    return profileEmail ? emailToName(profileEmail) : null;
  }

  function formatAssigneeValue(raw: string | null | undefined) {
    const value = (raw ?? "").trim();
    if (!value) return "unassigned";
    if (isUuidLike(value)) return nameFromProfileId(value) ?? value;
    if (value.includes("@")) return emailToName(value);
    return value;
  }

  function formatEvent(event: EventRow) {
    const oldValue = (event.old_value ?? "").trim();
    const newValue = (event.new_value ?? "").trim();

    switch (event.event_type) {
      case "ticket_created":
        return "Ticket created";
      case "status_changed":
        return `Status changed: ${formatStatus(oldValue || "unknown")} → ${formatStatus(
          newValue || "unknown"
        )}`;
      case "assigned_changed":
        return `Assignee changed: ${formatAssigneeValue(
          oldValue
        )} → ${formatAssigneeValue(newValue)}`;
      case "ticket_closed":
        return "Ticket resolved";
      default: {
        const field = event.field_name ? `${event.field_name}: ` : "";
        if (!oldValue && !newValue) return event.event_type;
        return `${field}${oldValue || "—"} → ${newValue || "—"}`;
      }
    }
  }

  async function resolveProfilesForTicket(allIds: string[]) {
    const uniqueIds = Array.from(new Set(allIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;

    const { data, error: profileError } = await supabase.rpc(
      "ticket_profile_emails",
      {
        _ticket_id: ticketId,
        _ids: uniqueIds,
      }
    );

    if (profileError || !data) return;

    const nextProfiles: Record<
      string,
      { email: string | null; full_name: string | null }
    > = {};

    for (const row of data as Array<{
      id: string;
      email: string | null;
      full_name: string | null;
    }>) {
      if (!row?.id) continue;
      nextProfiles[row.id] = {
        email: row.email ?? null,
        full_name: row.full_name ?? null,
      };
    }

    setProfileById((previous) => ({ ...previous, ...nextProfiles }));
  }

  async function markRequesterCommentsRead(
    ticketData: TicketRow,
    commentRows: CommentRow[]
  ) {
    if (!userId || ticketData.requester_id !== userId) return;

    const latestResponse = commentRows
      .filter((comment) => comment.author_id !== userId)
      .at(-1);
    if (!latestResponse) return;

    const { error: readError } = await supabase
      .from("ticket_comment_reads")
      .upsert(
        {
          ticket_id: ticketData.id,
          user_id: userId,
          last_read_at: latestResponse.created_at,
        },
        { onConflict: "ticket_id,user_id" }
      );

    if (readError) {
      // The page remains usable while the read-state migration is pending.
      console.warn("Could not mark ticket comments as read:", readError.message);
    }
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const { data: ticketData, error: ticketError } = await supabase
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

      if (ticketError) throw ticketError;
      setTicket(ticketData);

      const { data: eventRows, error: eventsError } = await supabase
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

      if (eventsError) throw eventsError;
      setEvents(eventRows ?? []);

      const { data: commentRows, error: commentsError } = await supabase
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

      if (commentsError) throw commentsError;
      setComments(commentRows ?? []);
      await markRequesterCommentsRead(ticketData, commentRows ?? []);

      const assignedChangeIds: string[] = [];
      for (const event of eventRows ?? []) {
        if (event.event_type !== "assigned_changed") continue;
        const oldValue = (event.old_value ?? "").trim();
        const newValue = (event.new_value ?? "").trim();
        if (oldValue && isUuidLike(oldValue)) assignedChangeIds.push(oldValue);
        if (newValue && isUuidLike(newValue)) assignedChangeIds.push(newValue);
      }

      await resolveProfilesForTicket([
        ...(eventRows ?? []).map((event) => event.actor_id),
        ...(commentRows ?? []).map((comment) => comment.author_id),
        ticketData.requester_id,
        ...(ticketData.assigned_to ? [ticketData.assigned_to] : []),
        ...assignedChangeIds,
      ]);
    } catch (caughtError: unknown) {
      setError(errorMessage(caughtError, "Failed to load ticket."));
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
      const { error: updateError } = await supabase
        .from("tickets")
        .update({ status: newStatus })
        .eq("id", ticket.id);
      if (updateError) throw updateError;

      await loadAll();
      setNotice("Status updated.");
    } catch (caughtError: unknown) {
      setError(errorMessage(caughtError, "Failed to update status."));
    } finally {
      setUpdating(false);
    }
  }

  async function assignToMe() {
    if (!isTech || !ticket || !userId) return;

    setUpdating(true);
    setError(null);
    setNotice(null);

    try {
      const { error: updateError } = await supabase
        .from("tickets")
        .update({ assigned_to: userId })
        .eq("id", ticket.id);
      if (updateError) throw updateError;

      await loadAll();
      setNotice("Assigned to you.");
    } catch (caughtError: unknown) {
      setError(errorMessage(caughtError, "Failed to assign ticket."));
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
      const { error: updateError } = await supabase
        .from("tickets")
        .update({ assigned_to: null })
        .eq("id", ticket.id);
      if (updateError) throw updateError;

      await loadAll();
      setNotice("Ticket unassigned.");
    } catch (caughtError: unknown) {
      setError(errorMessage(caughtError, "Failed to unassign ticket."));
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
      const { error: commentError } = await supabase
        .from("ticket_comments")
        .insert({
          ticket_id: ticketId,
          author_id: userId,
          body,
        });
      if (commentError) throw commentError;

      setCommentBody("");
      await loadAll();
      setNotice("Reply posted.");
    } catch (caughtError: unknown) {
      setError(errorMessage(caughtError, "Failed to add reply."));
    } finally {
      setPostingComment(false);
    }
  }

  if (checkingAuth || loading) {
    return <div className={styles.loadingState}>Loading ticket…</div>;
  }

  if (!ticket) {
    return <div className={styles.loadingState}>Ticket not found.</div>;
  }

  const requesterLabel =
    displayNameFromProfile(ticket.requester) ??
    nameFromProfileId(ticket.requester_id) ??
    ticket.requester_id;
  const assigneeLabel = ticket.assigned_to
    ? displayNameFromProfile(ticket.assignee) ??
      nameFromProfileId(ticket.assigned_to) ??
      ticket.assigned_to
    : "Unassigned";

  const requesterEmail =
    ticket.requester?.email ??
    profileById[ticket.requester_id]?.email ??
    null;
  const assigneeEmail =
    ticket.assignee?.email ??
    (ticket.assigned_to
      ? profileById[ticket.assigned_to]?.email ?? null
      : null);

  const isMine = ticket.assigned_to === userId;
  const isResolved = ticket.status === "resolved";
  const canComment =
    !isResolved && (isTech || ticket.requester_id === userId);
  const statusClass =
    ticket.status === "resolved"
      ? styles.statusResolved
      : ticket.status === "in_progress"
      ? styles.statusProgress
      : ticket.status === "waiting_on_user"
      ? styles.statusWaiting
      : styles.statusOpen;

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <nav className={styles.topbar} aria-label="Ticket navigation">
          <button
            type="button"
            className={styles.backButton}
            onClick={() => router.push("/my-tickets")}
          >
            ← All tickets
          </button>

          <div className={styles.topbarActions}>
            <span className={styles.signedIn}>
              {email || "Signed in"} · {role}
              {isAdmin ? " (view-only)" : ""}
            </span>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={loadAll}
              disabled={loading || updating}
            >
              Refresh
            </button>
          </div>
        </nav>

        {error ? <div className={styles.alert}>{error}</div> : null}
        {notice ? <div className={styles.notice}>{notice}</div> : null}

        <header className={styles.ticketHeader}>
          <div className={styles.eyebrow}>
            Support ticket · #{ticket.id.slice(0, 8)}
          </div>
          <h1 className={styles.ticketTitle}>{ticket.title}</h1>
          <div className={styles.badgeRow}>
            <span className={`${styles.badge} ${statusClass}`}>
              {formatStatus(ticket.status)}
            </span>
            <span className={`${styles.badge} ${styles.neutralBadge}`}>
              {formatStatus(ticket.priority)} priority
            </span>
            <span className={`${styles.badge} ${styles.neutralBadge}`}>
              {ticket.category}
            </span>
          </div>
        </header>

        <div className={styles.contentGrid}>
          <div className={styles.mainColumn}>
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Issue description</h2>
              </div>
              <div className={styles.cardBody}>
                <p className={styles.description}>{ticket.description}</p>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>Conversation</h2>
                  <p className={styles.cardSubtitle}>
                    Updates between the requester and support team
                  </p>
                </div>
                <span className={styles.commentCount}>{comments.length}</span>
              </div>

              {comments.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIcon} aria-hidden="true">
                    💬
                  </div>
                  <strong>No replies yet</strong>
                  <div>The conversation will appear here.</div>
                </div>
              ) : (
                <div className={styles.conversation}>
                  {comments.map((comment) => {
                    const authorName =
                      displayNameFromProfile(comment.author) ??
                      nameFromProfileId(comment.author_id) ??
                      "Unknown user";
                    const isOwnComment = comment.author_id === userId;
                    const authorRole =
                      comment.author_id === ticket.requester_id
                        ? "Requester"
                        : "Support";

                    return (
                      <article
                        key={comment.id}
                        className={`${styles.comment} ${
                          isOwnComment ? styles.ownComment : ""
                        }`}
                      >
                        <div className={styles.avatar} aria-hidden="true">
                          {initialsFor(authorName)}
                        </div>
                        <div className={styles.commentContent}>
                          <div className={styles.commentMeta}>
                            <span className={styles.commentAuthor}>
                              {isOwnComment ? "You" : authorName}
                            </span>
                            <span>·</span>
                            <span>{authorRole}</span>
                            <span>·</span>
                            <time dateTime={comment.created_at}>
                              {new Date(comment.created_at).toLocaleString()}
                            </time>
                          </div>
                          <div className={styles.commentBubble}>
                            {comment.body}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {canComment ? (
                <div className={styles.composer}>
                  <label className={styles.composerLabel} htmlFor="ticket-reply">
                    Add a reply
                  </label>
                  <textarea
                    id="ticket-reply"
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder="Write a clear update or ask a follow-up question…"
                    disabled={postingComment}
                  />
                  <div className={styles.composerFooter}>
                    <span className={styles.composerHint}>
                      Everyone with access to this ticket can see your reply.
                    </span>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={postComment}
                      disabled={postingComment || !commentBody.trim()}
                    >
                      {postingComment ? "Posting…" : "Post reply"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.disabledMessage}>
                  {isResolved
                    ? "This ticket is resolved, so the conversation is closed."
                    : "You do not have permission to reply to this ticket."}
                </div>
              )}
            </section>
          </div>

          <aside className={styles.sideColumn}>
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Ticket details</h2>
              </div>
              <div className={styles.cardBody}>
                <dl className={styles.detailsList}>
                  <div className={styles.detailRow}>
                    <dt className={styles.detailLabel}>Requester</dt>
                    <dd className={styles.detailValue}>{requesterLabel}</dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt className={styles.detailLabel}>Assigned to</dt>
                    <dd className={styles.detailValue}>{assigneeLabel}</dd>
                  </div>
                  {ticket.location ? (
                    <div className={styles.detailRow}>
                      <dt className={styles.detailLabel}>Location</dt>
                      <dd className={styles.detailValue}>{ticket.location}</dd>
                    </div>
                  ) : null}
                  <div className={styles.detailRow}>
                    <dt className={styles.detailLabel}>Created</dt>
                    <dd className={styles.detailValue}>
                      {new Date(ticket.created_at).toLocaleString()}
                    </dd>
                  </div>
                  {ticket.closed_at ? (
                    <div className={styles.detailRow}>
                      <dt className={styles.detailLabel}>Resolved</dt>
                      <dd className={styles.detailValue}>
                        {new Date(ticket.closed_at).toLocaleString()}
                      </dd>
                    </div>
                  ) : null}
                  {isStaff && requesterEmail ? (
                    <div className={styles.detailRow}>
                      <dt className={styles.detailLabel}>Email</dt>
                      <dd className={styles.detailValue}>{requesterEmail}</dd>
                    </div>
                  ) : null}
                  {isStaff && assigneeEmail ? (
                    <div className={styles.detailRow}>
                      <dt className={styles.detailLabel}>Tech email</dt>
                      <dd className={styles.detailValue}>{assigneeEmail}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </section>

            {isStaff ? (
              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Staff actions</h2>
                </div>
                <div className={styles.cardBody}>
                  {isResolved ? (
                    <p className={styles.disabledMessage}>
                      No actions are available for a resolved ticket.
                    </p>
                  ) : isTech ? (
                    <div className={styles.staffControls}>
                      <label className={styles.detailLabel} htmlFor="ticket-status">
                        Status
                      </label>
                      <select
                        id="ticket-status"
                        value={ticket.status}
                        onChange={(event) => changeStatus(event.target.value)}
                        disabled={updating}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {formatStatus(status)}
                          </option>
                        ))}
                      </select>
                      {isMine ? (
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={unassignFromMe}
                          disabled={updating}
                        >
                          Unassign from me
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={assignToMe}
                          disabled={updating}
                        >
                          Assign to me
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className={styles.disabledMessage}>
                      Administrators have view-only access.
                    </p>
                  )}
                </div>
              </section>
            ) : null}

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Activity</h2>
              </div>
              <div className={styles.cardBody}>
                {events.length === 0 ? (
                  <p className={styles.cardSubtitle}>No activity recorded yet.</p>
                ) : (
                  <div className={styles.timeline}>
                    {events.map((event) => {
                      const actorName =
                        displayNameFromProfile(event.actor) ??
                        nameFromProfileId(event.actor_id) ??
                        "Unknown user";

                      return (
                        <div key={event.id} className={styles.timelineItem}>
                          <span className={styles.timelineDot} aria-hidden="true" />
                          <div className={styles.timelineText}>
                            {formatEvent(event)}
                          </div>
                          <div className={styles.timelineMeta}>
                            {actorName} · {new Date(event.created_at).toLocaleString()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
