"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import TicketImagePicker from "@/components/TicketImagePicker";
import { supabase } from "@/lib/supabaseClient";
import {
  uploadTicketImages,
  type PreparedTicketImage,
} from "@/lib/ticketAttachments";
import styles from "./page.module.css";

type Building = "main" | "prek";
type SortOption = "priority" | "newest" | "oldest" | "updated";

type TicketRow = {
  id: string;
  title: string;
  description: string;
  location: string | null;
  building: Building;
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

type ProfileRow = { id: string; role: string | null };
type UnreadCommentCountRow = { ticket_id: string; unread_count: number };

const PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

function emailToName(email: string) {
  return (email.split("@")[0] ?? email).replace(/[._-]+/g, " ").trim();
}

function displayNameFromProfile(
  profile?: { full_name: string | null; email: string | null } | null
) {
  const fullName = (profile?.full_name ?? "").trim();
  if (fullName) return fullName;
  const email = (profile?.email ?? "").trim();
  return email ? emailToName(email) : null;
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) return error.message;
  return fallback;
}

function statusClass(status: string) {
  if (status === "in_progress") return styles.statusProgress;
  if (status === "waiting_on_user") return styles.statusWaiting;
  if (status === "resolved") return styles.statusResolved;
  return styles.statusOpen;
}

function priorityClass(priority: string) {
  if (priority === "urgent") return styles.priorityUrgent;
  if (priority === "high") return styles.priorityHigh;
  if (priority === "low") return styles.priorityLow;
  return styles.priorityNormal;
}

