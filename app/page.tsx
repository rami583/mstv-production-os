"use client";

import {
  AlertCircle,
  Brush,
  Camera,
  Captions,
  Check,
  CircleHelp,
  CirclePlay,
  Clock3,
  Cloud,
  Copy,
  ExternalLink,
  FileStack,
  FileText,
  Mic2,
  MonitorPlay,
  Palette,
  Presentation,
  Radio,
  Scissors,
  Search,
  ShieldCheck,
  Timer,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  supabase,
  type CompletionStatus,
  type Database,
  type EventStatus,
  type LinkStatus,
} from "@/lib/supabase";

type Screen = "calendar" | "detail";
type State = "ok" | "waiting";
type ItemKind = "option" | "link";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventOptionRow = Database["public"]["Tables"]["event_options"]["Row"];
type EventLinkRow = Database["public"]["Tables"]["event_links"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type TeamMemberRow = Database["public"]["Tables"]["team_members"]["Row"];

type EventQueryRow = EventRow & {
  event_options: EventOptionRow[] | null;
  event_links: EventLinkRow[] | null;
  tasks:
    | (TaskRow & {
        task_assignees:
          | ({
              team_members: TeamMemberRow | null;
            } | null)[]
          | null;
      })[]
    | null;
};

type TeamMember = {
  id: string;
  firstName: string;
  role: string | null;
};

type EventOption = {
  id: string;
  eventId: string;
  label: string;
  status: CompletionStatus;
  details: string | null;
  createdAt: string;
};

type EventLink = {
  id: string;
  eventId: string;
  label: string;
  url: string | null;
  status: LinkStatus;
  createdAt: string;
};

type TaskItem = {
  id: string;
  eventId: string;
  title: string;
  subtitle: string | null;
  status: CompletionStatus;
  createdAt: string;
  assignees: TeamMember[];
};

type ProductionEvent = {
  id: string;
  clientName: string;
  eventName: string;
  date: string;
  clientArrivalTime: string | null;
  startTime: string;
  endTime: string;
  endOfDayTime: string | null;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
  options: EventOption[];
  links: EventLink[];
  tasks: TaskItem[];
};

type ContextSelection =
  | { type: "option"; optionId: string }
  | { type: "link"; linkId: string; copied: boolean }
  | null;

type CreateEventInput = {
  clientName: string;
  eventName: string;
  date: string;
  clientArrivalTime: string;
  startTime: string;
  endTime: string;
  endOfDayTime: string;
  status: EventStatus;
};

const statusOptions: EventStatus[] = ["Brouillon", "En préparation", "En attente client", "Prêt", "En direct", "Terminé"];

const statusStyles: Record<EventStatus, string> = {
  Brouillon: "bg-stone-100 text-stone-600 ring-stone-200",
  "En préparation": "bg-amber-100 text-amber-800 ring-amber-200",
  "En attente client": "bg-sky-100 text-sky-800 ring-sky-200",
  Prêt: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  "En direct": "bg-rose-100 text-rose-800 ring-rose-200",
  Terminé: "bg-stone-200 text-stone-700 ring-stone-300",
};

const stateStyles: Record<State, { panel: string; icon: string; label: string }> = {
  ok: {
    panel: "border-emerald-200 bg-emerald-50/70",
    icon: "bg-emerald-100 text-emerald-700",
    label: "Terminé",
  },
  waiting: {
    panel: "border-sky-200 bg-sky-50/70",
    icon: "bg-sky-100 text-sky-700",
    label: "À faire",
  },
};

const iconKeywordRules: { keywords: string[]; icon: LucideIcon }[] = [
  { keywords: ["drive", "dossier", "cloud"], icon: Cloud },
  { keywords: ["replay", "video", "vod"], icon: CirclePlay },
  { keywords: ["slides", "slide", "presentation", "deck"], icon: Presentation },
  { keywords: ["wifi", "wi fi", "reseau", "internet"], icon: Wifi },
  { keywords: ["streaming", "stream", "live", "direct"], icon: Radio },
  { keywords: ["maquillage", "makeup"], icon: Brush },
  { keywords: ["habillage", "design", "graphique"], icon: Palette },
  { keywords: ["timer", "chrono", "compte a rebours"], icon: Timer },
  { keywords: ["prompteur", "texte", "script"], icon: FileText },
  { keywords: ["plateforme", "platform", "livemaker", "evenement"], icon: MonitorPlay },
  { keywords: ["quiz", "question", "q&a", "qa"], icon: CircleHelp },
  { keywords: ["moderation", "moderateur", "chat"], icon: ShieldCheck },
  { keywords: ["sous titres", "sous-titres", "subtitles", "caption"], icon: Captions },
  { keywords: ["camera", "cam"], icon: Camera },
  { keywords: ["montage", "edit", "edition"], icon: Scissors },
  { keywords: ["duplex", "micro", "mic", "invite"], icon: Mic2 },
  { keywords: ["conducteur", "run of show"], icon: FileStack },
];

const defaultOptions = [
  { label: "Habillage", details: "Éléments graphiques à installer" },
  { label: "Plateforme", details: "Événement live à configurer" },
  { label: "Duplex", details: "Invités distants à confirmer" },
  { label: "Slides", details: "Deck client à recevoir" },
  { label: "Replay", details: "Destination replay à définir" },
  { label: "Modération", details: "Comptes modérateurs à préparer" },
];

const defaultLinks = ["Drive client", "Habillage Guillaume", "Événement LiveMaker", "Conducteur", "Slides", "Replay"];

const defaultTasks = [
  { title: "Mobilier", subtitle: "Configuration plateau à confirmer", assignees: ["Arthur"] },
  { title: "Installer l'habillage", subtitle: "Package graphique régie", assignees: ["Tony", "Guillaume"] },
  { title: "Configurer la plateforme", subtitle: "Event, page privée, test technique", assignees: ["Rami"] },
  { title: "Préparer l'accueil", subtitle: "Café, loge, arrivée client", assignees: ["Antoine"] },
];

const calendarArrowClassName =
  "flex h-9 w-9 items-center justify-center rounded-full text-base text-[#bb2720] transition hover:bg-[#bb2720]/[0.08] disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-transparent";

const monthNames = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(time: string | null) {
  if (!time) return "À confirmer";
  const [hours = "00", minutes = "00"] = time.split(":");
  return `${hours.padStart(2, "0")}h${minutes.padStart(2, "0")}`;
}

function toTimeInputValue(time: string | null) {
  if (!time) return "";
  const [hours = "00", minutes = "00"] = time.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function eventSortValue(event: ProductionEvent) {
  return new Date(`${event.date}T${toTimeInputValue(event.startTime) || "00:00"}:00`).getTime();
}

function normalizeLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatTitleCase(label: string) {
  return label
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/(^|[^\p{L}\p{N}])([\p{L}])/gu, (_, separator: string, letter: string) => {
      return `${separator}${letter.toLocaleUpperCase("fr-FR")}`;
    });
}

function mapTeamMember(row: TeamMemberRow): TeamMember {
  return {
    id: row.id,
    firstName: row.first_name,
    role: row.role,
  };
}

function mapEvent(row: EventQueryRow): ProductionEvent {
  const options = [...(row.event_options ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((option) => ({
      id: option.id,
      eventId: option.event_id,
      label: option.label,
      status: option.status,
      details: option.details,
      createdAt: option.created_at,
    }));

  const links = [...(row.event_links ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((link) => ({
      id: link.id,
      eventId: link.event_id,
      label: link.label,
      url: link.url,
      status: link.status,
      createdAt: link.created_at,
    }));

  const tasks = [...(row.tasks ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((task) => ({
      id: task.id,
      eventId: task.event_id,
      title: task.title,
      subtitle: task.subtitle,
      status: task.status,
      createdAt: task.created_at,
      assignees: (task.task_assignees ?? [])
        .map((assignee) => assignee?.team_members)
        .filter((member): member is TeamMemberRow => Boolean(member))
        .map(mapTeamMember),
    }));

  return {
    id: row.id,
    clientName: row.client_name,
    eventName: row.event_name,
    date: row.date,
    clientArrivalTime: row.client_arrival_time,
    startTime: row.start_time,
    endTime: row.end_time,
    endOfDayTime: row.end_of_day_time,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    options,
    links,
    tasks,
  };
}

async function fetchEvents() {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  const { data, error } = await supabase
    .from("events")
    .select(
      `
        *,
        event_options (*),
        event_links (*),
        tasks (
          *,
          task_assignees (
            team_members (*)
          )
        )
      `,
    )
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as EventQueryRow[]).map(mapEvent);
}

async function fetchTeamMembers() {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  const { data, error } = await supabase.from("team_members").select("*").order("first_name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapTeamMember);
}

export default function Home() {
  const today = useMemo(() => new Date(), []);
  const [screen, setScreen] = useState<Screen>("calendar");
  const [events, setEvents] = useState<ProductionEvent[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDateKey, setSelectedDateKey] = useState(formatDateKey(today));
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const chronologicalEvents = useMemo(() => [...events].sort((a, b) => eventSortValue(a) - eventSortValue(b)), [events]);
  const selectedEvent = useMemo(() => chronologicalEvents.find((item) => item.id === selectedId) ?? chronologicalEvents[0] ?? null, [chronologicalEvents, selectedId]);
  const selectedEventIndex = selectedEvent ? chronologicalEvents.findIndex((item) => item.id === selectedEvent.id) : -1;
  const hasPreviousEvent = selectedEventIndex > 0;
  const hasNextEvent = selectedEventIndex >= 0 && selectedEventIndex < chronologicalEvents.length - 1;
  const yearLabel = String(visibleMonth.getFullYear());

  useEffect(() => {
    void reloadData();
  }, []);

  async function reloadData(nextSelectedId?: string | null) {
    setLoading(true);
    setError(null);

    try {
      const [nextEvents, nextTeamMembers] = await Promise.all([fetchEvents(), fetchTeamMembers()]);
      setEvents(nextEvents);
      setTeamMembers(nextTeamMembers);
      setSelectedId((current) => {
        if (nextSelectedId !== undefined) return nextSelectedId;
        if (current && nextEvents.some((event) => event.id === current)) return current;
        return nextEvents[0]?.id ?? null;
      });
    } catch (supabaseError) {
      setError(supabaseError instanceof Error ? supabaseError.message : "Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  }

  function openEvent(id: string) {
    setSelectedId(id);
    setScreen("detail");
  }

  function changeMonth(delta: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function goToday() {
    const now = new Date();
    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDateKey(formatDateKey(now));
    setScreen("calendar");
  }

  function navigateEvent(delta: -1 | 1) {
    const nextEvent = chronologicalEvents[selectedEventIndex + delta];
    if (!nextEvent) return;
    setSelectedId(nextEvent.id);
  }

  async function createEvent(input: CreateEventInput) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        client_name: input.clientName,
        event_name: input.eventName,
        date: input.date,
        client_arrival_time: input.clientArrivalTime || null,
        start_time: input.startTime,
        end_time: input.endTime,
        end_of_day_time: input.endOfDayTime || null,
        status: input.status,
      })
      .select()
      .single();

    if (eventError) throw eventError;

    await Promise.all([
      supabase.from("event_options").insert(
        defaultOptions.map((option) => ({
          event_id: event.id,
          label: option.label,
          status: "incomplete" as CompletionStatus,
          details: option.details,
        })),
      ),
      supabase.from("event_links").insert(
        defaultLinks.map((label) => ({
          event_id: event.id,
          label,
          url: null,
          status: "missing" as LinkStatus,
        })),
      ),
    ]);

    const { data: insertedTasks, error: taskError } = await supabase
      .from("tasks")
      .insert(
        defaultTasks.map((task) => ({
          event_id: event.id,
          title: task.title,
          subtitle: task.subtitle,
          status: "incomplete" as CompletionStatus,
        })),
      )
      .select();

    if (taskError) throw taskError;

    const assignees = (insertedTasks ?? []).flatMap((task, index) => {
      const assignedNames = defaultTasks[index]?.assignees ?? [];
      return assignedNames.flatMap((name) => {
        const member = teamMembers.find((item) => item.firstName === name);
        return member ? [{ task_id: task.id, team_member_id: member.id }] : [];
      });
    });

    if (assignees.length > 0) {
      const { error: assigneeError } = await supabase.from("task_assignees").insert(assignees);
      if (assigneeError) throw assigneeError;
    }

    await reloadData(event.id);
    setSelectedDateKey(event.date);
    setVisibleMonth(new Date(`${event.date}T12:00:00`));
    setScreen("detail");
  }

  async function toggleOption(option: EventOption) {
    if (!supabase) return;
    const nextStatus: CompletionStatus = option.status === "completed" ? "incomplete" : "completed";
    const { error: updateError } = await supabase.from("event_options").update({ status: nextStatus }).eq("id", option.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setEvents((current) =>
      current.map((event) =>
        event.id === option.eventId
          ? {
              ...event,
              options: event.options.map((item) => (item.id === option.id ? { ...item, status: nextStatus } : item)),
            }
          : event,
      ),
    );
  }

  async function toggleTask(task: TaskItem) {
    if (!supabase) return;
    const nextStatus: CompletionStatus = task.status === "completed" ? "incomplete" : "completed";
    const { error: updateError } = await supabase.from("tasks").update({ status: nextStatus }).eq("id", task.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setEvents((current) =>
      current.map((event) =>
        event.id === task.eventId
          ? {
              ...event,
              tasks: event.tasks.map((item) => (item.id === task.id ? { ...item, status: nextStatus } : item)),
            }
          : event,
      ),
    );
  }

  async function updateLinkUrl(link: EventLink, url: string) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextUrl = url.trim();
    const nextStatus: LinkStatus = nextUrl ? "available" : "missing";
    const { error: updateError } = await supabase
      .from("event_links")
      .update({ url: nextUrl || null, status: nextStatus })
      .eq("id", link.id);

    if (updateError) throw updateError;

    const updatedLink: EventLink = {
      ...link,
      url: nextUrl || null,
      status: nextStatus,
    };

    setEvents((current) =>
      current.map((event) =>
        event.id === link.eventId
          ? {
              ...event,
              links: event.links.map((item) => (item.id === link.id ? updatedLink : item)),
            }
          : event,
      ),
    );

    return updatedLink;
  }

  async function createEventOption(eventId: string, label: string) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextLabel = formatTitleCase(label);
    if (!nextLabel) {
      throw new Error("Le nom de l'option est requis.");
    }

    const { data, error: insertError } = await supabase
      .from("event_options")
      .insert({
        event_id: eventId,
        label: nextLabel,
        status: "incomplete",
        details: null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const option: EventOption = {
      id: data.id,
      eventId: data.event_id,
      label: data.label,
      status: data.status,
      details: data.details,
      createdAt: data.created_at,
    };

    setEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? {
              ...event,
              options: [...event.options, option],
            }
          : event,
      ),
    );

    return option;
  }

  async function deleteEventOption(option: EventOption) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const { error: deleteError } = await supabase.from("event_options").delete().eq("id", option.id);

    if (deleteError) throw deleteError;

    setEvents((current) =>
      current.map((event) =>
        event.id === option.eventId
          ? {
              ...event,
              options: event.options.filter((item) => item.id !== option.id),
            }
          : event,
      ),
    );
  }

  async function createEventLink(eventId: string, input: { label: string; url: string }) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextLabel = formatTitleCase(input.label);
    const nextUrl = input.url.trim();
    if (!nextLabel) {
      throw new Error("Le nom du lien est requis.");
    }

    const { data, error: insertError } = await supabase
      .from("event_links")
      .insert({
        event_id: eventId,
        label: nextLabel,
        url: nextUrl || null,
        status: nextUrl ? "available" : "missing",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const link: EventLink = {
      id: data.id,
      eventId: data.event_id,
      label: data.label,
      url: data.url,
      status: data.status,
      createdAt: data.created_at,
    };

    setEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? {
              ...event,
              links: [...event.links, link],
            }
          : event,
      ),
    );

    return link;
  }

  async function deleteEventLink(link: EventLink) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const { error: deleteError } = await supabase.from("event_links").delete().eq("id", link.id);

    if (deleteError) throw deleteError;

    setEvents((current) =>
      current.map((event) =>
        event.id === link.eventId
          ? {
              ...event,
              links: event.links.filter((item) => item.id !== link.id),
            }
          : event,
      ),
    );
  }

  async function deleteCurrentEvent() {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    if (!selectedEvent) {
      throw new Error("Aucun événement sélectionné.");
    }

    const eventId = selectedEvent.id;
    const { error: deleteError } = await supabase.from("events").delete().eq("id", eventId);

    if (deleteError) throw deleteError;

    setEvents((current) => current.filter((event) => event.id !== eventId));
    setSelectedId(null);
    setScreen("calendar");
    setCreateMenuOpen(false);
    setDeleteDialogOpen(false);
    await reloadData(null);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f9fb] text-stone-950">
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <AppHeader
          screen={screen}
          setScreen={setScreen}
          yearLabel={yearLabel}
          goToday={goToday}
          createMenuOpen={createMenuOpen}
          setCreateMenuOpen={setCreateMenuOpen}
          onCreateEvent={() => {
            setCreateModalOpen(true);
            setCreateMenuOpen(false);
          }}
          canDeleteEvent={screen === "detail" && Boolean(selectedEvent)}
          onDeleteEvent={() => {
            setDeleteDialogOpen(true);
            setCreateMenuOpen(false);
          }}
        />

        {error && <StatusMessage tone="error">{error}</StatusMessage>}
        {loading && <StatusMessage>Chargement des productions...</StatusMessage>}

        {!loading && screen === "calendar" && (
          <CalendarDashboard
            events={events}
            onOpen={openEvent}
            visibleMonth={visibleMonth}
            selectedDateKey={selectedDateKey}
            setSelectedDateKey={setSelectedDateKey}
            changeMonth={changeMonth}
          />
        )}

        {!loading && screen === "detail" && selectedEvent && (
          <ProductionDetail
            event={selectedEvent}
            hasPrevious={hasPreviousEvent}
            hasNext={hasNextEvent}
            goPrevious={() => navigateEvent(-1)}
            goNext={() => navigateEvent(1)}
            onToggleOption={toggleOption}
            onToggleTask={toggleTask}
            onCreateOption={createEventOption}
            onDeleteOption={deleteEventOption}
            onCreateLink={createEventLink}
            onDeleteLink={deleteEventLink}
            onSaveLink={updateLinkUrl}
          />
        )}

        {!loading && screen === "detail" && !selectedEvent && (
          <StatusMessage>Aucune production à afficher.</StatusMessage>
        )}
      </div>

      {createModalOpen && (
        <CreateEventModal
          selectedDateKey={selectedDateKey}
          onClose={() => setCreateModalOpen(false)}
          onCreate={async (input) => {
            await createEvent(input);
            setCreateModalOpen(false);
          }}
        />
      )}

      {deleteDialogOpen && selectedEvent && (
        <DeleteEventDialog
          event={selectedEvent}
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={deleteCurrentEvent}
        />
      )}
    </main>
  );
}

function AppHeader({
  screen,
  setScreen,
  yearLabel,
  goToday,
  createMenuOpen,
  setCreateMenuOpen,
  onCreateEvent,
  canDeleteEvent,
  onDeleteEvent,
}: {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  yearLabel: string;
  goToday: () => void;
  createMenuOpen: boolean;
  setCreateMenuOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  onCreateEvent: () => void;
  canDeleteEvent: boolean;
  onDeleteEvent: () => void;
}) {
  return (
    <header className="relative mb-5 flex items-center justify-between gap-2 px-1 py-1">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button className="flex items-center gap-3 text-left" onClick={() => setScreen("calendar")} aria-label="Accueil calendrier">
          <img src="/brand/mon-studio-tv-icon.png" alt="Mon Studio TV" className="h-11 w-auto sm:hidden" />
          <img src="/brand/mon-studio-tv-horizontal.png" alt="Mon Studio TV" className="hidden h-10 w-auto sm:block lg:h-11" />
        </button>
        {screen === "calendar" && (
          <button className="rounded-full border border-stone-200 bg-white px-2.5 py-1.5 text-base font-semibold text-stone-700 sm:px-3">
            {yearLabel}
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {screen === "calendar" && (
          <button
            onClick={goToday}
            className="rounded-full border border-stone-200 bg-white px-2.5 py-2 text-base font-semibold text-[#bb2720] transition hover:bg-[#bb2720]/[0.05] sm:px-3"
          >
            Aujourd'hui
          </button>
        )}
        <HeaderIcon label="Rechercher" icon={Search} />
        <button
          onClick={() => setCreateMenuOpen((current) => !current)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#bb2720] text-base font-semibold leading-none text-white transition hover:bg-[#a7211b]"
          aria-label="Créer"
        >
          +
        </button>
      </div>
      {createMenuOpen && <CreateMenu onCreateEvent={onCreateEvent} canDeleteEvent={canDeleteEvent} onDeleteEvent={onDeleteEvent} />}
    </header>
  );
}

function CreateMenu({
  onCreateEvent,
  canDeleteEvent,
  onDeleteEvent,
}: {
  onCreateEvent: () => void;
  canDeleteEvent: boolean;
  onDeleteEvent: () => void;
}) {
  return (
    <div className="absolute right-1 top-14 z-40 w-56 rounded-2xl border border-stone-200 bg-white/95 p-1.5 backdrop-blur-xl">
      <button
        disabled
        className="flex w-full cursor-not-allowed items-center justify-between rounded-xl px-4 py-3 text-left text-base font-medium text-stone-400"
      >
        <span>Importer un devis</span>
        <span className="text-base font-medium text-stone-300">Bientôt</span>
      </button>
      <button
        onClick={onCreateEvent}
        className="block w-full rounded-xl px-4 py-3 text-left text-base font-medium text-stone-700 transition hover:bg-[#bb2720]/[0.05] hover:text-stone-950"
      >
        Créer un événement
      </button>
      {canDeleteEvent && (
        <button
          onClick={onDeleteEvent}
          className="block w-full rounded-xl px-4 py-3 text-left text-base font-medium text-[#bb2720] transition hover:bg-[#bb2720]/[0.05]"
        >
          Supprimer l'événement
        </button>
      )}
    </div>
  );
}

function CalendarDashboard({
  events,
  onOpen,
  visibleMonth,
  selectedDateKey,
  setSelectedDateKey,
  changeMonth,
}: {
  events: ProductionEvent[];
  onOpen: (id: string) => void;
  visibleMonth: Date;
  selectedDateKey: string;
  setSelectedDateKey: (dateKey: string) => void;
  changeMonth: (delta: number) => void;
}) {
  const weekdays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const monthTitle = monthNames[month];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingEmptyDays = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalCells = Math.ceil((leadingEmptyDays + daysInMonth) / 7) * 7;
  const trailingEmptyDays = totalCells - leadingEmptyDays - daysInMonth;
  const todayKey = formatDateKey(new Date());
  const calendarDays = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    return {
      day,
      events: events.filter((event) => event.date === dateKey),
      dateKey,
    };
  });
  const selectedDay = calendarDays.find((day) => day.dateKey === selectedDateKey);
  const selectedEvents = [...(selectedDay?.events ?? [])].sort((a, b) => eventSortValue(a) - eventSortValue(b));

  useEffect(() => {
    const [selectedYear, selectedMonth] = selectedDateKey.split("-").map(Number);
    if (selectedYear === year && selectedMonth === month + 1) {
      return;
    }

    const firstEventInMonth = calendarDays.find((day) => day.events.length > 0);
    setSelectedDateKey(firstEventInMonth?.dateKey ?? `${year}-${String(month + 1).padStart(2, "0")}-01`);
  }, [calendarDays, month, selectedDateKey, setSelectedDateKey, year]);

  return (
    <section className="flex flex-1 flex-col gap-4">
      <div className="flex items-end justify-between px-1 pt-1">
        <h1 className="text-4xl font-semibold leading-none text-stone-950 sm:text-6xl">{monthTitle}</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className={calendarArrowClassName} aria-label="Mois précédent">
            ←
          </button>
          <button onClick={() => changeMonth(1)} className={calendarArrowClassName} aria-label="Mois suivant">
            →
          </button>
        </div>
      </div>
      <Card className="premium-surface overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b border-stone-200 bg-white/50">
          {weekdays.map((weekday) => (
            <div key={weekday} className="px-1 py-3 text-center text-base font-medium uppercase tracking-[0.12em] text-stone-400">
              <span className="lg:hidden">{weekday.slice(0, 1)}</span>
              <span className="hidden lg:inline">{weekday}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: leadingEmptyDays }).map((_, index) => (
            <div key={`empty-${index}`} className="h-[56px] border-b border-r border-stone-200/70 bg-white/20 lg:h-[112px]" />
          ))}
          {calendarDays.map(({ day, events: dayEvents, dateKey }, index) => {
            const position = leadingEmptyDays + index;
            const isLastColumn = position % 7 === 6;
            const isLastRow = position >= totalCells - 7;
            const isCurrentDay = dateKey === todayKey;
            const isSelected = dateKey === selectedDateKey;

            return (
              <button
                key={dateKey}
                onClick={() => setSelectedDateKey(dateKey)}
                className={cn(
                  "flex h-[56px] flex-col items-center justify-start gap-1 bg-white/55 px-1 py-2 transition hover:bg-white lg:h-[112px] lg:items-start lg:p-4",
                  !isLastColumn && "border-r border-stone-200/70",
                  !isLastRow && "border-b border-stone-200/70",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-base font-medium text-stone-500 lg:h-9 lg:w-9",
                    isSelected && "bg-[#bb2720] text-white",
                    !isSelected && isCurrentDay && "text-[#bb2720]",
                  )}
                >
                  {day}
                </span>
                {dayEvents.length > 0 && (
                  <span className="flex max-w-full gap-0.5 overflow-hidden lg:mt-2 lg:gap-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span key={event.id} className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#bb2720] lg:h-2 lg:w-2" />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
          {Array.from({ length: trailingEmptyDays }).map((_, index) => (
            <div key={`trailing-${index}`} className="h-[56px] border-l border-stone-200/70 bg-white/20 lg:h-[112px]" />
          ))}
        </div>
      </Card>
      <SelectedDayEvents events={selectedEvents} onOpen={onOpen} />
    </section>
  );
}

function SelectedDayEvents({
  events,
  onOpen,
}: {
  events: ProductionEvent[];
  onOpen: (id: string) => void;
}) {
  if (events.length === 0) return null;

  return (
    <section className="space-y-1.5 lg:space-y-2">
      {events.map((event) => (
        <button
          key={event.id}
          onClick={() => onOpen(event.id)}
          className="grid min-h-20 w-full grid-cols-[3px_1fr_auto] items-center gap-4 rounded-xl bg-white/70 px-4 py-4 text-left transition hover:bg-white lg:gap-5 lg:px-5"
        >
          <span className="h-full min-h-14 rounded-full bg-[#bb2720]" />
          <span className="min-w-0">
            <span className="block text-base font-semibold leading-snug text-stone-950">{event.clientName}</span>
            <span className="block truncate text-base text-stone-500">{event.eventName}</span>
          </span>
          <span className="pl-2 text-right text-base font-medium text-stone-500">
            {formatTime(event.startTime)} → {formatTime(event.endTime)}
          </span>
        </button>
      ))}
    </section>
  );
}

function ProductionDetail({
  event,
  hasPrevious,
  hasNext,
  goPrevious,
  goNext,
  onToggleOption,
  onToggleTask,
  onCreateOption,
  onDeleteOption,
  onCreateLink,
  onDeleteLink,
  onSaveLink,
}: {
  event: ProductionEvent;
  hasPrevious: boolean;
  hasNext: boolean;
  goPrevious: () => void;
  goNext: () => void;
  onToggleOption: (option: EventOption) => Promise<void>;
  onToggleTask: (task: TaskItem) => Promise<void>;
  onCreateOption: (eventId: string, label: string) => Promise<EventOption>;
  onDeleteOption: (option: EventOption) => Promise<void>;
  onCreateLink: (eventId: string, input: { label: string; url: string }) => Promise<EventLink>;
  onDeleteLink: (link: EventLink) => Promise<void>;
  onSaveLink: (link: EventLink, url: string) => Promise<EventLink>;
}) {
  const [contextSelection, setContextSelection] = useState<ContextSelection>(null);
  const [addForm, setAddForm] = useState<ItemKind | null>(null);
  const [optionName, setOptionName] = useState("");
  const [linkName, setLinkName] = useState("");
  const [manageError, setManageError] = useState<string | null>(null);
  const [submittingAdd, setSubmittingAdd] = useState(false);

  useEffect(() => {
    setContextSelection((current) => {
      if (!current) return null;
      if (current?.type === "option" && event.options.some((option) => option.id === current.optionId)) return current;
      if (current?.type === "link" && event.links.some((link) => link.id === current.linkId)) return current;
      return null;
    });
  }, [event.id, event.links, event.options]);

  function selectOption(option: EventOption) {
    setContextSelection((current) =>
      current?.type === "option" && current.optionId === option.id ? null : { type: "option", optionId: option.id },
    );
  }

  function selectLink(link: EventLink) {
    let selectedSameLink = false;
    setContextSelection((current) => {
      selectedSameLink = current?.type === "link" && current.linkId === link.id;
      return selectedSameLink ? null : { type: "link", linkId: link.id, copied: false };
    });

    if (selectedSameLink) return;

    const linkUrl = link.url?.trim();
    if (!linkUrl) return;

    const copyPromise = navigator.clipboard?.writeText(linkUrl);
    if (copyPromise) {
      void copyPromise.then(
        () => setContextSelection((current) => (current?.type === "link" && current.linkId === link.id ? { ...current, copied: true } : current)),
        () => setContextSelection((current) => (current?.type === "link" && current.linkId === link.id ? { ...current, copied: false } : current)),
      );
    }
  }

  async function addOption(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setSubmittingAdd(true);
    setManageError(null);

    try {
      const option = await onCreateOption(event.id, optionName);
      setOptionName("");
      setAddForm(null);
      setContextSelection({ type: "option", optionId: option.id });
    } catch (createError) {
      setManageError(createError instanceof Error ? createError.message : "Impossible d'ajouter l'option.");
    } finally {
      setSubmittingAdd(false);
    }
  }

  async function addLink(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setSubmittingAdd(true);
    setManageError(null);

    try {
      const link = await onCreateLink(event.id, { label: linkName, url: "" });
      setLinkName("");
      setAddForm(null);
      setContextSelection({ type: "link", linkId: link.id, copied: false });
    } catch (createError) {
      setManageError(createError instanceof Error ? createError.message : "Impossible d'ajouter le lien.");
    } finally {
      setSubmittingAdd(false);
    }
  }

  return (
    <section className="flex flex-1 flex-col gap-5">
      <Card className="premium-surface p-5 sm:p-8">
        <div className="mb-8 flex items-center justify-between">
          <StatusBadge status={event.status} large />
          <div className="flex items-center gap-2">
            <button onClick={goPrevious} disabled={!hasPrevious} className={calendarArrowClassName} aria-label="Événement précédent">
              ←
            </button>
            <button onClick={goNext} disabled={!hasNext} className={calendarArrowClassName} aria-label="Événement suivant">
              →
            </button>
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight text-stone-950 sm:text-6xl">{event.clientName}</h1>
          <p className="mt-2 text-base font-medium text-stone-500">{event.eventName}</p>
        </div>
        <ProductionTimeline event={event} />
      </Card>

      <Card className="premium-surface p-3 sm:p-5">
        <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:items-start">
          <div className="min-w-0">
            <SectionHeader
              label="Options"
              tone="option"
              addLabel="Ajouter une option"
              onAdd={() => setAddForm((current) => (current === "option" ? null : "option"))}
            />
            {addForm === "option" && (
              <InlineAddForm onSubmit={addOption} eventId={event.id}>
                <input
                  required
                  value={optionName}
                  onChange={(inputEvent) => setOptionName(inputEvent.target.value)}
                  placeholder="Nom de l'option"
                  className={inlineAddInputClassName}
                />
                <InlineAddButton tone="option" disabled={submittingAdd}>
                  Ajouter
                </InlineAddButton>
              </InlineAddForm>
            )}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {event.options.map((option) => {
                const Icon = getOptionIcon(option.label);
                const optionTone = getOptionTone(option.status);
                const isSelectedOption = contextSelection?.type === "option" && contextSelection.optionId === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => selectOption(option)}
                    className={cn(
                      "flex min-h-16 items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-left transition sm:gap-2 sm:px-3",
                      optionTone.surface,
                      optionTone.border,
                      optionTone.hover,
                      isSelectedOption && "border-emerald-700 ring-2 ring-emerald-700/20",
                    )}
                  >
                    <Icon className={cn("h-5 w-5 shrink-0", optionTone.icon)} />
                    <span className={cn("truncate text-base font-semibold", optionTone.text)}>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0">
            <SectionHeader
              label="Liens"
              align="right"
              tone="link"
              addLabel="Ajouter un lien"
              onAdd={() => setAddForm((current) => (current === "link" ? null : "link"))}
            />
            {addForm === "link" && (
              <InlineAddForm onSubmit={addLink} eventId={event.id} align="right">
                <input
                  required
                  value={linkName}
                  onChange={(inputEvent) => setLinkName(inputEvent.target.value)}
                  placeholder="Nom du lien"
                  className={inlineAddInputClassName}
                />
                <InlineAddButton tone="link" disabled={submittingAdd}>
                  Ajouter
                </InlineAddButton>
              </InlineAddForm>
            )}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {event.links.map((link) => {
                const Icon = getLinkIcon(link.label);
                const isSelectedLink = contextSelection?.type === "link" && contextSelection.linkId === link.id;
                const linkTone = getLinkTone(getLinkState(link));
                return (
                  <button
                    key={link.id}
                    onClick={() => selectLink(link)}
                    className={cn(
                      "flex min-h-16 items-center justify-between gap-1.5 rounded-xl border-2 px-2 py-3 text-left transition sm:gap-2 sm:px-3",
                      linkTone.surface,
                      linkTone.border,
                      linkTone.hover,
                      isSelectedLink && "border-sky-700 ring-2 ring-sky-700/20",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                      <Icon className={cn("h-5 w-5 shrink-0", linkTone.icon)} />
                      <span className={cn("truncate text-base font-semibold", linkTone.text)}>{link.label}</span>
                    </span>
                    <ExternalLink className="hidden h-4 w-4 shrink-0 text-sky-400 sm:block" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {manageError && <div className="mt-3 text-base font-medium text-rose-700">{manageError}</div>}
      </Card>

      <ContextDetailBlock
        event={event}
        selection={contextSelection}
        onClearSelection={() => setContextSelection(null)}
        onToggleOption={onToggleOption}
        onDeleteOption={onDeleteOption}
        onDeleteLink={onDeleteLink}
        onSaveLink={onSaveLink}
      />

      <Panel title="To do list">
        <div className="grid gap-3 md:grid-cols-2">
          {event.tasks.map((task) => (
            <PreparationCard key={task.id} task={task} onToggle={() => void onToggleTask(task)} />
          ))}
        </div>
      </Panel>
    </section>
  );
}

function getOptionIcon(label: string) {
  return getAutomaticIcon(label, Check);
}

function getLinkIcon(label: string) {
  return getAutomaticIcon(label, ExternalLink);
}

function getAutomaticIcon(label: string, fallbackIcon: LucideIcon) {
  const normalizedLabel = normalizeLabel(label);
  return iconKeywordRules.find((rule) => rule.keywords.some((keyword) => normalizedLabel.includes(normalizeLabel(keyword))))?.icon ?? fallbackIcon;
}

function getLinkState(link: EventLink): LinkStatus {
  return link.status === "available" && link.url?.trim() ? "available" : "missing";
}

function getOptionTone(state: CompletionStatus) {
  return state === "completed"
    ? {
        surface: "bg-emerald-200/90",
        border: "border-emerald-400/70",
        hover: "hover:bg-emerald-200",
        icon: "text-emerald-900",
        text: "text-emerald-950",
      }
    : {
        surface: "bg-emerald-50/80",
        border: "border-emerald-100",
        hover: "hover:bg-emerald-100/55",
        icon: "text-emerald-600",
        text: "text-stone-700",
      };
}

function getLinkTone(state: LinkStatus) {
  return state === "available"
    ? {
        surface: "bg-sky-200/90",
        border: "border-sky-400/70",
        hover: "hover:bg-sky-200",
        icon: "text-sky-900",
        text: "text-sky-950",
      }
    : {
        surface: "bg-sky-50/80",
        border: "border-sky-100",
        hover: "hover:bg-sky-100/55",
        icon: "text-sky-600",
        text: "text-stone-700",
      };
}

function ProductionTimeline({ event }: { event: ProductionEvent }) {
  const moments = [
    { label: "Arrivée client", time: formatTime(event.clientArrivalTime) },
    { label: "Début live", time: formatTime(event.startTime) },
    { label: "Fin live", time: formatTime(event.endTime) },
    { label: "Fin journée", time: formatTime(event.endOfDayTime) },
  ];

  return (
    <div className="mt-8">
      <div className="relative flex w-full justify-between">
        <div className="absolute left-2 right-2 top-2 h-px bg-stone-200" />
        {moments.map((moment, index) => (
          <div key={moment.label} className={cn("relative min-w-0 flex-1", index === 0 ? "text-left" : index === moments.length - 1 ? "text-right" : "text-center")}>
            <span
              className={cn(
                "block h-4 w-4 rounded-full border-2 border-stone-300 bg-white",
                index === 0 ? "mr-auto" : index === moments.length - 1 ? "ml-auto" : "mx-auto",
              )}
            />
            <div className="mt-3 truncate font-semibold text-stone-950">{moment.label}</div>
            <div className="mt-1 text-stone-500">{moment.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContextDetailBlock({
  event,
  selection,
  onClearSelection,
  onToggleOption,
  onDeleteOption,
  onDeleteLink,
  onSaveLink,
}: {
  event: ProductionEvent;
  selection: ContextSelection;
  onClearSelection: () => void;
  onToggleOption: (option: EventOption) => Promise<void>;
  onDeleteOption: (option: EventOption) => Promise<void>;
  onDeleteLink: (link: EventLink) => Promise<void>;
  onSaveLink: (link: EventLink, url: string) => Promise<EventLink>;
}) {
  const selectedOption = selection?.type === "option" ? event.options.find((option) => option.id === selection.optionId) ?? null : null;
  const selectedLink = selection?.type === "link" ? event.links.find((link) => link.id === selection.linkId) ?? null : null;
  const selectedOptionId = selectedOption?.id ?? "";
  const selectedLinkId = selectedLink?.id ?? "";
  const selectedLinkUrl = selectedLink?.url ?? "";
  const [linkInput, setLinkInput] = useState(selectedLinkUrl);
  const [savingLink, setSavingLink] = useState(false);
  const [linkSaveError, setLinkSaveError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const hasUnsavedLinkChanges = linkInput.trim() !== selectedLinkUrl.trim();
  const hasSavedLinkUrl = selectedLinkUrl.trim().length > 0;
  const linkSaveLabel = savingLink ? "Enregistrement..." : hasSavedLinkUrl && !hasUnsavedLinkChanges ? "Enregistré" : "Enregistrer";

  useEffect(() => {
    setLinkInput(selectedLinkUrl);
    setSavingLink(false);
    setLinkSaveError(null);
    setLinkCopied(false);
  }, [selectedLinkId, selectedLinkUrl]);

  useEffect(() => {
    if (!linkCopied) return;

    const resetTimer = window.setTimeout(() => {
      setLinkCopied(false);
    }, 2500);

    return () => window.clearTimeout(resetTimer);
  }, [linkCopied]);

  useEffect(() => {
    setConfirmingDelete(false);
    setDeletingItem(false);
    setDeleteError(null);
  }, [selectedLinkId, selectedOptionId]);

  async function saveSelectedLink() {
    if (!selectedLink) return;

    setSavingLink(true);
    setLinkSaveError(null);

    try {
      const updatedLink = await onSaveLink(selectedLink, linkInput);
      setLinkInput(updatedLink.url ?? "");
    } catch (saveError) {
      setLinkSaveError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer le lien.");
    } finally {
      setSavingLink(false);
    }
  }

  async function copySelectedLink() {
    const linkUrl = selectedLink?.url?.trim();
    if (!linkUrl) return;

    try {
      await navigator.clipboard?.writeText(linkUrl);
      setLinkCopied(true);
    } catch {
      setLinkCopied(false);
    }
  }

  async function deleteSelectedItem() {
    setDeletingItem(true);
    setDeleteError(null);

    try {
      if (selectedOption) {
        await onDeleteOption(selectedOption);
      } else if (selectedLink) {
        await onDeleteLink(selectedLink);
      }

      setConfirmingDelete(false);
      onClearSelection();
    } catch (removeError) {
      setDeleteError(removeError instanceof Error ? removeError.message : "Impossible de supprimer cet élément.");
      setDeletingItem(false);
    }
  }

  if (!selection) return null;

  if (selection.type === "link" && selectedLink) {
    const linkState = getLinkState(selectedLink);
    const linkTone = getLinkTone(linkState);

    return (
      <Card className="border-sky-200 bg-white p-4 sm:p-5">
        <div className="w-full">
          <div className="flex w-full items-start justify-between gap-4">
            <div className={cn("flex min-w-0 items-center gap-2 text-base font-semibold", linkTone.text)}>
              <span className="truncate">{selectedLink.label}</span>
              <button
                onClick={() => void copySelectedLink()}
                disabled={linkState !== "available"}
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-35",
                  linkCopied ? "bg-sky-200 text-sky-900" : "bg-sky-50/60 text-sky-300 hover:bg-sky-100 hover:text-sky-600",
                )}
                aria-label="Copier le lien"
                title={linkCopied ? "Lien copié" : "Copier le lien"}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <DetailDeleteAction
              confirmLabel="Supprimer ce lien ?"
              confirming={confirmingDelete}
              deleting={deletingItem}
              error={deleteError}
              onAskConfirm={() => setConfirmingDelete(true)}
              onCancel={() => setConfirmingDelete(false)}
              onConfirm={() => void deleteSelectedItem()}
            />
          </div>
          <div className="mt-3 flex w-full items-stretch gap-2">
            <input
              value={linkInput}
              onChange={(event) => {
                setLinkInput(event.target.value);
              }}
              placeholder="https://..."
              className={cn(
                "h-12 min-w-0 w-full flex-1 rounded-2xl border border-sky-200 bg-white px-4 text-base font-medium text-stone-950 outline-none transition placeholder:text-stone-300 focus:border-sky-400",
              )}
            />
            <button
              onClick={() => void saveSelectedLink()}
              disabled={savingLink}
              className={cn(
                "h-12 shrink-0 rounded-2xl border px-4 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-60",
                linkTone.surface,
                linkTone.border,
                linkTone.text,
              )}
            >
              {linkSaveLabel}
            </button>
          </div>
          {linkSaveError && (
            <div className="mt-2 text-base font-medium text-rose-700">
              {linkSaveError}
            </div>
          )}
        </div>
      </Card>
    );
  }

  if (!selectedOption) return null;

  const details = splitDetails(selectedOption.details);
  const optionTone = getOptionTone(selectedOption.status);

  return (
    <Card className="border-emerald-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex min-w-0 items-center gap-2 text-base font-semibold", optionTone.text)}>
          <span className="truncate">{selectedOption.label}</span>
          <button
            onClick={() => void onToggleOption(selectedOption)}
            className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition", optionTone.surface, optionTone.icon)}
            aria-label={selectedOption.status === "completed" ? "Marquer incomplet" : "Marquer terminé"}
            title={selectedOption.status === "completed" ? "Terminé" : "À faire"}
          >
            {selectedOption.status === "completed" ? <Check className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
          </button>
        </div>
        <DetailDeleteAction
          confirmLabel="Supprimer cette option ?"
          confirming={confirmingDelete}
          deleting={deletingItem}
          error={deleteError}
          onAskConfirm={() => setConfirmingDelete(true)}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => void deleteSelectedItem()}
        />
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {details.map((detail) => (
          <span
            key={detail}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-base font-semibold",
              optionTone.surface,
              optionTone.border,
              optionTone.text,
            )}
          >
            {detail}
          </span>
        ))}
      </div>
    </Card>
  );
}

function splitDetails(details: string | null) {
  const values = (details ?? "")
    .split(/\n|,/)
    .map((detail) => detail.trim())
    .filter(Boolean);

  return values.length > 0 ? values : ["Information à compléter"];
}

function PreparationCard({ task, onToggle }: { task: TaskItem; onToggle: () => void }) {
  const state: State = task.status === "completed" ? "ok" : "waiting";

  return (
    <div className={cn("min-h-16 rounded-xl border-2 p-4", stateStyles[state].panel)}>
      <div className="flex items-start justify-between gap-4">
        <div className="truncate text-base font-semibold text-stone-950">{task.title}</div>
        <button onClick={onToggle} className="shrink-0" aria-label={task.status === "completed" ? "Marquer incomplet" : "Marquer terminé"}>
          <StateIcon state={state} />
        </button>
      </div>
      <div className="mt-3 flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-base text-stone-600">{task.subtitle}</div>
        <div className="flex shrink-0 flex-nowrap justify-end gap-1.5">
          {task.assignees.map((assignee) => (
            <span key={assignee.id} className="whitespace-nowrap rounded-full border border-stone-200 bg-white px-2.5 py-1 text-base font-medium text-stone-700">
              {assignee.firstName}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function CreateEventModal({
  selectedDateKey,
  onClose,
  onCreate,
}: {
  selectedDateKey: string;
  onClose: () => void;
  onCreate: (input: CreateEventInput) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateEventInput>({
    clientName: "",
    eventName: "",
    date: selectedDateKey,
    clientArrivalTime: "08:30",
    startTime: "10:00",
    endTime: "11:30",
    endOfDayTime: "13:00",
    status: "Brouillon",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await onCreate(form);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Impossible de créer l'événement.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateField<Key extends keyof CreateEventInput>(key: Key, value: CreateEventInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-stone-950/10 p-3 sm:items-center sm:justify-center sm:p-6">
      <form onSubmit={handleSubmit} className="w-full rounded-3xl border border-stone-200 bg-white p-5 sm:max-w-xl sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-stone-950">Créer un événement</h2>
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 px-3 py-1.5 text-base font-semibold text-stone-600">
            Fermer
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client">
            <input required value={form.clientName} onChange={(event) => updateField("clientName", event.target.value)} className={formInputClassName} />
          </Field>
          <Field label="Événement">
            <input required value={form.eventName} onChange={(event) => updateField("eventName", event.target.value)} className={formInputClassName} />
          </Field>
          <Field label="Date">
            <input required type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} className={formInputClassName} />
          </Field>
          <Field label="Statut">
            <select value={form.status} onChange={(event) => updateField("status", event.target.value as EventStatus)} className={formInputClassName}>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Arrivée client">
            <input type="time" value={form.clientArrivalTime} onChange={(event) => updateField("clientArrivalTime", event.target.value)} className={formInputClassName} />
          </Field>
          <Field label="Début">
            <input required type="time" value={form.startTime} onChange={(event) => updateField("startTime", event.target.value)} className={formInputClassName} />
          </Field>
          <Field label="Fin">
            <input required type="time" value={form.endTime} onChange={(event) => updateField("endTime", event.target.value)} className={formInputClassName} />
          </Field>
          <Field label="Fin journée">
            <input type="time" value={form.endOfDayTime} onChange={(event) => updateField("endOfDayTime", event.target.value)} className={formInputClassName} />
          </Field>
        </div>

        {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-base font-semibold text-stone-600">
            Annuler
          </button>
          <button disabled={submitting} className="rounded-full bg-[#bb2720] px-4 py-2 text-base font-semibold text-white disabled:bg-stone-300">
            {submitting ? "Création..." : "Créer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DeleteEventDialog({
  event,
  onClose,
  onConfirm,
}: {
  event: ProductionEvent;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setDeleting(true);
    setError(null);

    try {
      await onConfirm();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Impossible de supprimer l'événement.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-stone-950/10 p-3 sm:items-center sm:justify-center sm:p-6">
      <div className="w-full rounded-3xl border border-stone-200 bg-white p-5 sm:max-w-md sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-stone-950">Supprimer cet événement ?</h2>
          <p className="mt-2 text-base font-medium text-stone-500">Cette action est définitive.</p>
          <p className="mt-4 truncate text-base font-semibold text-stone-950">{event.clientName}</p>
          <p className="mt-1 truncate text-base text-stone-500">{event.eventName}</p>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-full border border-stone-200 bg-white px-4 py-2 text-base font-semibold text-stone-600 disabled:text-stone-300"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={deleting}
            className="rounded-full bg-[#bb2720] px-4 py-2 text-base font-semibold text-white disabled:bg-stone-300"
          >
            {deleting ? "Suppression..." : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

const formInputClassName =
  "h-11 w-full rounded-2xl border border-stone-200 bg-white px-3 text-base font-medium text-stone-950 outline-none transition focus:border-[#bb2720]/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-base font-semibold text-stone-500">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function StateIcon({ state }: { state: State }) {
  if (state === "ok") {
    return (
      <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", stateStyles[state].icon)}>
        <Check className="h-4 w-4" />
      </span>
    );
  }

  return (
    <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", stateStyles[state].icon)}>
      <Clock3 className="h-4 w-4" />
    </span>
  );
}

function StatusBadge({ status, large = false }: { status: EventStatus; large?: boolean }) {
  return (
    <span className={cn("inline-flex items-center rounded-full text-base font-bold ring-1", large ? "px-3 py-1.5" : "px-2.5 py-1 leading-tight", statusStyles[status])}>
      {large && status === "Prêt" ? "PRÊT" : status}
    </span>
  );
}

function HeaderIcon({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
  return (
    <button className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600" title={label}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

const inlineAddInputClassName =
  "h-9 min-w-0 rounded-xl border border-stone-200 bg-white px-3 text-base font-medium text-stone-950 outline-none transition placeholder:text-stone-300 focus:border-[#bb2720]/40";

function SectionHeader({
  label,
  align = "left",
  tone,
  addLabel,
  onAdd,
}: {
  label: string;
  align?: "left" | "right";
  tone: ItemKind;
  addLabel: string;
  onAdd: () => void;
}) {
  const addTone =
    tone === "option"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100"
      : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100";

  return (
    <div className={cn("mb-3 flex items-center gap-2", align === "right" ? "justify-end" : "justify-start")}>
      <h2 className={cn("text-base font-semibold uppercase tracking-[0.16em] text-stone-500", align === "right" && "text-right")}>{label}</h2>
      <button
        onClick={onAdd}
        className={cn("flex h-6 w-6 items-center justify-center rounded-full border text-base font-semibold leading-none transition", addTone)}
        aria-label={addLabel}
        title={addLabel}
      >
        +
      </button>
    </div>
  );
}

function InlineAddButton({
  tone,
  disabled,
  children,
}: {
  tone: ItemKind;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const toneClassName =
    tone === "option"
      ? "bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300"
      : "bg-sky-600 hover:bg-sky-700 disabled:bg-stone-300";

  return (
    <button disabled={disabled} className={cn("h-9 shrink-0 rounded-xl px-3 text-base font-semibold text-white transition", toneClassName)}>
      {children}
    </button>
  );
}

function InlineAddForm({
  children,
  onSubmit,
  eventId,
  align = "left",
}: {
  children: React.ReactNode;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  eventId: string;
  align?: "left" | "right";
}) {
  return (
    <form
      onSubmit={onSubmit}
      data-event-id={eventId}
      className={cn(
        "mb-2 flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-2 sm:flex-row",
        align === "right" && "sm:justify-end",
      )}
    >
      {children}
    </form>
  );
}

function DetailDeleteAction({
  confirmLabel,
  confirming,
  deleting,
  error,
  onAskConfirm,
  onCancel,
  onConfirm,
}: {
  confirmLabel: string;
  confirming: boolean;
  deleting: boolean;
  error: string | null;
  onAskConfirm: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {error && <span className="text-base font-medium text-rose-700">{error}</span>}
      {!confirming ? (
        <button
          onClick={onAskConfirm}
          className="rounded-full border border-stone-200 bg-transparent px-3 py-1.5 text-base font-semibold text-stone-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
        >
          Supprimer
        </button>
      ) : (
        <DeleteConfirmBubble label={confirmLabel} deleting={deleting} onCancel={onCancel} onConfirm={onConfirm} />
      )}
    </div>
  );
}

function DeleteConfirmBubble({
  label,
  deleting,
  onCancel,
  onConfirm,
}: {
  label: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex max-w-full flex-wrap items-center justify-end gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2">
      <div className="text-base font-semibold text-stone-700">{label}</div>
      <div className="flex justify-end gap-1.5">
        <button onClick={onCancel} disabled={deleting} className="rounded-full border border-stone-200 px-3 py-1.5 text-base font-semibold text-stone-600 disabled:text-stone-300">
          Annuler
        </button>
        <button onClick={onConfirm} disabled={deleting} className="rounded-full bg-[#bb2720] px-3 py-1.5 text-base font-semibold text-white disabled:bg-stone-300">
          Supprimer
        </button>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border-2 border-stone-200 bg-white p-5 sm:p-6">
      <h2 className="mb-5 text-base font-semibold uppercase tracking-[0.16em] text-stone-500">{title}</h2>
      {children}
    </section>
  );
}

function StatusMessage({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "error" }) {
  return (
    <div
      className={cn(
        "mb-4 rounded-2xl border bg-white px-4 py-3 text-base font-medium",
        tone === "error" ? "border-rose-200 text-rose-700" : "border-stone-200 text-stone-500",
      )}
    >
      <span className="inline-flex items-center gap-2">
        {tone === "error" && <AlertCircle className="h-4 w-4" />}
        {children}
      </span>
    </div>
  );
}
