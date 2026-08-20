import { createClient } from "@supabase/supabase-js";

const INACTIVITY_THRESHOLD_DAYS = 5;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  return (
    Boolean(cronSecret) &&
    request.headers.get("authorization") === `Bearer ${cronSecret}`
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const requesterId = process.env.MAINTENANCE_REQUESTER_ID;

  if (!supabaseUrl || !serviceRoleKey || !requesterId) {
    console.error(
      "Supabase keepalive is missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or MAINTENANCE_REQUESTER_ID."
    );
    return Response.json(
      { error: "Supabase keepalive is not configured." },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: latestTicket, error: lookupError } = await supabase
    .from("tickets")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string }>();

  if (lookupError) {
    console.error("Supabase keepalive could not read tickets:", lookupError);
    return Response.json(
      { error: "Could not check recent ticket activity." },
      { status: 502 }
    );
  }

  const inactivityThreshold =
    Date.now() - INACTIVITY_THRESHOLD_DAYS * MILLISECONDS_PER_DAY;
  const latestTicketTime = latestTicket
    ? new Date(latestTicket.created_at).getTime()
    : Number.NEGATIVE_INFINITY;

  if (latestTicketTime > inactivityThreshold) {
    return Response.json({
      ok: true,
      ticketCreated: false,
      reason: "Recent ticket activity found.",
      latestTicketAt: latestTicket?.created_at ?? null,
    });
  }

  const { data: maintenanceTicket, error: insertError } = await supabase
    .from("tickets")
    .insert({
      title: "Maintenance: Supabase keepalive",
      description:
        "This automatic maintenance ticket was created because the ticket database has been inactive for several days. No action is required.",
      location: "System",
      category: "Other",
      status: "open",
      priority: "low",
      requester_id: requesterId,
      assigned_to: null,
    })
    .select("id, created_at")
    .single<{ id: string; created_at: string }>();

  if (insertError) {
    console.error(
      "Supabase keepalive could not create a maintenance ticket:",
      insertError
    );
    return Response.json(
      { error: "Could not create the maintenance ticket." },
      { status: 502 }
    );
  }

  return Response.json({
    ok: true,
    ticketCreated: true,
    ticketId: maintenanceTicket.id,
    createdAt: maintenanceTicket.created_at,
  });
}