export default function MyTicketsPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [unreadCommentCounts, setUnreadCommentCounts] = useState<Record<string, number>>({});
  const [profileById, setProfileById] = useState<Record<string, { email: string | null; full_name: string | null }>>({});
  const [error, setError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("priority");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [building, setBuilding] = useState<Building>("main");
  const [category, setCategory] = useState("Other");
  const [priority, setPriority] = useState("normal");
  const [creating, setCreating] = useState(false);
  const [pendingImages, setPendingImages] = useState<PreparedTicketImage[]>([]);
  const [preparingImages, setPreparingImages] = useState(false);

  const isAdmin = role === "admin";
  const isStaff = role === "tech" || role === "admin";
  const isTech = role === "tech";

  useEffect(() => {
    async function checkAuthentication() {
      setCheckingAuth(true);
      setError(null);
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
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
    }
    void checkAuthentication();
  }, [router]);

  async function resolveProfilesForTicket(ticketId: string, ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return;
    const { data, error: profileError } = await supabase.rpc("ticket_profile_emails", {
      _ticket_id: ticketId,
      _ids: uniqueIds,
    });
    if (profileError || !data) return;
    const nextProfiles: Record<string, { email: string | null; full_name: string | null }> = {};
    for (const row of data as Array<{ id: string; email: string | null; full_name: string | null }>) {
      if (!row.id) continue;
      nextProfiles[row.id] = { email: row.email ?? null, full_name: row.full_name ?? null };
    }
    setProfileById((previous) => ({ ...previous, ...nextProfiles }));
  }

  async function loadUnreadCommentCounts() {
    if (!userId) return;
    const { data, error: unreadError } = await supabase.rpc("unread_ticket_comment_counts");
    if (unreadError) {
      console.warn("Could not load unread comment counts:", unreadError.message);
      return;
    }
    const nextCounts: Record<string, number> = {};
    for (const row of (data ?? []) as UnreadCommentCountRow[]) {
      if (row.unread_count > 0) nextCounts[row.ticket_id] = row.unread_count;
    }
    setUnreadCommentCounts(nextCounts);
  }

  async function loadTickets() {
    setLoadingTickets(true);
    setError(null);
    try {
      const { data, error: ticketError } = await supabase
        .from("tickets")
        .select(`
          id,title,description,location,building,category,status,priority,
          requester_id,assigned_to,created_at,updated_at,closed_at,
          requester:requester_id(email, full_name),
          assignee:assigned_to(email, full_name)
        `)
        .order("created_at", { ascending: false })
        .returns<TicketRow[]>();
      if (ticketError) throw ticketError;
      const rows = data ?? [];
      setTickets(rows);
      await loadUnreadCommentCounts();
      await Promise.all(
        rows
          .filter((ticket) => ticket.assigned_to && !ticket.assignee?.email && !profileById[ticket.assigned_to])
          .map((ticket) => resolveProfilesForTicket(ticket.id, [ticket.assigned_to!]))
      );
    } catch (caughtError: unknown) {
      setError(errorMessage(caughtError, "Failed to load tickets."));
    } finally {
      setLoadingTickets(false);
    }
  }

  useEffect(() => {
    if (!checkingAuth) void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingAuth]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`ticket-comment-notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_comments" }, () => void loadUnreadCommentCounts())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function createTicket() {
    setCreating(true);
    setError(null);
    setCreateNotice(null);
    let createdTicketId: string | null = null;
    try {
      if (!userId) throw new Error("Not signed in.");
      if (!title.trim()) throw new Error("Title is required.");
      if (!description.trim()) throw new Error("Description is required.");
      const { data: createdTicket, error: createError } = await supabase
        .from("tickets")
        .insert({
          title: title.trim(),
          description: description.trim(),
          location: location.trim() || null,
          building,
          category,
          priority,
          requester_id: userId,
        })
        .select("id")
        .single<{ id: string }>();
      if (createError) throw createError;
      createdTicketId = createdTicket.id;
      const uploadResult = await uploadTicketImages(supabase, createdTicket.id, userId, pendingImages);
      setTitle("");
      setDescription("");
      setLocation("");
      setBuilding("main");
      setCategory("Other");
      setPriority("normal");
      setPendingImages([]);
      if (uploadResult.errors.length > 0) {
        setError(`Ticket created, but ${uploadResult.errors.length} photo upload failed. ${uploadResult.errors.join(" ")}`);
      }
      setCreateNotice(uploadResult.uploadedCount > 0 ? `Ticket created with ${uploadResult.uploadedCount} photo${uploadResult.uploadedCount === 1 ? "" : "s"}.` : "Ticket created.");
      await loadTickets();
    } catch (caughtError: unknown) {
      if (createdTicketId) {
        setTitle("");
        setDescription("");
        setLocation("");
        setPendingImages([]);
        setCreateNotice("Ticket created without all selected photos.");
        await loadTickets();
      }
      setError(errorMessage(caughtError, createdTicketId ? "The ticket was created, but its photos could not be uploaded." : "Failed to create ticket."));
    } finally {
      setCreating(false);
    }
  }

  async function assignToMe(ticketId: string) {
    if (!isTech || !userId) return;
    setUpdatingTicketId(ticketId);
    setError(null);
    setActionNotice(null);
    try {
      const { error: updateError } = await supabase.from("tickets").update({ assigned_to: userId }).eq("id", ticketId);
      if (updateError) throw updateError;
      setTickets((previous) => previous.map((ticket) => ticket.id === ticketId ? { ...ticket, assigned_to: userId } : ticket));
      setActionNotice("Ticket assigned to you.");
      if (!profileById[userId]) await resolveProfilesForTicket(ticketId, [userId]);
    } catch (caughtError: unknown) {
      setError(errorMessage(caughtError, "Failed to assign ticket."));
    } finally {
      setUpdatingTicketId(null);
    }
  }

  async function unassignFromMe(ticketId: string) {
    if (!isTech || !userId) return;
    const ticket = tickets.find((candidate) => candidate.id === ticketId);
    if (ticket?.assigned_to !== userId) return;
    setUpdatingTicketId(ticketId);
    setError(null);
    setActionNotice(null);
    try {
      const { error: updateError } = await supabase.from("tickets").update({ assigned_to: null }).eq("id", ticketId);
      if (updateError) throw updateError;
      setTickets((previous) => previous.map((row) => row.id === ticketId ? { ...row, assigned_to: null } : row));
      setActionNotice("Ticket unassigned.");
    } catch (caughtError: unknown) {
      setError(errorMessage(caughtError, "Failed to unassign ticket."));
    } finally {
      setUpdatingTicketId(null);
    }
  }

  async function changeStatus(ticketId: string, newStatus: string) {
    if (!isTech) return;
    if (newStatus === "resolved" && !window.confirm("Mark this ticket as resolved? This cannot be undone.")) return;
    setUpdatingTicketId(ticketId);
    setError(null);
    setActionNotice(null);
    try {
      const { error: updateError } = await supabase.from("tickets").update({ status: newStatus }).eq("id", ticketId);
      if (updateError) throw updateError;
      setTickets((previous) => previous.map((ticket) => ticket.id === ticketId ? { ...ticket, status: newStatus } : ticket));
      setActionNotice("Status updated.");
    } catch (caughtError: unknown) {
      setError(errorMessage(caughtError, "Failed to update status."));
    } finally {
      setUpdatingTicketId(null);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const activeTickets = useMemo(() => {
    const rows = tickets.filter((ticket) => ticket.status !== "resolved");
    if (!isStaff) return rows;
    return [...rows].sort((a, b) => {
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "updated") return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      const rankDifference = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
      if (rankDifference !== 0) return rankDifference;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [tickets, isStaff, sortBy]);

  const mainTickets = activeTickets.filter((ticket) => ticket.building !== "prek");
  const prekTickets = activeTickets.filter((ticket) => ticket.building === "prek");
  const resolvedTickets = useMemo(() => tickets
    .filter((ticket) => ticket.status === "resolved")
    .sort((a, b) => new Date(b.closed_at ?? b.updated_at).getTime() - new Date(a.closed_at ?? a.updated_at).getTime()), [tickets]);

  function TicketCard({ ticket }: { ticket: TicketRow }) {
    const requesterLabel = displayNameFromProfile(ticket.requester) ?? ticket.requester_id;
    const fallbackAssignee = ticket.assigned_to ? profileById[ticket.assigned_to] : null;
    const assigneeLabel = ticket.assigned_to
      ? displayNameFromProfile(ticket.assignee) ?? displayNameFromProfile(fallbackAssignee) ?? ticket.assigned_to
      : "Unassigned";
    const unreadCount = unreadCommentCounts[ticket.id] ?? 0;
    const isMine = ticket.assigned_to === userId;
    const rowUpdating = updatingTicketId === ticket.id;
    const isResolved = ticket.status === "resolved";
    const openTicket = () => {
      setUnreadCommentCounts((previous) => ({ ...previous, [ticket.id]: 0 }));
      router.push(`/tickets/${ticket.id}`);
    };

    return (
      <article className={styles.ticketCard} onClick={openTicket} tabIndex={0} role="link"
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openTicket(); } }}>
        <div className={styles.ticketTopline}>
          <div className={styles.ticketHeading}>
            <h3>{ticket.title}</h3>
            {unreadCount > 0 ? <span className={styles.unreadBadge}><span aria-hidden="true" />{unreadCount} new {unreadCount === 1 ? "reply" : "replies"}</span> : null}
          </div>
          <time className={styles.cardDate} dateTime={ticket.created_at}>{formatDate(ticket.created_at)}</time>
        </div>
        <div className={styles.badgeRow}>
          <span className={`${styles.pill} ${statusClass(ticket.status)}`}>{formatLabel(ticket.status)}</span>
          <span className={`${styles.pill} ${priorityClass(ticket.priority)}`}>{formatLabel(ticket.priority)}</span>
          {!isResolved ? <span className={`${styles.pill} ${ticket.assigned_to ? styles.assigned : styles.unassigned}`}>
            {isMine ? "Assigned to you" : ticket.assigned_to ? "Assigned" : "Unassigned"}
          </span> : null}
        </div>
        <p className={styles.ticketDescription}>{ticket.description}</p>
        <div className={styles.ticketMeta}>
          <span><b>{ticket.building === "prek" ? "Pre-K" : "Main"}</b></span>
          {ticket.location ? <span>{ticket.location}</span> : null}
          <span>{ticket.category}</span>
          {isStaff ? <span>Requested by {requesterLabel}</span> : null}
          <span>{assigneeLabel}</span>
        </div>
        {isTech && !isResolved ? <div className={styles.cardActions} onClick={(event) => event.stopPropagation()}>
          <label><span>Status</span><select value={ticket.status} onChange={(event) => void changeStatus(ticket.id, event.target.value)} disabled={rowUpdating}>
            <option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_on_user">Waiting on user</option><option value="resolved">Resolved</option>
          </select></label>
          <button type="button" className={styles.secondaryButton} onClick={() => void (isMine ? unassignFromMe(ticket.id) : assignToMe(ticket.id))} disabled={rowUpdating}>
            {rowUpdating ? "Updating…" : isMine ? "Unassign" : "Assign to me"}
          </button>
        </div> : null}
      </article>
    );
  }

  function TicketSection({ title: sectionTitle, subtitle, rows, prek = false }: { title: string; subtitle: string; rows: TicketRow[]; prek?: boolean }) {
    if (rows.length === 0) return null;
    return <section className={styles.ticketSection}>
      <div className={styles.sectionHeading}><div><h2>{sectionTitle}<span className={styles.sectionCount}>{rows.length}</span></h2><p>{subtitle}</p></div>
        {prek ? <span className={styles.travelBadge}>Separate building</span> : null}</div>
      <div className={styles.ticketGrid}>{rows.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}</div>
    </section>;
  }

  if (checkingAuth) return <div className={styles.loadingState}>Loading tickets…</div>;

  return <div className={styles.page}><main className={styles.shell}>
    <header className={styles.topbar}>
      <div><div className={styles.eyebrow}>Peck IT Support</div><h1>{isStaff ? "Support tickets" : "My tickets"}</h1>
        <p className={styles.accountLine}>{email || "Signed in"} <span>·</span> {formatLabel(role)}{isAdmin ? " · View only" : ""}</p></div>
      <div className={styles.topbarActions}><ThemeToggle />
        <button type="button" className={styles.secondaryButton} onClick={() => void loadTickets()} disabled={loadingTickets}>{loadingTickets ? "Refreshing…" : "Refresh"}</button>
        <button type="button" className={styles.signOutButton} onClick={signOut}>Sign out</button>
      </div>
    </header>

    {error ? <div className={styles.alert}>{error}</div> : null}
    {actionNotice ? <div className={styles.notice}>{actionNotice}</div> : null}

    <section className={styles.createCard}>
      <div className={styles.createHeader}><div><h2>Create a ticket</h2><p>Tell the support team what you need help with.</p></div></div>
      <div className={styles.formGrid}>
        <label className={styles.fullField}><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Brief summary of the issue" /></label>
        <label className={styles.fullField}><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What happened, and what have you already tried?" /></label>
        <fieldset className={`${styles.buildingField} ${styles.fullField}`}><legend>Building</legend><div className={styles.segmentedControl}>
          <label className={building === "main" ? styles.segmentActive : ""}><input type="radio" name="building" value="main" checked={building === "main"} onChange={() => setBuilding("main")} /><span>Main Building</span></label>
          <label className={building === "prek" ? styles.segmentActive : ""}><input type="radio" name="building" value="prek" checked={building === "prek"} onChange={() => setBuilding("prek")} /><span>Pre-K Building</span></label>
        </div></fieldset>
        <label><span>Room or location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Example: Room 204" /></label>
        <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="Other">Other</option><option value="Classroom Tech">Classroom Tech</option><option value="Laptop">Laptop</option><option value="Internet">Internet</option><option value="Printer">Printer</option><option value="Account">Account</option>
        </select></label>
        <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value)}>
          <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
        </select></label>
        <div className={styles.fullField}><TicketImagePicker value={pendingImages} onChange={setPendingImages} disabled={creating} onBusyChange={setPreparingImages} label="Photos (optional)" /></div>
        <div className={`${styles.submitRow} ${styles.fullField}`}>
          {createNotice ? <span className={styles.inlineNotice}>{createNotice}</span> : <span />}
          <button type="button" className={styles.primaryButton} onClick={() => void createTicket()} disabled={creating || preparingImages || !title.trim() || !description.trim()}>
            {creating ? pendingImages.length > 0 ? "Creating and uploading…" : "Creating…" : preparingImages ? "Preparing photos…" : "Submit ticket"}
          </button>
        </div>
      </div>
    </section>

    <div className={styles.listToolbar}><div><h2>Active tickets</h2><p>{loadingTickets ? "Loading…" : `${activeTickets.length} open request${activeTickets.length === 1 ? "" : "s"}`}</p></div>
      {isStaff ? <label className={styles.sortControl}><span>Sort by</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)}>
        <option value="priority">Priority</option><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="updated">Recently updated</option>
      </select></label> : null}
    </div>

    {activeTickets.length === 0 ? <div className={styles.emptyState}>No active tickets.</div> : <div className={styles.sections}>
      <TicketSection title="Pre-K Building" subtitle="Tickets that require travel to the separate building" rows={prekTickets} prek />
      <TicketSection title="Main Building" subtitle="Tickets located in the main school building" rows={mainTickets} />
    </div>}

    <section className={styles.resolvedSection}>
      <button type="button" className={styles.resolvedToggle} onClick={() => setResolvedOpen((open) => !open)} aria-expanded={resolvedOpen}>
        <span>Resolved tickets <b>{resolvedTickets.length}</b></span><span aria-hidden="true">{resolvedOpen ? "−" : "+"}</span>
      </button>
      {resolvedOpen ? resolvedTickets.length === 0 ? <div className={styles.emptyState}>No resolved tickets.</div> : <div className={styles.ticketGrid}>{resolvedTickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}</div> : null}
    </section>
  </main></div>;
}
