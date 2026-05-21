import type { Database } from "@/lib/supabase";
import {
  getServiceSupabaseClient,
  googleCorsHeaders,
  googleJsonResponse,
  requireAuthenticatedUser,
} from "../_shared";

export const runtime = "nodejs";

type EventRow = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  "id" | "client_name" | "event_name" | "date" | "deleted_at" | "imported_from" | "external_import_id"
>;

const nativeMstvIcsImportSource = "apple_ics_mstv";
const pageSize = 1000;

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isClearlyExternalOrphanCandidate(event: EventRow) {
  const eventName = normalizeLabel(event.event_name);
  if (eventName === "evenement apple" || eventName === "evenement google") return true;

  const importedFrom = normalizeLabel(event.imported_from);
  if (importedFrom.includes("apple") || importedFrom.includes("google")) return event.imported_from !== nativeMstvIcsImportSource;
  return Boolean(event.external_import_id && event.imported_from && event.imported_from !== nativeMstvIcsImportSource);
}

async function fetchActiveEvents(supabase: ReturnType<typeof getServiceSupabaseClient>) {
  const rows: EventRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("events")
      .select("id, client_name, event_name, date, deleted_at, imported_from, external_import_id")
      .is("deleted_at", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rows.push(...((data ?? []) as EventRow[]));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: googleCorsHeaders,
  });
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const body = (await request.json().catch(() => null)) as { action?: "report" | "soft_delete" } | null;
    const action = body?.action === "soft_delete" ? "soft_delete" : "report";
    const supabase = getServiceSupabaseClient();
    const activeEvents = await fetchActiveEvents(supabase);
    const candidates = activeEvents.filter(isClearlyExternalOrphanCandidate);
    const candidateIds = candidates.map((event) => event.id);
    const linkedEventIds = new Set<string>();

    for (const batch of chunkArray(candidateIds, 500)) {
      if (batch.length === 0) continue;
      const { data, error } = await supabase
        .from("external_event_links")
        .select("event_id")
        .in("event_id", batch);

      if (error) throw error;
      for (const link of data ?? []) {
        if (link.event_id) linkedEventIds.add(link.event_id);
      }
    }

    const orphanEvents = candidates.filter((event) => !linkedEventIds.has(event.id));

    if (action === "soft_delete" && orphanEvents.length > 0) {
      const now = new Date().toISOString();
      for (const batch of chunkArray(orphanEvents.map((event) => event.id), 500)) {
        const { error } = await supabase
          .from("events")
          .update({
            deleted_at: now,
            deleted_by: "external_orphan_cleanup",
          })
          .in("id", batch);

        if (error) throw error;
      }
    }

    return googleJsonResponse({
      ok: true,
      action,
      activeEventsCount: activeEvents.length,
      candidateCount: candidates.length,
      orphanCount: orphanEvents.length,
      softDeletedCount: action === "soft_delete" ? orphanEvents.length : 0,
      sample: orphanEvents.slice(0, 25).map((event) => ({
        id: event.id,
        clientName: event.client_name,
        eventName: event.event_name,
        date: event.date,
        importedFrom: event.imported_from,
        externalImportId: event.external_import_id,
      })),
    });
  } catch (error) {
    console.error("External orphan maintenance failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return googleJsonResponse(
      {
        ok: false,
        error: "Impossible d’analyser les événements externes orphelins.",
      },
      { status: 500 },
    );
  }
}
