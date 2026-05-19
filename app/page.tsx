"use client";

import {
  AlertCircle,
  Bell,
  Brush,
  Camera,
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CirclePlay,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  File,
  FileStack,
  FileText,
  FileSpreadsheet,
  History,
  Import,
  KeyRound,
  Link,
  MonitorPlay,
  Palette,
  Pencil,
  Presentation,
  Radio,
  Scissors,
  Search,
  ShieldCheck,
  Timer,
  Trash2,
  Wifi,
  Webcam,
  X,
  type LucideIcon,
} from "lucide-react";
import { Keyboard } from "@capacitor/keyboard";
import { Network } from "@capacitor/network";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Card } from "@/components/ui/card";
import type { Session } from "@supabase/supabase-js";
import {
  publicHolidays,
  schoolHolidaysZoneC,
  type CalendarMarker,
} from "@/lib/calendar-markers";
import { cn } from "@/lib/utils";
import {
  supabase,
  type CompletionStatus,
  type Database,
  type EventStatus,
  type LinkStatus,
} from "@/lib/supabase";

type Screen = "calendar" | "detail";
type ItemKind = "option" | "link" | "document";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventOptionRow = Database["public"]["Tables"]["event_options"]["Row"];
type EventOptionItemRow = Database["public"]["Tables"]["event_option_items"]["Row"];
type EventLinkRow = Database["public"]["Tables"]["event_links"]["Row"];
type EventLinkEntryRow = Database["public"]["Tables"]["event_link_entries"]["Row"];
type EventDocumentRow = Database["public"]["Tables"]["event_documents"]["Row"];
type EventDocumentGroupRow = Database["public"]["Tables"]["event_document_groups"]["Row"];
type EventActivityLogRow = Database["public"]["Tables"]["event_activity_log"]["Row"];
type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ExternalCalendarRow = Database["public"]["Tables"]["external_calendars"]["Row"];
type ExternalCalendarEventRow = Database["public"]["Tables"]["external_calendar_events"]["Row"];

type UserRole = "admin" | "team";
type ExternalCalendarVisibility = "admin_only" | "team" | "private";
type ExternalCalendarSyncProgress = {
  calendarId: string;
  synced: number;
  total: number;
};
type ExternalCalendarSyncResult = {
  synced: number;
  total: number;
};

const EXTERNAL_CALENDAR_UPSERT_BATCH_SIZE = 250;
const EXTERNAL_CALENDAR_FETCH_PAGE_SIZE = 1000;

type EventQueryRow = EventRow & {
  event_options: EventOptionRow[] | null;
  event_links: EventLinkRow[] | null;
  event_documents?: EventDocumentRow[] | null;
};

type ExternalCalendarEventQueryRow = ExternalCalendarEventRow & {
  external_calendars: ExternalCalendarRow | null;
};

type UserProfile = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  createdAt: string;
};

type AppPermissions = {
  canManageEvents: boolean;
  canManageOperational: boolean;
  canSoftDeleteEvents: boolean;
  canRestoreEvents: boolean;
  canPermanentDeleteEvents: boolean;
  canManageUsers: boolean;
};

type CreatorMetadata = {
  createdByProfileId: string | null;
  createdByRole: UserRole | null;
  createdByName: string | null;
};

type EventOption = {
  id: string;
  eventId: string;
  label: string;
  status: CompletionStatus;
  details: string | null;
  completedByProfileId: string | null;
  completedByLabel: string | null;
  completedByInitials: string | null;
  completedAt: string | null;
  createdAt: string;
  items: EventOptionItem[];
} & CreatorMetadata;

type EventOptionItem = {
  id: string;
  optionId: string;
  label: string;
  createdAt: string;
} & CreatorMetadata;

type EventLink = {
  id: string;
  eventId: string;
  label: string;
  url: string | null;
  streamKey: string | null;
  status: LinkStatus;
  createdAt: string;
  entries: EventLinkEntry[];
} & CreatorMetadata;

type EventLinkEntry = {
  id: string;
  linkId: string;
  url: string | null;
  streamKey: string | null;
  position: number;
  createdAt: string;
} & CreatorMetadata;

type LinkEntryDraft = {
  id: string | null;
  url: string;
  streamKey: string;
  legacyParentValue?: boolean;
} & Partial<CreatorMetadata>;

type EventTimeField = "clientArrivalTime" | "startTime" | "endTime" | "endOfDayTime";

type EventDocument = {
  id: string;
  eventId: string;
  groupId: string;
  fileName: string;
  filePath: string;
  fileType: string | null;
  fileSize: number | null;
  createdAt: string;
} & CreatorMetadata;

type EventDocumentGroup = {
  id: string;
  eventId: string;
  label: string;
  createdAt: string;
  files: EventDocument[];
} & CreatorMetadata;

type DocumentPreview = {
  file: EventDocument;
  url: string;
  kind: "pdf" | "image";
};

type ActivityValue = Record<string, unknown> | null;

type EventActivityLog = {
  id: string;
  eventId: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  description: string;
  previousValue: ActivityValue;
  newValue: ActivityValue;
  createdBy: string | null;
  createdAt: string;
};

type AppNotification = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  relatedEventId: string | null;
  readAt: string | null;
  createdAt: string;
};

type ExternalCalendar = {
  id: string;
  name: string;
  icsUrl: string;
  color: string | null;
  visibility: ExternalCalendarVisibility;
  createdByProfileId: string | null;
  createdByName: string | null;
  createdAt: string;
};

type ExternalCalendarEvent = {
  id: string;
  externalCalendarId: string;
  externalEventId: string;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  rawEvent: Record<string, unknown> | null;
  lastSyncedAt: string | null;
  calendarName: string;
  calendarColor: string | null;
  calendarVisibility: ExternalCalendarVisibility;
  calendarCreatedByProfileId: string | null;
};

type ProductionEvent = {
  id: string;
  clientName: string;
  eventName: string;
  date: string;
  clientArrivalTime: string | null;
  startTime: string | null;
  endTime: string | null;
  endOfDayTime: string | null;
  status: EventStatus;
  deletedAt: string | null;
  deletedBy: string | null;
  quoteReference: string | null;
  quoteVersion: string | null;
  sourceQuoteText: string | null;
  lastQuoteImportedAt: string | null;
  importedFrom: string | null;
  externalImportId: string | null;
  createdAt: string;
  updatedAt: string;
  options: EventOption[];
  links: EventLink[];
  documentGroups: EventDocumentGroup[];
};

type ContextSelection =
  | { type: "option"; optionId: string }
  | { type: "link"; linkId: string }
  | { type: "document"; groupId: string }
  | null;

type DeleteSelection =
  | { type: "option"; optionId: string }
  | { type: "link"; linkId: string }
  | { type: "document"; groupId: string };

type CreateEventInput = {
  clientName: string;
  eventName: string;
  date: string;
  clientArrivalTime: string;
  startTime: string;
  endTime: string;
  endOfDayTime: string;
  optionLabels?: string[];
  quoteReference?: string | null;
  quoteVersion?: string | null;
  sourceQuoteText?: string | null;
};

type QuoteExtractionResult = {
  clientName: string;
  eventName: string;
  date: string;
  clientArrivalTime: string;
  startTime: string;
  endTime: string;
  endOfDayTime: string;
  services: string[];
  quoteReference: string;
  quoteVersion: string;
  sourceQuoteText: string;
};

type QuoteImportResolution = {
  existingEvent: ProductionEvent;
  input: CreateEventInput;
  differences: QuoteImportDifference[];
};

type QuoteImportDifference = {
  label: string;
  previousValue: string;
  nextValue: string;
};

type NativeMstvIcsReviewEvent = {
  externalImportId: string;
  sourceTitle: string;
  clientName: string;
  eventName: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string | null;
  description: string | null;
  skipped: boolean;
  skipReason: string | null;
};

type PendingSyncStatus = "pending" | "syncing" | "synced" | "failed";

type PendingSyncAction = {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  status: PendingSyncStatus;
  retryCount: number;
  lastError: string | null;
};

type PendingActivityPayload = {
  eventId: string;
  actionType: string;
  entityType?: string | null;
  entityId?: string | null;
  description: string;
  previousValue?: ActivityValue;
  newValue?: ActivityValue;
};

type CachedAppData = {
  events: ProductionEvent[];
  externalCalendars: ExternalCalendar[];
  externalCalendarEvents: ExternalCalendarEvent[];
  cachedAt: string;
};

type CachedAuthSession = {
  session: Session;
  cachedAt: string;
};

type CachedProfileMeta = {
  cachedAt: string;
};

type CachedAuthState = {
  session: Session;
  profile: UserProfile;
  appData: CachedAppData | null;
};

type CompletedByOverrideValue = "rami" | "antoine" | "arthur" | "tony" | "gauthier" | "externe";

type CompletedByOverrideChoice = {
  value: CompletedByOverrideValue;
  label: string;
  initials: string;
};

const completedByOverrideChoices: CompletedByOverrideChoice[] = [
  { value: "rami", label: "Rami", initials: "RM" },
  { value: "antoine", label: "Antoine", initials: "AS" },
  { value: "arthur", label: "Arthur", initials: "AL" },
  { value: "tony", label: "Tony", initials: "TB" },
  { value: "gauthier", label: "Gauthier", initials: "GR" },
  { value: "externe", label: "Externe", initials: "EXT" },
];

const completedByLegacyInitialLabels: Record<string, string> = {
  AL: "Arthur",
  AS: "Antoine",
  EXT: "Externe",
  GG: "Guillaume",
  GR: "Gauthier",
  RM: "Rami",
  TB: "Tony",
};

const userRoleOptions: UserRole[] = ["admin", "team"];
const realtimeTableNames = [
  "events",
  "event_options",
  "event_option_items",
  "event_links",
  "event_link_entries",
  "event_document_groups",
  "event_documents",
  "event_activity_log",
  "profiles",
  "notifications",
  "team_members",
  "external_calendars",
  "external_calendar_events",
] as const;

const externalCalendarColorOptions = [
  {
    value: "rose",
    label: "Rouge",
    swatchClassName: "bg-[#ff3b30]",
    selectedClassName: "ring-[#ff3b30]/35",
  },
  {
    value: "orange",
    label: "Orange",
    swatchClassName: "bg-[#ff9500]",
    selectedClassName: "ring-[#ff9500]/35",
  },
  {
    value: "yellow",
    label: "Jaune",
    swatchClassName: "bg-[#ffcc00]",
    selectedClassName: "ring-[#ffcc00]/35",
  },
  {
    value: "emerald",
    label: "Vert",
    swatchClassName: "bg-[#34c759]",
    selectedClassName: "ring-[#34c759]/35",
  },
  {
    value: "sky",
    label: "Bleu",
    swatchClassName: "bg-[#007aff]",
    selectedClassName: "ring-[#007aff]/35",
  },
  {
    value: "indigo",
    label: "Violet",
    swatchClassName: "bg-[#af52de]",
    selectedClassName: "ring-[#af52de]/35",
  },
  {
    value: "brown",
    label: "Marron",
    swatchClassName: "bg-[#a2845e]",
    selectedClassName: "ring-[#a2845e]/35",
  },
  {
    value: "stone",
    label: "Gris",
    swatchClassName: "bg-[#8e8e93]",
    selectedClassName: "ring-[#8e8e93]/35",
  },
] as const;

type DuplicateEventRequest = {
  event: ProductionEvent;
  date: string;
};

const PAGE_GAP = 18;
const PAGE_TRANSITION_MS = 360;
const PAGE_TRANSITION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const PAGE_SWIPE_THRESHOLD_RATIO = 0.18;
const PAGE_SWIPE_THRESHOLD_MIN = 58;
const PAGE_SWIPE_THRESHOLD_MAX = 124;

function getSwipePageStep(viewportWidth: number) {
  return viewportWidth + PAGE_GAP;
}

function getSwipeThreshold(viewportWidth: number) {
  return Math.min(PAGE_SWIPE_THRESHOLD_MAX, Math.max(PAGE_SWIPE_THRESHOLD_MIN, viewportWidth * PAGE_SWIPE_THRESHOLD_RATIO));
}

function createLocalId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isNetworkOrUnavailableError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|network|load failed|fetch failed|internet|offline|timeout|unavailable/i.test(message);
}

function getRawErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error ?? "");
}

function getUserFacingErrorMessage(error: unknown, fallback = "Une erreur est survenue.") {
  const rawMessage = getRawErrorMessage(error).trim();
  const normalizedMessage = rawMessage.toLocaleLowerCase("fr-FR");

  if (!rawMessage) return fallback;
  if (isNetworkOrUnavailableError(error)) return "Connexion réseau indisponible.";
  if (/invalid login credentials|invalid credentials|email not confirmed|invalid grant/.test(normalizedMessage)) {
    return "Email ou mot de passe incorrect.";
  }
  if (/password should be at least|weak password|password.*characters/.test(normalizedMessage)) {
    return "Le mot de passe doit contenir au moins 6 caractères.";
  }
  if (/rate limit|too many requests|over request rate limit/.test(normalizedMessage)) {
    return "Trop de tentatives. Réessayez dans quelques instants.";
  }
  if (/jwt|session|refresh token|invalid token|token.*expired/.test(normalizedMessage)) {
    return "Session expirée. Reconnectez-vous.";
  }
  if (/row-level security|rls|permission denied|not authorized|unauthorized|forbidden|policy/.test(normalizedMessage)) {
    return "Action non autorisée.";
  }
  if (/duplicate key|unique constraint|already exists/.test(normalizedMessage)) {
    return "Cet élément existe déjà.";
  }
  if (/not found|no rows|object.*does not exist/.test(normalizedMessage)) {
    return "Élément introuvable.";
  }
  if (/storage|bucket|upload/.test(normalizedMessage)) {
    return fallback;
  }

  const looksTechnical = /supabase|migration|policy|constraint|stack|dommatrix|indexeddb|next_public|on conflict|http\s*\d|failed to fetch|fetch failed|load failed|json|syntaxerror/i.test(rawMessage);
  const looksFrench =
    /[àâçéèêëîïôûùüÿœ’]/i.test(rawMessage) ||
    /^(impossible|vous|votre|le|la|les|un|une|aucun|aucune|action|session|configuration|hors ligne|importez|ajoutez|ce|cette|ancien|ancienne|suppression|restauration|gestion|nom|email|mot de passe|connexion)/i.test(
      rawMessage,
    );

  if (looksFrench && !looksTechnical) return rawMessage;
  return fallback;
}

function openPendingSyncDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible."));
      return;
    }

    const request = indexedDB.open(pendingSyncDbName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(pendingSyncStoreName)) {
        const store = database.createObjectStore(pendingSyncStoreName, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Impossible d'ouvrir la file locale."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function withPendingSyncStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T> | void) {
  const database = await openPendingSyncDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(pendingSyncStoreName, mode);
    const store = transaction.objectStore(pendingSyncStoreName);
    const request = callback(store);
    let requestResult: T | undefined;

    if (request) {
      request.onsuccess = () => {
        requestResult = request.result;
      };
      request.onerror = () => reject(request.error ?? new Error("Erreur IndexedDB."));
    }

    transaction.oncomplete = () => {
      database.close();
      resolve(requestResult);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Erreur IndexedDB."));
    };
  });
}

async function getPendingSyncActions() {
  const actions = await withPendingSyncStore<PendingSyncAction[]>("readonly", (store) => store.getAll());
  return (actions ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function putPendingSyncAction(action: PendingSyncAction) {
  await withPendingSyncStore("readwrite", (store) => store.put(action));
}

async function deletePendingSyncAction(actionId: string) {
  await withPendingSyncStore("readwrite", (store) => store.delete(actionId));
}

async function countUnresolvedPendingSyncActions() {
  const actions = await getPendingSyncActions();
  return actions.filter((action) => action.status === "pending" || action.status === "syncing" || action.status === "failed").length;
}

function getLocalStorageJson<T>(key: string) {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch (error) {
    console.warn("Failed to read local cache.", { key, error });
    return null;
  }
}

function setLocalStorageJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Failed to write local cache.", { key, error });
  }
}

function removeLocalStorageKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn("Failed to clear local cache.", { key, error });
  }
}

function cacheUserProfile(profile: UserProfile) {
  setLocalStorageJson(`${cachedProfileKeyPrefix}${profile.id}`, profile);
  setLocalStorageJson(`${cachedProfileMetaKeyPrefix}${profile.id}`, { cachedAt: new Date().toISOString() } satisfies CachedProfileMeta);
}

function getCachedUserProfile(userId: string) {
  return getLocalStorageJson<UserProfile>(`${cachedProfileKeyPrefix}${userId}`);
}

function cacheAuthSession(session: Session) {
  setLocalStorageJson(cachedAuthSessionKey, {
    session,
    cachedAt: new Date().toISOString(),
  } satisfies CachedAuthSession);
}

function getCachedAuthSession() {
  return getLocalStorageJson<CachedAuthSession>(cachedAuthSessionKey)?.session ?? null;
}

function readCachedAuthState(): CachedAuthState | null {
  const cachedSession = getCachedAuthSession();
  if (!cachedSession) return null;

  const cachedProfile = getCachedUserProfile(cachedSession.user.id);
  if (!cachedProfile) return null;

  return {
    session: cachedSession,
    profile: cachedProfile,
    appData: getCachedAppData(cachedSession.user.id),
  };
}

function cacheAppData(userId: string, data: Omit<CachedAppData, "cachedAt">) {
  setLocalStorageJson(`${cachedAppDataKeyPrefix}${userId}`, {
    ...data,
    cachedAt: new Date().toISOString(),
  } satisfies CachedAppData);
}

function getCachedAppData(userId: string) {
  return getLocalStorageJson<CachedAppData>(`${cachedAppDataKeyPrefix}${userId}`);
}

function cacheNotifications(userId: string, notifications: AppNotification[]) {
  setLocalStorageJson(`${cachedNotificationsKeyPrefix}${userId}`, notifications.slice(0, 80));
}

function getCachedNotifications(userId: string) {
  return getLocalStorageJson<AppNotification[]>(`${cachedNotificationsKeyPrefix}${userId}`) ?? [];
}

const statusStyles: Record<EventStatus, string> = {
  Brouillon: "bg-stone-100 text-stone-600 ring-stone-200",
  "En préparation": "bg-amber-100 text-amber-800 ring-amber-200",
  "En attente client": "bg-sky-100 text-sky-800 ring-sky-200",
  Prêt: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  "En direct": "bg-rose-100 text-rose-800 ring-rose-200",
  Terminé: "bg-stone-200 text-stone-700 ring-stone-300",
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
  { keywords: ["duplex", "visio", "remote", "invite"], icon: Webcam },
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

const platformLinkLabels = new Set(["plateforme", "plateforme de diffusion", "evenement plateforme", "event plateforme"]);
const eventDocumentsBucket = "event-documents";
const nativeMstvIcsImportSource = "apple_ics_mstv";
const pendingSyncDbName = "mstv-production-os-sync";
const pendingSyncStoreName = "pending_actions";
const cachedAuthSessionKey = "mstv.cachedAuthSession";
const cachedProfileKeyPrefix = "mstv.cachedProfile.";
const cachedProfileMetaKeyPrefix = "mstv.cachedProfileMeta.";
const cachedAppDataKeyPrefix = "mstv.cachedAppData.";
const cachedNotificationsKeyPrefix = "mstv.cachedNotifications.";
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

function isDateKeyInMarker(dateKey: string, marker: CalendarMarker) {
  if (marker.date) return marker.date === dateKey;
  if (!marker.start || !marker.end) return false;
  return dateKey >= marker.start && dateKey <= marker.end;
}

function getCalendarMarkers(dateKey: string) {
  return [...publicHolidays, ...schoolHolidaysZoneC].filter((marker) => isDateKeyInMarker(dateKey, marker));
}

function normalizeHexColor(color: string | null | undefined) {
  const trimmedColor = color?.trim() ?? "";
  const shortMatch = trimmedColor.match(/^#([0-9a-f]{3})$/i);
  if (shortMatch) {
    return `#${shortMatch[1].split("").map((char) => `${char}${char}`).join("")}`.toLocaleLowerCase("fr-FR");
  }

  const longMatch = trimmedColor.match(/^#[0-9a-f]{6}$/i);
  return longMatch ? trimmedColor.toLocaleLowerCase("fr-FR") : null;
}

function getHexRgb(color: string) {
  const normalizedColor = normalizeHexColor(color);
  if (!normalizedColor) return null;

  return {
    r: Number.parseInt(normalizedColor.slice(1, 3), 16),
    g: Number.parseInt(normalizedColor.slice(3, 5), 16),
    b: Number.parseInt(normalizedColor.slice(5, 7), 16),
  };
}

function getExternalCalendarTone(color: string | null) {
  const hexColor = normalizeHexColor(color);
  if (hexColor) {
    const rgb = getHexRgb(hexColor);
    return {
      dot: "",
      bg: "",
      stripe: "",
      title: "text-stone-950",
      meta: "text-stone-600",
      dotStyle: { backgroundColor: hexColor },
      bgStyle: rgb ? { backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)` } : undefined,
      stripeStyle: { backgroundColor: hexColor },
    };
  }

  const normalizedColor = normalizeLabel(color ?? "");
  if (normalizedColor.includes("violet") || normalizedColor.includes("direction") || normalizedColor.includes("indigo")) {
    return {
      dot: "bg-indigo-400/85",
      bg: "bg-indigo-50/80",
      stripe: "bg-indigo-400",
      title: "text-indigo-950",
      meta: "text-indigo-700",
    };
  }

  if (normalizedColor.includes("blue") || normalizedColor.includes("bleu") || normalizedColor.includes("sky")) {
    return {
      dot: "bg-sky-400/85",
      bg: "bg-sky-50/80",
      stripe: "bg-sky-400",
      title: "text-sky-950",
      meta: "text-sky-700",
    };
  }

  if (normalizedColor.includes("green") || normalizedColor.includes("vert") || normalizedColor.includes("emerald")) {
    return {
      dot: "bg-emerald-400/85",
      bg: "bg-emerald-50/80",
      stripe: "bg-emerald-400",
      title: "text-emerald-950",
      meta: "text-emerald-700",
    };
  }

  if (normalizedColor.includes("orange")) {
    return {
      dot: "bg-orange-400/85",
      bg: "bg-orange-50/80",
      stripe: "bg-orange-400",
      title: "text-orange-950",
      meta: "text-orange-700",
    };
  }

  if (normalizedColor.includes("yellow") || normalizedColor.includes("jaune") || normalizedColor.includes("amber")) {
    return {
      dot: "bg-amber-400/85",
      bg: "bg-amber-50/80",
      stripe: "bg-amber-400",
      title: "text-amber-950",
      meta: "text-amber-700",
    };
  }

  if (normalizedColor.includes("brown") || normalizedColor.includes("marron")) {
    return {
      dot: "bg-[#a2845e]/85",
      bg: "bg-[#a2845e]/10",
      stripe: "bg-[#a2845e]",
      title: "text-stone-950",
      meta: "text-stone-600",
    };
  }

  if (normalizedColor.includes("red") || normalizedColor.includes("rouge") || normalizedColor.includes("rose")) {
    return {
      dot: "bg-rose-400/85",
      bg: "bg-rose-50/80",
      stripe: "bg-rose-400",
      title: "text-rose-950",
      meta: "text-rose-700",
    };
  }

  if (normalizedColor.includes("grey") || normalizedColor.includes("gray") || normalizedColor.includes("gris") || normalizedColor.includes("stone")) {
    return {
      dot: "bg-stone-400/85",
      bg: "bg-stone-100/80",
      stripe: "bg-stone-400",
      title: "text-stone-950",
      meta: "text-stone-600",
    };
  }

  return {
    dot: "bg-indigo-400/85",
    bg: "bg-indigo-50/80",
    stripe: "bg-indigo-400",
    title: "text-indigo-950",
    meta: "text-indigo-700",
  };
}

function getExternalEventDateKey(event: ExternalCalendarEvent) {
  if (event.allDay) return event.startTime.slice(0, 10);
  return formatDateKey(new Date(event.startTime));
}

function formatExternalEventTimeRange(event: ExternalCalendarEvent) {
  if (event.allDay) return "Toute la journée";

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const startDate = new Date(event.startTime);
  const endDate = event.endTime ? new Date(event.endTime) : null;
  if (Number.isNaN(startDate.getTime())) return "";
  const startLabel = formatter.format(startDate).replace(":", "h");
  if (!endDate || Number.isNaN(endDate.getTime())) return startLabel;
  return `${startLabel} → ${formatter.format(endDate).replace(":", "h")}`;
}

function unescapeIcsValue(value: string) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function unfoldIcsLines(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .reduce<string[]>((lines, line) => {
      if (/^[ \t]/.test(line) && lines.length > 0) {
        lines[lines.length - 1] += line.slice(1);
      } else {
        lines.push(line);
      }
      return lines;
    }, []);
}

function parseIcsDate(value: string, params: Record<string, string>) {
  const isAllDay = params.VALUE?.toLocaleUpperCase("fr-FR") === "DATE" || /^\d{8}$/.test(value);
  const dateMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (isAllDay && dateMatch) {
    const [, year, month, day] = dateMatch;
    return {
      iso: `${year}-${month}-${day}T00:00:00.000Z`,
      allDay: true,
    };
  }

  const dateTimeMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!dateTimeMatch) return null;

  const [, year, month, day, hours, minutes, seconds = "00", utcFlag] = dateTimeMatch;
  const parsedDate = utcFlag
    ? new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`)
    : new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds));

  if (Number.isNaN(parsedDate.getTime())) return null;
  return {
    iso: parsedDate.toISOString(),
    allDay: false,
  };
}

function parseIcsProperty(line: string) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex < 0) return null;
  const rawName = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);
  const [name = "", ...paramParts] = rawName.split(";");
  const params = Object.fromEntries(
    paramParts.map((part) => {
      const [key = "", rawValue = ""] = part.split("=");
      return [key.toLocaleUpperCase("fr-FR"), rawValue.replace(/^"|"$/g, "")];
    }),
  );

  return {
    name: name.toLocaleUpperCase("fr-FR"),
    params,
    value,
  };
}

function hashIcsFallback(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `generated-${Math.abs(hash)}`;
}

function parseIcsEvents(icsText: string) {
  const lines = unfoldIcsLines(icsText);
  const events: Array<{
    externalEventId: string;
    title: string;
    description: string | null;
    location: string | null;
    startTime: string;
    endTime: string | null;
    allDay: boolean;
    rawEvent: Record<string, unknown>;
  }> = [];
  let currentLines: string[] | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      currentLines = [];
      continue;
    }
    if (line === "END:VEVENT") {
      if (currentLines) {
        const raw: Record<string, unknown> = {};
        let uid = "";
        let recurrenceId = "";
        let summary = "";
        let description: string | null = null;
        let location: string | null = null;
        let startTime = "";
        let endTime: string | null = null;
        let allDay = false;

        for (const eventLine of currentLines) {
          const property = parseIcsProperty(eventLine);
          if (!property) continue;
          raw[property.name] = property.value;

          if (property.name === "UID") uid = property.value.trim();
          if (property.name === "RECURRENCE-ID") recurrenceId = property.value.trim();
          if (property.name === "SUMMARY") summary = unescapeIcsValue(property.value);
          if (property.name === "DESCRIPTION") description = unescapeIcsValue(property.value);
          if (property.name === "LOCATION") location = unescapeIcsValue(property.value);
          if (property.name === "DTSTART") {
            const parsedDate = parseIcsDate(property.value.trim(), property.params);
            if (parsedDate) {
              startTime = parsedDate.iso;
              allDay = parsedDate.allDay;
            }
          }
          if (property.name === "DTEND") {
            const parsedDate = parseIcsDate(property.value.trim(), property.params);
            if (parsedDate) {
              endTime = parsedDate.iso;
            }
          }
        }

        if (startTime && summary) {
          const externalEventId = uid
            ? recurrenceId
              ? `${uid}::${recurrenceId}`
              : uid
            : hashIcsFallback(`${summary}-${startTime}-${endTime ?? ""}`);

          events.push({
            externalEventId,
            title: summary,
            description,
            location,
            startTime,
            endTime,
            allDay,
            rawEvent: raw,
          });
        }
      }

      currentLines = null;
      continue;
    }

    if (currentLines) {
      currentLines.push(line);
    }
  }

  return events;
}

function getLocalDateKeyFromIso(isoValue: string) {
  return formatDateKey(new Date(isoValue));
}

function getLocalTimeFromIso(isoValue: string | null, allDay = false) {
  if (!isoValue || allDay) return "";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseNativeMstvIcsTitle(title: string) {
  const cleanTitle = title.trim().replace(/\s+/g, " ");
  const separators = [" - ", " – ", " — ", " | ", " : ", " / "];

  for (const separator of separators) {
    const separatorIndex = cleanTitle.indexOf(separator);
    if (separatorIndex > 0) {
      const clientName = cleanTitle.slice(0, separatorIndex).trim();
      const eventName = cleanTitle.slice(separatorIndex + separator.length).trim();
      if (clientName && eventName) return { clientName, eventName };
    }
  }

  return {
    clientName: cleanTitle || "Événement importé",
    eventName: "Événement importé",
  };
}

function buildNativeMstvIcsReviewEvents(icsText: string, existingImportIds: Set<string>): NativeMstvIcsReviewEvent[] {
  return parseIcsEvents(icsText)
    .map((event) => {
      const parsedTitle = parseNativeMstvIcsTitle(event.title);
      const alreadyImported = existingImportIds.has(event.externalEventId);

      return {
        externalImportId: event.externalEventId,
        sourceTitle: event.title,
        clientName: parsedTitle.clientName,
        eventName: parsedTitle.eventName,
        date: getLocalDateKeyFromIso(event.startTime),
        startTime: getLocalTimeFromIso(event.startTime, event.allDay),
        endTime: getLocalTimeFromIso(event.endTime, event.allDay),
        location: event.location,
        description: event.description,
        skipped: alreadyImported,
        skipReason: alreadyImported ? "Déjà importé" : null,
      };
    })
    .sort((a, b) => `${a.date}T${a.startTime || "00:00"}`.localeCompare(`${b.date}T${b.startTime || "00:00"}`));
}

function formatTime(time: string | null) {
  const timeValue = toTimeInputValue(time);
  if (!timeValue) return "";
  const [hours = "00", minutes = "00"] = timeValue.split(":");
  return `${hours}h${minutes}`;
}

function formatTimeRange(startTime: string | null, endTime: string | null) {
  const startLabel = formatTime(startTime);
  const endLabel = formatTime(endTime);

  if (startLabel && endLabel) return `${startLabel} → ${endLabel}`;
  return startLabel || endLabel;
}

function formatFullDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatHistoryTimestamp(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getEventTimeFieldLabel(field: EventTimeField) {
  const labels: Record<EventTimeField, string> = {
    clientArrivalTime: "Arrivée client",
    startTime: "Début live",
    endTime: "Fin live",
    endOfDayTime: "Fin journée",
  };

  return labels[field];
}

function toTimeInputValue(time: string | null) {
  if (!time) return "";
  const [hours = "00", minutes = "00"] = time.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function sanitizeTimeDraft(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

function normalizeCompactTimeInput(value: string) {
  const digits = sanitizeTimeDraft(value);
  if (!digits) return "";

  const [hours, minutes] =
    digits.length <= 2
      ? [digits, "00"]
      : digits.length === 3
        ? [digits.slice(0, 1), digits.slice(1)]
        : [digits.slice(0, 2), digits.slice(2)];

  const hourNumber = Number(hours);
  const minuteNumber = Number(minutes);

  if (!Number.isInteger(hourNumber) || !Number.isInteger(minuteNumber)) return "";
  if (hourNumber < 0 || hourNumber > 23 || minuteNumber < 0 || minuteNumber > 59) return "";

  return `${String(hourNumber).padStart(2, "0")}:${String(minuteNumber).padStart(2, "0")}`;
}

function normalizeEventTimeInput(input: CreateEventInput): CreateEventInput {
  return {
    ...input,
    clientArrivalTime: normalizeCompactTimeInput(input.clientArrivalTime),
    startTime: normalizeCompactTimeInput(input.startTime),
    endTime: normalizeCompactTimeInput(input.endTime),
    endOfDayTime: normalizeCompactTimeInput(input.endOfDayTime),
  };
}

function uniqueLabels(labels: string[]) {
  const seen = new Set<string>();
  return labels
    .map((label) => formatTitleCase(label))
    .filter((label) => {
      const key = normalizeLabel(label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function formatServiceLabel(label: string) {
  return label
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/^([\p{L}])/u, (letter) => letter.toLocaleUpperCase("fr-FR"))
    .replace(/\b(Sas|Sarl|Sa|Tv)\b/g, (acronym) => acronym.toLocaleUpperCase("fr-FR"));
}

function uniqueServiceLabels(labels: string[]) {
  const seen = new Set<string>();
  return labels
    .map((label) => formatServiceLabel(label))
    .filter((label) => {
      const key = normalizeLabel(label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseFrenchDateToKey(value: string) {
  const numericMatch = value.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (numericMatch) {
    const [, day, month, year] = numericMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const monthByName: Record<string, string> = {
    janvier: "01",
    fevrier: "02",
    mars: "03",
    avril: "04",
    mai: "05",
    juin: "06",
    juillet: "07",
    aout: "08",
    septembre: "09",
    octobre: "10",
    novembre: "11",
    decembre: "12",
  };
  const normalized = normalizeLabel(value);
  const textMatch = normalized.match(/\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})\b/);
  if (!textMatch) return "";

  const [, day, monthName, year] = textMatch;
  return `${year}-${monthByName[monthName]}-${day.padStart(2, "0")}`;
}

function parseFrenchDateToKeyWithDefaultYear(value: string, defaultYear?: string) {
  const explicitDate = parseFrenchDateToKey(value);
  if (explicitDate) return explicitDate;
  if (!defaultYear) return "";

  const monthByName: Record<string, string> = {
    janvier: "01",
    fevrier: "02",
    mars: "03",
    avril: "04",
    mai: "05",
    juin: "06",
    juillet: "07",
    aout: "08",
    septembre: "09",
    octobre: "10",
    novembre: "11",
    decembre: "12",
  };
  const normalized = normalizeLabel(value);
  const textMatch = normalized.match(/\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/);
  if (!textMatch) return "";

  const [, day, monthName] = textMatch;
  return `${defaultYear}-${monthByName[monthName]}-${day.padStart(2, "0")}`;
}

function parseFrenchTimeMatch(hours: string, minutes?: string) {
  return normalizeCompactTimeInput(`${hours}${minutes ?? ""}`);
}

function parseFrenchTimeRange(value: string) {
  const match = value.match(/\b(\d{1,2})\s*(?:h|H|:)\s*(\d{2})?\s*(?:-|–|—|à|a|jusqu(?:'|’)?a)\s*(\d{1,2})\s*(?:h|H|:)\s*(\d{2})?\b/i);
  if (!match) return { startTime: "", endTime: "" };

  return {
    startTime: parseFrenchTimeMatch(match[1], match[2]),
    endTime: parseFrenchTimeMatch(match[3], match[4]),
  };
}

function findLineValue(lines: string[], patterns: RegExp[]) {
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
  }
  return "";
}

function extractMstvClientName(lines: string[]) {
  const stopPattern = /\b(code client|devis|date|validit[eé]|total|adresse|t[eé]l|email|siret|tva)\b/i;
  const rejectedPattern = /^(?:cl\d+|code client|client|date|devis|n[°o]|#)/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const addressedMatch = line.match(/adress[eé]\s*[àa]\s*:?\s*(.*)$/i);
    if (!addressedMatch) continue;

    const candidates = [addressedMatch[1], ...lines.slice(index + 1, index + 8)]
      .map((candidate) => candidate.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    for (const candidate of candidates) {
      if (stopPattern.test(candidate) && !addressedMatch[1]) break;
      if (rejectedPattern.test(candidate)) continue;
      if (/\b\d{4,5}\b/.test(candidate)) continue;
      if (/\d+\s+(?:rue|avenue|boulevard|bd|place|impasse|chemin|route|quai)\b/i.test(candidate)) continue;
      if (candidate.length < 2 || candidate.length > 80) continue;
      return formatTitleCase(candidate);
    }
  }

  return "";
}

function findMstvProductionLine(lines: string[]) {
  const withDateAndRange = lines.find((line) => /\ble\s+\d{1,2}\s+[A-Za-zéûîôàèùç]+(?:\s+\d{4})?\b/i.test(line) && parseFrenchTimeRange(line).startTime);
  if (withDateAndRange) return withDateAndRange;

  const compactText = lines.join(" ");
  const match = compactText.match(/([^.:\n]*(?:le\s+)?\d{1,2}\s+[A-Za-zéûîôàèùç]+(?:\s+\d{4})?\s+(?:de\s+)?\d{1,2}\s*(?:h|H|:)\s*\d{0,2}\s*(?:-|–|—|à|a)\s*\d{1,2}\s*(?:h|H|:)\s*\d{0,2}[^.:\n]*)/i);
  return match?.[1]?.trim() ?? "";
}

function extractQuoteDocumentYear(lines: string[]) {
  const dateLine = findLineValue(lines, [
    /\bdate(?:\s+(?:facturation|de\s+facture|du\s+devis|devis))?\s*[:#-]\s*(.+)$/i,
    /\b(?:devis|facture)\s+du\s+(.+)$/i,
  ]);
  const date = parseFrenchDateToKey(dateLine);
  return date ? date.slice(0, 4) : "";
}

function extractQuoteServices(text: string) {
  const serviceRules = [
    { label: "Habillage", keywords: ["habillage", "graphisme", "identite visuelle"] },
    { label: "Plateforme", keywords: ["plateforme", "livemaker", "streaming", "diffusion"] },
    { label: "Duplex", keywords: ["duplex", "visio", "invite distant", "remote"] },
    { label: "Slides", keywords: ["slides", "presentation", "powerpoint", "deck"] },
    { label: "Replay", keywords: ["replay", "vod"] },
    { label: "Modération", keywords: ["moderation", "moderateur", "chat"] },
    { label: "Conducteur", keywords: ["conducteur", "deroule", "run of show"] },
    { label: "Sous-Titres", keywords: ["sous titres", "sous-titres", "caption"] },
    { label: "Prompteur", keywords: ["prompteur", "script"] },
    { label: "Timer", keywords: ["timer", "chrono", "compte a rebours"] },
    { label: "Captation", keywords: ["captation", "camera", "tournage"] },
    { label: "Maquillage", keywords: ["maquillage", "makeup"] },
    { label: "Montage", keywords: ["montage", "post-production", "edition"] },
    { label: "Quiz", keywords: ["quiz", "questionnaire", "q&a"] },
    { label: "Wifi", keywords: ["wifi", "wi fi", "internet"] },
  ];
  const normalizedText = normalizeLabel(text);
  const keywordServices = serviceRules.filter((rule) => rule.keywords.some((keyword) => normalizedText.includes(normalizeLabel(keyword)))).map((rule) => rule.label);
  const lineItemServices = extractQuoteLineItemLabels(text);
  return lineItemServices.length > 0 ? uniqueServiceLabels(lineItemServices) : uniqueServiceLabels(keywordServices);
}

function extractQuoteLineItemLabels(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const labels: string[] = [];
  let inItemsSection = false;

  for (const line of lines) {
    const normalizedLine = normalizeLabel(line);
    const pricedLineMatch = line.match(/^(.+?)\s+\d[\d\s]*(?:[,.]\d{2})\s+\d+(?:[,.]\d+)?\s+\d[\d\s]*(?:[,.]\d{2})$/);
    if (pricedLineMatch?.[1]) {
      const pricedLabel = pricedLineMatch[1].replace(/^[-•*\d.)\s]+/, "").trim();
      if (
        pricedLabel &&
        !/^\d+$/.test(pricedLabel) &&
        !/\b(total|tva|montant|condition|r[eè]glement|location du studio|studio tout [ée]quip[ée])\b/i.test(pricedLabel)
      ) {
        labels.push(pricedLabel);
      }
      continue;
    }

    if (/\b(d[eé]signation|description|prestation|service|option)\b/i.test(line) && /\b(prix|total|qt[eé]|quantit[eé]|montant|ht|ttc)\b/i.test(line)) {
      inItemsSection = true;
      continue;
    }

    if (inItemsSection && /\b(total|sous[-\s]?total|conditions|bon pour accord|validit[eé]|tva|net [aà] payer)\b/i.test(line)) {
      break;
    }

    if (!inItemsSection) continue;
    if (line.length < 3 || line.length > 90) continue;
    if (/^\d+([,.]\d+)?\s*(€|eur|ht|ttc)?$/i.test(line)) continue;
    if (/\b\d+[,.]\d{2}\s*(€|eur)?\b/i.test(line)) continue;
    if (/^(qt[eé]|quantit[eé]|prix|total|montant|remise|tva|ht|ttc)$/i.test(normalizedLine)) continue;
    if (/\b(mon studio tv|siret|tva intracom|iban|bic|adresse|email|tel|devis|facture|page)\b/i.test(normalizedLine)) continue;

    labels.push(line.replace(/^[-•*\d.)\s]+/, "").trim());
  }

  return labels;
}

function normalizeQuoteText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuoteDebugSnippet(text: string, maxLength = 240) {
  return normalizeQuoteText(text).slice(0, maxLength);
}

function findCommercialQuoteTextBoundary(text: string) {
  const cgvPatterns = [
    /conditions\s+g[eé]n[eé]rales\s+de\s+vente/i,
    /conditions\s+generales\s+de\s+vente/i,
    /conditions\s+g[eé]n[eé]rales/i,
    /\bCGV\b/i,
  ];
  const boundary = cgvPatterns
    .map((pattern) => {
      const match = text.match(pattern);
      return typeof match?.index === "number" ? match.index : -1;
    })
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  return typeof boundary === "number" ? boundary : -1;
}

function getCommercialQuoteText(text: string) {
  const boundary = findCommercialQuoteTextBoundary(text);
  return boundary >= 0 ? text.slice(0, boundary) : text;
}

function extractQuoteReference(text: string, fileName: string) {
  const candidates = `${fileName}\n${text}`;
  const referenceMatch =
    candidates.match(/\b((?:DE|FA)\d{6}-\d{3,})\b/i) ||
    candidates.match(/\b(DE\d{6}-\d{3,})\b/i) ||
    candidates.match(/\b(?:devis|quote)\s*(?:n[°o.]?|#|:)?\s*([A-Z]{1,4}\d{4,8}-\d{2,6})\b/i);
  return referenceMatch?.[1]?.toLocaleUpperCase("fr-FR") ?? "";
}

function extractQuoteVersion(text: string) {
  const normalizedText = normalizeQuoteText(text);
  const versionMatch = normalizedText.match(/\b(?:version|v)\s*[:#-]?\s*(\d+(?:\.\d+)?)\b/i);
  if (versionMatch?.[1]) return `v${versionMatch[1]}`;
  if (/\bannule\s+et\s+remplace\b/i.test(normalizedText)) return "annule-et-remplace";
  return "";
}

function extractQuoteFields(text: string, fallbackDate: string, fileName: string): QuoteExtractionResult {
  const commercialText = getCommercialQuoteText(text);
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const commercialLines = commercialText
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const parsingLines = commercialLines.length > 0 ? commercialLines : lines;
  const compactText = parsingLines.join(" ");
  const productionLine = findMstvProductionLine(parsingLines);
  const productionTimeRange = parseFrenchTimeRange(productionLine);
  const documentYear = extractQuoteDocumentYear(parsingLines);
  const clientName =
    extractMstvClientName(parsingLines) ||
    formatTitleCase(
      findLineValue(parsingLines, [
        /\bclient\s*[:#-]\s*(.+)$/i,
        /\bsoci[eé]t[eé]\s*[:#-]\s*(.+)$/i,
        /\bentreprise\s*[:#-]\s*(.+)$/i,
      ]),
    );
  const date =
    parseFrenchDateToKeyWithDefaultYear(productionLine, documentYear) ||
    parseFrenchDateToKeyWithDefaultYear(
      findLineValue(parsingLines, [
        /\b(?:date\s+(?:de\s+)?(?:l['’])?(?:événement|evenement)|jour\s+(?:de\s+)?(?:l['’])?(?:événement|evenement))\s*[:#-]\s*(.+)$/i,
        /\b(?:le)\s+(\d{1,2}\s+[A-Za-zéûîôàèùç]+(?:\s+\d{4})?)\b/i,
      ]) || "",
      documentYear,
    ) ||
    fallbackDate;
  const services = extractQuoteServices(commercialText);
  const quoteReference = extractQuoteReference(commercialText, fileName);
  const quoteVersion = extractQuoteVersion(commercialText);

  console.info("[Quote PDF import] parser diagnostics", {
    fileName,
    originalTextLength: text.length,
    commercialTextLength: commercialText.length,
    cgvBoundary: findCommercialQuoteTextBoundary(text),
    lineCount: lines.length,
    commercialLineCount: commercialLines.length,
    productionLine,
    detectedQuoteReference: quoteReference || null,
    detectedQuoteVersion: quoteVersion || null,
    detectedClient: clientName || null,
    detectedDate: date || null,
    detectedStartTime: productionTimeRange.startTime || null,
    detectedEndTime: productionTimeRange.endTime || null,
    detectedServiceCount: services.length,
    firstCommercialText: normalizeQuoteDebugSnippet(commercialText),
  });

  return {
    clientName,
    eventName: "Événement",
    date,
    clientArrivalTime: "",
    startTime: productionTimeRange.startTime,
    endTime: productionTimeRange.endTime,
    endOfDayTime: "",
    services,
    quoteReference,
    quoteVersion,
    sourceQuoteText: normalizeQuoteText(commercialText),
  };
}

class PdfImportError extends Error {
  constructor(
    message: string,
    public readonly causeDetails?: unknown,
  ) {
    super(message);
    this.name = "PdfImportError";
  }
}

function getPdfWorkerSrc() {
  if (typeof window === "undefined") return "/pdf.worker.mjs";
  return new URL("/pdf.worker.mjs", window.location.href).toString();
}

function getPdfAssetUrl(path: string) {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.href).toString();
}

function formatBytesForDebug(bytes: Uint8Array, byteCount = 16) {
  const sample = bytes.slice(0, byteCount);
  return {
    ascii: Array.from(sample)
      .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."))
      .join(""),
    hex: Array.from(sample)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" "),
  };
}

function getDebugError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
}

async function extractPdfText(file: File) {
  const debugId = `quote-pdf-${Date.now()}`;
  console.info("[Quote PDF import] file received", {
    debugId,
    name: file.name,
    type: file.type || "(empty)",
    size: file.size,
    lastModified: "lastModified" in file ? file.lastModified : null,
  });

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (readError) {
    console.error("[Quote PDF import] file.arrayBuffer failed", {
      debugId,
      error: getDebugError(readError),
    });
    throw new PdfImportError("Impossible de lire le fichier PDF depuis l’appareil.", readError);
  }

  const bytes = new Uint8Array(arrayBuffer);
  const header = formatBytesForDebug(bytes);
  const hasPdfHeader = header.ascii.startsWith("%PDF");
  console.info("[Quote PDF import] file bytes", {
    debugId,
    byteLength: arrayBuffer.byteLength,
    uint8Length: bytes.byteLength,
    header,
    hasPdfHeader,
  });

  if (bytes.byteLength === 0) {
    throw new PdfImportError("Le fichier PDF reçu est vide.");
  }

  if (!hasPdfHeader) {
    console.warn("[Quote PDF import] PDF header is not %PDF; trying pdfjs anyway", {
      debugId,
      header,
    });
  }

  const pdfjs = await import("pdfjs-dist");
  const workerSrc = getPdfWorkerSrc();
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  console.info("[Quote PDF import] pdfjs configured", {
    debugId,
    version: pdfjs.version,
    workerSrc,
  });

  let pdf;
  try {
    const loadingTask = pdfjs.getDocument({
      data: bytes.slice(),
      useWorkerFetch: false,
      useWasm: false,
      standardFontDataUrl: getPdfAssetUrl("/pdfjs/standard_fonts/"),
      cMapUrl: getPdfAssetUrl("/pdfjs/cmaps/"),
      cMapPacked: true,
    });
    pdf = await loadingTask.promise;
    console.info("[Quote PDF import] pdfjs loaded document", {
      debugId,
      pages: pdf.numPages,
    });
  } catch (pdfError) {
    console.error("[Quote PDF import] pdfjs failed to load document", {
      debugId,
      hasPdfHeader,
      workerSrc,
      error: getDebugError(pdfError),
    });
    throw new PdfImportError(
      hasPdfHeader
        ? "Le PDF semble valide, mais le lecteur PDF de l’app n’a pas réussi à l’ouvrir."
        : "Le fichier reçu ne ressemble pas à un PDF valide.",
      pdfError,
    );
  }

  const pages: string[] = [];
  let stoppedAtCgvPage: number | null = null;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    try {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => {
          const textItem = item as { str?: unknown; hasEOL?: boolean };
          if (typeof textItem.str !== "string") return "";
          return textItem.hasEOL ? `${textItem.str}\n` : `${textItem.str} `;
        })
        .join("");

      console.info("[Quote PDF import] extracted page text", {
        debugId,
        pageNumber,
        itemCount: content.items.length,
        textLength: pageText.trim().length,
        startsCgvSection: findCommercialQuoteTextBoundary(pageText) >= 0,
        sample: normalizeQuoteDebugSnippet(pageText, 160),
      });

      const cgvBoundary = findCommercialQuoteTextBoundary(pageText);
      if (cgvBoundary >= 0) {
        const commercialPageText = pageText.slice(0, cgvBoundary).trim();
        if (commercialPageText) {
          pages.push(commercialPageText);
        }
        stoppedAtCgvPage = pageNumber;
        console.info("[Quote PDF import] stopped before CGV pages", {
          debugId,
          pageNumber,
          keptTextLengthOnPage: commercialPageText.length,
        });
        break;
      }

      pages.push(pageText);
    } catch (pageError) {
      console.error("[Quote PDF import] page text extraction failed", {
        debugId,
        pageNumber,
        error: getDebugError(pageError),
      });
      if (pages.join("\n").trim().length > 120) {
        console.warn("[Quote PDF import] keeping previously extracted commercial pages after later page failure", {
          debugId,
          pageNumber,
          keptPages: pages.length,
          keptTextLength: pages.join("\n").trim().length,
        });
        break;
      }
      throw new PdfImportError("Le PDF s’ouvre, mais l’extraction du texte a échoué.", pageError);
    }
  }

  const text = getCommercialQuoteText(pages.join("\n"));
  console.info("[Quote PDF import] extracted document text", {
    debugId,
    totalTextLength: text.trim().length,
    extractedPages: pages.length,
    stoppedAtCgvPage,
    cgvBoundary: findCommercialQuoteTextBoundary(text),
    sample: normalizeQuoteDebugSnippet(text),
  });

  if (!text.trim()) {
    throw new PdfImportError("Le PDF a été lu, mais aucun texte exploitable n’a été trouvé.");
  }

  return text;
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

function getTokenSet(value: string) {
  return new Set(normalizeLabel(value).split(/[^a-z0-9]+/).filter((token) => token.length > 1));
}

function getTextSimilarity(left: string, right: string) {
  const leftTokens = getTokenSet(left);
  const rightTokens = getTokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) shared += 1;
  });

  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function formatTitleCase(label: string) {
  return label
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/(^|[^\p{L}\p{N}])([\p{L}])/gu, (_, separator: string, letter: string) => {
      return `${separator}${letter.toLocaleUpperCase("fr-FR")}`;
    })
    .replace(/\b(Sas|Sarl|Sa|Tv)\b/g, (acronym) => acronym.toLocaleUpperCase("fr-FR"));
}

function findMatchingQuoteEvent(events: ProductionEvent[], input: CreateEventInput) {
  const quoteReference = input.quoteReference?.trim();
  const activeEvents = events.filter((event) => !event.deletedAt);

  if (quoteReference) {
    const exactReferenceMatch = activeEvents.find((event) => event.quoteReference?.trim().toLocaleUpperCase("fr-FR") === quoteReference.toLocaleUpperCase("fr-FR"));
    if (exactReferenceMatch) return exactReferenceMatch;
  }

  const scoredMatches = activeEvents
    .map((event) => {
      const clientSimilarity = getTextSimilarity(event.clientName, input.clientName);
      const sameDate = event.date === input.date;
      const score = (sameDate ? 0.58 : 0) + clientSimilarity * 0.42;
      return { event, score };
    })
    .filter((match) => match.score >= 0.7)
    .sort((a, b) => b.score - a.score);

  return scoredMatches[0]?.event ?? null;
}

function getQuoteImportDifferences(existingEvent: ProductionEvent, input: CreateEventInput): QuoteImportDifference[] {
  const differences: QuoteImportDifference[] = [];
  const addDifference = (label: string, previousValue: string | null | undefined, nextValue: string | null | undefined) => {
    const previousDisplay = previousValue || "--";
    const nextDisplay = nextValue || "--";
    if (previousDisplay === nextDisplay) return;
    differences.push({ label, previousValue: previousDisplay, nextValue: nextDisplay });
  };

  addDifference("Client", existingEvent.clientName, input.clientName);
  addDifference("Date", formatFullDate(existingEvent.date), formatFullDate(input.date));
  addDifference("Début", toTimeInputValue(existingEvent.startTime), input.startTime);
  addDifference("Fin", toTimeInputValue(existingEvent.endTime), input.endTime);

  const existingOptionKeys = new Set(existingEvent.options.map((option) => normalizeLabel(option.label)));
  const importedOptionKeys = new Set((input.optionLabels ?? []).map(normalizeLabel));
  const addedOptions = (input.optionLabels ?? []).filter((label) => !existingOptionKeys.has(normalizeLabel(label)));
  const removedOptions = existingEvent.options.filter((option) => importedOptionKeys.size > 0 && !importedOptionKeys.has(normalizeLabel(option.label))).map((option) => option.label);

  if (addedOptions.length > 0) {
    differences.push({ label: "Options ajoutées", previousValue: "--", nextValue: addedOptions.join(", ") });
  }
  if (removedOptions.length > 0) {
    differences.push({ label: "Options absentes du devis", previousValue: removedOptions.join(", "), nextValue: "Conservées" });
  }

  return differences;
}

function sanitizeStorageFileName(fileName: string) {
  const extension = getFileExtension(fileName);
  const baseName = fileName
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const safeBaseName = baseName || "document";
  return extension ? `${Date.now()}-${safeBaseName}.${extension}` : `${Date.now()}-${safeBaseName}`;
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension && extension !== fileName ? extension.toLowerCase() : "";
}

function getDocumentObjectPath(filePath: string) {
  const prefix = `${eventDocumentsBucket}/`;
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}

function getDocumentPreviewKind(file: EventDocument): DocumentPreview["kind"] | null {
  const extension = getFileExtension(file.fileName);
  const fileType = file.fileType?.toLowerCase() ?? "";

  if (fileType.includes("pdf") || extension === "pdf") return "pdf";
  if (fileType.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(extension)) return "image";

  return null;
}

function formatFileSize(size: number | null) {
  if (size === null) return "Taille inconnue";
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function isLinkEntryDraftEmpty(draft: LinkEntryDraft, isPlatform: boolean) {
  return isPlatform ? !draft.url.trim() && !draft.streamKey.trim() : !draft.url.trim();
}

function isLinkEntryDraftComplete(draft: Pick<LinkEntryDraft, "url" | "streamKey">, isPlatform: boolean) {
  return isPlatform ? Boolean(draft.url.trim() && draft.streamKey.trim()) : Boolean(draft.url.trim());
}

function normalizeLinkEntryDrafts(drafts: LinkEntryDraft[], isPlatform: boolean) {
  const nonEmptyDrafts = drafts.filter((draft) => !isLinkEntryDraftEmpty(draft, isPlatform));
  const emptyDraft = drafts.find((draft) => isLinkEntryDraftEmpty(draft, isPlatform) && draft.id) ??
    drafts.find((draft) => isLinkEntryDraftEmpty(draft, isPlatform)) ?? { id: null, url: "", streamKey: "" };

  return [
    ...nonEmptyDrafts,
    {
      ...emptyDraft,
      url: "",
      streamKey: "",
    },
  ];
}

function createLinkEntryDrafts(link: EventLink, isPlatform: boolean) {
  const sourceEntries = link.entries.length > 0
    ? link.entries
    : link.url || link.streamKey
      ? [{
          id: null,
          linkId: link.id,
          url: link.url,
          streamKey: link.streamKey,
          position: 0,
          createdAt: link.createdAt,
          createdByProfileId: link.createdByProfileId,
          createdByRole: link.createdByRole,
          createdByName: link.createdByName,
          legacyParentValue: true,
        }]
      : [];

  return normalizeLinkEntryDrafts(
    sourceEntries.map((entry) => ({
      id: entry.id,
      url: entry.url ?? "",
      streamKey: entry.streamKey ?? "",
      legacyParentValue: "legacyParentValue" in entry ? Boolean(entry.legacyParentValue) : false,
      createdByProfileId: entry.createdByProfileId ?? null,
      createdByRole: entry.createdByRole ?? null,
      createdByName: entry.createdByName ?? null,
    })),
    isPlatform,
  );
}

function getPersistableLinkEntryDrafts(drafts: LinkEntryDraft[], isPlatform: boolean) {
  return drafts.filter((draft) => !isLinkEntryDraftEmpty(draft, isPlatform));
}

function serializeLinkEntryDrafts(drafts: LinkEntryDraft[], isPlatform: boolean) {
  return JSON.stringify(
    getPersistableLinkEntryDrafts(drafts, isPlatform).map((draft, position) => ({
      id: draft.id,
      url: draft.url.trim(),
      streamKey: isPlatform ? draft.streamKey.trim() : "",
      position,
    })),
  );
}

function serializeLinkEntries(entries: EventLinkEntry[], isPlatform: boolean) {
  return JSON.stringify(
    entries.map((entry, position) => ({
      id: entry.id,
      url: entry.url?.trim() ?? "",
      streamKey: isPlatform ? entry.streamKey?.trim() ?? "" : "",
      position,
    })),
  );
}

function getInitialsFromName(firstName: string, lastName?: string | null) {
  const firstInitial = firstName.trim().charAt(0).toLocaleUpperCase("fr-FR");
  const lastInitial = lastName?.trim().charAt(0).toLocaleUpperCase("fr-FR") ?? "";
  return `${firstInitial}${lastInitial}`.slice(0, 2) || firstInitial || "U";
}

function normalizeUserRole(role: string | null | undefined): UserRole {
  return role === "admin" ? "admin" : "team";
}

function mapUserProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email ?? null,
    firstName: row.first_name,
    lastName: row.last_name,
    role: normalizeUserRole(row.role),
    createdAt: row.created_at,
  };
}

function getProfileDisplayName(profile: UserProfile | null) {
  if (!profile) return null;
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  return fullName || "Utilisateur";
}

function getProfileInitials(profile: UserProfile | null, email?: string | null) {
  const firstName = profile?.firstName?.trim() ?? "";
  const lastName = profile?.lastName?.trim() ?? "";

  if (firstName && lastName) {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toLocaleUpperCase("fr-FR");
  }

  if (firstName) {
    const knownInternalInitials = completedByOverrideChoices.find((choice) => choice.label.toLocaleLowerCase("fr-FR") === firstName.toLocaleLowerCase("fr-FR"))?.initials;
    if (knownInternalInitials) {
      return knownInternalInitials;
    }

    return firstName.slice(0, 2).toLocaleUpperCase("fr-FR");
  }

  const emailLocalPart = email?.trim().split("@")[0] ?? "";
  const emailParts = emailLocalPart.split(/[^a-zA-ZÀ-ÿ0-9]+/).filter(Boolean);
  if (emailParts.length >= 2) {
    return `${emailParts[0].charAt(0)}${emailParts[1].charAt(0)}`.toLocaleUpperCase("fr-FR");
  }

  return emailLocalPart.slice(0, 2).toLocaleUpperCase("fr-FR") || "U";
}

function getCompleterInitials(profile: UserProfile | null, email?: string | null) {
  return getProfileInitials(profile, email).toLocaleUpperCase("fr-FR");
}

function getCompleterLabel(profile: UserProfile | null, email?: string | null) {
  const firstName = profile?.firstName?.trim();
  if (firstName) return firstName;

  const emailPrefix = email?.trim().split("@")[0]?.trim();
  return emailPrefix || null;
}

function getPasswordResetRedirectUrl() {
  if (typeof window === "undefined") return undefined;
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const origin = configuredUrl || window.location.origin;
  return origin.endsWith("/") ? origin : `${origin}/`;
}

function isCapacitorRuntime() {
  if (typeof window === "undefined") return false;
  const maybeCapacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return window.location.protocol === "capacitor:" || Boolean(maybeCapacitor?.isNativePlatform?.());
}

function isTauriRuntime() {
  if (typeof window === "undefined") return false;
  const tauriWindow = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return (
    window.location.protocol === "tauri:" ||
    window.location.hostname === "tauri.localhost" ||
    Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__)
  );
}

function getAppApiUrl(path: string, unavailableMessage = "Service momentanément indisponible.") {
  if (typeof window === "undefined") return path;
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const needsDeployedApiOrigin = isCapacitorRuntime() || isTauriRuntime();
  if (needsDeployedApiOrigin && configuredUrl) {
    return new URL(path, configuredUrl.endsWith("/") ? configuredUrl : `${configuredUrl}/`).toString();
  }
  if (needsDeployedApiOrigin) {
    throw new Error(unavailableMessage);
  }
  return path;
}

async function getCurrentSupabaseAccessToken(fallbackToken?: string | null) {
  if (!supabase) return fallbackToken ?? "";

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.access_token ?? fallbackToken ?? "";
  } catch (sessionError) {
    console.warn("Unable to refresh Supabase session before API call.", getDebugError(sessionError));
    return fallbackToken ?? "";
  }
}

function isPdfFile(file: File | null | undefined) {
  return Boolean(file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")));
}

function hasFileDragItem(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.items).some((item) => item.kind === "file");
}

function hasPotentialPdfDragItem(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.items).some((item) => {
    if (item.kind !== "file") return false;
    return !item.type || item.type === "application/pdf" || item.type === "application/x-pdf";
  });
}

function getFirstFileFromTransfer(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.files).find(Boolean) ?? null;
}

function getPdfFileFromTransfer(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.files).find(isPdfFile) ?? null;
}

function getCompletedByNameForDisplay(option: EventOption) {
  const label = option.completedByLabel?.trim();
  if (label) return label;

  const initials = option.completedByInitials?.trim().toLocaleUpperCase("fr-FR");
  if (initials) return completedByLegacyInitialLabels[initials] ?? label ?? initials;

  return label || null;
}

function getRoleLabel(role: UserRole) {
  const labels: Record<UserRole, string> = {
    admin: "Admin",
    team: "Team",
  };
  return labels[role];
}

function normalizeExternalCalendarVisibility(visibility: string | null | undefined): ExternalCalendarVisibility {
  if (visibility === "admin" || visibility === "admin_only") return "admin_only";
  if (visibility === "team") return "team";
  if (visibility === "private") return "private";
  return "private";
}

function normalizeExternalCalendarIcsUrl(value: string) {
  const trimmed = value.trim();
  if (/^webcal:\/\//i.test(trimmed)) {
    return `https://${trimmed.replace(/^webcal:\/\//i, "")}`;
  }
  return trimmed;
}

function getExternalCalendarVisibilityLabel(visibility: ExternalCalendarVisibility) {
  const labels: Record<ExternalCalendarVisibility, string> = {
    admin_only: "Admin",
    team: "Team",
    private: "Privé",
  };
  return labels[visibility];
}

function canViewExternalCalendar(permissions: AppPermissions, profile: UserProfile | null, calendar: Pick<ExternalCalendar, "visibility" | "createdByProfileId">) {
  if (permissions.canManageEvents) return true;
  if (calendar.visibility === "team") return true;
  return calendar.visibility === "private" && Boolean(profile?.id) && calendar.createdByProfileId === profile?.id;
}

function canManageExternalCalendar(permissions: AppPermissions, profile: UserProfile | null, calendar: Pick<ExternalCalendar, "createdByProfileId">) {
  if (permissions.canManageEvents) return true;
  return Boolean(profile?.id) && calendar.createdByProfileId === profile?.id;
}

function getPermissionsForRole(role: UserRole): AppPermissions {
  return {
    canManageEvents: role === "admin",
    canManageOperational: role === "admin" || role === "team",
    canSoftDeleteEvents: role === "admin",
    canRestoreEvents: role === "admin",
    canPermanentDeleteEvents: role === "admin",
    canManageUsers: role === "admin",
  };
}

function mapCreatorMetadata(row: {
  created_by_profile_id?: string | null;
  created_by_role?: string | null;
  created_by_name?: string | null;
}): CreatorMetadata {
  return {
    createdByProfileId: row.created_by_profile_id ?? null,
    createdByRole: row.created_by_role ? normalizeUserRole(row.created_by_role) : null,
    createdByName: row.created_by_name ?? null,
  };
}

function getCreatorInsertPayload(profile: UserProfile | null) {
  return {
    created_by_profile_id: profile?.id ?? null,
    created_by_role: profile?.role ?? null,
    created_by_name: getProfileDisplayName(profile),
  };
}

function canManageCreatedEntity(permissions: AppPermissions, profile: UserProfile | null, entity: CreatorMetadata) {
  if (permissions.canManageEvents) return true;
  if (!permissions.canManageOperational || !profile?.id) return false;
  if (entity.createdByProfileId !== profile.id) return false;
  return entity.createdByRole !== "admin";
}

function canManageLinkEntryEntity(permissions: AppPermissions, profile: UserProfile | null, link: EventLink, entry: CreatorMetadata) {
  if (canManageCreatedEntity(permissions, profile, entry)) return true;
  if (entry.createdByProfileId) return false;
  return canManageCreatedEntity(permissions, profile, link);
}

function mapEventActivityLog(row: EventActivityLogRow): EventActivityLog {
  return {
    id: row.id,
    eventId: row.event_id,
    actionType: row.action_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    description: row.description,
    previousValue: row.previous_value,
    newValue: row.new_value,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    relatedEventId: row.related_event_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

function mapEventOptionItem(row: EventOptionItemRow): EventOptionItem {
  return {
    id: row.id,
    optionId: row.option_id,
    label: row.label,
    createdAt: row.created_at,
    ...mapCreatorMetadata(row),
  };
}

function mapEventDocument(row: EventDocumentRow): EventDocument {
  return {
    id: row.id,
    eventId: row.event_id,
    groupId: row.group_id,
    fileName: row.file_name,
    filePath: row.file_path,
    fileType: row.file_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
    ...mapCreatorMetadata(row),
  };
}

function mapEventDocumentGroup(row: EventDocumentGroupRow): EventDocumentGroup {
  return {
    id: row.id,
    eventId: row.event_id,
    label: row.label,
    createdAt: row.created_at,
    ...mapCreatorMetadata(row),
    files: [],
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
      completedByProfileId: option.completed_by_profile_id ?? null,
      completedByLabel: option.completed_by_label ?? null,
      completedByInitials: option.completed_by_initials ?? null,
      completedAt: option.completed_at ?? null,
      createdAt: option.created_at,
      ...mapCreatorMetadata(option),
      items: [],
    }));

  const links = [...(row.event_links ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((link) => ({
      id: link.id,
      eventId: link.event_id,
      label: link.label,
      url: link.url,
      streamKey: link.stream_key ?? null,
      status: link.status,
      createdAt: link.created_at,
      ...mapCreatorMetadata(link),
      entries: [],
    }));

  return {
    id: row.id,
    clientName: row.client_name,
    eventName: row.event_name,
    date: row.date,
    clientArrivalTime: toTimeInputValue(row.client_arrival_time) || null,
    startTime: toTimeInputValue(row.start_time) || null,
    endTime: toTimeInputValue(row.end_time) || null,
    endOfDayTime: toTimeInputValue(row.end_of_day_time) || null,
    status: row.status,
    deletedAt: row.deleted_at ?? null,
    deletedBy: row.deleted_by ?? null,
    quoteReference: row.quote_reference ?? null,
    quoteVersion: row.quote_version ?? null,
    sourceQuoteText: row.source_quote_text ?? null,
    lastQuoteImportedAt: row.last_quote_imported_at ?? null,
    importedFrom: row.imported_from ?? null,
    externalImportId: row.external_import_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    options,
    links,
    documentGroups: [],
  };
}

function mapEventLinkEntry(row: EventLinkEntryRow): EventLinkEntry {
  return {
    id: row.id,
    linkId: row.link_id,
    url: row.url,
    streamKey: row.stream_key,
    position: row.position,
    createdAt: row.created_at,
    ...mapCreatorMetadata(row),
  };
}

function mapExternalCalendar(row: ExternalCalendarRow): ExternalCalendar {
  return {
    id: row.id,
    name: row.name,
    icsUrl: row.ics_url,
    color: row.color,
    visibility: normalizeExternalCalendarVisibility(row.visibility),
    createdByProfileId: row.created_by_profile_id ?? null,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
  };
}

function mapExternalCalendarEvent(row: ExternalCalendarEventQueryRow): ExternalCalendarEvent {
  return {
    id: row.id,
    externalCalendarId: row.external_calendar_id,
    externalEventId: row.external_event_id,
    title: row.title,
    description: row.description,
    location: row.location,
    startTime: row.start_time,
    endTime: row.end_time,
    allDay: Boolean(row.all_day),
    rawEvent: row.raw_event,
    lastSyncedAt: row.last_synced_at,
    calendarName: row.external_calendars?.name ?? "Calendrier externe",
    calendarColor: row.external_calendars?.color ?? null,
    calendarVisibility: normalizeExternalCalendarVisibility(row.external_calendars?.visibility),
    calendarCreatedByProfileId: row.external_calendars?.created_by_profile_id ?? null,
  };
}

function withOptionItems(events: ProductionEvent[], items: EventOptionItem[]) {
  const itemsByOptionId = new Map<string, EventOptionItem[]>();

  for (const item of items) {
    const optionItems = itemsByOptionId.get(item.optionId) ?? [];
    optionItems.push(item);
    itemsByOptionId.set(item.optionId, optionItems);
  }

  return events.map((event) => ({
    ...event,
    options: event.options.map((option) => ({
      ...option,
      items: itemsByOptionId.get(option.id) ?? [],
    })),
  }));
}

function withLinkEntries(events: ProductionEvent[], entries: EventLinkEntry[]) {
  const entriesByLinkId = new Map<string, EventLinkEntry[]>();

  for (const entry of entries) {
    const linkEntries = entriesByLinkId.get(entry.linkId) ?? [];
    linkEntries.push(entry);
    entriesByLinkId.set(entry.linkId, linkEntries);
  }

  return events.map((event) => ({
    ...event,
    links: event.links.map((link) => ({
      ...link,
      entries: (entriesByLinkId.get(link.id) ?? []).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
    })),
  }));
}

function withDocumentGroups(events: ProductionEvent[], groups: EventDocumentGroup[], files: EventDocument[]) {
  const filesByGroupId = new Map<string, EventDocument[]>();

  for (const file of files) {
    const groupFiles = filesByGroupId.get(file.groupId) ?? [];
    groupFiles.push(file);
    filesByGroupId.set(file.groupId, groupFiles);
  }

  const groupsByEventId = new Map<string, EventDocumentGroup[]>();
  for (const group of groups) {
    const eventGroups = groupsByEventId.get(group.eventId) ?? [];
    eventGroups.push({
      ...group,
      files: filesByGroupId.get(group.id) ?? [],
    });
    groupsByEventId.set(group.eventId, eventGroups);
  }

  return events.map((event) => ({
    ...event,
    documentGroups: groupsByEventId.get(event.id) ?? [],
  }));
}

async function fetchEvents(filter: "active" | "deleted" = "active") {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  let query = supabase
    .from("events")
    .select(
      `
        *,
        event_options (*),
        event_links (*)
      `,
    );

  if (filter === "deleted") {
    query = query.not("deleted_at", "is", null).order("deleted_at", { ascending: false });
  } else {
    query = query.is("deleted_at", null).order("date", { ascending: true }).order("start_time", { ascending: true });
  }

  const { data, error } = await query;

  if (error) throw error;
  let events = ((data ?? []) as EventQueryRow[]).map(mapEvent);
  const eventIds = events.map((event) => event.id);
  const optionIds = events.flatMap((event) => event.options.map((option) => option.id));
  const linkIds = events.flatMap((event) => event.links.map((link) => link.id));

  if (eventIds.length > 0) {
    const [{ data: groupData, error: groupError }, { data: documentData, error: documentError }] = await Promise.all([
      supabase
        .from("event_document_groups")
        .select("*")
        .in("event_id", eventIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("event_documents")
        .select("*")
        .in("event_id", eventIds)
        .order("created_at", { ascending: true }),
    ]);

    if (groupError || documentError) {
      console.error("Failed to load document groups/files. Apply supabase/migrations/005_event_document_groups.sql if the tables are missing.", {
        groupError,
        documentError,
      });
    } else {
      events = withDocumentGroups(events, (groupData ?? []).map(mapEventDocumentGroup), (documentData ?? []).map(mapEventDocument));
    }
  }

  if (linkIds.length > 0) {
    const { data: linkEntryData, error: linkEntryError } = await supabase
      .from("event_link_entries")
      .select("*")
      .in("link_id", linkIds)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (linkEntryError) {
      console.error("Failed to load event_link_entries. Apply supabase/migrations/009_event_link_entries.sql if the table is missing.", linkEntryError);
    } else {
      events = withLinkEntries(events, (linkEntryData ?? []).map(mapEventLinkEntry));
    }
  }

  if (optionIds.length === 0) return events;

  const { data: itemData, error: itemError } = await supabase
    .from("event_option_items")
    .select("*")
    .in("option_id", optionIds)
    .order("created_at", { ascending: true });

  if (itemError) {
    console.error("Failed to load event_option_items. Apply supabase/migrations/002_event_option_items.sql if the table is missing.", itemError);
    return events;
  }

  return withOptionItems(events, (itemData ?? []).map(mapEventOptionItem));
}

async function fetchOrCreateProfile(session: Session) {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) {
    const nextEmail = session.user.email ?? null;
    if (nextEmail && data.email !== nextEmail) {
      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update({ email: nextEmail })
        .eq("id", session.user.id)
        .select()
        .single();

      if (updateError) throw updateError;
      return mapUserProfile(updatedProfile);
    }
    return mapUserProfile(data);
  }

  const emailName = session.user.email?.split("@")[0]?.replace(/[._-]+/g, " ") ?? "Utilisateur";
  const firstName = formatTitleCase(emailName).split(" ")[0] || "Utilisateur";
  const { data: insertedProfile, error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: session.user.id,
      email: session.user.email ?? null,
      first_name: firstName,
      last_name: null,
      role: "team",
    })
    .select()
    .single();

  if (insertError) throw insertError;
  return mapUserProfile(insertedProfile);
}

async function fetchProfiles() {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapUserProfile);
}

async function fetchExternalCalendars() {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  const { data, error } = await supabase
    .from("external_calendars")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapExternalCalendar);
}

async function fetchExternalCalendarEvents() {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  const rows: ExternalCalendarEventQueryRow[] = [];
  let from = 0;

  while (true) {
    const to = from + EXTERNAL_CALENDAR_FETCH_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("external_calendar_events")
      .select("*, external_calendars (*)")
      .order("start_time", { ascending: true })
      .range(from, to);

    if (error) throw error;

    const pageRows = (data ?? []) as ExternalCalendarEventQueryRow[];
    rows.push(...pageRows);

    if (pageRows.length < EXTERNAL_CALENDAR_FETCH_PAGE_SIZE) {
      break;
    }

    from += EXTERNAL_CALENDAR_FETCH_PAGE_SIZE;
  }

  return rows.map(mapExternalCalendarEvent);
}

export default function Home() {
  const today = useMemo(() => new Date(), []);
  const [hasMounted, setHasMounted] = useState(false);
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [passwordRecoveryOpen, setPasswordRecoveryOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>("calendar");
  const [events, setEvents] = useState<ProductionEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDateKey, setSelectedDateKey] = useState(formatDateKey(today));
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [quoteImportOpen, setQuoteImportOpen] = useState(false);
  const [quoteImportFile, setQuoteImportFile] = useState<File | null>(null);
  const [nativeMstvIcsImportOpen, setNativeMstvIcsImportOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [yearOverviewOpen, setYearOverviewOpen] = useState(false);
  const [globalQuoteDragActive, setGlobalQuoteDragActive] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ProductionEvent | null>(null);
  const [editingReturnScreen, setEditingReturnScreen] = useState<Screen>("calendar");
  const [deleteDialogEvent, setDeleteDialogEvent] = useState<ProductionEvent | null>(null);
  const [permanentDeleteDialogEvent, setPermanentDeleteDialogEvent] = useState<ProductionEvent | null>(null);
  const [duplicateDatePickerEvent, setDuplicateDatePickerEvent] = useState<ProductionEvent | null>(null);
  const [duplicateRequest, setDuplicateRequest] = useState<DuplicateEventRequest | null>(null);
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [externalCalendarSettingsOpen, setExternalCalendarSettingsOpen] = useState(false);
  const [externalCalendarDetail, setExternalCalendarDetail] = useState<ExternalCalendarEvent | null>(null);
  const [managedProfiles, setManagedProfiles] = useState<UserProfile[]>([]);
  const [managedProfilesLoading, setManagedProfilesLoading] = useState(false);
  const [managedProfilesError, setManagedProfilesError] = useState<string | null>(null);
  const [updatingProfileId, setUpdatingProfileId] = useState<string | null>(null);
  const [externalCalendars, setExternalCalendars] = useState<ExternalCalendar[]>([]);
  const [externalCalendarEvents, setExternalCalendarEvents] = useState<ExternalCalendarEvent[]>([]);
  const [externalCalendarSettingsLoading, setExternalCalendarSettingsLoading] = useState(false);
  const [externalCalendarSettingsError, setExternalCalendarSettingsError] = useState<string | null>(null);
  const [syncingExternalCalendarId, setSyncingExternalCalendarId] = useState<string | null>(null);
  const [externalCalendarSyncProgress, setExternalCalendarSyncProgress] = useState<ExternalCalendarSyncProgress | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsHydrated, setNotificationsHydrated] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncingPendingActions, setSyncingPendingActions] = useState(false);
  const [pendingSyncError, setPendingSyncError] = useState<string | null>(null);
  const [deletedEvents, setDeletedEvents] = useState<ProductionEvent[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [restoringEventId, setRestoringEventId] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<EventActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [restoringActivityId, setRestoringActivityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTimelineTimeEditing, setIsTimelineTimeEditing] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const timelineTimeSaveRef = useRef<(() => Promise<void>) | null>(null);
  const processingPendingActionsRef = useRef(false);
  const pendingNetworkSyncTimeoutRef = useRef<number | null>(null);
  const reminderNotificationKeysRef = useRef<Set<string>>(new Set());
  const onlineRef = useRef(online);
  const processPendingSyncQueueRef = useRef<((options?: { forceOnline?: boolean }) => Promise<void>) | null>(null);
  const todayKey = formatDateKey(today);

  function schedulePendingSyncReplay(source: "browser" | "capacitor" | "state" | "enqueue") {
    if (typeof window === "undefined") return;
    if (pendingNetworkSyncTimeoutRef.current) {
      window.clearTimeout(pendingNetworkSyncTimeoutRef.current);
    }

    pendingNetworkSyncTimeoutRef.current = window.setTimeout(() => {
      pendingNetworkSyncTimeoutRef.current = null;
      console.info("[MSTV offline sync] network online, replaying pending queue", { source });
      void refreshPendingSyncState();
      void processPendingSyncQueueRef.current?.({ forceOnline: true });
    }, 450);
  }

  function hydrateFromCachedAuthState(cachedState: CachedAuthState) {
    setAuthSession(cachedState.session);
    setProfile(cachedState.profile);
    setAuthError(null);

    if (cachedState.appData) {
      setEvents(cachedState.appData.events);
      setExternalCalendars(cachedState.appData.externalCalendars);
      setExternalCalendarEvents(cachedState.appData.externalCalendarEvents);
      setSelectedId((current) => {
        if (current && cachedState.appData?.events.some((event) => event.id === current)) return current;
        return cachedState.appData?.events[0]?.id ?? null;
      });
    }

    setLoading(false);
    setAuthLoading(false);
  }

  const chronologicalEvents = useMemo(() => [...events].sort((a, b) => eventSortValue(a) - eventSortValue(b)), [events]);
  const selectedEvent = useMemo(() => chronologicalEvents.find((item) => item.id === selectedId) ?? chronologicalEvents[0] ?? null, [chronologicalEvents, selectedId]);
  const selectedEventIndex = selectedEvent ? chronologicalEvents.findIndex((item) => item.id === selectedEvent.id) : -1;
  const hasPreviousEvent = selectedEventIndex > 0;
  const hasNextEvent = selectedEventIndex >= 0 && selectedEventIndex < chronologicalEvents.length - 1;
  const isSelectedDateToday = selectedDateKey === todayKey;
  const yearLabel = String(visibleMonth.getFullYear());
  const permissions = useMemo(() => getPermissionsForRole(profile?.role ?? "team"), [profile?.role]);
  const headerProfile = profile;
  const headerSession = authSession;
  const headerPermissions = useMemo(() => getPermissionsForRole(headerProfile?.role ?? "team"), [headerProfile?.role]);
  const headerCanOpenTrash = headerPermissions.canRestoreEvents || headerPermissions.canPermanentDeleteEvents;
  const actorName = getProfileDisplayName(profile);
  const visibleExternalCalendarEvents = useMemo(
    () =>
      externalCalendarEvents.filter((event) =>
        canViewExternalCalendar(permissions, profile, {
          visibility: event.calendarVisibility,
          createdByProfileId: event.calendarCreatedByProfileId,
        }),
      ),
    [externalCalendarEvents, permissions, profile],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const monthEnd = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
    const monthStartKey = formatDateKey(monthStart);
    const monthEndKey = formatDateKey(monthEnd);
    const visibleExternalEventsInCurrentMonth = visibleExternalCalendarEvents.filter((event) => {
      const dateKey = getExternalEventDateKey(event);
      return dateKey >= monthStartKey && dateKey <= monthEndKey;
    });
    const visibleExternalEventsForSelectedDay = visibleExternalCalendarEvents.filter((event) => getExternalEventDateKey(event) === selectedDateKey);

    console.info("External calendar display debug", {
      externalCalendarsLoaded: externalCalendars.length,
      externalEventsLoaded: externalCalendarEvents.length,
      visibleExternalEventsLoaded: visibleExternalCalendarEvents.length,
      visibleExternalEventsInCurrentMonth: visibleExternalEventsInCurrentMonth.length,
      visibleExternalEventsForSelectedDay: visibleExternalEventsForSelectedDay.length,
      currentMonth: `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, "0")}`,
      selectedDateKey,
      currentUserRole: profile?.role ?? null,
    });
  }, [externalCalendars.length, externalCalendarEvents.length, profile?.role, selectedDateKey, visibleExternalCalendarEvents, visibleMonth]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  useEffect(() => {
    void refreshPendingSyncState();
    let cancelled = false;
    let networkListener: { remove: () => Promise<void> } | null = null;

    function handleOnline() {
      onlineRef.current = true;
      setOnline(true);
      schedulePendingSyncReplay("browser");
    }

    function handleOffline() {
      onlineRef.current = false;
      setOnline(false);
      if (pendingNetworkSyncTimeoutRef.current) {
        window.clearTimeout(pendingNetworkSyncTimeoutRef.current);
        pendingNetworkSyncTimeoutRef.current = null;
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    void Network.getStatus()
      .then((status) => {
        if (cancelled) return;
        onlineRef.current = status.connected;
        setOnline(status.connected);
        if (status.connected) {
          schedulePendingSyncReplay("capacitor");
        }
      })
      .catch((networkError) => {
        console.warn("Capacitor Network status unavailable; using browser online events.", networkError);
      });

    void Network.addListener("networkStatusChange", (status) => {
      if (cancelled) return;
      onlineRef.current = status.connected;
      setOnline(status.connected);
      if (status.connected) {
        schedulePendingSyncReplay("capacitor");
      } else if (pendingNetworkSyncTimeoutRef.current) {
        window.clearTimeout(pendingNetworkSyncTimeoutRef.current);
        pendingNetworkSyncTimeoutRef.current = null;
      }
    })
      .then((listener) => {
        if (cancelled) {
          void listener.remove();
        } else {
          networkListener = listener;
        }
      })
      .catch((networkError) => {
        console.warn("Capacitor Network listener unavailable; using browser online events.", networkError);
      });

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (pendingNetworkSyncTimeoutRef.current) {
        window.clearTimeout(pendingNetworkSyncTimeoutRef.current);
        pendingNetworkSyncTimeoutRef.current = null;
      }
      void networkListener?.remove();
    };
  }, []);

  useEffect(() => {
    if (online && authSession) {
      schedulePendingSyncReplay("state");
    }
  }, [authSession, online]);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthenticatedProfile(session: Session | null) {
      console.info("[MSTV offline boot] profile load start", {
        hasSession: Boolean(session),
        userId: session?.user.id ?? null,
        online: typeof navigator === "undefined" ? true : navigator.onLine,
      });
      setAuthSession(session);
      setAuthError(null);

      if (!session) {
        console.info("[MSTV offline boot] no session available");
        setProfile(null);
        setEvents([]);
        setExternalCalendars([]);
        setExternalCalendarEvents([]);
        setNotifications([]);
        setNotificationsHydrated(false);
        setSelectedId(null);
        setLoading(false);
        return;
      }

      try {
        const nextProfile = await fetchOrCreateProfile(session);
        console.info("[MSTV offline boot] live profile loaded", { userId: session.user.id });
        cacheAuthSession(session);
        cacheUserProfile(nextProfile);
        if (!cancelled) {
          setProfile(nextProfile);
        }
      } catch (profileError) {
        console.error("Failed to load authenticated profile. Apply supabase/migrations/013_auth_profiles.sql if needed.", profileError);
        const cachedProfile = getCachedUserProfile(session.user.id);
        console.info("[MSTV offline boot] live profile failed", {
          userId: session.user.id,
          networkLike: isNetworkOrUnavailableError(profileError),
          cachedProfileFound: Boolean(cachedProfile),
        });
        if (cachedProfile) {
          if (!cancelled) {
            console.info("[MSTV offline boot] cached profile fallback used", { userId: session.user.id });
            cacheAuthSession(session);
            setProfile(cachedProfile);
            setAuthError(null);
            if (isNetworkOrUnavailableError(profileError)) {
              setOnline(false);
            }
          }
          return;
        }
        if (!cancelled) {
          console.info("[MSTV offline boot] fatal profile error, no cached profile", { userId: session.user.id });
          setProfile(null);
          setAuthError(
            isNetworkOrUnavailableError(profileError)
              ? "Hors ligne. Connectez-vous une première fois avec du réseau pour préparer l'accès hors ligne."
              : "Impossible de charger le profil utilisateur.",
          );
        }
      }
    }

    async function initializeAuth() {
      if (!supabase) {
        setAuthLoading(false);
        setAuthError("Service momentanément indisponible.");
        return;
      }

      const cachedState = readCachedAuthState();
      if (cachedState) {
        console.info("[MSTV offline boot] cache-first auth state used", {
          userId: cachedState.session.user.id,
          online: typeof navigator === "undefined" ? true : navigator.onLine,
        });
        hydrateFromCachedAuthState(cachedState);
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setOnline(false);
          return;
        }
      }

      console.info("[MSTV offline boot] auth boot start", {
        online: typeof navigator === "undefined" ? true : navigator.onLine,
      });

      try {
        const { data, error } = await supabase.auth.getSession();
        console.info("[MSTV offline boot] getSession result", {
          sessionFound: Boolean(data.session),
          hasError: Boolean(error),
        });

        if (data.session) {
          cacheAuthSession(data.session);
          await loadAuthenticatedProfile(data.session);
          if (!cancelled) setAuthLoading(false);
          return;
        }

        const cachedSession = getCachedAuthSession();
        if (cachedSession) {
          console.info("[MSTV offline boot] cached session fallback used", { userId: cachedSession.user.id });
          if (error || isNetworkOrUnavailableError(error) || (typeof navigator !== "undefined" && !navigator.onLine)) {
            setOnline(false);
          }
          await loadAuthenticatedProfile(cachedSession);
          if (!cancelled) setAuthLoading(false);
          return;
        }

        if (error) {
          await loadAuthenticatedProfile(null);
          if (!cancelled) {
            setAuthError(getUserFacingErrorMessage(error, "Impossible de charger la session utilisateur."));
          }
          if (!cancelled) setAuthLoading(false);
          return;
        }
        await loadAuthenticatedProfile(null);
      } catch (sessionError) {
        console.error("[MSTV offline boot] getSession threw", sessionError);
        const cachedSession = getCachedAuthSession();
        if (cachedSession) {
          console.info("[MSTV offline boot] cached session fallback used after getSession throw", { userId: cachedSession.user.id });
          setOnline(false);
          await loadAuthenticatedProfile(cachedSession);
          if (!cancelled) setAuthLoading(false);
          return;
        }
        if (!cancelled) {
          setAuthError(getUserFacingErrorMessage(sessionError, "Impossible de charger la session utilisateur."));
        }
      }
      if (!cancelled) setAuthLoading(false);
    }

    const { data: authListener } = supabase?.auth.onAuthStateChange((authEvent, session) => {
      if (authEvent === "PASSWORD_RECOVERY") {
        setPasswordRecoveryOpen(true);
      }
      if (session) {
        cacheAuthSession(session);
      }
      void loadAuthenticatedProfile(session);
    }) ?? { data: { subscription: null } };

    void initializeAuth();

    return () => {
      cancelled = true;
      void authListener.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const recoveryPayload = `${window.location.search}${window.location.hash}`;
    if (/type=(?:recovery|password_recovery)\b/i.test(recoveryPayload)) {
      setPasswordRecoveryOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!authSession || !profile) return;
    const cachedNotifications = getCachedNotifications(profile.id);
    setNotifications(cachedNotifications);
    setNotificationsHydrated(!online || cachedNotifications.length > 0);
  }, [authSession?.user.id, online, profile?.id]);

  useEffect(() => {
    if (!authSession || !profile || !online) return;
    void refreshNotifications({ silent: true });
  }, [authSession?.user.id, profile?.id, online]);

  useEffect(() => {
    if (!authSession || !profile || loading || !notificationsHydrated) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = formatDateKey(tomorrow);
    const todayNotificationKey = formatDateKey(new Date());

    events
      .filter((event) => !event.deletedAt && event.date === tomorrowKey)
      .forEach((event) => {
        const reminderKey = `${profile.id}:${event.id}:${todayNotificationKey}:tomorrow`;
        if (reminderNotificationKeysRef.current.has(reminderKey)) return;
        reminderNotificationKeysRef.current.add(reminderKey);

        void createNotification(
          {
            type: "event_tomorrow",
            title: "Événement demain",
            body: `${event.clientName} - ${event.eventName}`,
            relatedEventId: event.id,
          },
          { dedupe: true },
        );
      });
  }, [authSession?.user.id, events, loading, notificationsHydrated, profile?.id]);

  useEffect(() => {
    if (!authSession || !profile) return;
    if (!online) {
      const cachedData = getCachedAppData(authSession.user.id);
      if (cachedData) {
        setEvents(cachedData.events);
        setExternalCalendars(cachedData.externalCalendars);
        setExternalCalendarEvents(cachedData.externalCalendarEvents);
        setSelectedId((current) => {
          if (current && cachedData.events.some((event) => event.id === current)) return current;
          return cachedData.events[0]?.id ?? null;
        });
      }
      setLoading(false);
      setError(null);
      return;
    }
    void reloadData();
  }, [authSession?.user.id, profile?.id, online]);

  useEffect(() => {
    if (!historyOpen || !selectedEvent) return;
    void refreshActivityLog(selectedEvent.id);
  }, [historyOpen, selectedEvent?.id]);

  useEffect(() => {
    if (!trashOpen) return;
    void refreshTrash();
  }, [trashOpen]);

  useEffect(() => {
    if (!userManagementOpen || !permissions.canManageUsers) return;
    void refreshManagedProfiles();
  }, [userManagementOpen, permissions.canManageUsers]);

  useEffect(() => {
    if (!externalCalendarSettingsOpen) return;
    void refreshExternalCalendarSettings();
  }, [externalCalendarSettingsOpen]);

  useEffect(() => {
    if (!authSession || !profile || !supabase || !online) return;

    const currentSession = authSession;
    const realtimeClient = supabase;
    let disposed = false;
    let refreshTimer: number | null = null;

    function scheduleRealtimeRefresh() {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        if (disposed) return;

        void (async () => {
          try {
            const nextProfile = await fetchOrCreateProfile(currentSession);
            cacheUserProfile(nextProfile);
            if (!disposed) {
              setProfile(nextProfile);
            }

            await reloadData(undefined, { silent: true });
            await refreshNotifications({ silent: true });

            if (trashOpen) {
              await refreshTrash();
            }

            if (historyOpen && selectedEvent?.id) {
              await refreshActivityLog(selectedEvent.id);
            }

            if (userManagementOpen && permissions.canManageUsers) {
              await refreshManagedProfiles();
            }

            if (externalCalendarSettingsOpen) {
              await refreshExternalCalendarSettings();
            }
          } catch (realtimeError) {
            console.warn("Realtime refresh failed", realtimeError);
          }
        })();
      }, 450);
    }

    const channel = realtimeClient.channel(`mstv-production-realtime-${currentSession.user.id}`);
    realtimeTableNames.forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
        },
        scheduleRealtimeRefresh,
      );
    });

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Supabase realtime channel status", status);
      }
    });

    return () => {
      disposed = true;
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      void realtimeClient.removeChannel(channel);
    };
  }, [authSession?.user.id, profile?.id, profile?.role, trashOpen, historyOpen, selectedEvent?.id, userManagementOpen, externalCalendarSettingsOpen, permissions.canManageUsers]);

  useEffect(() => {
    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    async function setupKeyboardListeners() {
      try {
        const keyboardWillShow = await Keyboard.addListener("keyboardWillShow", (info) => {
          console.log("Timeline keyboard accessory: keyboardWillShow", { keyboardHeight: info.keyboardHeight });
          setKeyboardHeight(info.keyboardHeight);
          setKeyboardVisible(true);
        });
        if (cancelled) {
          void keyboardWillShow.remove();
        } else {
          handles.push(keyboardWillShow);
        }

        const keyboardDidShow = await Keyboard.addListener("keyboardDidShow", (info) => {
          console.log("Timeline keyboard accessory: keyboardDidShow", { keyboardHeight: info.keyboardHeight });
          setKeyboardHeight(info.keyboardHeight);
          setKeyboardVisible(true);
        });
        if (cancelled) {
          void keyboardDidShow.remove();
        } else {
          handles.push(keyboardDidShow);
        }

        const keyboardWillHide = await Keyboard.addListener("keyboardWillHide", () => {
          console.log("Timeline keyboard accessory: keyboardWillHide");
          setKeyboardVisible(false);
          setKeyboardHeight(0);
        });
        if (cancelled) {
          void keyboardWillHide.remove();
        } else {
          handles.push(keyboardWillHide);
        }

        const keyboardDidHide = await Keyboard.addListener("keyboardDidHide", () => {
          console.log("Timeline keyboard accessory: keyboardDidHide");
          setKeyboardVisible(false);
          setKeyboardHeight(0);
        });
        if (cancelled) {
          void keyboardDidHide.remove();
        } else {
          handles.push(keyboardDidHide);
        }
      } catch (keyboardError) {
        console.warn("Timeline keyboard accessory: unable to attach Capacitor Keyboard listeners", keyboardError);
      }
    }

    void setupKeyboardListeners();

    return () => {
      cancelled = true;
      handles.forEach((handle) => {
        void handle.remove();
      });
    };
  }, []);

  async function reloadData(nextSelectedId?: string | null, options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const [nextEvents, nextExternalCalendars, nextExternalEvents] = await Promise.all([
        fetchEvents(),
        fetchExternalCalendars(),
        fetchExternalCalendarEvents(),
      ]);
      if (authSession?.user.id) {
        cacheAppData(authSession.user.id, {
          events: nextEvents,
          externalCalendars: nextExternalCalendars,
          externalCalendarEvents: nextExternalEvents,
        });
      }
      setEvents(nextEvents);
      setExternalCalendars(nextExternalCalendars);
      setExternalCalendarEvents(nextExternalEvents);
      setSelectedId((current) => {
        if (nextSelectedId !== undefined) return nextSelectedId;
        if (current && nextEvents.some((event) => event.id === current)) return current;
        return nextEvents[0]?.id ?? null;
      });
    } catch (supabaseError) {
      const cachedData = authSession?.user.id ? getCachedAppData(authSession.user.id) : null;
      if (cachedData && isNetworkOrUnavailableError(supabaseError)) {
        setEvents(cachedData.events);
        setExternalCalendars(cachedData.externalCalendars);
        setExternalCalendarEvents(cachedData.externalCalendarEvents);
        setSelectedId((current) => {
          if (nextSelectedId !== undefined) return nextSelectedId;
          if (current && cachedData.events.some((event) => event.id === current)) return current;
          return cachedData.events[0]?.id ?? null;
        });
        setError(null);
        setOnline(false);
      } else {
        setError(getUserFacingErrorMessage(supabaseError, "Impossible de charger les données."));
      }
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }

  async function refreshTrash() {
    setTrashLoading(true);
    setTrashError(null);

    try {
      setDeletedEvents(await fetchEvents("deleted"));
    } catch (trashLoadError) {
      console.error("Failed to load deleted events. Apply supabase/migrations/012_soft_delete_events.sql if columns are missing.", trashLoadError);
      setTrashError("Impossible de charger la corbeille.");
    } finally {
      setTrashLoading(false);
    }
  }

  async function refreshManagedProfiles() {
    if (!permissions.canManageUsers) return;

    setManagedProfilesLoading(true);
    setManagedProfilesError(null);

    try {
      setManagedProfiles(await fetchProfiles());
    } catch (profilesError) {
      console.error("Failed to load profiles. Apply supabase/migrations/014_profiles_admin_management.sql if needed.", profilesError);
      setManagedProfilesError("Impossible de charger les utilisateurs.");
    } finally {
      setManagedProfilesLoading(false);
    }
  }

  async function refreshExternalCalendarSettings() {
    setExternalCalendarSettingsLoading(true);
    setExternalCalendarSettingsError(null);

    try {
      const [nextCalendars, nextEvents] = await Promise.all([
        fetchExternalCalendars(),
        fetchExternalCalendarEvents(),
      ]);
      setExternalCalendars(nextCalendars);
      setExternalCalendarEvents(nextEvents);
    } catch (calendarError) {
      console.error("Failed to load external calendars. Apply supabase/migrations/023_external_calendars.sql if needed.", calendarError);
      setExternalCalendarSettingsError("Impossible de charger les calendriers externes.");
    } finally {
      setExternalCalendarSettingsLoading(false);
    }
  }

  async function createExternalCalendar(input: { name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility }) {
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    if (!profile?.id) throw new Error("Profil utilisateur introuvable.");
    const visibility = permissions.canManageEvents ? input.visibility : "private";
    const icsUrl = normalizeExternalCalendarIcsUrl(input.icsUrl);

    const { error: insertError } = await supabase
      .from("external_calendars")
      .insert({
        name: input.name.trim(),
        ics_url: icsUrl,
        color: input.color,
        visibility,
        created_by_profile_id: profile.id,
        created_by_name: actorName,
      });

    if (insertError) throw insertError;
    await refreshExternalCalendarSettings();
  }

  async function updateExternalCalendar(calendar: ExternalCalendar, input: { name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility }) {
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    if (!canManageExternalCalendar(permissions, profile, calendar)) {
      throw new Error("Vous ne pouvez modifier que vos calendriers.");
    }
    const visibility = permissions.canManageEvents ? input.visibility : "private";
    const icsUrl = normalizeExternalCalendarIcsUrl(input.icsUrl);

    const { error: updateError } = await supabase
      .from("external_calendars")
      .update({
        name: input.name.trim(),
        ics_url: icsUrl,
        color: input.color,
        visibility,
      })
      .eq("id", calendar.id);

    if (updateError) throw updateError;
    await refreshExternalCalendarSettings();
  }

  async function syncExternalCalendar(calendar: ExternalCalendar): Promise<ExternalCalendarSyncResult> {
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    if (!canManageExternalCalendar(permissions, profile, calendar)) {
      throw new Error("Vous ne pouvez synchroniser que vos calendriers.");
    }
    if (!calendar.icsUrl.trim()) {
      throw new Error("Ajoutez une URL ICS avant de synchroniser.");
    }
    if (!online) {
      throw new Error("La synchronisation du calendrier nécessite une connexion.");
    }

    setSyncingExternalCalendarId(calendar.id);
    setExternalCalendarSyncProgress(null);
    setExternalCalendarSettingsError(null);

    try {
      const accessToken = await getCurrentSupabaseAccessToken(authSession?.access_token);
      if (!accessToken) {
        throw new Error("Votre session a expiré. Reconnectez-vous.");
      }

      const response = await fetch(getAppApiUrl("/api/external-calendars/fetch-ics", "Synchronisation du calendrier momentanément indisponible."), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ calendarId: calendar.id }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null) as { error?: string } | null;
        console.error("External calendar ICS fetch API failed", {
          calendarId: calendar.id,
          status: response.status,
          error: errorPayload?.error ?? response.statusText,
        });
        throw new Error(errorPayload?.error || "Impossible de récupérer le flux ICS.");
      }

      const payload = await response.json().catch(() => null) as { icsText?: string; error?: string } | null;
      const icsText = payload?.icsText ?? "";
      if (!icsText.trim()) {
        throw new Error(payload?.error || "Impossible de récupérer le flux ICS.");
      }
      let parsedEvents: ReturnType<typeof parseIcsEvents>;
      try {
        parsedEvents = parseIcsEvents(icsText);
      } catch (parseError) {
        console.error("External calendar ICS parse failed", {
          calendarId: calendar.id,
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        throw new Error("Le calendrier a été récupéré mais n'a pas pu être lu.");
      }
      if (parsedEvents.length === 0) {
        console.error("External calendar ICS parse returned no events", {
          calendarId: calendar.id,
        });
        throw new Error("Le calendrier a été récupéré mais n'a pas pu être lu.");
      }

      const now = new Date().toISOString();
      const usedExternalEventIds = new Set<string>();
      let duplicateExternalEventIds = 0;
      const rows: Database["public"]["Tables"]["external_calendar_events"]["Insert"][] = parsedEvents.map((event) => {
        let externalEventId = event.externalEventId;

        if (usedExternalEventIds.has(externalEventId)) {
          duplicateExternalEventIds += 1;
          const stableSuffix = hashIcsFallback(`${event.startTime}-${event.endTime ?? ""}-${event.title}-${JSON.stringify(event.rawEvent)}`);
          externalEventId = `${event.externalEventId}::${stableSuffix}`;

          while (usedExternalEventIds.has(externalEventId)) {
            duplicateExternalEventIds += 1;
            externalEventId = `${event.externalEventId}::${stableSuffix}-${duplicateExternalEventIds}`;
          }
        }

        usedExternalEventIds.add(externalEventId);

        return {
        external_calendar_id: calendar.id,
        external_event_id: externalEventId,
        title: event.title,
        description: event.description,
        location: event.location,
        start_time: event.startTime,
        end_time: event.endTime,
        all_day: event.allDay,
        raw_event: event.rawEvent,
        last_synced_at: now,
        };
      });

      if (duplicateExternalEventIds > 0) {
        console.info("External calendar duplicate event identifiers normalized", {
          calendarId: calendar.id,
          duplicateExternalEventIds,
          parsedEvents: parsedEvents.length,
        });
      }

      const totalBatches = Math.ceil(rows.length / EXTERNAL_CALENDAR_UPSERT_BATCH_SIZE);
      setExternalCalendarSyncProgress({ calendarId: calendar.id, synced: 0, total: rows.length });

      for (let startIndex = 0; startIndex < rows.length; startIndex += EXTERNAL_CALENDAR_UPSERT_BATCH_SIZE) {
        const batch = rows.slice(startIndex, startIndex + EXTERNAL_CALENDAR_UPSERT_BATCH_SIZE);
        const batchNumber = Math.floor(startIndex / EXTERNAL_CALENDAR_UPSERT_BATCH_SIZE) + 1;
        const { error: upsertError } = await supabase
          .from("external_calendar_events")
          .upsert(batch, { onConflict: "external_calendar_id,external_event_id" });

        if (upsertError) {
          console.error("External calendar batch upsert failed", {
            calendarId: calendar.id,
            batchNumber,
            totalBatches,
            batchSize: batch.length,
            errorCode: upsertError.code,
            errorMessage: upsertError.message,
            errorDetails: upsertError.details,
            errorHint: upsertError.hint,
          });
          throw new Error(`Synchronisation interrompue au lot ${batchNumber}/${totalBatches}.`);
        }

        setExternalCalendarSyncProgress({
          calendarId: calendar.id,
          synced: Math.min(startIndex + batch.length, rows.length),
          total: rows.length,
        });
      }

      await refreshExternalCalendarSettings();
      if (rows.length >= 100) {
        await createNotification({
          type: "external_calendar_sync_completed",
          title: "Calendrier synchronisé",
          body: `${calendar.name}: ${rows.length} événements synchronisés.`,
        });
      }
      return { synced: rows.length, total: parsedEvents.length };
    } finally {
      setSyncingExternalCalendarId(null);
      setExternalCalendarSyncProgress(null);
    }
  }

  async function deleteExternalCalendar(calendar: ExternalCalendar) {
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    if (!canManageExternalCalendar(permissions, profile, calendar)) {
      throw new Error("Vous ne pouvez supprimer que vos calendriers.");
    }

    const { error: deleteError } = await supabase
      .from("external_calendars")
      .delete()
      .eq("id", calendar.id);

    if (deleteError) throw deleteError;
    await refreshExternalCalendarSettings();
  }

  async function fetchActivityLog(eventId: string) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const { data, error: logError } = await supabase
      .from("event_activity_log")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (logError) throw logError;
    return (data ?? []).map(mapEventActivityLog);
  }

  async function refreshActivityLog(eventId: string) {
    setActivityLoading(true);
    setActivityError(null);

    try {
      setActivityLog(await fetchActivityLog(eventId));
    } catch (logError) {
      console.error("Failed to load event activity log. Apply supabase/migrations/011_event_activity_log.sql if the table is missing.", logError);
      setActivityError("Impossible de charger l'historique.");
    } finally {
      setActivityLoading(false);
    }
  }

  async function logEventActivity(input: {
    eventId: string;
    actionType: string;
    entityType?: string | null;
    entityId?: string | null;
    description: string;
    previousValue?: ActivityValue;
    newValue?: ActivityValue;
  }) {
    if (!supabase) return;

    const description = actorName ? `${input.description} par ${actorName}` : input.description;

    const { data, error: logError } = await supabase
      .from("event_activity_log")
      .insert({
        event_id: input.eventId,
        action_type: input.actionType,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        description,
        previous_value: input.previousValue ?? null,
        new_value: input.newValue ?? null,
        created_by: actorName,
      })
      .select()
      .single();

    if (logError) {
      console.warn("Failed to write event activity log. Apply supabase/migrations/011_event_activity_log.sql if the table is missing.", {
        payload: input,
        errorMessage: logError.message,
        errorCode: logError.code,
        errorDetails: logError.details,
        errorHint: logError.hint,
      });
      return;
    }

    if (historyOpen && selectedEvent?.id === input.eventId) {
      setActivityLog((current) => [mapEventActivityLog(data), ...current].slice(0, 80));
    }
  }

  async function writeQueuedActivity(activity: PendingActivityPayload | null | undefined) {
    if (!supabase || !activity) return;
    const description = actorName ? `${activity.description} par ${actorName}` : activity.description;

    const { error: logError } = await supabase.from("event_activity_log").insert({
      event_id: activity.eventId,
      action_type: activity.actionType,
      entity_type: activity.entityType ?? null,
      entity_id: activity.entityId ?? null,
      description,
      previous_value: activity.previousValue ?? null,
      new_value: activity.newValue ?? null,
      created_by: actorName,
    });

    if (logError) {
      console.warn("Failed to replay queued activity log.", logError);
    }
  }

  async function fetchNotifications(userId: string) {
    if (!supabase) return [];

    const { data, error: notificationsError } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (notificationsError) throw notificationsError;
    return (data ?? []).map(mapNotification);
  }

  async function refreshNotifications(options: { silent?: boolean } = {}) {
    if (!profile?.id || !supabase || !online) return;

    try {
      const nextNotifications = await fetchNotifications(profile.id);
      setNotifications(nextNotifications);
      cacheNotifications(profile.id, nextNotifications);
    } catch (notificationsError) {
      if (!options.silent) {
        console.warn("Failed to load notifications.", notificationsError);
      }
    } finally {
      setNotificationsHydrated(true);
    }
  }

  function setCachedNotifications(updater: (current: AppNotification[]) => AppNotification[]) {
    setNotifications((current) => {
      const next = updater(current).slice(0, 80);
      if (profile?.id) {
        cacheNotifications(profile.id, next);
      }
      return next;
    });
  }

  async function createNotification(
    input: {
      type: string;
      title: string;
      body: string;
      relatedEventId?: string | null;
    },
    options: { persist?: boolean; dedupe?: boolean } = {},
  ) {
    if (!profile?.id) return;
    const persist = options.persist ?? true;
    const dedupe = options.dedupe ?? false;
    const now = new Date().toISOString();
    const notification: AppNotification = {
      id: createLocalId(),
      userId: profile.id,
      type: input.type,
      title: input.title,
      body: input.body,
      relatedEventId: input.relatedEventId ?? null,
      readAt: null,
      createdAt: now,
    };

    if (dedupe) {
      const alreadyExists = notifications.some(
        (item) =>
          item.type === notification.type &&
          item.relatedEventId === notification.relatedEventId &&
          item.title === notification.title &&
          item.body === notification.body &&
          item.createdAt.slice(0, 10) === notification.createdAt.slice(0, 10),
      );
      if (alreadyExists) return;
    }

    setCachedNotifications((current) => [notification, ...current]);

    if (!persist) return;

    const row: Database["public"]["Tables"]["notifications"]["Insert"] = {
      id: notification.id,
      user_id: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      related_event_id: notification.relatedEventId,
      read_at: notification.readAt,
      created_at: notification.createdAt,
    };

    if (!online) {
      await enqueuePendingSyncAction({
        actionType: "notification_insert",
        entityType: "notification",
        entityId: notification.id,
        payload: { values: row },
      });
      return;
    }

    if (!supabase) return;
    const { error: insertError } = await supabase.from("notifications").insert(row);
    if (insertError) {
      if (isNetworkOrUnavailableError(insertError)) {
        await enqueuePendingSyncAction({
          actionType: "notification_insert",
          entityType: "notification",
          entityId: notification.id,
          payload: { values: row },
        });
        return;
      }
      console.warn("Failed to create notification.", insertError);
    }
  }

  async function markNotificationRead(notification: AppNotification) {
    if (notification.readAt) return;
    const readAt = new Date().toISOString();
    setCachedNotifications((current) => current.map((item) => (item.id === notification.id ? { ...item, readAt } : item)));

    const values: Database["public"]["Tables"]["notifications"]["Update"] = { read_at: readAt };
    if (!online) {
      await enqueuePendingSyncAction({
        actionType: "notification_update",
        entityType: "notification",
        entityId: notification.id,
        payload: { values },
      });
      return;
    }

    if (!supabase) return;
    const { error: updateError } = await supabase.from("notifications").update(values).eq("id", notification.id);
    if (updateError) {
      if (isNetworkOrUnavailableError(updateError)) {
        await enqueuePendingSyncAction({
          actionType: "notification_update",
          entityType: "notification",
          entityId: notification.id,
          payload: { values },
        });
        return;
      }
      console.warn("Failed to mark notification as read.", updateError);
    }
  }

  async function markAllNotificationsRead() {
    const unreadNotifications = notifications.filter((item) => !item.readAt);
    if (unreadNotifications.length === 0) return;
    await Promise.all(unreadNotifications.map((notification) => markNotificationRead(notification)));
  }

  function handleNotificationOpen(notification: AppNotification) {
    void markNotificationRead(notification);
    setNotificationsOpen(false);
    if (notification.relatedEventId) {
      openEvent(notification.relatedEventId);
    }
  }

  async function executePendingSyncAction(action: PendingSyncAction) {
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    const activity = action.payload.activity as PendingActivityPayload | null | undefined;

    if (action.actionType === "notification_insert") {
      const values = action.payload.values as Database["public"]["Tables"]["notifications"]["Insert"];
      const { error: insertError } = await supabase.from("notifications").insert(values);
      if (insertError) throw insertError;
      return;
    }

    if (action.actionType === "notification_update") {
      const values = action.payload.values as Database["public"]["Tables"]["notifications"]["Update"];
      const { error: updateError } = await supabase.from("notifications").update(values).eq("id", action.entityId);
      if (updateError) throw updateError;
      return;
    }

    if (action.actionType === "event_insert") {
      const values = action.payload.values as Database["public"]["Tables"]["events"]["Insert"];
      const { error: insertError } = await supabase.from("events").insert(values);
      if (insertError) throw insertError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "event_update") {
      const values = action.payload.values as Database["public"]["Tables"]["events"]["Update"];
      const { error: updateError } = await supabase.from("events").update(values).eq("id", action.entityId);
      if (updateError) throw updateError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "event_soft_delete") {
      const values = action.payload.values as Database["public"]["Tables"]["events"]["Update"];
      const { error: updateError } = await supabase.from("events").update(values).eq("id", action.entityId);
      if (updateError) throw updateError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "event_restore") {
      const values = action.payload.values as Database["public"]["Tables"]["events"]["Update"];
      const { error: updateError } = await supabase.from("events").update(values).eq("id", action.entityId);
      if (updateError) throw updateError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "option_update") {
      const values = action.payload.values as Database["public"]["Tables"]["event_options"]["Update"];
      const { error: updateError } = await supabase.from("event_options").update(values).eq("id", action.entityId);
      if (updateError) throw updateError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "option_insert") {
      const values = action.payload.values as Database["public"]["Tables"]["event_options"]["Insert"];
      const { error: insertError } = await supabase.from("event_options").insert(values);
      if (insertError) throw insertError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "option_delete") {
      const { error: deleteError } = await supabase.from("event_options").delete().eq("id", action.entityId);
      if (deleteError) throw deleteError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "option_item_insert") {
      const values = action.payload.values as Database["public"]["Tables"]["event_option_items"]["Insert"];
      const { error: insertError } = await supabase.from("event_option_items").insert(values);
      if (insertError) throw insertError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "option_item_update") {
      const values = action.payload.values as Database["public"]["Tables"]["event_option_items"]["Update"];
      const { error: updateError } = await supabase.from("event_option_items").update(values).eq("id", action.entityId);
      if (updateError) throw updateError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "option_item_delete") {
      const { error: deleteError } = await supabase.from("event_option_items").delete().eq("id", action.entityId);
      if (deleteError) throw deleteError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "link_insert") {
      const values = action.payload.values as Database["public"]["Tables"]["event_links"]["Insert"];
      const { error: insertError } = await supabase.from("event_links").insert(values);
      if (insertError) throw insertError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "link_update") {
      const values = action.payload.values as Database["public"]["Tables"]["event_links"]["Update"];
      const { error: updateError } = await supabase.from("event_links").update(values).eq("id", action.entityId);
      if (updateError) throw updateError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "link_delete") {
      const { error: deleteError } = await supabase.from("event_links").delete().eq("id", action.entityId);
      if (deleteError) throw deleteError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "link_entries_replace") {
      const deletedEntryIds = action.payload.deletedEntryIds as string[] | undefined;
      const rows = action.payload.rows as Database["public"]["Tables"]["event_link_entries"]["Insert"][] | undefined;
      const linkValues = action.payload.linkValues as Database["public"]["Tables"]["event_links"]["Update"] | undefined;

      if (deletedEntryIds?.length) {
        const { error: deleteError } = await supabase.from("event_link_entries").delete().in("id", deletedEntryIds);
        if (deleteError) throw deleteError;
      }
      if (rows?.length) {
        const { error: upsertError } = await supabase.from("event_link_entries").upsert(rows, { onConflict: "id" });
        if (upsertError) throw upsertError;
      }
      if (linkValues) {
        const { error: updateError } = await supabase.from("event_links").update(linkValues).eq("id", action.entityId);
        if (updateError) throw updateError;
      }
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "document_group_insert") {
      const values = action.payload.values as Database["public"]["Tables"]["event_document_groups"]["Insert"];
      const { error: insertError } = await supabase.from("event_document_groups").insert(values);
      if (insertError) throw insertError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "document_group_update") {
      const values = action.payload.values as Database["public"]["Tables"]["event_document_groups"]["Update"];
      const { error: updateError } = await supabase.from("event_document_groups").update(values).eq("id", action.entityId);
      if (updateError) throw updateError;
      await writeQueuedActivity(activity);
      return;
    }

    if (action.actionType === "document_group_delete") {
      const { error: deleteError } = await supabase.from("event_document_groups").delete().eq("id", action.entityId);
      if (deleteError) throw deleteError;
      await writeQueuedActivity(activity);
    }
  }

  async function refreshPendingSyncState() {
    try {
      setPendingSyncCount(await countUnresolvedPendingSyncActions());
    } catch (countError) {
      console.warn("Unable to count pending sync actions.", countError);
    }
  }

  async function enqueuePendingSyncAction(input: {
    actionType: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    const action: PendingSyncAction = {
      id: createLocalId(),
      actionType: input.actionType,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: {
        ...input.payload,
        clientTimestamp: now,
      },
      createdAt: now,
      updatedAt: now,
      userId: profile?.id ?? null,
      status: "pending",
      retryCount: 0,
      lastError: null,
    };

    await putPendingSyncAction(action);
    setPendingSyncError(null);
    await refreshPendingSyncState();
    if (!input.actionType.startsWith("notification_")) {
      void createNotification(
        {
          type: "sync_pending",
          title: "Modifications en attente",
          body: "Elles seront synchronisées au retour du réseau.",
        },
        { persist: false, dedupe: true },
      );
    }
    if (online) {
      schedulePendingSyncReplay("enqueue");
    }
  }

  async function processPendingSyncQueue(options: { forceOnline?: boolean } = {}) {
    if ((!options.forceOnline && !onlineRef.current) || processingPendingActionsRef.current || !supabase) return;
    processingPendingActionsRef.current = true;
    setSyncingPendingActions(true);
    setPendingSyncError(null);

    try {
      const actions = (await getPendingSyncActions()).filter((action) => action.status === "pending" || action.status === "failed");
      let syncedSomething = false;
      let syncedOperationalAction = false;

      for (const action of actions) {
        const syncingAction: PendingSyncAction = {
          ...action,
          status: "syncing",
          updatedAt: new Date().toISOString(),
        };
        await putPendingSyncAction(syncingAction);
        await refreshPendingSyncState();

        try {
          await executePendingSyncAction(syncingAction);
          await deletePendingSyncAction(syncingAction.id);
          syncedSomething = true;
          if (!syncingAction.actionType.startsWith("notification_")) {
            syncedOperationalAction = true;
          }
        } catch (syncError) {
          const message = getUserFacingErrorMessage(syncError, "Synchronisation impossible.");
          await putPendingSyncAction({
            ...syncingAction,
            status: "failed",
            retryCount: syncingAction.retryCount + 1,
            lastError: message,
            updatedAt: new Date().toISOString(),
          });
          setPendingSyncError(message);
          if (!syncingAction.actionType.startsWith("notification_")) {
            void createNotification(
              {
                type: "sync_failed",
                title: "Synchronisation impossible",
                body: message,
              },
              { persist: false, dedupe: true },
            );
          }
          if (isNetworkOrUnavailableError(syncError)) break;
        } finally {
          await refreshPendingSyncState();
        }
      }

      if (syncedSomething) {
        await reloadData(selectedId, { silent: true });
      }
      if (syncedOperationalAction) {
        await createNotification(
          {
            type: "sync_completed",
            title: "Synchronisation terminée",
            body: "Les modifications en attente ont été envoyées.",
          },
          { dedupe: true },
        );
      }
    } finally {
      processingPendingActionsRef.current = false;
      setSyncingPendingActions(false);
      await refreshPendingSyncState();
    }
  }

  processPendingSyncQueueRef.current = processPendingSyncQueue;

  function assertCanManageEvents() {
    if (!permissions.canManageEvents) {
      throw new Error("Action réservée aux admins.");
    }
  }

  function assertCanManageOperational() {
    if (!permissions.canManageOperational) {
      throw new Error("Action non autorisée avec ce rôle.");
    }
  }

  function assertCanSoftDeleteEvents() {
    if (!permissions.canSoftDeleteEvents) {
      throw new Error("Suppression d'événement non autorisée avec ce rôle.");
    }
  }

  function assertCanRestoreEvents() {
    if (!permissions.canRestoreEvents) {
      throw new Error("Restauration non autorisée avec ce rôle.");
    }
  }

  function assertCanPermanentDeleteEvents() {
    if (!permissions.canPermanentDeleteEvents) {
      throw new Error("Suppression définitive réservée aux admins.");
    }
  }

  function assertCanManageUsers() {
    if (!permissions.canManageUsers) {
      throw new Error("Gestion utilisateurs réservée aux admins.");
    }
  }

  function openHistory() {
    if (!selectedEvent) return;
    setHistoryOpen(true);
  }

  async function restoreActivityEntry(entry: EventActivityLog) {
    assertCanManageEvents();
    const eventToRestore = chronologicalEvents.find((item) => item.id === entry.eventId);
    if (!eventToRestore) {
      setActivityError("Événement introuvable.");
      return;
    }

    setRestoringActivityId(entry.id);
    setActivityError(null);

    try {
      if (entry.actionType === "event_date_changed" || entry.actionType === "event_date_restored") {
        const previousDate = typeof entry.previousValue?.date === "string" ? entry.previousValue.date : null;
        if (!previousDate) throw new Error("Ancienne date introuvable.");
        await updateEventDate(eventToRestore, previousDate, "Date restaurée");
      } else if (entry.actionType === "event_time_changed" || entry.actionType === "event_time_restored") {
        const field = typeof entry.previousValue?.field === "string" ? entry.previousValue.field : null;
        const previousTime = typeof entry.previousValue?.value === "string" ? entry.previousValue.value : "";
        if (!field || !["clientArrivalTime", "startTime", "endTime", "endOfDayTime"].includes(field)) {
          throw new Error("Ancien horaire introuvable.");
        }
        await updateEventTime(eventToRestore, field as EventTimeField, previousTime, "Horaire restauré");
      }

      await refreshActivityLog(entry.eventId);
    } catch (restoreError) {
      setActivityError(getUserFacingErrorMessage(restoreError, "Impossible de restaurer cette valeur."));
    } finally {
      setRestoringActivityId(null);
    }
  }

  function openEvent(id: string) {
    setSelectedId(id);
    setScreen("detail");
    setSearchOpen(false);
    setYearOverviewOpen(false);
  }

  function changeMonth(delta: number) {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + delta, 1);
    setVisibleMonth(nextMonth);
    setSelectedDateKey(getPreferredDateKeyForMonth(nextMonth, events));
  }

  function goToday() {
    const now = new Date();
    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDateKey(formatDateKey(now));
    setScreen("calendar");
  }

  function selectYearOverviewMonth(year: number, monthIndex: number) {
    const now = new Date();
    const nextMonth = new Date(year, monthIndex, 1);
    setVisibleMonth(nextMonth);
    setSelectedDateKey(
      year === now.getFullYear() && monthIndex === now.getMonth()
        ? formatDateKey(now)
        : `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`,
    );
    setYearOverviewOpen(false);
    setScreen("calendar");
  }

  function navigateEvent(delta: -1 | 1) {
    const nextEvent = chronologicalEvents[selectedEventIndex + delta];
    if (!nextEvent) return;
    setSelectedId(nextEvent.id);
  }

  const startTimelineTimeEditing = useCallback((saveTime: () => Promise<void>) => {
    console.log("Timeline keyboard accessory: timeline input focused");
    timelineTimeSaveRef.current = saveTime;
    setIsTimelineTimeEditing(true);
  }, []);

  const endTimelineTimeEditing = useCallback(() => {
    timelineTimeSaveRef.current = null;
    setIsTimelineTimeEditing(false);
  }, []);

  const confirmTimelineTimeEdit = useCallback(async () => {
    console.log("Timeline keyboard accessory: OK tapped");
    await timelineTimeSaveRef.current?.();
  }, []);

  function openQuoteImport(file: File | null = null) {
    setQuoteImportFile(file);
    setQuoteImportOpen(true);
    setCreateMenuOpen(false);
  }

  function openNativeMstvIcsImport() {
    if (!permissions.canManageEvents) return;
    setNativeMstvIcsImportOpen(true);
    setCreateMenuOpen(false);
  }

  async function createEvent(input: CreateEventInput) {
    assertCanManageEvents();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const normalizedInput = normalizeEventTimeInput(input);
    const eventId = createLocalId();
    const eventInsertPayload: Database["public"]["Tables"]["events"]["Insert"] = {
      id: eventId,
      client_name: normalizedInput.clientName,
      event_name: normalizedInput.eventName,
      date: normalizedInput.date,
      client_arrival_time: normalizedInput.clientArrivalTime || null,
      start_time: normalizedInput.startTime || null,
      end_time: normalizedInput.endTime || null,
      end_of_day_time: normalizedInput.endOfDayTime || null,
      quote_reference: normalizedInput.quoteReference?.trim() || null,
      quote_version: normalizedInput.quoteVersion?.trim() || null,
      source_quote_text: normalizedInput.sourceQuoteText?.trim() || null,
      last_quote_imported_at: normalizedInput.sourceQuoteText || normalizedInput.quoteReference ? new Date().toISOString() : null,
    };
    const optionDefinitions = uniqueLabels(normalizedInput.optionLabels ?? []).map((label) => {
      const defaultOption = defaultOptions.find((option) => normalizeLabel(option.label) === normalizeLabel(label));
      return {
        label,
        details: defaultOption?.details ?? "",
      };
    });
    const createdAt = new Date().toISOString();
    const activity: PendingActivityPayload = {
      eventId,
      actionType: "event_created",
      entityType: "event",
      entityId: eventId,
      description: "Événement créé",
      newValue: {
        clientName: normalizedInput.clientName,
        eventName: normalizedInput.eventName,
        date: normalizedInput.date,
      },
    };

    async function queueOfflineEventCreate() {
      const offlineOptions: EventOption[] = optionDefinitions.map((option) => ({
        id: createLocalId(),
        eventId,
        label: option.label,
        status: "incomplete",
        details: option.details,
        completedByProfileId: null,
        completedByLabel: null,
        completedByInitials: null,
        completedAt: null,
        createdAt,
        ...mapCreatorMetadata({
          created_by_profile_id: profile?.id ?? null,
          created_by_role: profile?.role ?? null,
          created_by_name: actorName,
        }),
        items: [],
      }));
      const offlineEvent: ProductionEvent = {
        id: eventId,
        clientName: normalizedInput.clientName,
        eventName: normalizedInput.eventName,
        date: normalizedInput.date,
        clientArrivalTime: normalizedInput.clientArrivalTime || null,
        startTime: normalizedInput.startTime || null,
        endTime: normalizedInput.endTime || null,
        endOfDayTime: normalizedInput.endOfDayTime || null,
        status: "Brouillon",
        deletedAt: null,
        deletedBy: null,
        quoteReference: normalizedInput.quoteReference ?? null,
        quoteVersion: normalizedInput.quoteVersion ?? null,
        sourceQuoteText: normalizedInput.sourceQuoteText ?? null,
        lastQuoteImportedAt: eventInsertPayload.last_quote_imported_at ?? null,
        importedFrom: null,
        externalImportId: null,
        createdAt,
        updatedAt: createdAt,
        options: offlineOptions,
        links: [],
        documentGroups: [],
      };

      setEvents((current) => [...current, offlineEvent].sort((a, b) => eventSortValue(a) - eventSortValue(b)));
      setSelectedId(eventId);
      setSelectedDateKey(normalizedInput.date);
      setVisibleMonth(new Date(`${normalizedInput.date}T12:00:00`));
      setScreen("detail");

      await enqueuePendingSyncAction({
        actionType: "event_insert",
        entityType: "event",
        entityId: eventId,
        payload: { values: eventInsertPayload, activity },
      });
      for (const option of offlineOptions) {
        await enqueuePendingSyncAction({
          actionType: "option_insert",
          entityType: "option",
          entityId: option.id,
          payload: {
            values: {
              id: option.id,
              event_id: eventId,
              label: option.label,
              status: option.status,
              details: option.details,
              created_by_profile_id: option.createdByProfileId,
              created_by_role: option.createdByRole,
              created_by_name: option.createdByName,
            } satisfies Database["public"]["Tables"]["event_options"]["Insert"],
          },
        });
      }
    }

    if (!online) {
      await queueOfflineEventCreate();
      return;
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert(eventInsertPayload)
      .select()
      .single();

    if (eventError) {
      if (isNetworkOrUnavailableError(eventError)) {
        await queueOfflineEventCreate();
        return;
      }
      throw eventError;
    }

    let insertedOptions: EventOptionRow[] = [];

    if (optionDefinitions.length > 0) {
      const { data, error: optionError } = await supabase
        .from("event_options")
        .insert(
          optionDefinitions.map((option) => ({
            event_id: event.id,
            label: option.label,
            status: "incomplete" as CompletionStatus,
            details: option.details,
            ...getCreatorInsertPayload(profile),
          })),
        )
        .select();

      if (optionError) throw optionError;
      insertedOptions = data ?? [];
    }

    const defaultOptionItems = insertedOptions.flatMap((option) => {
      const defaultOption = optionDefinitions.find((item) => item.label === option.label);
      return splitStoredDetails(defaultOption?.details ?? "").map((label) => ({
        option_id: option.id,
        label,
        ...getCreatorInsertPayload(profile),
      }));
    });

    if (defaultOptionItems.length > 0) {
      const { error: optionItemError } = await supabase.from("event_option_items").insert(defaultOptionItems);
      if (optionItemError) throw optionItemError;
    }

    await logEventActivity({
      eventId: event.id,
      actionType: "event_created",
      entityType: "event",
      entityId: event.id,
      description: "Événement créé",
      newValue: {
        clientName: normalizedInput.clientName,
        eventName: normalizedInput.eventName,
        date: normalizedInput.date,
      },
    });

    if (normalizedInput.sourceQuoteText || normalizedInput.quoteReference) {
      await logEventActivity({
        eventId: event.id,
        actionType: "quote_imported",
        entityType: "event",
        entityId: event.id,
        description: "Devis importé",
        newValue: {
          quoteReference: normalizedInput.quoteReference ?? null,
          quoteVersion: normalizedInput.quoteVersion ?? null,
        },
      });
    }

    await reloadData(event.id);
    setSelectedDateKey(event.date);
    setVisibleMonth(new Date(`${event.date}T12:00:00`));
    setScreen("detail");
  }

  async function importNativeMstvIcsEvents(reviewEvents: NativeMstvIcsReviewEvent[]) {
    assertCanManageEvents();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const importableEvents = reviewEvents.filter((event) => !event.skipped);
    if (importableEvents.length === 0) return { importedCount: 0, skippedCount: reviewEvents.length };

    let firstImportedEvent: EventRow | null = null;
    let importedCount = 0;
    let duplicateCount = 0;

    for (const event of importableEvents) {
      const { data, error: eventError } = await supabase
        .from("events")
        .insert({
          client_name: event.clientName,
          event_name: event.eventName,
          date: event.date,
          client_arrival_time: null,
          start_time: event.startTime || null,
          end_time: event.endTime || null,
          end_of_day_time: null,
          imported_from: nativeMstvIcsImportSource,
          external_import_id: event.externalImportId,
        })
        .select()
        .single();

      if (eventError) {
        if (eventError.code === "23505") {
          duplicateCount += 1;
          continue;
        }
        throw eventError;
      }

      importedCount += 1;
      firstImportedEvent = firstImportedEvent ?? data;

      await logEventActivity({
        eventId: data.id,
        actionType: "event_imported_from_apple_ics",
        entityType: "event",
        entityId: data.id,
        description: "Événement importé depuis calendrier Apple",
        newValue: {
          source: nativeMstvIcsImportSource,
          externalImportId: event.externalImportId,
          sourceTitle: event.sourceTitle,
          location: event.location,
          description: event.description,
        },
      });
    }

    await reloadData(firstImportedEvent?.id ?? undefined);
    if (firstImportedEvent) {
      setSelectedDateKey(firstImportedEvent.date);
      setVisibleMonth(new Date(`${firstImportedEvent.date}T12:00:00`));
      setScreen("detail");
    }

    return {
      importedCount,
      skippedCount: reviewEvents.filter((event) => event.skipped).length + duplicateCount,
    };
  }

  async function updateEvent(event: ProductionEvent, input: CreateEventInput, nextScreen: Screen = "calendar") {
    assertCanManageEvents();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const normalizedInput = normalizeEventTimeInput(input);
    const updatePayload = {
      client_name: normalizedInput.clientName,
      event_name: normalizedInput.eventName,
      date: normalizedInput.date,
      client_arrival_time: normalizedInput.clientArrivalTime || null,
      start_time: normalizedInput.startTime || null,
      end_time: normalizedInput.endTime || null,
      end_of_day_time: normalizedInput.endOfDayTime || null,
    };

    const { data, error: updateError } = await supabase
      .from("events")
      .update(updatePayload)
      .eq("id", event.id)
      .select()
      .single();

    if (updateError) throw updateError;

    const updatedEvent: ProductionEvent = {
      ...event,
      clientName: data.client_name,
      eventName: data.event_name,
      date: data.date,
      clientArrivalTime: toTimeInputValue(data.client_arrival_time) || null,
      startTime: toTimeInputValue(data.start_time) || null,
      endTime: toTimeInputValue(data.end_time) || null,
      endOfDayTime: toTimeInputValue(data.end_of_day_time) || null,
      status: data.status,
      deletedAt: data.deleted_at ?? null,
      deletedBy: data.deleted_by ?? null,
      quoteReference: data.quote_reference ?? null,
      quoteVersion: data.quote_version ?? null,
      sourceQuoteText: data.source_quote_text ?? null,
      lastQuoteImportedAt: data.last_quote_imported_at ?? null,
      importedFrom: data.imported_from ?? null,
      externalImportId: data.external_import_id ?? null,
      updatedAt: data.updated_at,
    };

    setEvents((current) => current.map((item) => (item.id === event.id ? updatedEvent : item)));
    setSelectedId(updatedEvent.id);
    setSelectedDateKey(updatedEvent.date);
    setVisibleMonth(new Date(`${updatedEvent.date}T12:00:00`));
    setScreen(nextScreen);

    if (event.date !== updatedEvent.date) {
      await logEventActivity({
        eventId: event.id,
        actionType: "event_date_changed",
        entityType: "event",
        entityId: event.id,
        description: "Date modifiée",
        previousValue: { date: event.date },
        newValue: { date: updatedEvent.date },
      });
    }

    for (const field of ["clientArrivalTime", "startTime", "endTime", "endOfDayTime"] as EventTimeField[]) {
      const previousValue = toTimeInputValue(event[field]) || null;
      const nextValue = toTimeInputValue(updatedEvent[field]) || null;
      if (previousValue === nextValue) continue;

      await logEventActivity({
        eventId: event.id,
        actionType: "event_time_changed",
        entityType: "event",
        entityId: event.id,
        description: `Horaire modifié · ${getEventTimeFieldLabel(field)}`,
        previousValue: { field, value: previousValue },
        newValue: { field, value: nextValue },
      });
    }
  }

  async function updateEventFromQuote(event: ProductionEvent, input: CreateEventInput) {
    assertCanManageEvents();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const normalizedInput = normalizeEventTimeInput(input);
    const importTimestamp = new Date().toISOString();
    const updatePayload: Database["public"]["Tables"]["events"]["Update"] = {
      client_name: normalizedInput.clientName,
      event_name: normalizedInput.eventName,
      date: normalizedInput.date,
      client_arrival_time: normalizedInput.clientArrivalTime || null,
      start_time: normalizedInput.startTime || null,
      end_time: normalizedInput.endTime || null,
      end_of_day_time: normalizedInput.endOfDayTime || null,
      quote_reference: normalizedInput.quoteReference?.trim() || event.quoteReference,
      quote_version: normalizedInput.quoteVersion?.trim() || event.quoteVersion,
      source_quote_text: normalizedInput.sourceQuoteText?.trim() || event.sourceQuoteText,
      last_quote_imported_at: importTimestamp,
    };

    const { error: updateError } = await supabase.from("events").update(updatePayload).eq("id", event.id);
    if (updateError) throw updateError;

    const existingOptionKeys = new Set(event.options.map((option) => normalizeLabel(option.label)));
    const optionLabelsToAdd = uniqueLabels(normalizedInput.optionLabels ?? []).filter((label) => !existingOptionKeys.has(normalizeLabel(label)));

    if (optionLabelsToAdd.length > 0) {
      const { data: insertedOptions, error: optionError } = await supabase
        .from("event_options")
        .insert(
          optionLabelsToAdd.map((label) => {
            const defaultOption = defaultOptions.find((option) => normalizeLabel(option.label) === normalizeLabel(label));
            return {
              event_id: event.id,
              label,
              status: "incomplete" as CompletionStatus,
              details: defaultOption?.details ?? "",
              ...getCreatorInsertPayload(profile),
            };
          }),
        )
        .select();

      if (optionError) throw optionError;

      const defaultOptionItems = (insertedOptions ?? []).flatMap((option) => {
        const defaultOption = defaultOptions.find((item) => normalizeLabel(item.label) === normalizeLabel(option.label));
        return splitStoredDetails(defaultOption?.details ?? "").map((label) => ({
          option_id: option.id,
          label,
          ...getCreatorInsertPayload(profile),
        }));
      });

      if (defaultOptionItems.length > 0) {
        const { error: optionItemError } = await supabase.from("event_option_items").insert(defaultOptionItems);
        if (optionItemError) throw optionItemError;
      }

      for (const label of optionLabelsToAdd) {
        await logEventActivity({
          eventId: event.id,
          actionType: "option_added_from_quote",
          entityType: "option",
          entityId: null,
          description: `Option ${label} ajoutée via devis`,
          newValue: { label },
        });
      }
    }

    await logEventActivity({
      eventId: event.id,
      actionType: "quote_event_updated",
      entityType: "event",
      entityId: event.id,
      description: "Événement mis à jour depuis un nouveau devis",
      previousValue: {
        clientName: event.clientName,
        eventName: event.eventName,
        date: event.date,
        clientArrivalTime: event.clientArrivalTime,
        startTime: event.startTime,
        endTime: event.endTime,
        endOfDayTime: event.endOfDayTime,
        quoteReference: event.quoteReference,
        quoteVersion: event.quoteVersion,
      },
      newValue: {
        clientName: normalizedInput.clientName,
        eventName: normalizedInput.eventName,
        date: normalizedInput.date,
        clientArrivalTime: normalizedInput.clientArrivalTime || null,
        startTime: normalizedInput.startTime || null,
        endTime: normalizedInput.endTime || null,
        endOfDayTime: normalizedInput.endOfDayTime || null,
        quoteReference: updatePayload.quote_reference ?? null,
        quoteVersion: updatePayload.quote_version ?? null,
        addedOptions: optionLabelsToAdd,
      },
    });

    await logEventActivity({
      eventId: event.id,
      actionType: "quote_imported",
      entityType: "event",
      entityId: event.id,
      description: "Devis importé",
      newValue: {
        quoteReference: updatePayload.quote_reference ?? null,
        quoteVersion: updatePayload.quote_version ?? null,
      },
    });

    await reloadData(event.id);
    setSelectedDateKey(normalizedInput.date);
    setVisibleMonth(new Date(`${normalizedInput.date}T12:00:00`));
    setSelectedId(event.id);
    setScreen("detail");
  }

  async function duplicateEventToDate(sourceEvent: ProductionEvent, nextDate: string) {
    assertCanManageEvents();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    if (sourceEvent.deletedAt) {
      throw new Error("Impossible de dupliquer un événement supprimé.");
    }

    const normalizedDate = nextDate.trim();
    if (!normalizedDate) {
      throw new Error("La nouvelle date est obligatoire.");
    }

    const { data: duplicatedEvent, error: eventError } = await supabase
      .from("events")
      .insert({
        client_name: sourceEvent.clientName,
        event_name: sourceEvent.eventName,
        date: normalizedDate,
        client_arrival_time: sourceEvent.clientArrivalTime || null,
        start_time: sourceEvent.startTime || null,
        end_time: sourceEvent.endTime || null,
        end_of_day_time: sourceEvent.endOfDayTime || null,
        status: sourceEvent.status,
      })
      .select()
      .single();

    if (eventError) throw eventError;

    for (const option of sourceEvent.options) {
      const { data: duplicatedOption, error: optionError } = await supabase
        .from("event_options")
        .insert({
          event_id: duplicatedEvent.id,
          label: option.label,
          status: option.status,
          details: option.details,
          completed_by_profile_id: option.completedByProfileId,
          completed_by_label: option.completedByLabel,
          completed_by_initials: option.completedByInitials,
          completed_at: option.completedAt,
          ...getCreatorInsertPayload(profile),
        })
        .select()
        .single();

      if (optionError) throw optionError;

      if (option.items.length > 0) {
        const { error: optionItemsError } = await supabase.from("event_option_items").insert(
          option.items.map((item) => ({
            option_id: duplicatedOption.id,
            label: item.label,
            ...getCreatorInsertPayload(profile),
          })),
        );

        if (optionItemsError) throw optionItemsError;
      }
    }

    for (const link of sourceEvent.links) {
      const { data: duplicatedLink, error: linkError } = await supabase
        .from("event_links")
        .insert({
          event_id: duplicatedEvent.id,
          label: link.label,
          url: link.url,
          stream_key: link.streamKey,
          status: link.status,
          ...getCreatorInsertPayload(profile),
        })
        .select()
        .single();

      if (linkError) throw linkError;

      const entriesToDuplicate =
        link.entries.length > 0
          ? link.entries
          : link.url || link.streamKey
            ? [
                {
                  id: "",
                  linkId: link.id,
                  url: link.url,
                  streamKey: link.streamKey,
                  position: 0,
                  createdAt: link.createdAt,
                },
              ]
            : [];

      if (entriesToDuplicate.length > 0) {
        const { error: linkEntriesError } = await supabase.from("event_link_entries").insert(
          entriesToDuplicate.map((entry, position) => ({
            link_id: duplicatedLink.id,
            url: entry.url,
            stream_key: entry.streamKey,
            position: entry.position ?? position,
            ...getCreatorInsertPayload(profile),
          })),
        );

        if (linkEntriesError) throw linkEntriesError;
      }
    }

    if (sourceEvent.documentGroups.length > 0) {
      const { error: documentGroupsError } = await supabase.from("event_document_groups").insert(
        sourceEvent.documentGroups.map((group) => ({
          event_id: duplicatedEvent.id,
          label: group.label,
          ...getCreatorInsertPayload(profile),
        })),
      );

      if (documentGroupsError) throw documentGroupsError;
    }

    await logEventActivity({
      eventId: duplicatedEvent.id,
      actionType: "event_duplicated",
      entityType: "event",
      entityId: duplicatedEvent.id,
      description: `Événement dupliqué depuis ${formatFullDate(sourceEvent.date)}`,
      previousValue: {
        eventId: sourceEvent.id,
        date: sourceEvent.date,
      },
      newValue: {
        date: normalizedDate,
      },
    });

    await reloadData(duplicatedEvent.id);
    setSelectedDateKey(normalizedDate);
    setVisibleMonth(new Date(`${normalizedDate}T12:00:00`));
    setScreen("detail");
  }

  async function updateEventTime(event: ProductionEvent, field: EventTimeField, value: string, activityDescription = "Horaire modifié") {
    assertCanManageEvents();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const columnByField: Record<EventTimeField, "client_arrival_time" | "start_time" | "end_time" | "end_of_day_time"> = {
      clientArrivalTime: "client_arrival_time",
      startTime: "start_time",
      endTime: "end_time",
      endOfDayTime: "end_of_day_time",
    };
    const nextValue = normalizeCompactTimeInput(value) || null;
    const previousValue = toTimeInputValue(event[field]) || null;
    const column = columnByField[field];
    const updatePayload: Database["public"]["Tables"]["events"]["Update"] = {
      [column]: nextValue,
    };
    const optimisticUpdatedAt = new Date().toISOString();

    function applyOptimisticUpdate(updatedValue: string | null, updatedAt: string) {
      setEvents((current) =>
        current.map((item) =>
          item.id === event.id
            ? {
                ...item,
                [field]: updatedValue,
                updatedAt,
              }
            : item,
        ),
      );
    }

    const activity: PendingActivityPayload | null =
      previousValue !== nextValue
        ? {
            eventId: event.id,
            actionType: "event_time_changed",
            entityType: "event",
            entityId: event.id,
            description: `${activityDescription} · ${getEventTimeFieldLabel(field)}`,
            previousValue: { field, value: previousValue },
            newValue: { field, value: nextValue },
          }
        : null;

    if (!online) {
      applyOptimisticUpdate(nextValue, optimisticUpdatedAt);
      await enqueuePendingSyncAction({
        actionType: "event_update",
        entityType: "event",
        entityId: event.id,
        payload: { values: updatePayload, activity },
      });
      return;
    }

    const { data, error: updateError } = await supabase.from("events").update(updatePayload).eq("id", event.id).select().single();

    if (updateError) {
      if (isNetworkOrUnavailableError(updateError)) {
        applyOptimisticUpdate(nextValue, optimisticUpdatedAt);
        await enqueuePendingSyncAction({
          actionType: "event_update",
          entityType: "event",
          entityId: event.id,
          payload: { values: updatePayload, activity },
        });
        return;
      }
      throw updateError;
    }

    const updatedValue = toTimeInputValue(data[column]) || null;

    setEvents((current) =>
      current.map((item) =>
        item.id === event.id
          ? {
              ...item,
              clientArrivalTime: toTimeInputValue(data.client_arrival_time) || null,
              startTime: toTimeInputValue(data.start_time) || null,
              endTime: toTimeInputValue(data.end_time) || null,
              endOfDayTime: toTimeInputValue(data.end_of_day_time) || null,
              updatedAt: data.updated_at,
            }
          : item,
      ),
    );

    if (previousValue !== updatedValue) {
      await logEventActivity({
        eventId: event.id,
        actionType: "event_time_changed",
        entityType: "event",
        entityId: event.id,
        description: `${activityDescription} · ${getEventTimeFieldLabel(field)}`,
        previousValue: { field, value: previousValue },
        newValue: { field, value: updatedValue },
      });
    }
  }

  async function updateEventDate(event: ProductionEvent, nextDate: string, activityDescription = "Date modifiée") {
    assertCanManageEvents();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const normalizedDate = nextDate.trim();
    if (!normalizedDate) {
      throw new Error("La date est obligatoire.");
    }

    const optimisticUpdatedAt = new Date().toISOString();
    const updatePayload: Database["public"]["Tables"]["events"]["Update"] = { date: normalizedDate };
    const activity: PendingActivityPayload | null =
      event.date !== normalizedDate
        ? {
            eventId: event.id,
            actionType: "event_date_changed",
            entityType: "event",
            entityId: event.id,
            description: activityDescription,
            previousValue: { date: event.date },
            newValue: { date: normalizedDate },
          }
        : null;

    function applyOptimisticDate(date: string, updatedAt: string) {
      setEvents((current) =>
        current.map((item) =>
          item.id === event.id
            ? {
                ...item,
                date,
                updatedAt,
              }
            : item,
        ),
      );
      setSelectedId(event.id);
      setSelectedDateKey(date);
      setVisibleMonth(new Date(`${date}T12:00:00`));
      setScreen("detail");
    }

    if (!online) {
      applyOptimisticDate(normalizedDate, optimisticUpdatedAt);
      await enqueuePendingSyncAction({
        actionType: "event_update",
        entityType: "event",
        entityId: event.id,
        payload: { values: updatePayload, activity },
      });
      return;
    }

    const { data, error: updateError } = await supabase.from("events").update(updatePayload).eq("id", event.id).select().single();

    if (updateError) {
      if (isNetworkOrUnavailableError(updateError)) {
        applyOptimisticDate(normalizedDate, optimisticUpdatedAt);
        await enqueuePendingSyncAction({
          actionType: "event_update",
          entityType: "event",
          entityId: event.id,
          payload: { values: updatePayload, activity },
        });
        return;
      }
      throw updateError;
    }

    setEvents((current) =>
      current.map((item) =>
        item.id === event.id
          ? {
              ...item,
              date: data.date,
              updatedAt: data.updated_at,
            }
          : item,
      ),
    );
    setSelectedId(event.id);
    setSelectedDateKey(data.date);
    setVisibleMonth(new Date(`${data.date}T12:00:00`));
    setScreen("detail");

    if (event.date !== data.date) {
      await logEventActivity({
        eventId: event.id,
        actionType: "event_date_changed",
        entityType: "event",
        entityId: event.id,
        description: activityDescription,
        previousValue: { date: event.date },
        newValue: { date: data.date },
      });
    }
  }

  async function toggleOption(option: EventOption) {
    assertCanManageOperational();
    if (!supabase) return;
    const nextStatus: CompletionStatus = option.status === "completed" ? "incomplete" : "completed";
    const completerInitials = getCompleterInitials(profile, authSession?.user.email);
    const completerLabel = getCompleterLabel(profile, authSession?.user.email);
    const completedAt = new Date().toISOString();
    const updatePayload: Database["public"]["Tables"]["event_options"]["Update"] =
      nextStatus === "completed"
        ? {
            status: nextStatus,
            completed_by_profile_id: profile?.id ?? null,
            completed_by_label: completerLabel,
            completed_by_initials: completerInitials,
            completed_at: completedAt,
          }
        : {
            status: nextStatus,
            completed_by_profile_id: null,
            completed_by_label: null,
            completed_by_initials: null,
            completed_at: null,
          };
    function applyOptimisticOption() {
      setEvents((current) =>
      current.map((event) =>
        event.id === option.eventId
          ? {
              ...event,
              options: event.options.map((item) =>
                item.id === option.id
                  ? {
                      ...item,
                      status: nextStatus,
                      completedByProfileId: updatePayload.completed_by_profile_id ?? null,
                      completedByLabel: updatePayload.completed_by_label ?? null,
                      completedByInitials: updatePayload.completed_by_initials ?? null,
                      completedAt: updatePayload.completed_at ?? null,
                    }
                  : item,
              ),
            }
        : event,
      ),
      );
    }

    const description =
      nextStatus === "completed"
        ? `Option ${option.label} marquée comme Fait par ${completerLabel ?? completerInitials}`
        : `Option ${option.label} repassée À faire`;
    const activity: PendingActivityPayload = {
      eventId: option.eventId,
      actionType: "option_status_changed",
      entityType: "option",
      entityId: option.id,
      description,
      previousValue: {
        status: option.status,
        completedByProfileId: option.completedByProfileId,
        completedByLabel: option.completedByLabel,
        completedByInitials: option.completedByInitials,
        completedAt: option.completedAt,
      },
      newValue: {
        status: nextStatus,
        completedByProfileId: updatePayload.completed_by_profile_id ?? null,
        completedByLabel: updatePayload.completed_by_label ?? null,
        completedByInitials: updatePayload.completed_by_initials ?? null,
        completedAt: updatePayload.completed_at ?? null,
      },
    };
    const parentEvent = events.find((event) => event.id === option.eventId);
    function notifyOptionCompleted() {
      if (nextStatus !== "completed") return;
      void createNotification({
        type: "option_completed",
        title: "Option marquée Fait",
        body: `${option.label}${parentEvent ? ` - ${parentEvent.clientName}` : ""}`,
        relatedEventId: option.eventId,
      });
    }

    if (!online) {
      applyOptimisticOption();
      notifyOptionCompleted();
      await enqueuePendingSyncAction({
        actionType: "option_update",
        entityType: "option",
        entityId: option.id,
        payload: { values: updatePayload, activity },
      });
      return;
    }

    const { error: updateError } = await supabase.from("event_options").update(updatePayload).eq("id", option.id);

    if (updateError) {
      if (isNetworkOrUnavailableError(updateError)) {
        applyOptimisticOption();
        notifyOptionCompleted();
        await enqueuePendingSyncAction({
          actionType: "option_update",
          entityType: "option",
          entityId: option.id,
          payload: { values: updatePayload, activity },
        });
        return;
      }
      setError(getUserFacingErrorMessage(updateError, "Impossible de modifier l'événement."));
      return;
    }

    applyOptimisticOption();
    notifyOptionCompleted();

    await logEventActivity({
      ...activity,
    });
  }

  async function updateOptionCompletedBy(option: EventOption, choice: CompletedByOverrideChoice, customLabel?: string) {
    assertCanManageEvents();
    if (!supabase) return;
    if (option.status !== "completed") return;

    let completedByProfileId: string | null = null;
    const completedByLabel = choice.value === "externe" ? customLabel?.trim() || "Externe" : choice.label;

    if (choice.value !== "externe") {
      try {
        const profiles = await fetchProfiles();
        const matchingProfile = profiles.find((userProfile) => userProfile.firstName?.trim().toLocaleLowerCase("fr-FR") === choice.label.toLocaleLowerCase("fr-FR"));
        completedByProfileId = matchingProfile?.id ?? null;
      } catch (profileLookupError) {
        console.warn("Unable to resolve completed_by profile id for override.", {
          choice,
          error: profileLookupError,
        });
      }
    }

    const updatePayload: Database["public"]["Tables"]["event_options"]["Update"] = {
      completed_by_profile_id: completedByProfileId,
      completed_by_label: completedByLabel,
      completed_by_initials: choice.initials,
    };

    const { error: updateError } = await supabase.from("event_options").update(updatePayload).eq("id", option.id);

    if (updateError) {
      setError(getUserFacingErrorMessage(updateError, "Impossible de modifier l'événement."));
      throw updateError;
    }

    setEvents((current) =>
      current.map((event) =>
        event.id === option.eventId
          ? {
              ...event,
              options: event.options.map((item) =>
                item.id === option.id
                  ? {
                      ...item,
                      completedByProfileId,
                      completedByLabel,
                      completedByInitials: choice.initials,
                    }
                  : item,
              ),
            }
          : event,
      ),
    );

    await logEventActivity({
      eventId: option.eventId,
      actionType: "option_completed_by_changed",
      entityType: "option",
      entityId: option.id,
      description: `Fait par modifié : ${completedByLabel}`,
      previousValue: {
        completedByProfileId: option.completedByProfileId,
        completedByLabel: option.completedByLabel,
        completedByInitials: option.completedByInitials,
      },
      newValue: {
        completedByProfileId,
        completedByLabel,
        completedByInitials: choice.initials,
      },
    });
  }

  async function syncEventLinkEntries(link: EventLink, drafts: LinkEntryDraft[]) {
    assertCanManageOperational();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const isPlatform = isPlatformLink(link);
    const nextDrafts = getPersistableLinkEntryDrafts(drafts, isPlatform);
    const existingEntryIds = new Set(link.entries.map((entry) => entry.id));
    const nextExistingEntryIds = new Set(nextDrafts.map((draft) => draft.id).filter((id): id is string => Boolean(id)));
    const deletedEntryIds = link.entries
      .filter((entry) => !nextExistingEntryIds.has(entry.id) && canManageLinkEntryEntity(permissions, profile, link, entry))
      .map((entry) => entry.id);
    const nextEntries: EventLinkEntry[] = [];
    const offlineDrafts = nextDrafts.map((draft) => ({ ...draft, id: draft.id || createLocalId() }));
    const offlineRows: Database["public"]["Tables"]["event_link_entries"]["Insert"][] = offlineDrafts.map((draft, position) => {
      const entryCreatorPayload = draft.legacyParentValue
        ? {
            created_by_profile_id: draft.createdByProfileId ?? null,
            created_by_role: draft.createdByRole ?? null,
            created_by_name: draft.createdByName ?? null,
          }
        : getCreatorInsertPayload(profile);
      return {
        id: draft.id,
        link_id: link.id,
        url: draft.url.trim() || null,
        stream_key: isPlatform ? draft.streamKey.trim() || null : null,
        position,
        ...entryCreatorPayload,
      };
    });
    const offlineEntries: EventLinkEntry[] = offlineRows.map((row) => ({
      id: row.id ?? createLocalId(),
      linkId: link.id,
      url: row.url ?? null,
      streamKey: row.stream_key ?? null,
      position: row.position ?? 0,
      createdAt: new Date().toISOString(),
      ...mapCreatorMetadata({
        created_by_profile_id: row.created_by_profile_id ?? null,
        created_by_role: row.created_by_role ?? null,
        created_by_name: row.created_by_name ?? null,
      }),
    }));
    const offlineStatus: LinkStatus = offlineDrafts.some((draft) => isLinkEntryDraftComplete(draft, isPlatform)) ? "available" : "missing";
    const offlineFirstEntry = offlineEntries[0] ?? null;
    const offlineLinkPayload: Database["public"]["Tables"]["event_links"]["Update"] = {
      url: offlineFirstEntry?.url ?? null,
      stream_key: isPlatform ? offlineFirstEntry?.streamKey ?? null : null,
      status: offlineStatus,
    };

    function applyOptimisticLinkEntries(updatedLink: EventLink) {
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
    }

    const offlineUpdatedLink: EventLink = {
      ...link,
      url: offlineLinkPayload.url ?? null,
      streamKey: offlineLinkPayload.stream_key ?? null,
      status: offlineStatus,
      entries: offlineEntries,
    };
    const linkActivity: PendingActivityPayload | null =
      serializeLinkEntries(link.entries, isPlatform) !== serializeLinkEntries(offlineUpdatedLink.entries, isPlatform) || link.status !== offlineStatus
        ? {
            eventId: link.eventId,
            actionType: "link_edited",
            entityType: "link",
            entityId: link.id,
            description: `Lien ${link.label} modifié`,
            previousValue: { status: link.status, entries: link.entries },
            newValue: { status: offlineStatus, entries: offlineEntries },
          }
        : null;

    if (!online) {
      applyOptimisticLinkEntries(offlineUpdatedLink);
      await enqueuePendingSyncAction({
        actionType: "link_entries_replace",
        entityType: "link",
        entityId: link.id,
        payload: {
          deletedEntryIds,
          rows: offlineRows,
          linkValues: offlineLinkPayload,
          activity: linkActivity,
        },
      });
      return offlineUpdatedLink;
    }

    if (deletedEntryIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("event_link_entries")
        .delete()
        .in("id", deletedEntryIds);

      if (deleteError) throw deleteError;
    }

    for (const [position, draft] of nextDrafts.entries()) {
      const entryPayload = {
        url: draft.url.trim() || null,
        stream_key: isPlatform ? draft.streamKey.trim() || null : null,
        position,
      };

      if (draft.id && existingEntryIds.has(draft.id)) {
        const existingEntry = link.entries.find((entry) => entry.id === draft.id);
        if (existingEntry && !canManageLinkEntryEntity(permissions, profile, link, existingEntry)) {
          nextEntries.push(existingEntry);
          continue;
        }

        const { data, error: updateEntryError } = await supabase
          .from("event_link_entries")
          .update(entryPayload)
          .eq("id", draft.id)
          .select()
          .single();

        if (updateEntryError) throw updateEntryError;
        nextEntries.push(mapEventLinkEntry(data));
      } else {
        const entryCreatorPayload = draft.legacyParentValue
          ? {
              created_by_profile_id: draft.createdByProfileId ?? null,
              created_by_role: draft.createdByRole ?? null,
              created_by_name: draft.createdByName ?? null,
            }
          : getCreatorInsertPayload(profile);
        const { data, error: insertEntryError } = await supabase
          .from("event_link_entries")
          .insert({
            link_id: link.id,
            ...entryPayload,
            ...entryCreatorPayload,
          })
          .select()
          .single();

        if (insertEntryError) throw insertEntryError;
        nextEntries.push(mapEventLinkEntry(data));
      }
    }

    const nextStatus: LinkStatus = nextDrafts.some((draft) => isLinkEntryDraftComplete(draft, isPlatform)) ? "available" : "missing";
    const firstEntry = nextEntries[0] ?? null;
    const linkPayload = {
      url: firstEntry?.url ?? null,
      stream_key: isPlatform ? firstEntry?.streamKey ?? null : null,
      status: nextStatus,
    };
    const { error: updateLinkError } = await supabase
      .from("event_links")
      .update(linkPayload)
      .eq("id", link.id);

    if (updateLinkError) {
      const debugError = {
        linkId: link.id,
        label: link.label,
        payload: linkPayload,
        errorMessage: updateLinkError.message,
        errorCode: updateLinkError.code,
        errorDetails: updateLinkError.details,
        errorHint: updateLinkError.hint,
      };
      console.error("Failed to save event link", debugError);
      console.error("Failed to save event link JSON", JSON.stringify(debugError, null, 2));
      throw updateLinkError;
    }

    const updatedLink: EventLink = {
      ...link,
      url: linkPayload.url,
      streamKey: linkPayload.stream_key,
      status: nextStatus,
      entries: nextEntries,
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

    if (serializeLinkEntries(link.entries, isPlatform) !== serializeLinkEntries(updatedLink.entries, isPlatform) || link.status !== nextStatus) {
      await logEventActivity({
        eventId: link.eventId,
        actionType: "link_edited",
        entityType: "link",
        entityId: link.id,
        description: `Lien ${link.label} modifié`,
        previousValue: { status: link.status, entries: link.entries },
        newValue: { status: nextStatus, entries: nextEntries },
      });
    }

    return updatedLink;
  }

  async function createEventOption(eventId: string, label: string) {
    assertCanManageOperational();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextLabel = formatTitleCase(label);
    if (!nextLabel) {
      throw new Error("Le nom de l'option est requis.");
    }
    const optionId = createLocalId();
    const optionInsertPayload: Database["public"]["Tables"]["event_options"]["Insert"] = {
      id: optionId,
      event_id: eventId,
      label: nextLabel,
      status: "incomplete",
      details: null,
      ...getCreatorInsertPayload(profile),
    };

    function buildOptimisticOption(): EventOption {
      return {
        id: optionId,
        eventId,
        label: nextLabel,
        status: "incomplete",
        details: null,
        completedByProfileId: null,
        completedByLabel: null,
        completedByInitials: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
        ...mapCreatorMetadata({
          created_by_profile_id: optionInsertPayload.created_by_profile_id ?? null,
          created_by_role: optionInsertPayload.created_by_role ?? null,
          created_by_name: optionInsertPayload.created_by_name ?? null,
        }),
        items: [],
      };
    }

    function applyOptimisticOption(option: EventOption) {
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
    }

    if (!online) {
      const option = buildOptimisticOption();
      applyOptimisticOption(option);
      await enqueuePendingSyncAction({
        actionType: "option_insert",
        entityType: "option",
        entityId: option.id,
        payload: {
          values: optionInsertPayload,
          activity: {
            eventId,
            actionType: "option_created",
            entityType: "option",
            entityId: option.id,
            description: `Option ${option.label} ajoutée`,
            newValue: { label: option.label, status: option.status },
          } satisfies PendingActivityPayload,
        },
      });
      return option;
    }

    const { data, error: insertError } = await supabase
      .from("event_options")
      .insert(optionInsertPayload)
      .select()
      .single();

    if (insertError) {
      if (isNetworkOrUnavailableError(insertError)) {
        const option = buildOptimisticOption();
        applyOptimisticOption(option);
        await enqueuePendingSyncAction({
          actionType: "option_insert",
          entityType: "option",
          entityId: option.id,
          payload: { values: optionInsertPayload },
        });
        return option;
      }
      throw insertError;
    }

    const option: EventOption = {
      id: data.id,
      eventId: data.event_id,
      label: data.label,
      status: data.status,
      details: data.details,
      completedByProfileId: data.completed_by_profile_id ?? null,
      completedByLabel: data.completed_by_label ?? null,
      completedByInitials: data.completed_by_initials ?? null,
      completedAt: data.completed_at ?? null,
      createdAt: data.created_at,
      ...mapCreatorMetadata(data),
      items: [],
    };

    applyOptimisticOption(option);

    await logEventActivity({
      eventId,
      actionType: "option_created",
      entityType: "option",
      entityId: option.id,
      description: `Option ${option.label} ajoutée`,
      newValue: { label: option.label, status: option.status },
    });

    return option;
  }

  async function deleteEventOption(option: EventOption) {
    assertCanManageOperational();
    if (!canManageCreatedEntity(permissions, profile, option)) {
      throw new Error("Vous ne pouvez supprimer que vos propres options.");
    }
    if (!permissions.canManageEvents && option.items.some((item) => !canManageCreatedEntity(permissions, profile, item))) {
      throw new Error("Cette option contient des notes créées par un admin.");
    }
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    function applyOptimisticDelete() {
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

    const activity: PendingActivityPayload = {
      eventId: option.eventId,
      actionType: "option_deleted",
      entityType: "option",
      entityId: option.id,
      description: `Option ${option.label} supprimée`,
      previousValue: { label: option.label, status: option.status },
    };

    if (!online) {
      applyOptimisticDelete();
      await enqueuePendingSyncAction({
        actionType: "option_delete",
        entityType: "option",
        entityId: option.id,
        payload: { activity },
      });
      return;
    }

    const { error: deleteError } = await supabase.from("event_options").delete().eq("id", option.id);

    if (deleteError) {
      if (isNetworkOrUnavailableError(deleteError)) {
        applyOptimisticDelete();
        await enqueuePendingSyncAction({
          actionType: "option_delete",
          entityType: "option",
          entityId: option.id,
          payload: { activity },
        });
        return;
      }
      throw deleteError;
    }

    applyOptimisticDelete();

    await logEventActivity({
      ...activity,
    });
  }

  async function renameEventOption(option: EventOption, label: string) {
    assertCanManageOperational();
    if (!canManageCreatedEntity(permissions, profile, option)) {
      throw new Error("Vous ne pouvez renommer que vos propres options.");
    }
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextLabel = formatTitleCase(label);
    if (!nextLabel || nextLabel === option.label) return option;
    const updatePayload: Database["public"]["Tables"]["event_options"]["Update"] = { label: nextLabel };
    const updatedOption = { ...option, label: nextLabel };

    function applyOptimisticRename() {
      setEvents((current) =>
        current.map((event) =>
          event.id === option.eventId
            ? {
                ...event,
                options: event.options.map((item) => (item.id === option.id ? updatedOption : item)),
              }
            : event,
        ),
      );
    }

    const activity: PendingActivityPayload = {
      eventId: option.eventId,
      actionType: "option_renamed",
      entityType: "option",
      entityId: option.id,
      description: `Option ${option.label} renommée`,
      previousValue: { label: option.label },
      newValue: { label: nextLabel },
    };

    if (!online) {
      applyOptimisticRename();
      await enqueuePendingSyncAction({
        actionType: "option_update",
        entityType: "option",
        entityId: option.id,
        payload: { values: updatePayload, activity },
      });
      return updatedOption;
    }

    const { error: updateError } = await supabase
      .from("event_options")
      .update(updatePayload)
      .eq("id", option.id);

    if (updateError) {
      if (isNetworkOrUnavailableError(updateError)) {
        applyOptimisticRename();
        await enqueuePendingSyncAction({
          actionType: "option_update",
          entityType: "option",
          entityId: option.id,
          payload: { values: updatePayload, activity },
        });
        return updatedOption;
      }
      throw updateError;
    }

    applyOptimisticRename();

    await logEventActivity({
      eventId: option.eventId,
      actionType: "option_renamed",
      entityType: "option",
      entityId: option.id,
      description: `Option ${option.label} renommée`,
      previousValue: { label: option.label },
      newValue: { label: nextLabel },
    });

    return updatedOption;
  }

  async function createEventOptionItem(option: EventOption, label: string) {
    assertCanManageOperational();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextLabel = label.trim();
    if (!nextLabel) {
      throw new Error("La note est requise.");
    }
    const localItemId = createLocalId();
    const creatorPayload = getCreatorInsertPayload(profile);
    const insertPayload: Database["public"]["Tables"]["event_option_items"]["Insert"] = {
      id: localItemId,
      option_id: option.id,
      label: nextLabel,
      ...creatorPayload,
    };

    function applyOptimisticItem(optionItem: EventOptionItem) {
      setEvents((current) =>
        current.map((event) =>
          event.id === option.eventId
            ? {
                ...event,
                options: event.options.map((item) =>
                  item.id === option.id
                    ? {
                        ...item,
                        items: [...item.items, optionItem],
                      }
                    : item,
                ),
              }
            : event,
        ),
      );
    }
    function notifyOptionNoteAdded() {
      void createNotification({
        type: "option_note_added",
        title: "Note ajoutée",
        body: `${option.label}: ${nextLabel.length > 64 ? `${nextLabel.slice(0, 61)}...` : nextLabel}`,
        relatedEventId: option.eventId,
      });
    }

    if (!online) {
      const optionItem: EventOptionItem = {
        id: localItemId,
        optionId: option.id,
        label: nextLabel,
        createdAt: new Date().toISOString(),
        ...mapCreatorMetadata({
          created_by_profile_id: creatorPayload.created_by_profile_id ?? null,
          created_by_role: creatorPayload.created_by_role ?? null,
          created_by_name: creatorPayload.created_by_name ?? null,
        }),
      };
      applyOptimisticItem(optionItem);
      notifyOptionNoteAdded();
      await enqueuePendingSyncAction({
        actionType: "option_item_insert",
        entityType: "option_item",
        entityId: localItemId,
        payload: { values: insertPayload },
      });
      return optionItem;
    }

    const { data, error: insertError } = await supabase
      .from("event_option_items")
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      if (isNetworkOrUnavailableError(insertError)) {
        const optionItem: EventOptionItem = {
          id: localItemId,
          optionId: option.id,
          label: nextLabel,
          createdAt: new Date().toISOString(),
          ...mapCreatorMetadata({
            created_by_profile_id: creatorPayload.created_by_profile_id ?? null,
            created_by_role: creatorPayload.created_by_role ?? null,
            created_by_name: creatorPayload.created_by_name ?? null,
          }),
        };
        applyOptimisticItem(optionItem);
        notifyOptionNoteAdded();
        await enqueuePendingSyncAction({
          actionType: "option_item_insert",
          entityType: "option_item",
          entityId: localItemId,
          payload: { values: insertPayload },
        });
        return optionItem;
      }
      console.error("Failed to create event_option_items row", {
        optionId: option.id,
        label: nextLabel,
        error: insertError,
      });
      if (insertError.code === "PGRST205" || insertError.code === "42P01") {
        throw new Error("Table Supabase event_option_items manquante. Applique la migration 002_event_option_items.sql.");
      }
      throw insertError;
    }

    const optionItem = mapEventOptionItem(data);

    applyOptimisticItem(optionItem);
    notifyOptionNoteAdded();

    return optionItem;
  }

  async function deleteEventOptionItem(option: EventOption, optionItem: EventOptionItem) {
    assertCanManageOperational();
    if (!canManageCreatedEntity(permissions, profile, optionItem)) {
      throw new Error("Vous ne pouvez supprimer que vos propres notes.");
    }
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    function applyOptimisticDelete() {
      setEvents((current) =>
        current.map((event) =>
          event.id === option.eventId
            ? {
                ...event,
                options: event.options.map((item) =>
                  item.id === option.id
                    ? {
                        ...item,
                        items: item.items.filter((detailItem) => detailItem.id !== optionItem.id),
                      }
                    : item,
                ),
              }
            : event,
        ),
      );
    }

    if (!online) {
      applyOptimisticDelete();
      await enqueuePendingSyncAction({
        actionType: "option_item_delete",
        entityType: "option_item",
        entityId: optionItem.id,
        payload: {},
      });
      return;
    }

    const { error: deleteError } = await supabase.from("event_option_items").delete().eq("id", optionItem.id);

    if (deleteError) {
      if (isNetworkOrUnavailableError(deleteError)) {
        applyOptimisticDelete();
        await enqueuePendingSyncAction({
          actionType: "option_item_delete",
          entityType: "option_item",
          entityId: optionItem.id,
          payload: {},
        });
        return;
      }
      console.error("Failed to delete event_option_items row", {
        optionId: option.id,
        itemId: optionItem.id,
        error: deleteError,
      });
      if (deleteError.code === "PGRST205" || deleteError.code === "42P01") {
        throw new Error("Table Supabase event_option_items manquante. Applique la migration 002_event_option_items.sql.");
      }
      throw deleteError;
    }

    applyOptimisticDelete();

  }

  async function updateEventOptionItem(option: EventOption, optionItem: EventOptionItem, label: string) {
    assertCanManageOperational();
    if (!canManageCreatedEntity(permissions, profile, optionItem)) {
      throw new Error("Vous ne pouvez modifier que vos propres notes.");
    }
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextLabel = label.trim();
    if (!nextLabel) {
      throw new Error("La note ne peut pas être vide.");
    }
    if (nextLabel === optionItem.label) return optionItem;

    const updatePayload: Database["public"]["Tables"]["event_option_items"]["Update"] = {
      label: nextLabel,
    };
    const updatedItem: EventOptionItem = {
      ...optionItem,
      label: nextLabel,
    };
    const activity: PendingActivityPayload = {
      eventId: option.eventId,
      actionType: "option_item_updated",
      entityType: "option_item",
      entityId: optionItem.id,
      description: "Note modifiée",
      previousValue: { label: optionItem.label },
      newValue: { label: nextLabel },
    };

    function applyOptimisticUpdate() {
      setEvents((current) =>
        current.map((event) =>
          event.id === option.eventId
            ? {
                ...event,
                options: event.options.map((item) =>
                  item.id === option.id
                    ? {
                        ...item,
                        items: item.items.map((detailItem) => (detailItem.id === optionItem.id ? updatedItem : detailItem)),
                      }
                    : item,
                ),
              }
            : event,
        ),
      );
    }

    if (!online) {
      applyOptimisticUpdate();
      await enqueuePendingSyncAction({
        actionType: "option_item_update",
        entityType: "option_item",
        entityId: optionItem.id,
        payload: { values: updatePayload, activity },
      });
      return updatedItem;
    }

    const { data, error: updateError } = await supabase
      .from("event_option_items")
      .update(updatePayload)
      .eq("id", optionItem.id)
      .select()
      .single();

    if (updateError) {
      if (isNetworkOrUnavailableError(updateError)) {
        applyOptimisticUpdate();
        await enqueuePendingSyncAction({
          actionType: "option_item_update",
          entityType: "option_item",
          entityId: optionItem.id,
          payload: { values: updatePayload, activity },
        });
        return updatedItem;
      }
      console.error("Failed to update event_option_items row", {
        optionId: option.id,
        itemId: optionItem.id,
        error: updateError,
      });
      if (updateError.code === "PGRST205" || updateError.code === "42P01") {
        throw new Error("Table Supabase event_option_items manquante. Applique la migration 002_event_option_items.sql.");
      }
      throw updateError;
    }

    const savedItem = mapEventOptionItem(data);
    applyOptimisticUpdate();

    await logEventActivity(activity);

    return savedItem;
  }

  async function createEventLink(eventId: string, input: { label: string; url: string }) {
    assertCanManageOperational();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextLabel = formatTitleCase(input.label);
    const nextUrl = input.url.trim();
    if (!nextLabel) {
      throw new Error("Le nom du lien est requis.");
    }
    const linkId = createLocalId();
    const insertPayload: Database["public"]["Tables"]["event_links"]["Insert"] = {
      id: linkId,
      event_id: eventId,
      label: nextLabel,
      url: nextUrl || null,
      status: nextUrl ? "available" : "missing",
      ...getCreatorInsertPayload(profile),
    };

    function applyOptimisticLink(link: EventLink) {
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
    }

    function buildOptimisticLink(): EventLink {
      return {
        id: linkId,
        eventId,
        label: nextLabel,
        url: nextUrl || null,
        streamKey: null,
        status: nextUrl ? "available" : "missing",
        createdAt: new Date().toISOString(),
        ...mapCreatorMetadata({
          created_by_profile_id: insertPayload.created_by_profile_id ?? null,
          created_by_role: insertPayload.created_by_role ?? null,
          created_by_name: insertPayload.created_by_name ?? null,
        }),
        entries: [],
      };
    }

    if (!online) {
      const link = buildOptimisticLink();
      applyOptimisticLink(link);
      await enqueuePendingSyncAction({
        actionType: "link_insert",
        entityType: "link",
        entityId: linkId,
        payload: {
          values: insertPayload,
          activity: {
            eventId,
            actionType: "link_created",
            entityType: "link",
            entityId: linkId,
            description: `Lien ${nextLabel} ajouté`,
            newValue: { label: nextLabel, status: insertPayload.status, url: insertPayload.url },
          } satisfies PendingActivityPayload,
        },
      });
      return link;
    }

    const { data, error: insertError } = await supabase
      .from("event_links")
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      if (isNetworkOrUnavailableError(insertError)) {
        const link = buildOptimisticLink();
        applyOptimisticLink(link);
        await enqueuePendingSyncAction({
          actionType: "link_insert",
          entityType: "link",
          entityId: linkId,
          payload: { values: insertPayload },
        });
        return link;
      }
      throw insertError;
    }

    const link: EventLink = {
      id: data.id,
      eventId: data.event_id,
      label: data.label,
      url: data.url,
      streamKey: data.stream_key ?? null,
      status: data.status,
      createdAt: data.created_at,
      ...mapCreatorMetadata(data),
      entries: [],
    };

    applyOptimisticLink(link);

    await logEventActivity({
      eventId,
      actionType: "link_created",
      entityType: "link",
      entityId: link.id,
      description: `Lien ${link.label} ajouté`,
      newValue: { label: link.label, status: link.status, url: link.url },
    });

    return link;
  }

  async function deleteEventLink(link: EventLink) {
    assertCanManageOperational();
    if (!canManageCreatedEntity(permissions, profile, link)) {
      throw new Error("Vous ne pouvez supprimer que vos propres liens.");
    }
    if (!permissions.canManageEvents && link.entries.some((entry) => !canManageCreatedEntity(permissions, profile, entry))) {
      throw new Error("Ce lien contient des entrées créées par un admin.");
    }
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    function applyOptimisticDelete() {
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

    if (!online) {
      applyOptimisticDelete();
      await enqueuePendingSyncAction({
        actionType: "link_delete",
        entityType: "link",
        entityId: link.id,
        payload: {
          activity: {
            eventId: link.eventId,
            actionType: "link_deleted",
            entityType: "link",
            entityId: link.id,
            description: `Lien ${link.label} supprimé`,
            previousValue: { label: link.label, status: link.status, url: link.url },
          } satisfies PendingActivityPayload,
        },
      });
      return;
    }

    const { error: deleteError } = await supabase.from("event_links").delete().eq("id", link.id);

    if (deleteError) {
      if (isNetworkOrUnavailableError(deleteError)) {
        applyOptimisticDelete();
        await enqueuePendingSyncAction({
          actionType: "link_delete",
          entityType: "link",
          entityId: link.id,
          payload: {},
        });
        return;
      }
      throw deleteError;
    }

    applyOptimisticDelete();

    await logEventActivity({
      eventId: link.eventId,
      actionType: "link_deleted",
      entityType: "link",
      entityId: link.id,
      description: `Lien ${link.label} supprimé`,
      previousValue: { label: link.label, status: link.status, url: link.url },
    });
  }

  async function renameEventLink(link: EventLink, label: string) {
    assertCanManageOperational();
    if (!canManageCreatedEntity(permissions, profile, link)) {
      throw new Error("Vous ne pouvez renommer que vos propres liens.");
    }
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextLabel = formatTitleCase(label);
    if (!nextLabel || nextLabel === link.label) return link;
    const updatePayload: Database["public"]["Tables"]["event_links"]["Update"] = { label: nextLabel };
    const updatedLink = { ...link, label: nextLabel };

    function applyOptimisticRename() {
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
    }

    const activity: PendingActivityPayload = {
      eventId: link.eventId,
      actionType: "link_renamed",
      entityType: "link",
      entityId: link.id,
      description: `Lien ${link.label} renommé`,
      previousValue: { label: link.label },
      newValue: { label: nextLabel },
    };

    if (!online) {
      applyOptimisticRename();
      await enqueuePendingSyncAction({
        actionType: "link_update",
        entityType: "link",
        entityId: link.id,
        payload: { values: updatePayload, activity },
      });
      return updatedLink;
    }

    const { error: updateError } = await supabase
      .from("event_links")
      .update(updatePayload)
      .eq("id", link.id);

    if (updateError) {
      if (isNetworkOrUnavailableError(updateError)) {
        applyOptimisticRename();
        await enqueuePendingSyncAction({
          actionType: "link_update",
          entityType: "link",
          entityId: link.id,
          payload: { values: updatePayload, activity },
        });
        return updatedLink;
      }
      throw updateError;
    }

    applyOptimisticRename();

    await logEventActivity({
      eventId: link.eventId,
      actionType: "link_renamed",
      entityType: "link",
      entityId: link.id,
      description: `Lien ${link.label} renommé`,
      previousValue: { label: link.label },
      newValue: { label: nextLabel },
    });

    return updatedLink;
  }

  async function createEventDocumentGroup(eventId: string, label: string) {
    assertCanManageOperational();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextLabel = formatTitleCase(label);
    if (!nextLabel) {
      throw new Error("Le nom du document est requis.");
    }

    const insertPayload = {
      event_id: eventId,
      label: nextLabel,
      ...getCreatorInsertPayload(profile),
    };

    const { data, error: insertError } = await supabase
      .from("event_document_groups")
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      const debugError = {
        table: "event_document_groups",
        eventId,
        payload: insertPayload,
        errorMessage: insertError.message,
        errorCode: insertError.code,
        errorDetails: insertError.details,
        errorHint: insertError.hint,
      };
      console.error("Failed to create event document group", debugError);
      console.error("Failed to create event document group JSON", JSON.stringify(debugError, null, 2));
      throw insertError;
    }

    const group = mapEventDocumentGroup(data);

    setEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? {
              ...event,
              documentGroups: [...event.documentGroups, group],
            }
          : event,
      ),
    );

    await logEventActivity({
      eventId,
      actionType: "document_group_created",
      entityType: "document_group",
      entityId: group.id,
      description: `Document ${group.label} créé`,
      newValue: { label: group.label },
    });

    return group;
  }

  async function renameEventDocumentGroup(group: EventDocumentGroup, label: string) {
    assertCanManageOperational();
    if (!canManageCreatedEntity(permissions, profile, group)) {
      throw new Error("Vous ne pouvez renommer que vos propres documents.");
    }
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextLabel = formatTitleCase(label);
    if (!nextLabel || nextLabel === group.label) return group;

    const { error: updateError } = await supabase
      .from("event_document_groups")
      .update({ label: nextLabel })
      .eq("id", group.id);

    if (updateError) throw updateError;

    const updatedGroup = { ...group, label: nextLabel };
    setEvents((current) =>
      current.map((event) =>
        event.id === group.eventId
          ? {
              ...event,
              documentGroups: event.documentGroups.map((item) => (item.id === group.id ? updatedGroup : item)),
            }
          : event,
      ),
    );

    await logEventActivity({
      eventId: group.eventId,
      actionType: "document_group_renamed",
      entityType: "document_group",
      entityId: group.id,
      description: `Document ${group.label} renommé`,
      previousValue: { label: group.label },
      newValue: { label: nextLabel },
    });

    return updatedGroup;
  }

  async function uploadEventDocument(group: EventDocumentGroup, file: globalThis.File) {
    assertCanManageOperational();
    if (!online) {
      throw new Error("Envoi de document indisponible hors ligne. Le fichier n'est pas perdu: réessayez quand le réseau revient.");
    }
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const storageFileName = sanitizeStorageFileName(file.name);
    const storagePath = `${group.eventId}/${group.id}/${storageFileName}`;
    const filePath = `${eventDocumentsBucket}/${storagePath}`;

    const { error: uploadError } = await supabase.storage.from(eventDocumentsBucket).upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });

    if (uploadError) throw uploadError;

    const { data, error: insertError } = await supabase
      .from("event_documents")
      .insert({
        event_id: group.eventId,
        group_id: group.id,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type || null,
        file_size: file.size,
        ...getCreatorInsertPayload(profile),
      })
      .select()
      .single();

    if (insertError) {
      await supabase.storage.from(eventDocumentsBucket).remove([storagePath]);
      throw insertError;
    }

    const document = mapEventDocument(data);

    setEvents((current) =>
      current.map((event) =>
        event.id === group.eventId
          ? {
              ...event,
              documentGroups: event.documentGroups.map((item) =>
                item.id === group.id
                  ? {
                      ...item,
                      files: [...item.files, document],
                    }
                  : item,
              ),
            }
          : event,
      ),
    );

    await logEventActivity({
      eventId: group.eventId,
      actionType: "document_uploaded",
      entityType: "document",
      entityId: document.id,
      description: `Document ${document.fileName} téléversé`,
      newValue: { fileName: document.fileName, groupId: group.id, groupLabel: group.label },
    });

    await createNotification({
      type: "document_uploaded",
      title: "Document ajouté",
      body: `${group.label}: ${document.fileName}`,
      relatedEventId: group.eventId,
    });

    return document;
  }

  async function deleteEventDocumentGroup(group: EventDocumentGroup) {
    assertCanManageOperational();
    if (!canManageCreatedEntity(permissions, profile, group)) {
      throw new Error("Vous ne pouvez supprimer que vos propres groupes de documents.");
    }
    if (!permissions.canManageEvents && group.files.some((file) => !canManageCreatedEntity(permissions, profile, file))) {
      throw new Error("Ce groupe contient des fichiers ajoutés par un admin.");
    }
    if (!online && group.files.length > 0) {
      throw new Error("Suppression de documents indisponible hors ligne. Réessayez quand le réseau revient.");
    }
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const objectPaths = group.files.map((file) => getDocumentObjectPath(file.filePath));
    if (objectPaths.length > 0) {
      const { error: storageError } = await supabase.storage.from(eventDocumentsBucket).remove(objectPaths);
      if (storageError) throw storageError;
    }

    const { error: deleteError } = await supabase.from("event_document_groups").delete().eq("id", group.id);
    if (deleteError) throw deleteError;

    setEvents((current) =>
      current.map((event) =>
        event.id === group.eventId
          ? {
              ...event,
              documentGroups: event.documentGroups.filter((item) => item.id !== group.id),
            }
        : event,
      ),
    );

    await logEventActivity({
      eventId: group.eventId,
      actionType: "document_group_deleted",
      entityType: "document_group",
      entityId: group.id,
      description: `Document ${group.label} supprimé`,
      previousValue: { label: group.label, fileCount: group.files.length },
    });
  }

  async function deleteEventDocument(document: EventDocument) {
    assertCanManageOperational();
    if (!canManageCreatedEntity(permissions, profile, document)) {
      throw new Error("Vous ne pouvez supprimer que vos propres fichiers.");
    }
    if (!online) {
      throw new Error("Suppression de fichier indisponible hors ligne. Réessayez quand le réseau revient.");
    }
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const objectPath = getDocumentObjectPath(document.filePath);
    const { error: storageError } = await supabase.storage.from(eventDocumentsBucket).remove([objectPath]);
    if (storageError) throw storageError;

    const { error: deleteError } = await supabase.from("event_documents").delete().eq("id", document.id);
    if (deleteError) throw deleteError;

    setEvents((current) =>
      current.map((event) =>
        event.id === document.eventId
          ? {
              ...event,
              documentGroups: event.documentGroups.map((group) =>
                group.id === document.groupId
                  ? {
                      ...group,
                      files: group.files.filter((item) => item.id !== document.id),
                    }
                  : group,
              ),
            }
        : event,
      ),
    );

    await logEventActivity({
      eventId: document.eventId,
      actionType: "document_deleted",
      entityType: "document",
      entityId: document.id,
      description: `Document ${document.fileName} supprimé`,
      previousValue: { fileName: document.fileName, groupId: document.groupId },
    });
  }

  async function openEventDocument(file: EventDocument) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const objectPath = getDocumentObjectPath(file.filePath);
    const { data, error: signedUrlError } = await supabase.storage.from(eventDocumentsBucket).createSignedUrl(objectPath, 10 * 60);

    if (signedUrlError) throw signedUrlError;

    const previewKind = getDocumentPreviewKind(file);
    if (previewKind) {
      setDocumentPreview({
        file,
        url: data.signedUrl,
        kind: previewKind,
      });
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function downloadEventDocument(file: EventDocument) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const objectPath = getDocumentObjectPath(file.filePath);
    const { data, error: signedUrlError } = await supabase.storage
      .from(eventDocumentsBucket)
      .createSignedUrl(objectPath, 60, { download: file.fileName });

    if (signedUrlError) throw signedUrlError;

    const downloadLink = document.createElement("a");
    downloadLink.href = data.signedUrl;
    downloadLink.download = file.fileName;
    downloadLink.rel = "noopener noreferrer";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
  }

  async function deleteCurrentEvent(eventToDelete: ProductionEvent) {
    assertCanSoftDeleteEvents();

    if (!eventToDelete) {
      throw new Error("Aucun événement sélectionné.");
    }

    const eventId = eventToDelete.id;
    console.log("Soft deleting current event", {
      eventId,
      selectedEventId: selectedEvent?.id ?? null,
      clientName: eventToDelete.clientName,
      eventName: eventToDelete.eventName,
    });

    const deletedAt = new Date().toISOString();
    const deletePayload: Database["public"]["Tables"]["events"]["Update"] = { deleted_at: deletedAt, deleted_by: actorName ?? "Utilisateur" };
    const activity: PendingActivityPayload = {
      eventId,
      actionType: "event_deleted",
      entityType: "event",
      entityId: eventId,
      description: "Événement placé dans la corbeille",
      previousValue: {
        clientName: eventToDelete.clientName,
        eventName: eventToDelete.eventName,
        date: eventToDelete.date,
      },
      newValue: { deletedAt },
    };

    function applyOptimisticSoftDelete(updatedAt: string) {
      setEvents((current) => current.filter((event) => event.id !== eventId));
      setDeletedEvents((current) => [{ ...eventToDelete, deletedAt, deletedBy: actorName ?? "Utilisateur", updatedAt }, ...current]);
      setSelectedId(null);
      setScreen("calendar");
      setCreateMenuOpen(false);
      setDeleteDialogEvent(null);
    }

    if (!online) {
      applyOptimisticSoftDelete(deletedAt);
      await enqueuePendingSyncAction({
        actionType: "event_soft_delete",
        entityType: "event",
        entityId: eventId,
        payload: { values: deletePayload, activity },
      });
      return;
    }

    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const { data: deletedEvent, error: softDeleteError } = await supabase
      .from("events")
      .update(deletePayload)
      .eq("id", eventId)
      .select()
      .single();

    console.log("Supabase event soft delete response", {
      eventId,
      deletedAt,
      data: deletedEvent,
      errorMessage: softDeleteError?.message,
      errorCode: softDeleteError?.code,
      errorDetails: softDeleteError?.details,
      errorHint: softDeleteError?.hint,
    });

    if (softDeleteError) {
      if (isNetworkOrUnavailableError(softDeleteError)) {
        applyOptimisticSoftDelete(deletedAt);
        await enqueuePendingSyncAction({
          actionType: "event_soft_delete",
          entityType: "event",
          entityId: eventId,
          payload: { values: deletePayload, activity },
        });
        return;
      }
      throw softDeleteError;
    }

    await logEventActivity({
      ...activity,
    });

    applyOptimisticSoftDelete(deletedEvent.updated_at);
    await reloadData(null);
  }

  async function restoreDeletedEvent(eventToRestore: ProductionEvent) {
    assertCanRestoreEvents();
    setRestoringEventId(eventToRestore.id);
    setTrashError(null);
    const restorePayload: Database["public"]["Tables"]["events"]["Update"] = { deleted_at: null, deleted_by: null };
    const activity: PendingActivityPayload = {
      eventId: eventToRestore.id,
      actionType: "event_restored",
      entityType: "event",
      entityId: eventToRestore.id,
      description: "Événement restauré",
      previousValue: { deletedAt: eventToRestore.deletedAt },
      newValue: { deletedAt: null },
    };

    function applyOptimisticRestore(updatedAt: string) {
      setDeletedEvents((current) => current.filter((event) => event.id !== eventToRestore.id));
      setEvents((current) =>
        [...current, { ...eventToRestore, deletedAt: null, deletedBy: null, updatedAt }].sort(
          (a, b) => eventSortValue(a) - eventSortValue(b),
        ),
      );
      setSelectedDateKey(eventToRestore.date);
      setVisibleMonth(new Date(`${eventToRestore.date}T12:00:00`));
    }

    try {
      if (!online) {
        applyOptimisticRestore(new Date().toISOString());
        await enqueuePendingSyncAction({
          actionType: "event_restore",
          entityType: "event",
          entityId: eventToRestore.id,
          payload: { values: restorePayload, activity },
        });
        return;
      }

      if (!supabase) {
        throw new Error("Configuration Supabase manquante.");
      }

      const { data, error: restoreError } = await supabase
        .from("events")
        .update(restorePayload)
        .eq("id", eventToRestore.id)
        .select()
        .single();

      if (restoreError) {
        if (isNetworkOrUnavailableError(restoreError)) {
          applyOptimisticRestore(new Date().toISOString());
          await enqueuePendingSyncAction({
            actionType: "event_restore",
            entityType: "event",
            entityId: eventToRestore.id,
            payload: { values: restorePayload, activity },
          });
          return;
        }
        throw restoreError;
      }

      await logEventActivity({
        ...activity,
      });

      applyOptimisticRestore(data.updated_at);
      setSelectedDateKey(data.date);
      setVisibleMonth(new Date(`${data.date}T12:00:00`));
    } catch (restoreError) {
      setTrashError(getUserFacingErrorMessage(restoreError, "Impossible de restaurer cet événement."));
    } finally {
      setRestoringEventId(null);
    }
  }

  async function permanentlyDeleteEvent(eventToDelete: ProductionEvent) {
    assertCanPermanentDeleteEvents();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const eventId = eventToDelete.id;
    const documentObjectPaths = eventToDelete.documentGroups
      .flatMap((group) => group.files)
      .map((file) => file.filePath.replace(`${eventDocumentsBucket}/`, ""));

    if (documentObjectPaths.length > 0) {
      const { error: storageError } = await supabase.storage.from(eventDocumentsBucket).remove(documentObjectPaths);
      if (storageError) {
        console.warn("Permanent delete storage cleanup failed; continuing event deletion", {
          eventId,
          errorMessage: storageError.message,
        });
      }
    }

    const { data: deleteData, error: deleteError } = await supabase.from("events").delete().eq("id", eventId).select("id");

    if (deleteError) throw deleteError;
    if (!deleteData || deleteData.length === 0) {
      throw new Error(`Aucun événement supprimé définitivement pour l'id ${eventId}.`);
    }

    setDeletedEvents((current) => current.filter((event) => event.id !== eventId));
    setPermanentDeleteDialogEvent(null);
  }

  async function updateManagedProfileRole(profileToUpdate: UserProfile, role: UserRole) {
    assertCanManageUsers();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }
    if (profile?.id === profileToUpdate.id) {
      setManagedProfilesError("Vous ne pouvez pas modifier votre propre rôle.");
      return;
    }

    const payload = { role };
    setUpdatingProfileId(profileToUpdate.id);
    setManagedProfilesError(null);

    try {
      const { data, error: updateError } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profileToUpdate.id)
        .select()
        .single();

      console.info("Profile role update response", {
        payload,
        targetProfileId: profileToUpdate.id,
        requestedRole: role,
        returnedRow: data,
        errorMessage: updateError?.message,
        errorCode: updateError?.code,
        errorDetails: updateError?.details,
        errorHint: updateError?.hint,
      });

      if (updateError) throw updateError;

      const updatedProfile = mapUserProfile(data);
      if (updatedProfile.role !== role) {
        console.warn("Profile role update did not persist requested role", {
          payload,
          targetProfileId: profileToUpdate.id,
          requestedRole: role,
          returnedRole: updatedProfile.role,
          returnedRow: data,
        });
        throw new Error("Le rôle n'a pas été modifié dans Supabase. Vérifiez la migration des policies profils.");
      }

      setManagedProfiles((current) => current.map((item) => (item.id === updatedProfile.id ? updatedProfile : item)));
      if (profile?.id === updatedProfile.id) {
        setProfile(updatedProfile);
      }
    } catch (roleError) {
      console.error("Failed to update profile role", {
        payload,
        targetProfileId: profileToUpdate.id,
        targetEmail: profileToUpdate.email,
        currentProfileId: profile?.id,
        currentProfileRole: profile?.role,
        errorMessage: roleError instanceof Error ? roleError.message : null,
        error: roleError,
      });
      setManagedProfilesError(getUserFacingErrorMessage(roleError, "Impossible de modifier le rôle."));
    } finally {
      setUpdatingProfileId(null);
    }
  }

  async function signOut() {
    if (!supabase) return;
    const userId = authSession?.user.id ?? profile?.id ?? null;
    await supabase.auth.signOut();
    if (userId) {
      removeLocalStorageKey(`${cachedProfileKeyPrefix}${userId}`);
      removeLocalStorageKey(`${cachedAppDataKeyPrefix}${userId}`);
      removeLocalStorageKey(`${cachedNotificationsKeyPrefix}${userId}`);
    }
    removeLocalStorageKey(cachedAuthSessionKey);
    setAuthSession(null);
    setProfile(null);
    setEvents([]);
    setNotifications([]);
    setNotificationsHydrated(false);
    setSelectedId(null);
    setScreen("calendar");
    setCreateMenuOpen(false);
  }

  if (!hasMounted || authLoading) {
    return <FullScreenStatus>Chargement...</FullScreenStatus>;
  }

  if (passwordRecoveryOpen) {
    if (!authSession) {
      return <FullScreenStatus>Préparation de la réinitialisation...</FullScreenStatus>;
    }

    return (
      <UpdatePasswordScreen
        email={authSession.user.email}
        onComplete={() => setPasswordRecoveryOpen(false)}
        onCancel={() => setPasswordRecoveryOpen(false)}
      />
    );
  }

  if (!authSession) {
    return <LoginScreen error={authError} />;
  }

  if (authError && !profile) {
    return <FullScreenStatus tone="error">{authError}</FullScreenStatus>;
  }

  return (
    <main className="relative h-screen h-[100svh] overflow-hidden bg-[#f7f9fb] text-stone-950">
      <div
        onDragEnter={(event) => {
          if (!permissions.canManageEvents) return;
          if (!hasFileDragItem(event.dataTransfer)) return;
          event.preventDefault();
          setGlobalQuoteDragActive(hasPotentialPdfDragItem(event.dataTransfer));
        }}
        onDragOver={(event) => {
          if (!permissions.canManageEvents) return;
          if (!hasFileDragItem(event.dataTransfer)) return;
          event.preventDefault();
          const canDropPdf = hasPotentialPdfDragItem(event.dataTransfer);
          event.dataTransfer.dropEffect = canDropPdf ? "copy" : "none";
          setGlobalQuoteDragActive(canDropPdf);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setGlobalQuoteDragActive(false);
        }}
        onDrop={(event) => {
          if (!permissions.canManageEvents) return;
          if (!hasFileDragItem(event.dataTransfer)) return;
          event.preventDefault();
          const pdfFile = getPdfFileFromTransfer(event.dataTransfer);
          if (!pdfFile) {
            setGlobalQuoteDragActive(false);
            const firstFile = getFirstFileFromTransfer(event.dataTransfer);
            if (firstFile) {
              openQuoteImport(firstFile);
            } else {
              setError("Déposez un fichier PDF.");
            }
            return;
          }
          setGlobalQuoteDragActive(false);
          openQuoteImport(pdfFile);
        }}
        className="relative mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pt-[calc(1.5rem+env(safe-area-inset-top))] lg:px-8"
      >
        <AppHeader
          screen={screen}
          setScreen={setScreen}
          yearLabel={yearLabel}
          detailDateLabel={screen === "detail" && selectedEvent ? formatFullDate(selectedEvent.date) : null}
          onEditDetailDate={screen === "detail" && selectedEvent && headerPermissions.canManageEvents ? () => setDateEditorOpen(true) : undefined}
          goToday={goToday}
          isSelectedDateToday={isSelectedDateToday}
          createMenuOpen={createMenuOpen && !yearOverviewOpen}
          setCreateMenuOpen={setCreateMenuOpen}
          profile={headerProfile}
          email={headerSession?.user.email}
          onLogout={signOut}
          canManageUsers={headerPermissions.canManageUsers}
          onOpenUserManagement={() => setUserManagementOpen(true)}
          canManageExternalCalendars={Boolean(headerProfile)}
          onOpenExternalCalendars={() => setExternalCalendarSettingsOpen(true)}
          online={online}
          pendingSyncCount={pendingSyncCount}
          syncingPendingActions={syncingPendingActions}
          pendingSyncError={pendingSyncError}
          notifications={notifications}
          notificationsOpen={notificationsOpen && !yearOverviewOpen}
          setNotificationsOpen={setNotificationsOpen}
          onOpenNotification={handleNotificationOpen}
          onMarkAllNotificationsRead={markAllNotificationsRead}
          onImportQuote={() => {
            if (!headerPermissions.canManageEvents) return;
            openQuoteImport();
          }}
          onImportNativeMstvCalendar={openNativeMstvIcsImport}
          onSearch={() => setSearchOpen(true)}
          canOpenHistory={headerPermissions.canManageEvents && screen === "detail" && Boolean(selectedEvent)}
          onOpenHistory={openHistory}
          canOpenTrash={headerCanOpenTrash}
          onOpenTrash={() => {
            setTrashOpen(true);
            setCreateMenuOpen(false);
          }}
          onOpenYearOverview={() => setYearOverviewOpen(true)}
          onCreateEvent={() => {
            if (!headerPermissions.canManageEvents) return;
            setEditingEvent(null);
            setEditingReturnScreen("calendar");
            setCreateModalOpen(true);
            setCreateMenuOpen(false);
          }}
          canCreateEvent={headerPermissions.canManageEvents}
          canImportQuote={headerPermissions.canManageEvents}
          canImportNativeMstvCalendar={headerPermissions.canManageEvents}
          canDuplicateEvent={headerPermissions.canManageEvents && screen === "detail" && Boolean(selectedEvent)}
          onDuplicateEvent={() => {
            if (selectedEvent && !selectedEvent.deletedAt) {
              setDuplicateDatePickerEvent(selectedEvent);
            }
            setCreateMenuOpen(false);
          }}
          canDeleteEvent={headerPermissions.canSoftDeleteEvents && screen === "detail" && Boolean(selectedEvent)}
          onDeleteEvent={() => {
            console.log("Delete event menu action clicked", {
              eventId: selectedEvent?.id ?? null,
              clientName: selectedEvent?.clientName ?? null,
              eventName: selectedEvent?.eventName ?? null,
            });
            if (selectedEvent) {
              setDeleteDialogEvent(selectedEvent);
            }
            setCreateMenuOpen(false);
          }}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          {error && <StatusMessage tone="error">{error}</StatusMessage>}
          {loading && <StatusMessage>Chargement des productions...</StatusMessage>}

          {!loading && screen === "calendar" && (
            <CalendarDashboard
              events={events}
              externalEvents={visibleExternalCalendarEvents}
              onOpen={openEvent}
              onOpenExternalEvent={setExternalCalendarDetail}
              visibleMonth={visibleMonth}
              selectedDateKey={selectedDateKey}
              onDeleteRequest={(event) => {
                if (permissions.canSoftDeleteEvents) {
                  setDeleteDialogEvent(event);
                }
              }}
              onDuplicateRequest={(event) => {
                if (permissions.canManageEvents && !event.deletedAt) {
                  setDuplicateDatePickerEvent(event);
                }
              }}
              canDeleteEvents={permissions.canSoftDeleteEvents}
              canDuplicateEvents={permissions.canManageEvents}
              setSelectedDateKey={setSelectedDateKey}
              changeMonth={changeMonth}
            />
          )}

          {!loading && screen === "detail" && selectedEvent && (
            <ProductionDetail
              event={selectedEvent}
              previousEvent={chronologicalEvents[selectedEventIndex - 1] ?? null}
              nextEvent={chronologicalEvents[selectedEventIndex + 1] ?? null}
              hasPrevious={hasPreviousEvent}
              hasNext={hasNextEvent}
              goPrevious={() => navigateEvent(-1)}
              goNext={() => navigateEvent(1)}
              onUpdateEventTime={updateEventTime}
              onToggleOption={toggleOption}
              onChangeOptionCompletedBy={updateOptionCompletedBy}
              onCreateOption={createEventOption}
              onDeleteOption={deleteEventOption}
              onRenameOption={renameEventOption}
              onCreateOptionItem={createEventOptionItem}
              onUpdateOptionItem={updateEventOptionItem}
              onDeleteOptionItem={deleteEventOptionItem}
              onCreateLink={createEventLink}
              onDeleteLink={deleteEventLink}
              onRenameLink={renameEventLink}
              onSaveLinkEntries={syncEventLinkEntries}
              onCreateDocumentGroup={createEventDocumentGroup}
              onDeleteDocumentGroup={deleteEventDocumentGroup}
              onRenameDocumentGroup={renameEventDocumentGroup}
              onUploadDocument={uploadEventDocument}
              onDeleteDocumentFile={deleteEventDocument}
              onOpenDocument={openEventDocument}
              onDownloadDocument={downloadEventDocument}
              onTimelineTimeEditStart={startTimelineTimeEditing}
              onTimelineTimeEditEnd={endTimelineTimeEditing}
              permissions={permissions}
              profile={profile}
            />
          )}

          {!loading && screen === "detail" && !selectedEvent && (
            <StatusMessage>Aucune production à afficher.</StatusMessage>
          )}
        </div>
      </div>

      {globalQuoteDragActive && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-stone-950/10 p-4">
          <div className="flex items-center gap-3 rounded-full border border-stone-200 bg-white/95 px-5 py-3 text-base font-semibold text-stone-800 backdrop-blur-xl">
            <Import className="h-5 w-5 text-[#bb2720]" />
            Déposer le devis pour l'importer
          </div>
        </div>
      )}

      {yearOverviewOpen && (
        <YearOverviewOverlay
          initialYear={visibleMonth.getFullYear()}
          events={events}
          visibleMonth={visibleMonth}
          todayKey={todayKey}
          isSelectedDateToday={isSelectedDateToday}
          createMenuOpen={createMenuOpen}
          setCreateMenuOpen={setCreateMenuOpen}
          profile={profile}
          email={authSession.user.email}
          onLogout={signOut}
          canManageUsers={permissions.canManageUsers}
          onOpenUserManagement={() => setUserManagementOpen(true)}
          canManageExternalCalendars={Boolean(profile)}
          onOpenExternalCalendars={() => setExternalCalendarSettingsOpen(true)}
          online={online}
          pendingSyncCount={pendingSyncCount}
          syncingPendingActions={syncingPendingActions}
          pendingSyncError={pendingSyncError}
          notifications={notifications}
          notificationsOpen={notificationsOpen}
          setNotificationsOpen={setNotificationsOpen}
          onOpenNotification={handleNotificationOpen}
          onMarkAllNotificationsRead={markAllNotificationsRead}
          onGoToday={() => {
            goToday();
            setYearOverviewOpen(false);
          }}
          onImportQuote={() => {
            if (!permissions.canManageEvents) return;
            openQuoteImport();
          }}
          onImportNativeMstvCalendar={openNativeMstvIcsImport}
          onSearch={() => setSearchOpen(true)}
          onCreateEvent={() => {
            if (!permissions.canManageEvents) return;
            setEditingEvent(null);
            setEditingReturnScreen("calendar");
            setCreateModalOpen(true);
            setCreateMenuOpen(false);
          }}
          onOpenTrash={() => {
            setTrashOpen(true);
            setCreateMenuOpen(false);
          }}
          canCreateEvent={permissions.canManageEvents}
          canImportQuote={permissions.canManageEvents}
          canImportNativeMstvCalendar={permissions.canManageEvents}
          canOpenTrash={permissions.canRestoreEvents || permissions.canPermanentDeleteEvents}
          onSelectMonth={selectYearOverviewMonth}
        />
      )}

      {createModalOpen && (
        <CreateEventModal
          selectedDateKey={selectedDateKey}
          event={editingEvent}
          onClose={() => {
            setCreateModalOpen(false);
            setEditingEvent(null);
            setEditingReturnScreen("calendar");
          }}
          onSubmit={async (input) => {
            if (editingEvent) {
              await updateEvent(editingEvent, input, editingReturnScreen);
            } else {
              await createEvent(input);
            }
            setCreateModalOpen(false);
            setEditingEvent(null);
            setEditingReturnScreen("calendar");
          }}
        />
      )}

      {quoteImportOpen && (
        <QuoteImportModal
          accessToken={authSession?.access_token ?? null}
          online={online}
          initialFile={quoteImportFile}
          selectedDateKey={selectedDateKey}
          events={events}
          onClose={() => {
            setQuoteImportOpen(false);
            setQuoteImportFile(null);
          }}
          onCreateEvent={async (input) => {
            await createEvent(input);
            setQuoteImportOpen(false);
            setQuoteImportFile(null);
          }}
          onUpdateEvent={async (event, input) => {
            await updateEventFromQuote(event, input);
            setQuoteImportOpen(false);
            setQuoteImportFile(null);
          }}
        />
      )}

      {nativeMstvIcsImportOpen && (
        <NativeMstvIcsImportModal
          onClose={() => setNativeMstvIcsImportOpen(false)}
          onImport={async (reviewEvents) => {
            await importNativeMstvIcsEvents(reviewEvents);
            setNativeMstvIcsImportOpen(false);
          }}
        />
      )}

      {dateEditorOpen && selectedEvent && (
        <SharedDatePicker
          selectedDate={selectedEvent.date}
          onClose={() => setDateEditorOpen(false)}
          onSelectDate={async (nextDate) => {
            await updateEventDate(selectedEvent, nextDate);
            setDateEditorOpen(false);
          }}
          confirmationTitle="Modifier la date de cet événement ?"
        />
      )}

      {duplicateDatePickerEvent && (
        <SharedDatePicker
          selectedDate={duplicateDatePickerEvent.date}
          onClose={() => setDuplicateDatePickerEvent(null)}
          onSelectDate={(nextDate) => {
            setDuplicateRequest({ event: duplicateDatePickerEvent, date: nextDate });
            setDuplicateDatePickerEvent(null);
          }}
        />
      )}

      {duplicateRequest && (
        <DuplicateEventDialog
          request={duplicateRequest}
          onClose={() => setDuplicateRequest(null)}
          onConfirm={async (request) => {
            await duplicateEventToDate(request.event, request.date);
            setDuplicateRequest(null);
          }}
        />
      )}

      {searchOpen && (
        <EventSearchOverlay
          events={chronologicalEvents}
          onClose={() => setSearchOpen(false)}
          onOpenEvent={openEvent}
        />
      )}

      {deleteDialogEvent && (
        <DeleteEventDialog
          event={deleteDialogEvent}
          onClose={() => setDeleteDialogEvent(null)}
          onConfirm={deleteCurrentEvent}
        />
      )}

      {trashOpen && (
        <TrashEventsSheet
          events={deletedEvents}
          loading={trashLoading}
          error={trashError}
          restoringEventId={restoringEventId}
          onClose={() => setTrashOpen(false)}
          onRestore={restoreDeletedEvent}
          onPermanentDeleteRequest={setPermanentDeleteDialogEvent}
          canRestore={permissions.canRestoreEvents}
          canPermanentDelete={permissions.canPermanentDeleteEvents}
        />
      )}

      {userManagementOpen && permissions.canManageUsers && (
        <UserManagementSheet
          profiles={managedProfiles}
          currentProfileId={profile?.id ?? null}
          loading={managedProfilesLoading}
          error={managedProfilesError}
          updatingProfileId={updatingProfileId}
          onClose={() => setUserManagementOpen(false)}
          onUpdateRole={updateManagedProfileRole}
        />
      )}

      {externalCalendarSettingsOpen && (
        <ExternalCalendarsSheet
          calendars={externalCalendars}
          events={externalCalendarEvents}
          permissions={permissions}
          profile={profile}
          loading={externalCalendarSettingsLoading}
          error={externalCalendarSettingsError}
          syncingCalendarId={syncingExternalCalendarId}
          syncProgress={externalCalendarSyncProgress}
          onClose={() => setExternalCalendarSettingsOpen(false)}
          onCreate={createExternalCalendar}
          onUpdate={updateExternalCalendar}
          onDelete={async (calendar) => {
            try {
              await deleteExternalCalendar(calendar);
            } catch (deleteError) {
              console.error("External calendar delete failed", deleteError);
              setExternalCalendarSettingsError(getUserFacingErrorMessage(deleteError, "Impossible de supprimer ce calendrier."));
            }
          }}
          onSync={async (calendar) => {
            try {
              return await syncExternalCalendar(calendar);
            } catch (syncError) {
              console.error("External calendar sync failed", syncError);
              setExternalCalendarSettingsError(getUserFacingErrorMessage(syncError, "Impossible de synchroniser ce calendrier."));
              void createNotification(
                {
                  type: "external_calendar_sync_failed",
                  title: "Synchronisation calendrier échouée",
                  body: calendar.name,
                },
                { persist: false, dedupe: true },
              );
              throw syncError;
            }
          }}
        />
      )}

      {permanentDeleteDialogEvent && (
        <PermanentDeleteEventDialog
          event={permanentDeleteDialogEvent}
          onClose={() => setPermanentDeleteDialogEvent(null)}
          onConfirm={permanentlyDeleteEvent}
        />
      )}

      {documentPreview && (
        <DocumentPreviewModal
          preview={documentPreview}
          onClose={() => setDocumentPreview(null)}
          onDownload={downloadEventDocument}
        />
      )}

      {externalCalendarDetail && (
        <ExternalCalendarEventDetails event={externalCalendarDetail} onClose={() => setExternalCalendarDetail(null)} />
      )}

      {historyOpen && selectedEvent && (
        <EventHistorySheet
          event={selectedEvent}
          entries={activityLog}
          loading={activityLoading}
          error={activityError}
          restoringActivityId={restoringActivityId}
          onClose={() => setHistoryOpen(false)}
          onRestore={restoreActivityEntry}
          canRestore={permissions.canManageEvents}
        />
      )}

      {isTimelineTimeEditing && keyboardVisible && (
        <TimelineKeyboardAccessoryBar keyboardHeight={keyboardHeight} onConfirm={confirmTimelineTimeEdit} />
      )}
    </main>
  );
}

function AppHeader({
  screen,
  setScreen,
  yearLabel,
  detailDateLabel,
  onEditDetailDate,
  goToday,
  isSelectedDateToday,
  createMenuOpen,
  setCreateMenuOpen,
  profile,
  email,
  onLogout,
  canManageUsers,
  onOpenUserManagement,
  canManageExternalCalendars,
  onOpenExternalCalendars,
  online,
  pendingSyncCount,
  syncingPendingActions,
  pendingSyncError,
  notifications,
  notificationsOpen,
  setNotificationsOpen,
  onOpenNotification,
  onMarkAllNotificationsRead,
  onImportQuote,
  onImportNativeMstvCalendar,
  onSearch,
  canOpenHistory,
  onOpenHistory,
  canOpenTrash,
  onOpenTrash,
  onLogoClick,
  onOpenYearOverview,
  onCreateEvent,
  canCreateEvent,
  canImportQuote,
  canImportNativeMstvCalendar,
  canDuplicateEvent,
  onDuplicateEvent,
  canDeleteEvent,
  onDeleteEvent,
}: {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  yearLabel: string;
  detailDateLabel: string | null;
  onEditDetailDate?: () => void;
  goToday: () => void;
  isSelectedDateToday: boolean;
  createMenuOpen: boolean;
  setCreateMenuOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  profile: UserProfile | null;
  email: string | undefined;
  onLogout: () => void;
  canManageUsers: boolean;
  onOpenUserManagement: () => void;
  canManageExternalCalendars: boolean;
  onOpenExternalCalendars: () => void;
  online: boolean;
  pendingSyncCount: number;
  syncingPendingActions: boolean;
  pendingSyncError: string | null;
  notifications: AppNotification[];
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  onOpenNotification: (notification: AppNotification) => void;
  onMarkAllNotificationsRead: () => void;
  onImportQuote: () => void;
  onImportNativeMstvCalendar: () => void;
  onSearch: () => void;
  canOpenHistory: boolean;
  onOpenHistory: () => void;
  canOpenTrash: boolean;
  onOpenTrash: () => void;
  onLogoClick?: () => void;
  onOpenYearOverview: () => void;
  onCreateEvent: () => void;
  canCreateEvent: boolean;
  canImportQuote: boolean;
  canImportNativeMstvCalendar: boolean;
  canDuplicateEvent: boolean;
  onDuplicateEvent: () => void;
  canDeleteEvent: boolean;
  onDeleteEvent: () => void;
}) {
  const menuWrapperRef = useRef<HTMLDivElement | null>(null);
  const hasCreateMenuActions = canImportQuote || canImportNativeMstvCalendar || canCreateEvent || canDuplicateEvent || canDeleteEvent || canOpenTrash;
  const unreadNotificationCount = notifications.filter((notification) => !notification.readAt).length;

  useEffect(() => {
    if (!createMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuWrapperRef.current?.contains(target)) return;
      setCreateMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [createMenuOpen, setCreateMenuOpen]);

  useEffect(() => {
    if (!hasCreateMenuActions && createMenuOpen) {
      setCreateMenuOpen(false);
    }
  }, [createMenuOpen, hasCreateMenuActions, setCreateMenuOpen]);

  return (
    <header className="relative mb-5 flex flex-col gap-2 px-1 py-1">
      <div className="flex items-center justify-between gap-3">
        <button className="flex shrink-0 items-center text-left" onClick={onLogoClick ?? (() => setScreen("calendar"))} aria-label="Accueil calendrier">
          <img src="/brand/mon-studio-tv-icon.png" alt="Mon Studio TV" className="h-11 w-auto shrink-0" />
        </button>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <HeaderIcon label="Rechercher" icon={Search} onClick={onSearch} />
          <NotificationMenu
            notifications={notifications}
            unreadCount={unreadNotificationCount}
            open={notificationsOpen}
            setOpen={setNotificationsOpen}
            onOpenNotification={onOpenNotification}
            onMarkAllRead={onMarkAllNotificationsRead}
          />
          {hasCreateMenuActions && (
            <div ref={menuWrapperRef} className="relative">
              <button
                onClick={() => setCreateMenuOpen((current) => !current)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#bb2720] text-base font-semibold leading-none text-white transition hover:bg-[#a7211b]"
                aria-label="Créer"
              >
                +
              </button>
              {createMenuOpen && (
                <CreateMenu
                  onImportQuote={onImportQuote}
                  onImportNativeMstvCalendar={onImportNativeMstvCalendar}
                  onCreateEvent={onCreateEvent}
                  onOpenTrash={onOpenTrash}
                  canImportQuote={canImportQuote}
                  canImportNativeMstvCalendar={canImportNativeMstvCalendar}
                  canCreateEvent={canCreateEvent}
                  canOpenTrash={canOpenTrash}
                  canDuplicateEvent={canDuplicateEvent}
                  onDuplicateEvent={onDuplicateEvent}
                  canDeleteEvent={canDeleteEvent}
                  onDeleteEvent={onDeleteEvent}
                />
              )}
            </div>
          )}
          <AccountMenu
            profile={profile}
            email={email}
            canManageUsers={canManageUsers}
            onOpenUserManagement={onOpenUserManagement}
            canManageExternalCalendars={canManageExternalCalendars}
            onOpenExternalCalendars={onOpenExternalCalendars}
            onLogout={onLogout}
          />
        </div>
      </div>

      <div className="flex min-h-10 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {screen === "calendar" && (
            <button
              type="button"
              onClick={onOpenYearOverview}
              className="rounded-full border border-stone-200 bg-white px-2.5 py-1.5 text-base font-semibold text-stone-700 transition hover:bg-stone-50 sm:px-3"
            >
              {yearLabel}
            </button>
          )}
          {screen === "detail" && detailDateLabel && (
            <button
              type="button"
              onClick={onEditDetailDate}
              className="max-w-full truncate rounded-full border border-stone-200 bg-white px-2.5 py-1.5 text-base font-semibold text-stone-700 transition hover:bg-stone-50 sm:px-3"
            >
              {detailDateLabel}
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
          <SyncStatusIndicator
            online={online}
            pendingCount={pendingSyncCount}
            syncing={syncingPendingActions}
            error={pendingSyncError}
          />
          {screen === "calendar" && (
            <button
              onClick={goToday}
              className={cn(
                "rounded-full border px-2.5 py-2 text-base font-semibold transition sm:px-3",
                isSelectedDateToday
                  ? "border-[#bb2720]/20 bg-[#bb2720]/[0.08] text-[#bb2720] hover:bg-[#bb2720]/[0.1]"
                  : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
              )}
              aria-pressed={isSelectedDateToday}
            >
              Aujourd'hui
            </button>
          )}
          {canOpenHistory && <HeaderIcon label="Historique" icon={History} onClick={onOpenHistory} />}
        </div>
      </div>
    </header>
  );
}

function CreateMenu({
  onImportQuote,
  onImportNativeMstvCalendar,
  onCreateEvent,
  onOpenTrash,
  canImportQuote,
  canImportNativeMstvCalendar,
  canCreateEvent,
  canOpenTrash,
  canDuplicateEvent,
  onDuplicateEvent,
  canDeleteEvent,
  onDeleteEvent,
}: {
  onImportQuote: () => void;
  onImportNativeMstvCalendar: () => void;
  onCreateEvent: () => void;
  onOpenTrash: () => void;
  canImportQuote: boolean;
  canImportNativeMstvCalendar: boolean;
  canCreateEvent: boolean;
  canOpenTrash: boolean;
  canDuplicateEvent: boolean;
  onDuplicateEvent: () => void;
  canDeleteEvent: boolean;
  onDeleteEvent: () => void;
}) {
  const hasActions = canImportQuote || canImportNativeMstvCalendar || canCreateEvent || canDuplicateEvent || canDeleteEvent || canOpenTrash;

  return (
    <div className="absolute right-1 top-14 z-40 w-56 rounded-2xl border border-stone-200 bg-white/95 p-1.5 backdrop-blur-xl">
      {!hasActions && (
        <div className="px-4 py-3 text-right text-base font-medium text-stone-400">
          Aucune action
        </div>
      )}
      {canImportQuote && (
        <button
          onClick={onImportQuote}
          className="block w-full rounded-xl px-4 py-3 text-right text-base font-medium text-stone-700 transition hover:bg-[#bb2720]/[0.05] hover:text-stone-950"
        >
          Importer un devis
        </button>
      )}
      {canImportNativeMstvCalendar && (
        <button
          onClick={onImportNativeMstvCalendar}
          className="block w-full rounded-xl px-4 py-3 text-right text-base font-medium text-stone-700 transition hover:bg-[#bb2720]/[0.05] hover:text-stone-950"
        >
          Importer calendrier MSTV
        </button>
      )}
      {canCreateEvent && (
        <button
          onClick={onCreateEvent}
          className="block w-full rounded-xl px-4 py-3 text-right text-base font-medium text-stone-700 transition hover:bg-[#bb2720]/[0.05] hover:text-stone-950"
        >
          Créer un événement
        </button>
      )}
      {canDuplicateEvent && (
        <button
          onClick={onDuplicateEvent}
          className="block w-full rounded-xl px-4 py-3 text-right text-base font-medium text-stone-700 transition hover:bg-[#bb2720]/[0.05] hover:text-stone-950"
        >
          Dupliquer l'événement
        </button>
      )}
      {canDeleteEvent && (
        <button
          onClick={onDeleteEvent}
          className="block w-full rounded-xl px-4 py-3 text-right text-base font-medium text-[#bb2720] transition hover:bg-[#bb2720]/[0.05]"
        >
          Supprimer l'événement
        </button>
      )}
      {canOpenTrash && (
        <button
          onClick={onOpenTrash}
          aria-label="Corbeille"
          title="Corbeille"
          className="flex w-full items-center justify-end rounded-xl px-4 py-3 text-stone-500 transition hover:bg-[#bb2720]/[0.05] hover:text-stone-800"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function getEventSearchText(event: ProductionEvent) {
  return normalizeLabel(
    [
      event.clientName,
      event.eventName,
      event.date,
      formatFullDate(event.date),
      formatTimeRange(event.startTime, event.endTime),
      ...event.options.map((option) => option.label),
      ...event.links.map((link) => link.label),
      ...event.documentGroups.map((group) => group.label),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function EventSearchOverlay({
  events,
  onClose,
  onOpenEvent,
}: {
  events: ProductionEvent[];
  onClose: () => void;
  onOpenEvent: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalizedQuery = normalizeLabel(query);
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return events.filter((event) => getEventSearchText(event).includes(normalizedQuery)).slice(0, 20);
  }, [events, normalizedQuery]);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/10 px-4 py-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-sm sm:px-6">
      <div className="mx-auto flex h-full max-w-2xl flex-col">
        <div className="rounded-[1.75rem] border border-stone-200 bg-white/95 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-stone-200 bg-[#f7f9fb] px-4">
              <Search className="h-4 w-4 shrink-0 text-stone-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher"
                className="min-w-0 flex-1 bg-transparent text-base font-semibold text-stone-950 outline-none placeholder:text-stone-300"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-2xl px-3 text-base font-semibold text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
            >
              Annuler
            </button>
          </div>
        </div>

        <div className="no-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[1.75rem] border border-stone-200 bg-white/95 p-2">
          {!normalizedQuery && (
            <div className="px-4 py-8 text-center text-base font-medium text-stone-400">Rechercher un client, un événement ou une date.</div>
          )}
          {normalizedQuery && results.length === 0 && (
            <div className="px-4 py-8 text-center text-base font-medium text-stone-400">Aucun résultat</div>
          )}
          {results.length > 0 && (
            <div className="space-y-1.5">
              {results.map((event) => {
                const timeRange = formatTimeRange(event.startTime, event.endTime);
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onOpenEvent(event.id)}
                    className="grid w-full grid-cols-[3px_1fr] items-center gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-stone-50"
                  >
                    <span className="h-full min-h-14 rounded-full bg-[#bb2720]" />
                    <span className="min-w-0">
                      <span className="block truncate text-base font-semibold leading-snug text-stone-950">{event.clientName}</span>
                      <span className="block truncate text-base font-medium text-stone-500">{event.eventName}</span>
                      <span className="mt-1 block truncate text-sm font-semibold text-stone-400">
                        {formatFullDate(event.date)}
                        {timeRange ? ` · ${timeRange}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function YearOverviewOverlay({
  initialYear,
  events,
  visibleMonth,
  todayKey,
  isSelectedDateToday,
  createMenuOpen,
  setCreateMenuOpen,
  profile,
  email,
  onLogout,
  canManageUsers,
  onOpenUserManagement,
  canManageExternalCalendars,
  onOpenExternalCalendars,
  online,
  pendingSyncCount,
  syncingPendingActions,
  pendingSyncError,
  notifications,
  notificationsOpen,
  setNotificationsOpen,
  onOpenNotification,
  onMarkAllNotificationsRead,
  onGoToday,
  onImportQuote,
  onImportNativeMstvCalendar,
  onSearch,
  onCreateEvent,
  onOpenTrash,
  onSelectMonth,
  canCreateEvent,
  canImportQuote,
  canImportNativeMstvCalendar,
  canOpenTrash,
}: {
  initialYear: number;
  events: ProductionEvent[];
  visibleMonth: Date;
  todayKey: string;
  isSelectedDateToday: boolean;
  createMenuOpen: boolean;
  setCreateMenuOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  profile: UserProfile | null;
  email: string | undefined;
  onLogout: () => void;
  canManageUsers: boolean;
  onOpenUserManagement: () => void;
  canManageExternalCalendars: boolean;
  onOpenExternalCalendars: () => void;
  online: boolean;
  pendingSyncCount: number;
  syncingPendingActions: boolean;
  pendingSyncError: string | null;
  notifications: AppNotification[];
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  onOpenNotification: (notification: AppNotification) => void;
  onMarkAllNotificationsRead: () => void;
  onGoToday: () => void;
  onImportQuote: () => void;
  onImportNativeMstvCalendar: () => void;
  onSearch: () => void;
  onCreateEvent: () => void;
  onOpenTrash: () => void;
  onSelectMonth: (year: number, monthIndex: number) => void;
  canCreateEvent: boolean;
  canImportQuote: boolean;
  canImportNativeMstvCalendar: boolean;
  canOpenTrash: boolean;
}) {
  const [displayYear, setDisplayYear] = useState(initialYear);
  const swipeStartRef = useRef<{ pointerId: number; x: number; y: number; year: number | null; monthIndex: number | null } | null>(null);
  const touchSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const yearPagerRef = useRef<HTMLDivElement | null>(null);
  const wheelLockRef = useRef<number | null>(null);
  const yearTransitionTimeoutRef = useRef<number | null>(null);
  const yearTransitioningRef = useRef(false);
  const suppressYearClickRef = useRef(false);
  const [yearPagerOffset, setYearPagerOffset] = useState(0);
  const [yearPageHeight, setYearPageHeight] = useState(0);
  const [yearTransitionEnabled, setYearTransitionEnabled] = useState(false);
  const shortWeekdays = ["L", "M", "M", "J", "V", "S", "D"];

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowUp") animateYearChange(-1);
      if (event.key === "ArrowDown") animateYearChange(1);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    return () => {
      if (wheelLockRef.current) {
        window.clearTimeout(wheelLockRef.current);
      }
      if (yearTransitionTimeoutRef.current) {
        window.clearTimeout(yearTransitionTimeoutRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const pagerElement = yearPagerRef.current;
    if (!pagerElement) return;
    const observedElement = pagerElement;

    function updatePageHeight() {
      setYearPageHeight(observedElement.clientHeight);
    }

    updatePageHeight();
    const observer = new ResizeObserver(updatePageHeight);
    observer.observe(observedElement);
    return () => observer.disconnect();
  }, []);

  function getYearPageStep() {
    return (yearPageHeight || yearPagerRef.current?.clientHeight || window.innerHeight) + PAGE_GAP;
  }

  function animateYearChange(direction: -1 | 1) {
    if (yearTransitioningRef.current) return;

    const pageStep = getYearPageStep();
    yearTransitioningRef.current = true;
    swipeStartRef.current = null;
    touchSwipeStartRef.current = null;
    setYearTransitionEnabled(true);
    setYearPagerOffset(direction === 1 ? -pageStep : pageStep);

    if (yearTransitionTimeoutRef.current) {
      window.clearTimeout(yearTransitionTimeoutRef.current);
    }

    yearTransitionTimeoutRef.current = window.setTimeout(() => {
      setYearTransitionEnabled(false);
      setDisplayYear((current) => current + direction);
      setYearPagerOffset(0);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          yearTransitioningRef.current = false;
          yearTransitionTimeoutRef.current = null;
        });
      });
    }, PAGE_TRANSITION_MS);
  }

  function settleYearSwipe(deltaY: number, deltaX: number) {
    const pageStep = getYearPageStep();
    const threshold = Math.min(160, Math.max(58, pageStep * 0.14));

    swipeStartRef.current = null;
    touchSwipeStartRef.current = null;

    if (Math.abs(deltaY) < threshold || Math.abs(deltaY) < Math.abs(deltaX) * 1.2) {
      setYearTransitionEnabled(true);
      setYearPagerOffset(0);
      window.setTimeout(() => {
        if (!yearTransitioningRef.current) setYearTransitionEnabled(false);
      }, PAGE_TRANSITION_MS);
      return;
    }

    suppressYearClickRef.current = true;
    window.setTimeout(() => {
      suppressYearClickRef.current = false;
    }, 0);
    animateYearChange(deltaY < 0 ? 1 : -1);
  }

  function handlePointerDown(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (pointerEvent.pointerType === "touch" || yearTransitioningRef.current) return;

    const monthCard = (pointerEvent.target as HTMLElement).closest<HTMLElement>("[data-year-month]");

    swipeStartRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      year: monthCard?.dataset.year ? Number(monthCard.dataset.year) : null,
      monthIndex: monthCard?.dataset.monthIndex ? Number(monthCard.dataset.monthIndex) : null,
    };
    setYearTransitionEnabled(false);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  function handlePointerMove(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    const swipeStart = swipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== pointerEvent.pointerId || yearTransitioningRef.current) return;

    const deltaY = pointerEvent.clientY - swipeStart.y;
    const deltaX = pointerEvent.clientX - swipeStart.x;
    if (Math.abs(deltaY) <= Math.abs(deltaX) || Math.abs(deltaY) < 8) return;

    pointerEvent.preventDefault();
    const pageStep = getYearPageStep();
    setYearPagerOffset(Math.max(-pageStep, Math.min(pageStep, deltaY)));
  }

  function handlePointerUp(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    const swipeStart = swipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== pointerEvent.pointerId) return;

    const deltaX = pointerEvent.clientX - swipeStart.x;
    const deltaY = pointerEvent.clientY - swipeStart.y;
    if (swipeStart.year !== null && swipeStart.monthIndex !== null && Math.max(Math.abs(deltaX), Math.abs(deltaY)) <= 10) {
      const selectedYear = swipeStart.year;
      const selectedMonthIndex = swipeStart.monthIndex;
      swipeStartRef.current = null;
      setYearTransitionEnabled(false);
      setYearPagerOffset(0);
      onSelectMonth(selectedYear, selectedMonthIndex);
      return;
    }

    settleYearSwipe(deltaY, deltaX);
  }

  function handleTouchStart(touchEvent: ReactTouchEvent<HTMLDivElement>) {
    if (yearTransitioningRef.current) return;

    const touch = touchEvent.changedTouches.item(0);
    if (!touch) return;

    touchSwipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
    setYearTransitionEnabled(false);
  }

  function handleTouchMove(touchEvent: ReactTouchEvent<HTMLDivElement>) {
    const touch = touchEvent.changedTouches.item(0);
    const swipeStart = touchSwipeStartRef.current;
    if (!touch || !swipeStart || yearTransitioningRef.current) return;

    const deltaX = touch.clientX - swipeStart.x;
    const deltaY = touch.clientY - swipeStart.y;
    if (Math.abs(deltaY) <= Math.abs(deltaX) || Math.abs(deltaY) < 8) return;

    touchEvent.preventDefault();
    const pageStep = getYearPageStep();
    setYearPagerOffset(Math.max(-pageStep, Math.min(pageStep, deltaY)));
  }

  function handleTouchEnd(touchEvent: ReactTouchEvent<HTMLDivElement>) {
    const touch = touchEvent.changedTouches.item(0);
    const swipeStart = touchSwipeStartRef.current;
    if (!touch || !swipeStart) return;

    const deltaX = touch.clientX - swipeStart.x;
    const deltaY = touch.clientY - swipeStart.y;
    settleYearSwipe(deltaY, deltaX);
  }

  function handleWheel(wheelEvent: ReactWheelEvent<HTMLDivElement>) {
    if (wheelLockRef.current || Math.abs(wheelEvent.deltaY) < 36 || Math.abs(wheelEvent.deltaY) < Math.abs(wheelEvent.deltaX)) return;
    animateYearChange(wheelEvent.deltaY > 0 ? 1 : -1);
    wheelLockRef.current = window.setTimeout(() => {
      wheelLockRef.current = null;
    }, 420);
  }

  const yearPageStep = getYearPageStep();

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#f7f9fb]/95 px-4 pb-[calc(1.15rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] backdrop-blur-xl sm:px-6 sm:pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pt-[calc(1.25rem+env(safe-area-inset-top))] lg:px-8">
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <AppHeader
          screen="calendar"
          setScreen={() => undefined}
          yearLabel={String(displayYear)}
          detailDateLabel={null}
          onEditDetailDate={undefined}
          goToday={onGoToday}
          isSelectedDateToday={isSelectedDateToday}
          createMenuOpen={createMenuOpen}
          setCreateMenuOpen={setCreateMenuOpen}
          profile={profile}
          email={email}
          onLogout={onLogout}
          canManageUsers={canManageUsers}
          onOpenUserManagement={onOpenUserManagement}
          canManageExternalCalendars={canManageExternalCalendars}
          onOpenExternalCalendars={onOpenExternalCalendars}
          online={online}
          pendingSyncCount={pendingSyncCount}
          syncingPendingActions={syncingPendingActions}
          pendingSyncError={pendingSyncError}
          notifications={notifications}
          notificationsOpen={notificationsOpen}
          setNotificationsOpen={setNotificationsOpen}
          onOpenNotification={onOpenNotification}
          onMarkAllNotificationsRead={onMarkAllNotificationsRead}
          onImportQuote={onImportQuote}
          onImportNativeMstvCalendar={onImportNativeMstvCalendar}
          onSearch={onSearch}
          canOpenHistory={false}
          onOpenHistory={() => undefined}
          canOpenTrash={canOpenTrash}
          onOpenTrash={onOpenTrash}
          onLogoClick={onGoToday}
          onOpenYearOverview={() => undefined}
          onCreateEvent={onCreateEvent}
          canCreateEvent={canCreateEvent}
          canImportQuote={canImportQuote}
          canImportNativeMstvCalendar={canImportNativeMstvCalendar}
          canDuplicateEvent={false}
          onDuplicateEvent={() => undefined}
          canDeleteEvent={false}
          onDeleteEvent={() => undefined}
        />
      <div
        ref={yearPagerRef}
        className="mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-hidden"
        style={{
          fontFamily: '"SF Pro Rounded", ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          swipeStartRef.current = null;
          setYearPagerOffset(0);
        }}
        onTouchStartCapture={handleTouchStart}
        onTouchMoveCapture={handleTouchMove}
        onTouchEndCapture={handleTouchEnd}
        onTouchCancelCapture={() => {
          touchSwipeStartRef.current = null;
          setYearPagerOffset(0);
        }}
        onClickCapture={(clickEvent) => {
          if (!suppressYearClickRef.current) return;
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
        }}
        onWheel={handleWheel}
      >
        <div
          className="flex flex-col"
          style={{
            gap: PAGE_GAP,
            height: yearPageHeight ? `${yearPageHeight * 3 + PAGE_GAP * 2}px` : `calc(300% + ${PAGE_GAP * 2}px)`,
            transform: `translate3d(0, ${-yearPageStep + yearPagerOffset}px, 0)`,
            transition: yearTransitionEnabled ? `transform ${PAGE_TRANSITION_MS}ms ${PAGE_TRANSITION_EASING}` : undefined,
          }}
        >
          {[displayYear - 1, displayYear, displayYear + 1].map((year) => (
            <YearOverviewPage
              key={year}
              year={year}
              events={events}
              todayKey={todayKey}
              visibleMonth={visibleMonth}
              weekdays={shortWeekdays}
              pageHeight={yearPageHeight}
              onSelectMonth={onSelectMonth}
            />
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

function YearOverviewPage({
  year,
  events,
  todayKey,
  visibleMonth,
  weekdays,
  pageHeight,
  onSelectMonth,
}: {
  year: number;
  events: ProductionEvent[];
  todayKey: string;
  visibleMonth: Date;
  weekdays: string[];
  pageHeight: number;
  onSelectMonth: (year: number, monthIndex: number) => void;
}) {
  return (
    <section className="flex w-full shrink-0 flex-col" style={{ height: pageHeight ? `${pageHeight}px` : "100%" }}>
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-4 gap-x-2 gap-y-2 pt-1.5 sm:gap-x-4 sm:gap-y-2 sm:pt-2 lg:gap-x-5 lg:gap-y-2">
        {monthNames.map((monthName, monthIndex) => (
          <YearOverviewMiniMonth
            key={`${year}-${monthName}`}
            year={year}
            monthIndex={monthIndex}
            monthName={monthName}
            events={events}
            todayKey={todayKey}
            visibleMonth={visibleMonth}
            weekdays={weekdays}
            onSelect={() => onSelectMonth(year, monthIndex)}
          />
        ))}
      </div>
    </section>
  );
}

function YearOverviewMiniMonth({
  year,
  monthIndex,
  monthName,
  events,
  todayKey,
  visibleMonth,
  weekdays,
  onSelect,
}: {
  year: number;
  monthIndex: number;
  monthName: string;
  events: ProductionEvent[];
  todayKey: string;
  visibleMonth: Date;
  weekdays: string[];
  onSelect: () => void;
}) {
  const monthData = useMemo(() => getCalendarMonthData(new Date(year, monthIndex, 1), events), [events, monthIndex, year]);
  const isVisibleMonth = visibleMonth.getFullYear() === year && visibleMonth.getMonth() === monthIndex;

  return (
    <button
      type="button"
      data-year-month
      data-year={year}
      data-month-index={monthIndex}
      onClick={onSelect}
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.1rem] p-1.5 text-left transition hover:bg-white/70 sm:rounded-[1rem] sm:p-1.5 lg:p-2",
        isVisibleMonth && "bg-white/90 ring-1 ring-[#bb2720]/20",
      )}
    >
      <span className={cn("mb-1 block truncate text-xs font-semibold leading-none sm:mb-1 sm:text-sm", isVisibleMonth ? "text-[#bb2720]" : "text-stone-950")}>
        {monthName}
      </span>
      <span className="grid min-h-0 flex-1 grid-cols-7 content-start gap-y-0.5 sm:content-stretch sm:gap-y-0">
        {weekdays.map((weekday, index) => (
          <span key={`${weekday}-${index}`} className="text-center text-[0.48rem] font-semibold leading-none text-stone-300 sm:text-[0.5rem] lg:text-[0.55rem]">
            {weekday}
          </span>
        ))}
        {Array.from({ length: monthData.leadingEmptyDays }).map((_, index) => (
          <span key={`empty-start-${index}`} className="aspect-square sm:h-3.5 sm:aspect-auto lg:h-4" />
        ))}
        {monthData.calendarDays.map((day) => {
          const isToday = day.dateKey === todayKey;
          const hasEvents = day.events.length > 0;
          return (
            <span key={day.dateKey} className="relative flex aspect-square min-w-0 items-center justify-center sm:h-3.5 sm:aspect-auto lg:h-4">
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[0.56rem] font-semibold leading-none sm:h-3.5 sm:w-3.5 sm:text-[0.54rem] lg:h-4 lg:w-4 lg:text-[0.62rem]",
                  isToday ? "bg-[#bb2720] text-white" : "text-stone-700",
                )}
              >
                {day.day}
              </span>
              {hasEvents && <span className={cn("absolute bottom-0 h-0.5 w-0.5 rounded-full sm:h-1 sm:w-1", isToday ? "bg-[#bb2720]" : "bg-stone-400")} />}
            </span>
          );
        })}
        {Array.from({ length: monthData.trailingEmptyDays }).map((_, index) => (
          <span key={`empty-end-${index}`} className="aspect-square sm:h-3.5 sm:aspect-auto lg:h-4" />
        ))}
      </span>
    </button>
  );
}

function CalendarDashboard({
  events,
  externalEvents,
  onOpen,
  onOpenExternalEvent,
  onDeleteRequest,
  onDuplicateRequest,
  canDeleteEvents,
  canDuplicateEvents,
  visibleMonth,
  selectedDateKey,
  setSelectedDateKey,
  changeMonth,
}: {
  events: ProductionEvent[];
  externalEvents: ExternalCalendarEvent[];
  onOpen: (id: string) => void;
  onOpenExternalEvent: (event: ExternalCalendarEvent) => void;
  onDeleteRequest: (event: ProductionEvent) => void;
  onDuplicateRequest: (event: ProductionEvent) => void;
  canDeleteEvents: boolean;
  canDuplicateEvents: boolean;
  visibleMonth: Date;
  selectedDateKey: string;
  setSelectedDateKey: (dateKey: string) => void;
  changeMonth: (delta: number) => void;
}) {
  const weekdays = ["L", "M", "M", "J", "V", "S", "D"];
  const todayKey = formatDateKey(new Date());
  const currentMonthData = useMemo(() => getCalendarMonthData(visibleMonth, events, externalEvents), [events, externalEvents, visibleMonth]);
  const previousMonthData = useMemo(() => getCalendarMonthData(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1), events, externalEvents), [events, externalEvents, visibleMonth]);
  const nextMonthData = useMemo(() => getCalendarMonthData(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1), events, externalEvents), [events, externalEvents, visibleMonth]);
  const currentSelectedDateKey = isDateKeyInMonth(selectedDateKey, currentMonthData)
    ? selectedDateKey
    : getPreferredDateKeyForMonth(visibleMonth, events);
  const previousSelectedDateKey = getPreferredDateKeyForMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1), events);
  const nextSelectedDateKey = getPreferredDateKeyForMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1), events);
  const [pagerOffset, setPagerOffset] = useState(0);
  const [pagerTransitionEnabled, setPagerTransitionEnabled] = useState(false);
  const [pagerAnimatingDirection, setPagerAnimatingDirection] = useState<-1 | 1 | null>(null);
  const pagerViewportRef = useRef<HTMLDivElement | null>(null);
  const monthSwipeStartRef = useRef<{ pointerId: number; x: number; y: number; axis: "horizontal" | "vertical" | null; dateKey: string | null } | null>(null);
  const monthTransitioningRef = useRef(false);
  const monthTransitionIdRef = useRef(0);
  const monthTransitionTimeoutRef = useRef<number | null>(null);
  const suppressMonthClickRef = useRef(false);

  useEffect(() => {
    if (!isDateKeyInMonth(selectedDateKey, currentMonthData)) {
      setSelectedDateKey(getPreferredDateKeyForMonth(visibleMonth, events));
    }
  }, [currentMonthData, events, selectedDateKey, setSelectedDateKey, visibleMonth]);

  useEffect(() => {
    return () => {
      if (monthTransitionTimeoutRef.current) {
        window.clearTimeout(monthTransitionTimeoutRef.current);
      }
    };
  }, []);

  function animateMonthChange(direction: -1 | 1) {
    if (monthTransitioningRef.current) return;

    const viewportWidth = pagerViewportRef.current?.clientWidth ?? 0;
    const pageStep = getSwipePageStep(viewportWidth);
    const transitionId = monthTransitionIdRef.current + 1;
    monthTransitionIdRef.current = transitionId;
    monthTransitioningRef.current = true;
    monthSwipeStartRef.current = null;
    setPagerTransitionEnabled(true);
    setPagerAnimatingDirection(direction);
    setPagerOffset(direction === 1 ? -pageStep : pageStep);

    if (monthTransitionTimeoutRef.current) {
      window.clearTimeout(monthTransitionTimeoutRef.current);
    }

    monthTransitionTimeoutRef.current = window.setTimeout(() => {
      if (monthTransitionIdRef.current !== transitionId) return;

      setPagerTransitionEnabled(false);
      changeMonth(direction);
      setPagerAnimatingDirection(null);
      setPagerOffset(0);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (monthTransitionIdRef.current !== transitionId) return;
          monthTransitioningRef.current = false;
          monthTransitionTimeoutRef.current = null;
        });
      });
    }, PAGE_TRANSITION_MS);
  }

  function handleMonthSwipePointerDown(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (monthTransitioningRef.current) return;

    const dayCell = (pointerEvent.target as HTMLElement).closest<HTMLElement>("[data-calendar-date-key]");

    monthSwipeStartRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      axis: null,
      dateKey: dayCell?.dataset.calendarDateKey ?? null,
    };
    setPagerTransitionEnabled(false);
    setPagerOffset(0);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  function handleMonthSwipePointerMove(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (monthTransitioningRef.current) return;

    const swipeStart = monthSwipeStartRef.current;
    if (!swipeStart) return;

    const deltaX = pointerEvent.clientX - swipeStart.x;
    const deltaY = pointerEvent.clientY - swipeStart.y;

    if (!swipeStart.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 8) {
      swipeStart.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
    }

    if (swipeStart.axis !== "horizontal") {
      return;
    }

    suppressMonthClickRef.current = true;
    pointerEvent.preventDefault();

    const viewportWidth = pagerViewportRef.current?.clientWidth ?? pointerEvent.currentTarget.clientWidth;
    const pageStep = getSwipePageStep(viewportWidth);
    setPagerOffset(Math.max(-pageStep, Math.min(pageStep, deltaX)));
  }

  function handleMonthSwipePointerUp(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (monthTransitioningRef.current) return;

    const swipeStart = monthSwipeStartRef.current;
    if (!swipeStart) return;

    const deltaX = pointerEvent.clientX - swipeStart.x;
    const deltaY = pointerEvent.clientY - swipeStart.y;
    const viewportWidth = pagerViewportRef.current?.clientWidth ?? pointerEvent.currentTarget.clientWidth;
    const swipeThreshold = getSwipeThreshold(viewportWidth);
    const isHorizontalSwipe = swipeStart.axis === "horizontal" && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
    const isTapSelection = Boolean(swipeStart.dateKey) && Math.max(Math.abs(deltaX), Math.abs(deltaY)) <= 10;

    monthSwipeStartRef.current = null;
    window.setTimeout(() => {
      suppressMonthClickRef.current = false;
    }, 0);

    if (isTapSelection && swipeStart.dateKey) {
      setSelectedDateKey(swipeStart.dateKey);
      setPagerTransitionEnabled(false);
      setPagerOffset(0);
      return;
    }

    if (!isHorizontalSwipe || Math.abs(deltaX) < swipeThreshold) {
      setPagerTransitionEnabled(true);
      setPagerOffset(0);
      window.setTimeout(() => {
        if (!monthTransitioningRef.current) {
          setPagerTransitionEnabled(false);
        }
      }, PAGE_TRANSITION_MS);
      return;
    }

    animateMonthChange(deltaX < 0 ? 1 : -1);
  }

  function resetMonthSwipe() {
    if (monthTransitioningRef.current) return;

    monthSwipeStartRef.current = null;
    setPagerTransitionEnabled(false);
    setPagerOffset(0);
    suppressMonthClickRef.current = false;
  }

  return (
    <section ref={pagerViewportRef} className="min-h-0 flex-1 overflow-hidden">
      <div
        className="flex h-full w-full"
        style={{
          gap: PAGE_GAP,
          transform: `translate3d(calc(-100% - ${PAGE_GAP}px + ${pagerOffset}px), 0, 0)`,
          transition: pagerTransitionEnabled ? `transform ${PAGE_TRANSITION_MS}ms ${PAGE_TRANSITION_EASING}` : undefined,
        }}
      >
        <CalendarMonthPage
          monthData={previousMonthData}
          selectedDateKey={previousSelectedDateKey}
          todayKey={todayKey}
          weekdays={weekdays}
          onSelectDate={setSelectedDateKey}
          onOpen={onOpen}
          onOpenExternalEvent={onOpenExternalEvent}
          onDeleteRequest={onDeleteRequest}
          onDuplicateRequest={onDuplicateRequest}
          canDeleteEvents={canDeleteEvents}
          canDuplicateEvents={canDuplicateEvents}
          onPreviousMonth={() => animateMonthChange(-1)}
          onNextMonth={() => animateMonthChange(1)}
          interactive={false}
        />
        <CalendarMonthPage
          monthData={currentMonthData}
          selectedDateKey={currentSelectedDateKey}
          todayKey={todayKey}
          weekdays={weekdays}
          onSelectDate={setSelectedDateKey}
          onOpen={onOpen}
          onOpenExternalEvent={onOpenExternalEvent}
          onDeleteRequest={onDeleteRequest}
          onDuplicateRequest={onDuplicateRequest}
          canDeleteEvents={canDeleteEvents}
          canDuplicateEvents={canDuplicateEvents}
          onPreviousMonth={() => animateMonthChange(-1)}
          onNextMonth={() => animateMonthChange(1)}
          onCalendarPointerDown={handleMonthSwipePointerDown}
          onCalendarPointerMove={handleMonthSwipePointerMove}
          onCalendarPointerUp={handleMonthSwipePointerUp}
          onCalendarPointerCancel={resetMonthSwipe}
          onCalendarClickCapture={(clickEvent) => {
            if (suppressMonthClickRef.current) {
              suppressMonthClickRef.current = false;
              clickEvent.preventDefault();
              clickEvent.stopPropagation();
            }
          }}
          interactive={!pagerAnimatingDirection}
        />
        <CalendarMonthPage
          monthData={nextMonthData}
          selectedDateKey={nextSelectedDateKey}
          todayKey={todayKey}
          weekdays={weekdays}
          onSelectDate={setSelectedDateKey}
          onOpen={onOpen}
          onOpenExternalEvent={onOpenExternalEvent}
          onDeleteRequest={onDeleteRequest}
          onDuplicateRequest={onDuplicateRequest}
          canDeleteEvents={canDeleteEvents}
          canDuplicateEvents={canDuplicateEvents}
          onPreviousMonth={() => animateMonthChange(-1)}
          onNextMonth={() => animateMonthChange(1)}
          interactive={false}
        />
      </div>
    </section>
  );
}

function CalendarMonthPage({
  monthData,
  selectedDateKey,
  todayKey,
  weekdays,
  onSelectDate,
  onOpen,
  onOpenExternalEvent,
  onDeleteRequest,
  onDuplicateRequest,
  canDeleteEvents,
  canDuplicateEvents,
  onPreviousMonth,
  onNextMonth,
  onCalendarPointerDown,
  onCalendarPointerMove,
  onCalendarPointerUp,
  onCalendarPointerCancel,
  onCalendarClickCapture,
  interactive,
}: {
  monthData: ReturnType<typeof getCalendarMonthData>;
  selectedDateKey: string;
  todayKey: string;
  weekdays: string[];
  onSelectDate: (dateKey: string) => void;
  onOpen: (id: string) => void;
  onOpenExternalEvent: (event: ExternalCalendarEvent) => void;
  onDeleteRequest: (event: ProductionEvent) => void;
  onDuplicateRequest: (event: ProductionEvent) => void;
  canDeleteEvents: boolean;
  canDuplicateEvents: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onCalendarPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCalendarPointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCalendarPointerUp?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCalendarPointerCancel?: () => void;
  onCalendarClickCapture?: (event: React.MouseEvent<HTMLDivElement>) => void;
  interactive: boolean;
}) {
  const selectedDay = monthData.calendarDays.find((day) => day.dateKey === selectedDateKey);
  const selectedEvents = [...(selectedDay?.events ?? [])].sort((a, b) => eventSortValue(a) - eventSortValue(b));
  const selectedExternalEvents = [...(selectedDay?.externalEvents ?? [])].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const selectedMarkers = selectedDay?.markers ?? [];

  return (
    <div className={cn("flex h-full w-full shrink-0 flex-col gap-4 overflow-hidden", !interactive && "pointer-events-none")}>
      <div className="shrink-0">
        <div className="flex items-end justify-between px-1 pt-1">
          <h1 className="text-4xl font-semibold leading-none text-stone-950 sm:text-6xl">{monthData.monthTitle}</h1>
          <div className="hidden items-center gap-2 sm:flex">
            <button onClick={onPreviousMonth} className={calendarArrowClassName} aria-label="Mois précédent" tabIndex={interactive ? 0 : -1}>
              ←
            </button>
            <button onClick={onNextMonth} className={calendarArrowClassName} aria-label="Mois suivant" tabIndex={interactive ? 0 : -1}>
              →
            </button>
          </div>
        </div>
        <div
          onPointerDown={onCalendarPointerDown}
          onPointerMove={onCalendarPointerMove}
          onPointerUp={onCalendarPointerUp}
          onPointerCancel={onCalendarPointerCancel}
          onClickCapture={onCalendarClickCapture}
          style={{ touchAction: "pan-y" }}
          className="mt-4 overflow-hidden rounded-[1.75rem] bg-white/70 p-0"
        >
          <div className="grid grid-cols-7">
            {weekdays.map((weekday, index) => (
              <div key={`${weekday}-${index}`} className="flex min-w-0 items-center justify-center px-1 py-2.5 text-base font-semibold uppercase tracking-normal text-stone-500">
                <span className="block w-full text-center leading-none">{weekday}</span>
              </div>
            ))}
          </div>
          <CalendarMonthGrid
            monthData={monthData}
            selectedDateKey={selectedDateKey}
            todayKey={todayKey}
            onSelectDate={onSelectDate}
            interactive={interactive}
          />
        </div>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5">
        <SelectedDayEvents
          markers={selectedMarkers}
          events={selectedEvents}
          externalEvents={selectedExternalEvents}
          onOpen={onOpen}
          onOpenExternalEvent={onOpenExternalEvent}
          onDeleteRequest={onDeleteRequest}
          onDuplicateRequest={onDuplicateRequest}
          canDeleteEvents={canDeleteEvents}
          canDuplicateEvents={canDuplicateEvents}
        />
      </div>
    </div>
  );
}

function getCalendarMonthData(monthDate: Date, events: ProductionEvent[], externalEvents: ExternalCalendarEvent[] = []) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingEmptyDays = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalCells = Math.ceil((leadingEmptyDays + daysInMonth) / 7) * 7;
  const trailingEmptyDays = totalCells - leadingEmptyDays - daysInMonth;
  const calendarDays = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    return {
      day,
      events: events.filter((event) => event.date === dateKey),
      externalEvents: externalEvents.filter((event) => getExternalEventDateKey(event) === dateKey),
      markers: getCalendarMarkers(dateKey),
      dateKey,
    };
  });

  return {
    year,
    month,
    monthTitle: monthNames[month],
    leadingEmptyDays,
    totalCells,
    trailingEmptyDays,
    calendarDays,
  };
}

function isDateKeyInMonth(dateKey: string, monthData: ReturnType<typeof getCalendarMonthData>) {
  const [dateYear, dateMonth] = dateKey.split("-").map(Number);
  return dateYear === monthData.year && dateMonth === monthData.month + 1;
}

function getPreferredDateKeyForMonth(monthDate: Date, events: ProductionEvent[]) {
  const todayDateKey = formatDateKey(new Date());
  const monthData = getCalendarMonthData(monthDate, events);

  if (isDateKeyInMonth(todayDateKey, monthData)) {
    return todayDateKey;
  }

  const firstEventInMonth = monthData.calendarDays.find((day) => day.events.length > 0);
  return firstEventInMonth?.dateKey ?? `${monthData.year}-${String(monthData.month + 1).padStart(2, "0")}-01`;
}

function CalendarMonthGrid({
  monthData,
  selectedDateKey,
  todayKey,
  onSelectDate,
  className,
  interactive = true,
}: {
  monthData: ReturnType<typeof getCalendarMonthData>;
  selectedDateKey: string;
  todayKey: string;
  onSelectDate: (dateKey: string) => void;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-7 transition-transform duration-[260ms] ease-out",
        className,
      )}
    >
      {Array.from({ length: monthData.leadingEmptyDays }).map((_, index) => (
        <div key={`empty-${index}`} className="h-[70px] border-b border-stone-200/45 bg-white/25 sm:h-[88px] lg:h-[clamp(72px,9svh,112px)]" />
      ))}
      {monthData.calendarDays.map(({ day, events: dayEvents, externalEvents: dayExternalEvents, markers, dateKey }, index) => {
        const position = monthData.leadingEmptyDays + index;
        const isLastRow = position >= monthData.totalCells - 7;
        const isWeekend = position % 7 >= 5;
        const isCurrentDay = dateKey === todayKey;
        const isSelected = dateKey === selectedDateKey;
        const publicHolidayMarker = markers.find((marker) => marker.type === "publicHoliday");
        const schoolHolidayMarker = markers.find((marker) => marker.type === "schoolHoliday");
        const markerLabel = markers.map((marker) => marker.label).join(" • ");
        const dayDots = [
          publicHolidayMarker ? { key: "public-holiday", className: "bg-emerald-400/80" } : null,
          schoolHolidayMarker ? { key: "school-holiday", className: "bg-amber-400/80" } : null,
          ...dayExternalEvents.slice(0, 4).map((event) => {
            const tone = getExternalCalendarTone(event.calendarColor);
            return { key: `external-${event.id}`, className: tone.dot, style: tone.dotStyle };
          }),
          ...dayEvents.slice(0, 4).map((event) => ({ key: event.id, className: "bg-[#bb2720]" })),
        ].filter(Boolean).slice(0, 4) as { key: string; className: string; style?: React.CSSProperties }[];

        return (
          <button
            key={dateKey}
            data-calendar-date-key={dateKey}
            onClick={() => {
              if (interactive) onSelectDate(dateKey);
            }}
            title={markerLabel || undefined}
            tabIndex={interactive ? 0 : -1}
            className={cn(
              "group flex h-[70px] flex-col items-center justify-start gap-1 bg-white/35 px-1 py-2.5 transition hover:bg-white/80 sm:h-[88px] sm:py-3 lg:h-[clamp(72px,9svh,112px)] lg:px-2 lg:py-4",
              schoolHolidayMarker && "bg-amber-50/60 hover:bg-amber-50/85",
              publicHolidayMarker && "bg-emerald-50/70 hover:bg-emerald-50/90",
              !isLastRow && "border-b border-stone-200/45",
              !interactive && "pointer-events-none",
            )}
          >
            <span className="flex w-full items-start justify-center gap-1">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold text-stone-800 lg:h-10 lg:w-10 lg:text-xl",
                  isWeekend && !isSelected && "text-stone-500",
                  isSelected && "bg-[#bb2720] text-white",
                  !isSelected && isCurrentDay && "text-[#bb2720]",
                )}
              >
                {day}
              </span>
            </span>
            {dayDots.length > 0 && (
              <span className="flex min-h-3 w-full items-center justify-center gap-0.5 px-0.5">
                {dayDots.map((dot) => (
                  <span key={dot.key} style={dot.style} className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot.className)} />
                ))}
              </span>
            )}
          </button>
        );
      })}
      {Array.from({ length: monthData.trailingEmptyDays }).map((_, index) => (
        <div key={`trailing-${index}`} className="h-[70px] bg-white/25 sm:h-[88px] lg:h-[clamp(72px,9svh,112px)]" />
      ))}
    </div>
  );
}

function SelectedDayEvents({
  markers,
  events,
  externalEvents,
  onOpen,
  onOpenExternalEvent,
  onDeleteRequest,
  onDuplicateRequest,
  canDeleteEvents,
  canDuplicateEvents,
}: {
  markers: CalendarMarker[];
  events: ProductionEvent[];
  externalEvents: ExternalCalendarEvent[];
  onOpen: (id: string) => void;
  onOpenExternalEvent: (event: ExternalCalendarEvent) => void;
  onDeleteRequest: (event: ProductionEvent) => void;
  onDuplicateRequest: (event: ProductionEvent) => void;
  canDeleteEvents: boolean;
  canDuplicateEvents: boolean;
}) {
  const [openSwipeAction, setOpenSwipeAction] = useState<{ eventId: string; type: "delete" | "duplicate" } | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!openSwipeAction) return;

    function handlePointerDown(event: PointerEvent) {
      if (!sectionRef.current?.contains(event.target as Node)) {
        setOpenSwipeAction(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openSwipeAction]);

  useEffect(() => {
    if ((!canDeleteEvents && openSwipeAction?.type === "delete") || (!canDuplicateEvents && openSwipeAction?.type === "duplicate")) {
      setOpenSwipeAction(null);
    }
  }, [canDeleteEvents, canDuplicateEvents, openSwipeAction]);

  if (markers.length === 0 && events.length === 0 && externalEvents.length === 0) return null;
  const orderedMarkers = [...markers].sort((a, b) => {
    if (a.type === b.type) return 0;
    return a.type === "publicHoliday" ? -1 : 1;
  });

  return (
    <section
      ref={sectionRef}
      onPointerDown={(pointerEvent) => {
        if (openSwipeAction && !(pointerEvent.target as HTMLElement).closest("[data-calendar-swipe-row]")) {
          setOpenSwipeAction(null);
        }
      }}
      className="space-y-1.5 lg:space-y-2"
    >
      {events.map((event) => (
        <SwipeableCalendarEventRow
          key={event.id}
          event={event}
          canDelete={canDeleteEvents}
          canDuplicate={canDuplicateEvents}
          isDeleteOpen={openSwipeAction?.eventId === event.id && openSwipeAction.type === "delete"}
          isDuplicateOpen={openSwipeAction?.eventId === event.id && openSwipeAction.type === "duplicate"}
          hasOpenAction={Boolean(openSwipeAction)}
          onOpenDelete={() => setOpenSwipeAction({ eventId: event.id, type: "delete" })}
          onOpenDuplicate={() => setOpenSwipeAction({ eventId: event.id, type: "duplicate" })}
          onCloseAction={() => setOpenSwipeAction(null)}
          onOpenEvent={onOpen}
          onDeleteRequest={(eventToDelete) => {
            setOpenSwipeAction(null);
            onDeleteRequest(eventToDelete);
          }}
          onDuplicateRequest={(eventToDuplicate) => {
            setOpenSwipeAction(null);
            onDuplicateRequest(eventToDuplicate);
          }}
        />
      ))}
      {externalEvents.map((event) => (
        <ExternalCalendarEventRow key={event.id} event={event} onOpen={onOpenExternalEvent} />
      ))}
      {orderedMarkers.map((marker) => {
        const isPublicHoliday = marker.type === "publicHoliday";
        return (
          <div
            key={`${marker.type}-${marker.label}-${marker.date ?? marker.start}`}
            className={selectedDayStaticRowClassName}
          >
            <span className={cn("h-full min-h-14 rounded-full", isPublicHoliday ? "bg-emerald-400" : "bg-amber-400")} />
            <span className="min-w-0">
              <span className="block text-base font-semibold leading-snug text-stone-950">{marker.label}</span>
              <span className={cn("block truncate text-base font-medium", isPublicHoliday ? "text-emerald-700" : "text-amber-700")}>
                {isPublicHoliday ? "Jour férié" : "Vacances scolaires Zone C"}
              </span>
            </span>
          </div>
        );
      })}
    </section>
  );
}

const calendarEventSwipeActionWidth = 112;
const calendarEventFullSwipeRatio = 0.65;
const selectedDayRowClassName =
  "grid min-h-20 w-full grid-cols-[3px_1fr_auto] items-center gap-4 rounded-xl bg-white/70 px-4 py-4 text-left hover:bg-white lg:gap-5 lg:px-5";
const selectedDayStaticRowClassName =
  "grid min-h-20 w-full grid-cols-[3px_1fr] items-center gap-4 rounded-xl bg-white/70 px-4 py-4 text-left lg:gap-5 lg:px-5";

function ExternalCalendarEventRow({
  event,
  onOpen,
}: {
  event: ExternalCalendarEvent;
  onOpen: (event: ExternalCalendarEvent) => void;
}) {
  const tone = getExternalCalendarTone(event.calendarColor);
  const timeRange = formatExternalEventTimeRange(event);

  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className={selectedDayRowClassName}
    >
      <span style={tone.stripeStyle} className={cn("h-full min-h-14 rounded-full", tone.stripe)} />
      <span className="min-w-0">
        <span className="block text-base font-semibold leading-snug text-stone-950">{event.title}</span>
        <span className={cn("block truncate text-base font-medium", tone.meta)}>
          {event.calendarName}
          {event.location ? ` · ${event.location}` : ""}
        </span>
      </span>
      {timeRange && <span className={cn("pl-2 text-right text-base font-medium", tone.meta)}>{timeRange}</span>}
    </button>
  );
}

function SwipeableCalendarEventRow({
  event,
  canDelete,
  canDuplicate,
  isDeleteOpen,
  isDuplicateOpen,
  hasOpenAction,
  onOpenDelete,
  onOpenDuplicate,
  onCloseAction,
  onOpenEvent,
  onDeleteRequest,
  onDuplicateRequest,
}: {
  event: ProductionEvent;
  canDelete: boolean;
  canDuplicate: boolean;
  isDeleteOpen: boolean;
  isDuplicateOpen: boolean;
  hasOpenAction: boolean;
  onOpenDelete: () => void;
  onOpenDuplicate: () => void;
  onCloseAction: () => void;
  onOpenEvent: (id: string) => void;
  onDeleteRequest: (event: ProductionEvent) => void;
  onDuplicateRequest: (event: ProductionEvent) => void;
}) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const pointerStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const canSwipe = canDelete || canDuplicate;
  const baseOffset = canDelete && isDeleteOpen ? -calendarEventSwipeActionWidth : canDuplicate && isDuplicateOpen ? calendarEventSwipeActionWidth : 0;
  const visibleOffset = isDragging ? dragOffset : baseOffset;
  const deleteActionVisible = canDelete && visibleOffset < -1;
  const duplicateActionVisible = canDuplicate && visibleOffset > 1;
  const stableRowWidthRef = useRef(0);
  const timeRange = formatTimeRange(event.startTime, event.endTime);

  function handlePointerDown(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (!canSwipe) return;
    if ((pointerEvent.target as HTMLElement).closest("[data-swipe-action]")) return;

    pointerStartRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
    };
    setIsDragging(true);
    setDragOffset(baseOffset);
    stableRowWidthRef.current = rowRef.current?.offsetWidth ?? pointerEvent.currentTarget.offsetWidth ?? calendarEventSwipeActionWidth;
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  function handlePointerMove(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (!canSwipe) return;
    const pointerStart = pointerStartRef.current;
    if (!pointerStart) return;

    const deltaX = pointerEvent.clientX - pointerStart.x;
    const deltaY = pointerEvent.clientY - pointerStart.y;

    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
      suppressClickRef.current = true;
      return;
    }

    const rowWidth = stableRowWidthRef.current || rowRef.current?.offsetWidth || calendarEventSwipeActionWidth;
    const minOffset = canDelete ? -rowWidth : 0;
    const maxOffset = canDuplicate ? rowWidth : 0;
    const nextOffset = Math.max(minOffset, Math.min(maxOffset, baseOffset + deltaX));
    if (Math.abs(deltaX) > 6) {
      suppressClickRef.current = true;
      pointerEvent.preventDefault();
    }
    setDragOffset(nextOffset);
  }

  function handlePointerUp(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (!canSwipe) return;
    const pointerStart = pointerStartRef.current;
    if (!pointerStart) return;

    const deltaX = pointerEvent.clientX - pointerStart.x;
    const rowWidth = stableRowWidthRef.current || rowRef.current?.offsetWidth || calendarEventSwipeActionWidth;
    const minOffset = canDelete ? -rowWidth : 0;
    const maxOffset = canDuplicate ? rowWidth : 0;
    const finalOffset = Math.max(minOffset, Math.min(maxOffset, baseOffset + deltaX));
    const fullSwipeThreshold = rowWidth * calendarEventFullSwipeRatio;
    const shouldRequestDelete = canDelete && finalOffset <= -fullSwipeThreshold;
    const shouldRequestDuplicate = canDuplicate && finalOffset >= fullSwipeThreshold;
    const shouldOpenDelete = canDelete && finalOffset < -calendarEventSwipeActionWidth / 2;
    const shouldOpenDuplicate = canDuplicate && finalOffset > calendarEventSwipeActionWidth / 2;
    const shouldCloseDelete = isDeleteOpen && deltaX > calendarEventSwipeActionWidth / 3;
    const shouldCloseDuplicate = isDuplicateOpen && deltaX < -calendarEventSwipeActionWidth / 3;

    pointerStartRef.current = null;
    setIsDragging(false);
    setDragOffset(0);
    stableRowWidthRef.current = 0;

    if (shouldRequestDelete) {
      onCloseAction();
      onDeleteRequest(event);
    } else if (shouldRequestDuplicate) {
      onCloseAction();
      onDuplicateRequest(event);
    } else if (shouldOpenDelete) {
      onOpenDelete();
    } else if (shouldOpenDuplicate) {
      onOpenDuplicate();
    } else if (shouldCloseDelete || shouldCloseDuplicate) {
      onCloseAction();
    } else {
      onCloseAction();
    }
  }

  function handleRowClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (hasOpenAction) {
      onCloseAction();
      return;
    }

    onOpenEvent(event.id);
  }

  return (
    <div data-calendar-swipe-row className="relative overflow-hidden rounded-xl">
      {canDuplicate && (
        <button
          type="button"
          data-swipe-action
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            onDuplicateRequest(event);
          }}
          className={cn(
            "absolute inset-y-0 left-0 z-0 flex w-full items-center justify-start rounded-l-xl bg-sky-600 pl-5 text-base font-semibold text-white transition hover:bg-sky-700",
            duplicateActionVisible ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          Dupliquer
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          data-swipe-action
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            onDeleteRequest(event);
          }}
          className={cn(
            "absolute inset-y-0 right-0 z-0 flex w-full items-center justify-end rounded-r-xl bg-[#bb2720] pr-5 text-base font-semibold text-white transition hover:bg-[#a9231d]",
            deleteActionVisible ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          Supprimer
        </button>
      )}
      <div
        ref={rowRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerStartRef.current = null;
          setIsDragging(false);
          setDragOffset(0);
          stableRowWidthRef.current = 0;
        }}
        onClick={handleRowClick}
            onKeyDown={(keyEvent) => {
          if (keyEvent.key === "Enter" || keyEvent.key === " ") {
            keyEvent.preventDefault();
            if (hasOpenAction) {
              onCloseAction();
            } else {
              onOpenEvent(event.id);
            }
          }
        }}
        role="button"
        tabIndex={0}
        style={{ transform: `translateX(${canSwipe ? visibleOffset : 0}px)`, touchAction: "pan-y" }}
        className={cn(
          selectedDayRowClassName,
          "relative z-10 cursor-pointer will-change-transform",
          isDragging ? "transition-none" : "transition-transform duration-200 ease-out",
        )}
      >
        <span className="h-full min-h-14 rounded-full bg-[#bb2720]" />
        <span className="min-w-0">
          <span className="block text-base font-semibold leading-snug text-stone-950">{event.clientName}</span>
          <span className="block truncate text-base font-medium text-stone-500">{event.eventName}</span>
        </span>
        {timeRange && <span className="pl-2 text-right text-base font-medium text-stone-500">{timeRange}</span>}
      </div>
    </div>
  );
}

function ProductionDetail({
  event,
  previousEvent,
  nextEvent,
  hasPrevious,
  hasNext,
  goPrevious,
  goNext,
  onUpdateEventTime,
  onToggleOption,
  onChangeOptionCompletedBy,
  onCreateOption,
  onDeleteOption,
  onRenameOption,
  onCreateOptionItem,
  onUpdateOptionItem,
  onDeleteOptionItem,
  onCreateLink,
  onDeleteLink,
  onRenameLink,
  onSaveLinkEntries,
  onCreateDocumentGroup,
  onDeleteDocumentGroup,
  onRenameDocumentGroup,
  onUploadDocument,
  onDeleteDocumentFile,
  onOpenDocument,
  onDownloadDocument,
  onTimelineTimeEditStart,
  onTimelineTimeEditEnd,
  permissions,
  profile,
}: {
  event: ProductionEvent;
  previousEvent: ProductionEvent | null;
  nextEvent: ProductionEvent | null;
  hasPrevious: boolean;
  hasNext: boolean;
  goPrevious: () => void;
  goNext: () => void;
  onUpdateEventTime: (event: ProductionEvent, field: EventTimeField, value: string) => Promise<void>;
  onToggleOption: (option: EventOption) => Promise<void>;
  onChangeOptionCompletedBy: (option: EventOption, choice: CompletedByOverrideChoice, customLabel?: string) => Promise<void>;
  onCreateOption: (eventId: string, label: string) => Promise<EventOption>;
  onDeleteOption: (option: EventOption) => Promise<void>;
  onRenameOption: (option: EventOption, label: string) => Promise<EventOption>;
  onCreateOptionItem: (option: EventOption, label: string) => Promise<EventOptionItem>;
  onUpdateOptionItem: (option: EventOption, item: EventOptionItem, label: string) => Promise<EventOptionItem>;
  onDeleteOptionItem: (option: EventOption, item: EventOptionItem) => Promise<void>;
  onCreateLink: (eventId: string, input: { label: string; url: string }) => Promise<EventLink>;
  onDeleteLink: (link: EventLink) => Promise<void>;
  onRenameLink: (link: EventLink, label: string) => Promise<EventLink>;
  onSaveLinkEntries: (link: EventLink, drafts: LinkEntryDraft[]) => Promise<EventLink>;
  onCreateDocumentGroup: (eventId: string, label: string) => Promise<EventDocumentGroup>;
  onDeleteDocumentGroup: (group: EventDocumentGroup) => Promise<void>;
  onRenameDocumentGroup: (group: EventDocumentGroup, label: string) => Promise<EventDocumentGroup>;
  onUploadDocument: (group: EventDocumentGroup, file: globalThis.File) => Promise<EventDocument>;
  onDeleteDocumentFile: (document: EventDocument) => Promise<void>;
  onOpenDocument: (document: EventDocument) => Promise<void>;
  onDownloadDocument: (document: EventDocument) => Promise<void>;
  onTimelineTimeEditStart: (saveTime: () => Promise<void>) => void;
  onTimelineTimeEditEnd: () => void;
  permissions: AppPermissions;
  profile: UserProfile | null;
}) {
  const [contextSelection, setContextSelection] = useState<ContextSelection>(null);
  const [addForm, setAddForm] = useState<ItemKind | null>(null);
  const [optionName, setOptionName] = useState("");
  const [linkName, setLinkName] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [manageError, setManageError] = useState<string | null>(null);
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DeleteSelection | null>(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const detailScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const detailBlockRef = useRef<HTMLDivElement | null>(null);
  const previousContextSelectionKeyRef = useRef<string | null>(null);
  const eventSwipeViewportRef = useRef<HTMLDivElement | null>(null);
  const eventSwipeStartRef = useRef<{ pointerId: number; x: number; y: number; axis: "horizontal" | "vertical" | null } | null>(null);
  const eventSwipeResetAfterEventChangeRef = useRef(false);
  const suppressEventSwipeClickRef = useRef(false);
  const [eventSwipeOffset, setEventSwipeOffset] = useState(0);
  const [eventSwipeIncomingOffset, setEventSwipeIncomingOffset] = useState(0);
  const [eventSwipeIncomingEvent, setEventSwipeIncomingEvent] = useState<ProductionEvent | null>(null);
  const [isEventSwipeDragging, setIsEventSwipeDragging] = useState(false);
  const [eventSwipeAnimating, setEventSwipeAnimating] = useState(false);

  const contextSelectionKey =
    contextSelection?.type === "option"
      ? `option-${contextSelection.optionId}`
      : contextSelection?.type === "link"
        ? `link-${contextSelection.linkId}`
        : contextSelection?.type === "document"
          ? `document-${contextSelection.groupId}`
          : null;

  useEffect(() => {
    setContextSelection((current) => {
      if (!current) return null;
      if (current?.type === "option" && event.options.some((option) => option.id === current.optionId)) return current;
      if (current?.type === "link" && event.links.some((link) => link.id === current.linkId)) return current;
      if (current?.type === "document" && event.documentGroups.some((group) => group.id === current.groupId)) return current;
      return null;
    });
  }, [event.documentGroups, event.id, event.links, event.options]);

  useEffect(() => {
    if (!confirmDelete) return;

    function handlePointerDown(pointerEvent: PointerEvent) {
      const target = pointerEvent.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-grid-delete-confirm]")) return;
      if (target.closest("[data-grid-delete-dialog]")) return;
      setDeleteConfirmationOpen(false);
      setConfirmDelete(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [confirmDelete]);

  useEffect(() => {
    const previousSelectionKey = previousContextSelectionKeyRef.current;
    previousContextSelectionKeyRef.current = contextSelectionKey;

    if (!contextSelectionKey || contextSelectionKey === previousSelectionKey) return;

    let firstFrame = 0;
    let secondFrame = 0;
    const settleTimers: number[] = [];

    function scrollDetailIntoView(behavior: ScrollBehavior) {
      const scrollContainer = detailScrollContainerRef.current;
      const detailBlock = detailBlockRef.current;
      if (!scrollContainer || !detailBlock) return;

      const containerBounds = scrollContainer.getBoundingClientRect();
      const detailBounds = detailBlock.getBoundingClientRect();
      const detailTop = detailBounds.top - containerBounds.top + scrollContainer.scrollTop;
      const detailBottom = detailTop + detailBounds.height;
      const scrollMargin = 22;
      const visibleTop = scrollContainer.scrollTop;
      const visibleBottom = visibleTop + scrollContainer.clientHeight;

      if (detailTop >= visibleTop + scrollMargin && detailBottom <= visibleBottom - scrollMargin) {
        return;
      }

      const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      scrollContainer.scrollTo({
        top: Math.min(maxScrollTop, Math.max(0, detailTop - scrollMargin)),
        behavior,
      });
    }

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => scrollDetailIntoView("smooth"));
    });

    // Link detail rows hydrate local drafts/inputs after selection, so give the
    // layout one short settle pass before deciding whether it still needs help.
    settleTimers.push(window.setTimeout(() => scrollDetailIntoView("smooth"), contextSelection?.type === "link" ? 120 : 60));
    settleTimers.push(window.setTimeout(() => scrollDetailIntoView("auto"), 260));

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      settleTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [contextSelectionKey]);

  useLayoutEffect(() => {
    const scrollContainer = detailScrollContainerRef.current;
    if (!scrollContainer) return;

    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
  }, [event.id]);

  useLayoutEffect(() => {
    if (!eventSwipeResetAfterEventChangeRef.current) return;

    eventSwipeResetAfterEventChangeRef.current = false;
    const scrollContainer = detailScrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
      scrollContainer.scrollLeft = 0;
    }
    setIsEventSwipeDragging(true);
    setEventSwipeOffset(0);
    setEventSwipeIncomingOffset(0);
    setEventSwipeIncomingEvent(null);

    window.requestAnimationFrame(() => {
      setIsEventSwipeDragging(false);
      setEventSwipeAnimating(false);
    });
  }, [event.id]);

  function selectOption(option: EventOption) {
    setContextSelection((current) =>
      current?.type === "option" && current.optionId === option.id ? null : { type: "option", optionId: option.id },
    );
  }

  function selectLink(link: EventLink) {
    setContextSelection((current) => (current?.type === "link" && current.linkId === link.id ? null : { type: "link", linkId: link.id }));
  }

  function selectDocumentGroup(group: EventDocumentGroup) {
    setContextSelection((current) =>
      current?.type === "document" && current.groupId === group.id ? null : { type: "document", groupId: group.id },
    );
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
      setManageError(getUserFacingErrorMessage(createError, "Impossible d'ajouter l'option."));
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
      setContextSelection({ type: "link", linkId: link.id });
    } catch (createError) {
      setManageError(getUserFacingErrorMessage(createError, "Impossible d'ajouter le lien."));
    } finally {
      setSubmittingAdd(false);
    }
  }

  async function addDocumentGroup(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setSubmittingAdd(true);
    setManageError(null);

    try {
      const group = await onCreateDocumentGroup(event.id, documentName);
      setDocumentName("");
      setAddForm(null);
      setContextSelection({ type: "document", groupId: group.id });
    } catch (createError) {
      setManageError(getUserFacingErrorMessage(createError, "Impossible d'ajouter le document."));
    } finally {
      setSubmittingAdd(false);
    }
  }

  async function deleteSelectedGridItem() {
    if (!confirmDelete) return;

    setDeletingItem(true);
    setManageError(null);

    try {
      if (confirmDelete.type === "option") {
        const option = event.options.find((item) => item.id === confirmDelete.optionId);
        if (!option) return;
        await onDeleteOption(option);
        if (contextSelection?.type === "option" && contextSelection.optionId === option.id) {
          setContextSelection(null);
        }
      } else if (confirmDelete.type === "link") {
        const link = event.links.find((item) => item.id === confirmDelete.linkId);
        if (!link) return;
        await onDeleteLink(link);
        if (contextSelection?.type === "link" && contextSelection.linkId === link.id) {
          setContextSelection(null);
        }
      } else {
        const group = event.documentGroups.find((item) => item.id === confirmDelete.groupId);
        if (!group) return;
        await onDeleteDocumentGroup(group);
        if (contextSelection?.type === "document" && contextSelection.groupId === group.id) {
          setContextSelection(null);
        }
      }

      setConfirmDelete(null);
      setDeleteConfirmationOpen(false);
    } catch (deleteError) {
      setManageError(getUserFacingErrorMessage(deleteError, "Impossible de supprimer cet élément."));
    } finally {
      setDeletingItem(false);
    }
  }

  function cancelSelectedGridDelete() {
    setDeleteConfirmationOpen(false);
    setConfirmDelete(null);
  }

  function isTouchEventSwipeTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && !target.closest("input, textarea, select, button, a, [contenteditable='true']");
  }

  function resetEventSwipe() {
    eventSwipeStartRef.current = null;
    setIsEventSwipeDragging(false);
    setEventSwipeOffset(0);
    setEventSwipeIncomingOffset(0);
    setEventSwipeIncomingEvent(null);
  }

  function animateEventNavigation(direction: -1 | 1) {
    const canNavigate = direction === 1 ? hasNext : hasPrevious;
    const incomingEvent = direction === 1 ? nextEvent : previousEvent;
    if (!canNavigate || !incomingEvent || eventSwipeAnimating) {
      resetEventSwipe();
      return;
    }

    const viewportWidth = eventSwipeViewportRef.current?.clientWidth ?? window.innerWidth;
    const pageStep = getSwipePageStep(viewportWidth);
    const exitOffset = direction === 1 ? -pageStep : pageStep;
    eventSwipeResetAfterEventChangeRef.current = true;
    setEventSwipeIncomingEvent(incomingEvent);
    setIsEventSwipeDragging(false);
    setEventSwipeAnimating(true);
    setEventSwipeOffset(exitOffset);
    setEventSwipeIncomingOffset(0);

    window.setTimeout(() => {
      const scrollContainer = detailScrollContainerRef.current;
      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
        scrollContainer.scrollLeft = 0;
      }

      if (direction === 1) {
        goNext();
      } else {
        goPrevious();
      }
    }, PAGE_TRANSITION_MS);
  }

  function beginEventSwipe(pointerId: number, clientX: number, clientY: number) {
    eventSwipeStartRef.current = {
      pointerId,
      x: clientX,
      y: clientY,
      axis: null,
    };
    suppressEventSwipeClickRef.current = false;
    setIsEventSwipeDragging(true);
  }

  function updateEventSwipe(pointerId: number, clientX: number, clientY: number, currentTargetWidth: number, preventDefault: () => void) {
    const swipeStart = eventSwipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== pointerId || eventSwipeAnimating) return;

    const deltaX = clientX - swipeStart.x;
    const deltaY = clientY - swipeStart.y;

    if (!swipeStart.axis && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      swipeStart.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
    }

    if (swipeStart.axis === "vertical") {
      resetEventSwipe();
      return;
    }

    if (swipeStart.axis !== "horizontal") return;

    preventDefault();
    suppressEventSwipeClickRef.current = true;

    const canNavigate = deltaX < 0 ? hasNext : hasPrevious;
    const viewportWidth = eventSwipeViewportRef.current?.clientWidth ?? currentTargetWidth;
    const pageStep = getSwipePageStep(viewportWidth);
    const resistedOffset = canNavigate ? deltaX : deltaX * 0.22;
    const boundedOffset = Math.max(-pageStep, Math.min(pageStep, resistedOffset));
    setEventSwipeOffset(boundedOffset);

    const direction = deltaX < 0 ? 1 : -1;
    const incomingEvent = direction === 1 ? nextEvent : previousEvent;
    if (canNavigate && incomingEvent) {
      const incomingStartOffset = direction === 1 ? pageStep : -pageStep;
      setEventSwipeIncomingEvent(incomingEvent);
      setEventSwipeIncomingOffset(Math.max(-pageStep, Math.min(pageStep, incomingStartOffset + deltaX)));
    } else {
      setEventSwipeIncomingEvent(null);
      setEventSwipeIncomingOffset(0);
    }
  }

  function finishEventSwipe(pointerId: number, clientX: number, currentTargetWidth: number) {
    const swipeStart = eventSwipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== pointerId) return;

    const deltaX = clientX - swipeStart.x;
    const viewportWidth = eventSwipeViewportRef.current?.clientWidth ?? currentTargetWidth;
    const swipeThreshold = getSwipeThreshold(viewportWidth);
    eventSwipeStartRef.current = null;
    setIsEventSwipeDragging(false);

    if (swipeStart.axis === "horizontal" && Math.abs(deltaX) >= swipeThreshold) {
      animateEventNavigation(deltaX < 0 ? 1 : -1);
      return;
    }

    setEventSwipeOffset(0);
    setEventSwipeIncomingOffset(0);
    setEventSwipeIncomingEvent(null);
  }

  function handleEventSwipePointerDown(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (eventSwipeStartRef.current || eventSwipeAnimating || pointerEvent.pointerType === "mouse" || !isTouchEventSwipeTarget(pointerEvent.target)) return;
    if (typeof window !== "undefined" && !window.matchMedia("(hover: none), (pointer: coarse)").matches) return;

    beginEventSwipe(pointerEvent.pointerId, pointerEvent.clientX, pointerEvent.clientY);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  function handleEventSwipePointerMove(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    updateEventSwipe(pointerEvent.pointerId, pointerEvent.clientX, pointerEvent.clientY, pointerEvent.currentTarget.clientWidth, () => pointerEvent.preventDefault());
  }

  function handleEventSwipePointerUp(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    finishEventSwipe(pointerEvent.pointerId, pointerEvent.clientX, pointerEvent.currentTarget.clientWidth);
  }

  return (
    <div
      ref={eventSwipeViewportRef}
      className="relative flex min-h-0 flex-1 overflow-hidden"
    >
      {eventSwipeIncomingEvent && (
        <EventSwipePreview
          event={eventSwipeIncomingEvent}
          style={{
            transform: `translate3d(${eventSwipeIncomingOffset}px, 0, 0)`,
            transition: isEventSwipeDragging ? undefined : `transform ${PAGE_TRANSITION_MS}ms ${PAGE_TRANSITION_EASING}`,
          }}
        />
      )}
      <section
        className="relative z-10 flex min-h-0 w-full flex-1 flex-col gap-5 overflow-hidden"
        style={{
          transform: `translate3d(${eventSwipeOffset}px, 0, 0)`,
          transition: isEventSwipeDragging ? undefined : `transform ${PAGE_TRANSITION_MS}ms ${PAGE_TRANSITION_EASING}`,
        }}
      >
      <Card
        className="premium-surface shrink-0 touch-pan-y p-5 sm:p-8"
        onPointerDown={handleEventSwipePointerDown}
        onPointerMove={handleEventSwipePointerMove}
        onPointerUp={handleEventSwipePointerUp}
        onPointerCancel={resetEventSwipe}
        onClickCapture={(clickEvent) => {
          if (!suppressEventSwipeClickRef.current) return;
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          suppressEventSwipeClickRef.current = false;
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-4xl font-semibold leading-tight text-stone-950 sm:text-6xl">{event.clientName}</h1>
            <p className="mt-2 truncate text-base font-medium text-stone-500">{event.eventName}</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <button onClick={goPrevious} disabled={!hasPrevious} className={calendarArrowClassName} aria-label="Événement précédent">
              ←
            </button>
            <button onClick={goNext} disabled={!hasNext} className={calendarArrowClassName} aria-label="Événement suivant">
              →
            </button>
          </div>
        </div>
        <ProductionTimeline
          event={event}
          onUpdateTime={onUpdateEventTime}
          onTimelineTimeEditStart={onTimelineTimeEditStart}
          onTimelineTimeEditEnd={onTimelineTimeEditEnd}
          editable={permissions.canManageEvents}
        />
      </Card>

      <div key={event.id} ref={detailScrollContainerRef} className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pb-6">
        <Card className="premium-surface overflow-hidden p-3 sm:p-5">
        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-1.5 sm:gap-4 lg:items-start">
          <div className="min-w-0">
            <SectionHeader
              label="Options"
              tone="option"
              addLabel="Ajouter une option"
              onAdd={permissions.canManageOperational ? () => setAddForm((current) => (current === "option" ? null : "option")) : undefined}
            />
            {permissions.canManageOperational && addForm === "option" && (
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
            <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
              {event.options.map((option) => {
                const Icon = getOptionIcon(option.label);
                const optionTone = getOptionTone(option.status);
                const optionCompletedName = option.status === "completed" ? getCompletedByNameForDisplay(option) : null;
                const showOptionCompletedName = Boolean(optionCompletedName);
                const isSelectedOption = contextSelection?.type === "option" && contextSelection.optionId === option.id;
                const isConfirmingDelete = confirmDelete?.type === "option" && confirmDelete.optionId === option.id;
                const canManageOptionStructure = canManageCreatedEntity(permissions, profile, option);
                const canDeleteOption = canManageOptionStructure && (permissions.canManageEvents || option.items.every((item) => canManageCreatedEntity(permissions, profile, item)));
                return (
                  <div
                    key={option.id}
                    data-grid-delete-confirm={isConfirmingDelete ? true : undefined}
                    className={cn(
                      "group relative flex min-h-[4.75rem] items-center gap-1.5 rounded-xl border-2 transition sm:min-h-20 sm:gap-2",
                      optionTone.surface,
                      optionTone.border,
                      optionTone.hover,
                      isSelectedOption && "border-emerald-700 ring-2 ring-emerald-700/20",
                    )}
                  >
                    {isConfirmingDelete ? (
                      <InlineGridDeleteConfirmation
                        tone="option"
                        deleting={deletingItem}
                        onCancel={() => setConfirmDelete(null)}
                        onConfirm={() => setDeleteConfirmationOpen(true)}
                      />
                    ) : (
                      <>
                        <button
                          onClick={() => selectOption(option)}
                          className={cn(
                            "flex min-h-[4.75rem] min-w-0 flex-1 px-2 py-3 text-left sm:min-h-20 sm:px-3",
                        showOptionCompletedName ? "flex-col items-start justify-between gap-2" : "items-center gap-1.5 sm:gap-2",
                      )}
                    >
                      {showOptionCompletedName ? (
                        <>
                          <span className="inline-flex max-w-full shrink-0 rounded-full border border-emerald-300 bg-white/75 px-2 py-0.5 text-base font-bold leading-tight text-emerald-800">
                                <span className="truncate">{optionCompletedName}</span>
                          </span>
                              <span className="flex w-full min-w-0 items-center gap-1.5 pr-5 sm:gap-2">
                                <Icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", optionTone.icon)} />
                                <span className={cn("min-w-0 flex-1 truncate text-base font-semibold", optionTone.text)}>{option.label}</span>
                              </span>
                            </>
                          ) : (
                            <>
                              <Icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", optionTone.icon)} />
                              <span className={cn("min-w-0 flex-1 truncate pr-5 text-base font-semibold", optionTone.text)}>{option.label}</span>
                            </>
                          )}
                        </button>
                        {canDeleteOption && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setConfirmDelete({ type: "option", optionId: option.id });
                            }}
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-emerald-500 opacity-100 transition hover:bg-white/70 hover:text-emerald-800 focus:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                            aria-label="Supprimer cette option"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="min-w-0">
            <SectionHeader
              label="Liens"
              tone="link"
              addLabel="Ajouter un lien"
              onAdd={permissions.canManageOperational ? () => setAddForm((current) => (current === "link" ? null : "link")) : undefined}
            />
            {permissions.canManageOperational && addForm === "link" && (
              <InlineAddForm onSubmit={addLink} eventId={event.id}>
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
            <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
              {event.links.map((link) => {
                const Icon = getLinkIcon(link.label);
                const isSelectedLink = contextSelection?.type === "link" && contextSelection.linkId === link.id;
                const linkTone = getLinkTone(getLinkState(link));
                const isConfirmingDelete = confirmDelete?.type === "link" && confirmDelete.linkId === link.id;
                const canManageLinkStructure = canManageCreatedEntity(permissions, profile, link);
                const canDeleteLink = canManageLinkStructure && (permissions.canManageEvents || link.entries.every((entry) => canManageCreatedEntity(permissions, profile, entry)));
                return (
                  <div
                    key={link.id}
                    data-grid-delete-confirm={isConfirmingDelete ? true : undefined}
                    className={cn(
                      "group relative flex min-h-[4.75rem] items-center gap-1.5 rounded-xl border-2 transition sm:min-h-20 sm:gap-2",
                      linkTone.surface,
                      linkTone.border,
                      linkTone.hover,
                      isSelectedLink && "border-sky-700 ring-2 ring-sky-700/20",
                    )}
                  >
                    {isConfirmingDelete ? (
                      <InlineGridDeleteConfirmation
                        tone="link"
                        deleting={deletingItem}
                        onCancel={() => setConfirmDelete(null)}
                        onConfirm={() => setDeleteConfirmationOpen(true)}
                      />
                    ) : (
                      <>
                        <button onClick={() => selectLink(link)} className="flex min-h-[4.75rem] min-w-0 flex-1 items-center gap-1.5 px-2 py-3 text-left sm:min-h-20 sm:gap-2 sm:px-3">
                          <Icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", linkTone.icon)} />
                          <span className={cn("min-w-0 flex-1 truncate pr-5 text-base font-semibold", linkTone.text)}>{link.label}</span>
                        </button>
                        <ExternalLink className="mr-8 hidden h-4 w-4 shrink-0 text-sky-400 sm:block" />
                        {canDeleteLink && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setConfirmDelete({ type: "link", linkId: link.id });
                            }}
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-sky-500 opacity-100 transition hover:bg-white/70 hover:text-sky-800 focus:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                            aria-label="Supprimer ce lien"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="min-w-0">
            <SectionHeader
              label="Documents"
              tone="document"
              addLabel="Ajouter un document"
              onAdd={permissions.canManageOperational ? () => setAddForm((current) => (current === "document" ? null : "document")) : undefined}
            />
            {permissions.canManageOperational && addForm === "document" && (
              <InlineAddForm onSubmit={addDocumentGroup} eventId={event.id}>
                <input
                  required
                  value={documentName}
                  onChange={(inputEvent) => setDocumentName(inputEvent.target.value)}
                  placeholder="Nom du document"
                  className={inlineAddInputClassName}
                />
                <InlineAddButton tone="document" disabled={submittingAdd}>
                  Ajouter
                </InlineAddButton>
              </InlineAddForm>
            )}
            <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
              {event.documentGroups.map((group) => {
                const Icon = getDocumentGroupIcon(group);
                const documentTone = getDocumentTone(group.files.length > 0);
                const isSelectedDocument = contextSelection?.type === "document" && contextSelection.groupId === group.id;
                const isConfirmingDelete = confirmDelete?.type === "document" && confirmDelete.groupId === group.id;
                const canManageDocumentGroupStructure = canManageCreatedEntity(permissions, profile, group);
                const canDeleteDocumentGroup =
                  canManageDocumentGroupStructure && (permissions.canManageEvents || group.files.every((file) => canManageCreatedEntity(permissions, profile, file)));
                return (
                  <div
                    key={group.id}
                    data-grid-delete-confirm={isConfirmingDelete ? true : undefined}
                    className={cn(
                      "group relative flex min-h-[4.75rem] items-center gap-1.5 rounded-xl border-2 transition sm:min-h-20 sm:gap-2",
                      documentTone.surface,
                      documentTone.border,
                      documentTone.hover,
                      isSelectedDocument && documentTone.selected,
                    )}
                  >
                    {isConfirmingDelete ? (
                      <InlineGridDeleteConfirmation
                        tone="document"
                        deleting={deletingItem}
                        onCancel={() => setConfirmDelete(null)}
                        onConfirm={() => setDeleteConfirmationOpen(true)}
                      />
                    ) : (
                      <>
                        <button
                          onClick={() => selectDocumentGroup(group)}
                          className="flex min-h-[4.75rem] min-w-0 flex-1 items-center gap-1.5 px-2 py-3 text-left sm:min-h-20 sm:gap-2 sm:px-3"
                        >
                          <Icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", documentTone.icon)} />
                          <span className={cn("min-w-0 flex-1 truncate pr-5 text-base font-semibold", documentTone.text)}>{group.label}</span>
                        </button>
                        {canDeleteDocumentGroup && (
                          <button
                            onClick={(buttonEvent) => {
                              buttonEvent.stopPropagation();
                              setConfirmDelete({ type: "document", groupId: group.id });
                            }}
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-amber-500 opacity-100 transition hover:bg-white/70 hover:text-amber-800 focus:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                            aria-label="Supprimer ce document"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {manageError && <div className="mt-3 text-base font-medium text-rose-700">{manageError}</div>}
      </Card>

        <div ref={detailBlockRef} className="scroll-mt-4">
          <ContextDetailBlock
            event={event}
            selection={contextSelection}
            onToggleOption={onToggleOption}
            onChangeOptionCompletedBy={onChangeOptionCompletedBy}
            onRenameOption={onRenameOption}
            onCreateOptionItem={onCreateOptionItem}
            onUpdateOptionItem={onUpdateOptionItem}
            onDeleteOptionItem={onDeleteOptionItem}
            onRenameLink={onRenameLink}
            onSaveLinkEntries={onSaveLinkEntries}
            onRenameDocumentGroup={onRenameDocumentGroup}
            onUploadDocument={onUploadDocument}
            onDeleteDocumentFile={onDeleteDocumentFile}
            onOpenDocument={onOpenDocument}
            onDownloadDocument={onDownloadDocument}
            permissions={permissions}
            profile={profile}
          />
        </div>
      </div>
    </section>
    {deleteConfirmationOpen && confirmDelete && (
      <CompactGridDeleteDialog
        deleting={deletingItem}
        onCancel={cancelSelectedGridDelete}
        onConfirm={() => void deleteSelectedGridItem()}
      />
    )}
    </div>
  );
}

function EventSwipePreview({ event, style }: { event: ProductionEvent; style: React.CSSProperties }) {
  return (
    <section aria-hidden className="pointer-events-none absolute inset-0 z-0 flex min-h-0 w-full flex-col gap-5 overflow-hidden" style={style}>
      <Card className="premium-surface shrink-0 p-5 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-4xl font-semibold leading-tight text-stone-950 sm:text-6xl">{event.clientName}</h1>
            <p className="mt-2 truncate text-base font-medium text-stone-500">{event.eventName}</p>
          </div>
        </div>
        <ProductionTimeline
          event={event}
          onUpdateTime={async () => {}}
          onTimelineTimeEditStart={() => {}}
          onTimelineTimeEditEnd={() => {}}
        />
      </Card>

      <div className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-hidden pb-6">
        <Card className="premium-surface overflow-hidden p-3 sm:p-5">
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-1.5 sm:gap-4 lg:items-start">
            <div className="min-w-0">
              <SectionHeader label="Options" tone="option" addLabel="Ajouter une option" onAdd={() => {}} />
              <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
                {event.options.map((option) => {
                const Icon = getOptionIcon(option.label);
                const optionTone = getOptionTone(option.status);
                const optionCompletedName = option.status === "completed" ? getCompletedByNameForDisplay(option) : null;
                const showOptionCompletedName = Boolean(optionCompletedName);
                return (
                  <div
                    key={option.id}
                    className={cn(
                      "group relative flex min-h-[4.75rem] items-center gap-1.5 rounded-xl border-2 sm:min-h-20 sm:gap-2",
                      optionTone.surface,
                      optionTone.border,
                      optionTone.hover,
                    )}
                  >
                    <div
                      className={cn(
                        "flex min-h-[4.75rem] min-w-0 flex-1 px-2 py-3 text-left sm:min-h-20 sm:px-3",
                        showOptionCompletedName ? "flex-col items-start justify-between gap-2" : "items-center gap-1.5 sm:gap-2",
                      )}
                    >
                      {showOptionCompletedName ? (
                        <>
                          <span className="inline-flex max-w-full shrink-0 rounded-full border border-emerald-300 bg-white/75 px-2 py-0.5 text-base font-bold leading-tight text-emerald-800">
                            <span className="truncate">{optionCompletedName}</span>
                          </span>
                          <span className="flex w-full min-w-0 items-center gap-1.5 pr-5 sm:gap-2">
                            <Icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", optionTone.icon)} />
                            <span className={cn("min-w-0 flex-1 truncate text-base font-semibold", optionTone.text)}>{option.label}</span>
                          </span>
                        </>
                      ) : (
                        <>
                          <Icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", optionTone.icon)} />
                          <span className={cn("min-w-0 flex-1 truncate pr-5 text-base font-semibold", optionTone.text)}>{option.label}</span>
                        </>
                      )}
                    </div>
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-emerald-500 opacity-100 [@media(hover:hover)]:opacity-0">
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </div>
                );
              })}
              </div>
            </div>
            <div className="min-w-0">
              <SectionHeader label="Liens" tone="link" addLabel="Ajouter un lien" onAdd={() => {}} />
              <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
                {event.links.map((link) => {
                const Icon = getLinkIcon(link.label);
                const linkTone = getLinkTone(getLinkState(link));
                return (
                  <div
                    key={link.id}
                    className={cn(
                      "group relative flex min-h-[4.75rem] items-center gap-1.5 rounded-xl border-2 sm:min-h-20 sm:gap-2",
                      linkTone.surface,
                      linkTone.border,
                      linkTone.hover,
                    )}
                  >
                    <div className="flex min-h-[4.75rem] min-w-0 flex-1 items-center gap-1.5 px-2 py-3 text-left sm:min-h-20 sm:gap-2 sm:px-3">
                      <Icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", linkTone.icon)} />
                      <span className={cn("min-w-0 flex-1 truncate pr-5 text-base font-semibold", linkTone.text)}>{link.label}</span>
                    </div>
                    <ExternalLink className="mr-8 hidden h-4 w-4 shrink-0 text-sky-400 sm:block" />
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-sky-500 opacity-100 [@media(hover:hover)]:opacity-0">
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </div>
                );
              })}
              </div>
            </div>
            <div className="min-w-0">
              <SectionHeader label="Documents" tone="document" addLabel="Ajouter un document" onAdd={() => {}} />
              <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
                {event.documentGroups.map((group) => {
                const Icon = getDocumentGroupIcon(group);
                const documentTone = getDocumentTone(group.files.length > 0);
                return (
                  <div
                    key={group.id}
                    className={cn(
                      "group relative flex min-h-[4.75rem] items-center gap-1.5 rounded-xl border-2 sm:min-h-20 sm:gap-2",
                      documentTone.surface,
                      documentTone.border,
                      documentTone.hover,
                    )}
                  >
                    <div className="flex min-h-[4.75rem] min-w-0 flex-1 items-center gap-1.5 px-2 py-3 text-left sm:min-h-20 sm:gap-2 sm:px-3">
                      <Icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", documentTone.icon)} />
                      <span className={cn("min-w-0 flex-1 truncate pr-5 text-base font-semibold", documentTone.text)}>{group.label}</span>
                    </div>
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-amber-500 opacity-100 [@media(hover:hover)]:opacity-0">
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function getOptionIcon(label: string) {
  return getAutomaticIcon(label, Check);
}

function getLinkIcon(label: string) {
  return getAutomaticIcon(label, ExternalLink);
}

function getDocumentGroupIcon(group: EventDocumentGroup) {
  return getAutomaticIcon(group.label, File);
}

function getDocumentFileIcon(document: EventDocument) {
  const extension = getFileExtension(document.fileName);
  const fileType = document.fileType?.toLowerCase() ?? "";

  if (fileType.includes("spreadsheet") || ["xls", "xlsx", "csv"].includes(extension)) return FileSpreadsheet;
  if (fileType.includes("presentation") || ["ppt", "pptx", "key"].includes(extension)) return Presentation;
  if (fileType.includes("pdf") || extension === "pdf") return FileText;
  if (fileType.includes("word") || ["doc", "docx"].includes(extension)) return FileText;
  if (["txt", "md", "rtf"].includes(extension)) return FileText;

  return File;
}

function getAutomaticIcon(label: string, fallbackIcon: LucideIcon) {
  const normalizedLabel = normalizeLabel(label);
  return iconKeywordRules.find((rule) => rule.keywords.some((keyword) => normalizedLabel.includes(normalizeLabel(keyword))))?.icon ?? fallbackIcon;
}

function isPlatformLink(link: EventLink) {
  return platformLinkLabels.has(normalizeLabel(link.label));
}

function getLinkState(link: EventLink): LinkStatus {
  const isPlatform = isPlatformLink(link);

  if (link.entries.length > 0) {
    return link.entries.some((entry) => isLinkEntryDraftComplete({ url: entry.url ?? "", streamKey: entry.streamKey ?? "" }, isPlatform))
      ? "available"
      : "missing";
  }

  return isLinkEntryDraftComplete({ url: link.url ?? "", streamKey: link.streamKey ?? "" }, isPlatform) ? "available" : "missing";
}

function getDocumentTone(hasFiles: boolean) {
  return hasFiles
    ? {
        surface: "bg-amber-200/90",
        border: "border-amber-400/70",
        hover: "hover:bg-amber-200",
        icon: "text-amber-900",
        text: "text-amber-950",
        selected: "border-amber-700 ring-2 ring-amber-700/20",
      }
    : {
        surface: "bg-amber-50/80",
        border: "border-amber-100",
        hover: "hover:bg-amber-100/60",
        icon: "text-amber-600",
        text: "text-stone-700",
        selected: "border-amber-700 ring-2 ring-amber-700/20",
      };
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

function ProductionTimeline({
  event,
  onUpdateTime,
  onTimelineTimeEditStart,
  onTimelineTimeEditEnd,
  editable = true,
}: {
  event: ProductionEvent;
  onUpdateTime: (event: ProductionEvent, field: EventTimeField, value: string) => Promise<void>;
  onTimelineTimeEditStart: (saveTime: () => Promise<void>) => void;
  onTimelineTimeEditEnd: () => void;
  editable?: boolean;
}) {
  const moments = [
    { label: "Arrivée client", field: "clientArrivalTime" as const, value: event.clientArrivalTime },
    { label: "Début live", field: "startTime" as const, value: event.startTime },
    { label: "Fin live", field: "endTime" as const, value: event.endTime },
    { label: "Fin journée", field: "endOfDayTime" as const, value: event.endOfDayTime },
  ];

  return (
    <div className="mt-8">
      <div className="relative flex w-full justify-between">
        <div className="absolute left-2.5 right-2.5 top-2.5 h-[2px] bg-[#bb2720]/20" />
        {moments.map((moment, index) => (
          <div key={moment.label} className={cn("relative min-w-0 flex-1", index === 0 ? "text-left" : index === moments.length - 1 ? "text-right" : "text-center")}>
            <span
              className={cn(
                "block h-5 w-5 rounded-full border-2 border-[#bb2720]/45 bg-white",
                index === 0 ? "mr-auto" : index === moments.length - 1 ? "ml-auto" : "mx-auto",
              )}
            />
            <div className="mt-3 truncate font-semibold text-stone-700">{moment.label}</div>
            <div className={cn("mt-1.5", index === 0 ? "text-left" : index === moments.length - 1 ? "text-right" : "text-center")}>
              <TimelineTimeCapsule
                value={moment.value}
                onSave={(value) => onUpdateTime(event, moment.field, value)}
                onEditingStart={onTimelineTimeEditStart}
                onEditingEnd={onTimelineTimeEditEnd}
                editable={editable}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineTimeCapsule({
  value,
  onSave,
  onEditingStart,
  onEditingEnd,
  editable = true,
}: {
  value: string | null;
  onSave: (value: string) => Promise<void>;
  onEditingStart: (saveTime: () => Promise<void>) => void;
  onEditingEnd: () => void;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(toTimeInputValue(value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurSaveRef = useRef(false);
  const saveTimeRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (!editing) {
      setDraft(toTimeInputValue(value));
      onEditingEnd();
    }
  }, [editing, onEditingEnd, value]);

  useEffect(() => {
    saveTimeRef.current = () => saveTime(true);
  });

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function blurAfterValidation() {
    skipBlurSaveRef.current = true;
    inputRef.current?.blur();
  }

  async function saveTime(blurAfterSave = false) {
    if (saving) return;
    const nextValue = normalizeCompactTimeInput(draft);
    setDraft(nextValue);

    if (nextValue === toTimeInputValue(value)) {
      if (blurAfterSave) blurAfterValidation();
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onSave(nextValue);
      if (blurAfterSave) blurAfterValidation();
      setEditing(false);
    } catch {
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  const displayedTime = formatTime(value);

  if (editing) {
    return (
      <>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          placeholder="--:--"
          value={draft}
          disabled={saving}
          onFocus={() => onEditingStart(() => saveTimeRef.current())}
          onChange={(event) => setDraft(sanitizeTimeDraft(event.target.value))}
          onBlur={() => {
            onEditingEnd();
            if (skipBlurSaveRef.current) {
              skipBlurSaveRef.current = false;
              return;
            }
            void saveTime();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void saveTime(true);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(toTimeInputValue(value));
              event.currentTarget.blur();
              setEditing(false);
            }
          }}
          className="h-7 w-24 rounded-full border border-slate-200 bg-slate-100 px-2.5 text-center text-base font-semibold leading-none text-slate-700 outline-none transition focus:border-slate-300 disabled:opacity-70"
        />
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (editable) setEditing(true);
      }}
      className={cn(
        "inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-base font-semibold leading-none ring-1 ring-slate-200/70 transition hover:bg-slate-200/70",
        displayedTime ? "text-slate-600" : "text-slate-400",
        !editable && "cursor-default hover:bg-slate-100",
      )}
    >
      {displayedTime || "--:--"}
    </button>
  );
}

function InlineEditableTitle({
  value,
  onSave,
  className,
  inputClassName,
  editable = true,
}: {
  value: string;
  onSave: (value: string) => Promise<void>;
  className?: string;
  inputClassName?: string;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  async function saveTitle() {
    if (saving) return;
    const nextValue = formatTitleCase(draft);
    if (!nextValue || nextValue === value) {
      setDraft(value);
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onSave(nextValue);
      setEditing(false);
    } catch {
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void saveTitle()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void saveTitle();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        className={cn(
          "h-8 min-w-0 rounded-lg border border-stone-200 bg-white px-2 text-base font-semibold outline-none transition focus:border-stone-300 disabled:opacity-70",
          inputClassName,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (editable) setEditing(true);
      }}
      className={cn("min-w-0 truncate text-left", !editable && "cursor-default", className)}
    >
      {value}
    </button>
  );
}

function LinkValueRow({
  value,
  placeholder,
  icon: Icon,
  copied,
  copyLabel,
  completed,
  onChange,
  onCommit,
  onCopy,
  openable = false,
  editable = true,
}: {
  value: string;
  placeholder: string;
  icon: LucideIcon;
  copied: boolean;
  copyLabel: string;
  completed: boolean;
  onChange: (value: string) => void;
  onCommit: (value: string) => Promise<void>;
  onCopy: () => void;
  openable?: boolean;
  editable?: boolean;
}) {
  const [localValue, setLocalValue] = useState(value);
  const trimmedValue = localValue.trim();
  const canOpen = openable && Boolean(getValidUrl(trimmedValue));
  const rowTone = getLinkTone(completed ? "available" : "missing");
  const [editing, setEditing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const openTimerRef = useRef<number | null>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!editing) setLocalValue(value);
  }, [editing, value]);

  useEffect(() => () => {
    if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
  }, []);

  async function commitValue(nextValue = localValue) {
    if (!editable || committing) return;
    setCommitting(true);
    try {
      onChange(nextValue);
      await onCommit(nextValue);
      setEditing(false);
    } catch {
      setEditing(true);
    } finally {
      setCommitting(false);
    }
  }

  function openUrlFromRow() {
    if (!canOpen) return;
    if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
    openTimerRef.current = window.setTimeout(() => {
      openUrl(trimmedValue);
      openTimerRef.current = null;
    }, 180);
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <div className={cn("inline-flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-full border px-3 py-1.5 transition focus-within:border-sky-400", rowTone.surface, rowTone.border)}>
        <Icon className={cn("h-4 w-4 shrink-0", rowTone.icon)} />
        {editable ? (
          <input
            value={localValue}
            disabled={committing}
            onFocus={() => setEditing(true)}
            onChange={(event) => setLocalValue(event.target.value)}
            onBlur={() => {
              if (skipBlurCommitRef.current) {
                skipBlurCommitRef.current = false;
                return;
              }
              void commitValue();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                skipBlurCommitRef.current = true;
                void commitValue().finally(() => event.currentTarget.blur());
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setLocalValue(value);
                setEditing(false);
                event.currentTarget.blur();
              }
            }}
            placeholder={placeholder}
            className={cn("min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-sky-300 disabled:opacity-70", rowTone.text)}
          />
        ) : canOpen ? (
          <button
            type="button"
            onClick={openUrlFromRow}
            className={cn("min-w-0 flex-1 truncate bg-transparent text-left text-base font-semibold underline-offset-2 outline-none transition hover:underline", rowTone.text)}
          >
            {localValue}
          </button>
        ) : (
          <span className={cn("min-w-0 flex-1 truncate text-base font-semibold", rowTone.text)}>
            {localValue || placeholder}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onCopy}
        disabled={!trimmedValue}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-35",
          rowTone.surface,
          rowTone.border,
          rowTone.icon,
          rowTone.hover,
          copied && "bg-sky-200 text-sky-900",
        )}
        aria-label={copyLabel}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function getValidUrl(value: string) {
  if (!value) return null;

  try {
    return new URL(value);
  } catch {
    try {
      return new URL(`https://${value}`);
    } catch {
      return null;
    }
  }
}

function openUrl(value: string) {
  const url = getValidUrl(value);
  if (!url) return;
  window.open(url.href, "_blank", "noopener,noreferrer");
}

function ContextDetailBlock({
  event,
  selection,
  onToggleOption,
  onChangeOptionCompletedBy,
  onRenameOption,
  onCreateOptionItem,
  onUpdateOptionItem,
  onDeleteOptionItem,
  onRenameLink,
  onSaveLinkEntries,
  onRenameDocumentGroup,
  onUploadDocument,
  onDeleteDocumentFile,
  onOpenDocument,
  onDownloadDocument,
  permissions,
  profile,
}: {
  event: ProductionEvent;
  selection: ContextSelection;
  onToggleOption: (option: EventOption) => Promise<void>;
  onChangeOptionCompletedBy: (option: EventOption, choice: CompletedByOverrideChoice, customLabel?: string) => Promise<void>;
  onRenameOption: (option: EventOption, label: string) => Promise<EventOption>;
  onCreateOptionItem: (option: EventOption, label: string) => Promise<EventOptionItem>;
  onUpdateOptionItem: (option: EventOption, item: EventOptionItem, label: string) => Promise<EventOptionItem>;
  onDeleteOptionItem: (option: EventOption, item: EventOptionItem) => Promise<void>;
  onRenameLink: (link: EventLink, label: string) => Promise<EventLink>;
  onSaveLinkEntries: (link: EventLink, drafts: LinkEntryDraft[]) => Promise<EventLink>;
  onRenameDocumentGroup: (group: EventDocumentGroup, label: string) => Promise<EventDocumentGroup>;
  onUploadDocument: (group: EventDocumentGroup, file: globalThis.File) => Promise<EventDocument>;
  onDeleteDocumentFile: (document: EventDocument) => Promise<void>;
  onOpenDocument: (document: EventDocument) => Promise<void>;
  onDownloadDocument: (document: EventDocument) => Promise<void>;
  permissions: AppPermissions;
  profile: UserProfile | null;
}) {
  const selectedOption = selection?.type === "option" ? event.options.find((option) => option.id === selection.optionId) ?? null : null;
  const selectedLink = selection?.type === "link" ? event.links.find((link) => link.id === selection.linkId) ?? null : null;
  const selectedDocumentGroup = selection?.type === "document" ? event.documentGroups.find((group) => group.id === selection.groupId) ?? null : null;
  const selectedOptionId = selectedOption?.id ?? "";
  const selectedLinkId = selectedLink?.id ?? "";
  const selectedDocumentGroupId = selectedDocumentGroup?.id ?? "";
  const selectedLinkIsPlatform = selectedLink ? isPlatformLink(selectedLink) : false;
  const canEdit = permissions.canManageOperational;
  const canRenameSelectedOption = selectedOption ? canManageCreatedEntity(permissions, profile, selectedOption) : false;
  const canRenameSelectedLink = selectedLink ? canManageCreatedEntity(permissions, profile, selectedLink) : false;
  const canRenameSelectedDocumentGroup = selectedDocumentGroup ? canManageCreatedEntity(permissions, profile, selectedDocumentGroup) : false;
  const [linkEntryDrafts, setLinkEntryDrafts] = useState<LinkEntryDraft[]>(() => selectedLink ? createLinkEntryDrafts(selectedLink, selectedLinkIsPlatform) : []);
  const [lastSavedLinkEntrySignature, setLastSavedLinkEntrySignature] = useState(() => selectedLink ? serializeLinkEntryDrafts(createLinkEntryDrafts(selectedLink, selectedLinkIsPlatform), selectedLinkIsPlatform) : "[]");
  const [linkSaveError, setLinkSaveError] = useState<string | null>(null);
  const [copiedLinkField, setCopiedLinkField] = useState<string | null>(null);
  const [addingOptionItem, setAddingOptionItem] = useState(false);
  const [optionItemInput, setOptionItemInput] = useState("");
  const [savingOptionItem, setSavingOptionItem] = useState(false);
  const [optionItemError, setOptionItemError] = useState<string | null>(null);
  const [editingOptionItemId, setEditingOptionItemId] = useState<string | null>(null);
  const [editingOptionItemInput, setEditingOptionItemInput] = useState("");
  const [savingEditedOptionItemId, setSavingEditedOptionItemId] = useState<string | null>(null);
  const [savingCompletedByOverride, setSavingCompletedByOverride] = useState(false);
  const [completedByOverrideError, setCompletedByOverrideError] = useState<string | null>(null);
  const [completedByOverrideChoiceValue, setCompletedByOverrideChoiceValue] = useState("");
  const [completedByExternalName, setCompletedByExternalName] = useState("");
  const [titleRenameError, setTitleRenameError] = useState<string | null>(null);
  const [draggingDocumentFiles, setDraggingDocumentFiles] = useState(false);
  const [uploadingDocumentFiles, setUploadingDocumentFiles] = useState(false);
  const [documentOpenError, setDocumentOpenError] = useState<string | null>(null);
  const linkEntryDraftsRef = useRef(linkEntryDrafts);

  useEffect(() => {
    linkEntryDraftsRef.current = linkEntryDrafts;
  }, [linkEntryDrafts]);

  useEffect(() => {
    const nextDrafts = selectedLink ? createLinkEntryDrafts(selectedLink, selectedLinkIsPlatform) : [];
    setLinkEntryDrafts(nextDrafts);
    setLastSavedLinkEntrySignature(selectedLink ? serializeLinkEntryDrafts(nextDrafts, selectedLinkIsPlatform) : "[]");
    setLinkSaveError(null);
    setCopiedLinkField(null);
  }, [selectedLinkId]);

  useEffect(() => {
    if (!copiedLinkField) return;

    const resetTimer = window.setTimeout(() => {
      setCopiedLinkField(null);
    }, 2500);

    return () => window.clearTimeout(resetTimer);
  }, [copiedLinkField]);

  useEffect(() => {
    setAddingOptionItem(false);
    setOptionItemInput("");
    setSavingOptionItem(false);
    setOptionItemError(null);
    setEditingOptionItemId(null);
    setEditingOptionItemInput("");
    setSavingEditedOptionItemId(null);
    setSavingCompletedByOverride(false);
    setCompletedByOverrideError(null);
    setCompletedByOverrideChoiceValue("");
    setCompletedByExternalName("");
    setTitleRenameError(null);
    setDraggingDocumentFiles(false);
    setUploadingDocumentFiles(false);
    setDocumentOpenError(null);
  }, [selectedDocumentGroupId, selectedLinkId, selectedOptionId]);

  useEffect(() => {
    if (!selectedOption || selectedOption.status !== "completed") return;
    const matchingInternalChoice = completedByOverrideChoices.find((choice) => choice.value !== "externe" && (choice.initials === selectedOption.completedByInitials || choice.label === selectedOption.completedByLabel));
    setCompletedByOverrideChoiceValue(matchingInternalChoice?.value ?? "externe");
    if (matchingInternalChoice) {
      setCompletedByExternalName("");
      return;
    }
    if (!matchingInternalChoice && selectedOption.completedByLabel && selectedOption.completedByLabel !== "Externe") {
      setCompletedByExternalName(selectedOption.completedByLabel);
    }
  }, [selectedOptionId, selectedOption?.completedByInitials, selectedOption?.completedByLabel, selectedOption?.status]);

  async function copyLinkValue(value: string | null | undefined, field: string) {
    const valueToCopy = value?.trim();
    if (!valueToCopy) return;

    try {
      await navigator.clipboard?.writeText(valueToCopy);
      setCopiedLinkField(field);
    } catch {
      setCopiedLinkField(null);
    }
  }

  function updateLinkEntryDraft(index: number, field: "url" | "streamKey", value: string) {
    setLinkEntryDrafts((current) => {
      const currentDraft = current[index];
      if (currentDraft && !canEditLinkEntryDraft(currentDraft)) return current;
      const nextDrafts = current.map((draft, draftIndex) => (
        draftIndex === index ? { ...draft, [field]: value } : draft
      ));
      linkEntryDraftsRef.current = nextDrafts;
      return nextDrafts;
    });
  }

  async function saveLinkEntryDraft(index: number, field: "url" | "streamKey", value: string) {
    if (!selectedLink || !canEdit) return;

    const currentDrafts = linkEntryDraftsRef.current;
    const currentDraft = currentDrafts[index];
    if (currentDraft && !canEditLinkEntryDraft(currentDraft)) return;

    const nextRawDrafts = currentDrafts.map((draft, draftIndex) => (
      draftIndex === index ? { ...draft, [field]: value } : draft
    ));
    const nextDrafts = normalizeLinkEntryDrafts(nextRawDrafts, selectedLinkIsPlatform);
    const nextSignature = serializeLinkEntryDrafts(nextDrafts, selectedLinkIsPlatform);

    linkEntryDraftsRef.current = nextDrafts;
    setLinkEntryDrafts(nextDrafts);

    if (nextSignature === lastSavedLinkEntrySignature) return;

    setLinkSaveError(null);

    try {
      console.info("Saving link entry draft", {
        linkId: selectedLink.id,
        entryId: currentDraft?.id ?? null,
        field,
        editable: currentDraft ? canEditLinkEntryDraft(currentDraft) : true,
      });
      const updatedLink = await onSaveLinkEntries(selectedLink, nextDrafts);
      const updatedDrafts = createLinkEntryDrafts(updatedLink, selectedLinkIsPlatform);
      const updatedSignature = serializeLinkEntryDrafts(updatedDrafts, selectedLinkIsPlatform);
      linkEntryDraftsRef.current = updatedDrafts;
      setLinkEntryDrafts(updatedDrafts);
      setLastSavedLinkEntrySignature(updatedSignature);
    } catch (saveError) {
      console.error("Unable to save link entry draft", saveError);
      setLinkSaveError(getUserFacingErrorMessage(saveError, "Impossible d'enregistrer le lien."));
      throw saveError;
    }
  }

  function canEditLinkEntryDraft(draft: LinkEntryDraft) {
    if (!selectedLink) return false;
    if (!canEdit) return false;
    if (!draft.id && !draft.legacyParentValue) return true;
    return canManageLinkEntryEntity(permissions, profile, selectedLink, {
      createdByProfileId: draft.createdByProfileId ?? null,
      createdByRole: draft.createdByRole ?? null,
      createdByName: draft.createdByName ?? null,
    });
  }

  function getCopiedLinkField(index: number, field: "url" | "streamKey") {
    return `${index}:${field}`;
  }

  async function uploadFilesToSelectedGroup(files: FileList | File[]) {
    if (!selectedDocumentGroup) return;
    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) return;

    setUploadingDocumentFiles(true);
    setDocumentOpenError(null);

    try {
      for (const file of selectedFiles) {
        await onUploadDocument(selectedDocumentGroup, file);
      }
      setDraggingDocumentFiles(false);
    } catch (uploadError) {
      setDocumentOpenError(getUserFacingErrorMessage(uploadError, "Impossible d'ajouter le fichier."));
    } finally {
      setUploadingDocumentFiles(false);
    }
  }

  async function removeDocumentFile(file: EventDocument) {
    setDocumentOpenError(null);

    try {
      await onDeleteDocumentFile(file);
    } catch (deleteError) {
      setDocumentOpenError(getUserFacingErrorMessage(deleteError, "Impossible de supprimer ce fichier."));
    }
  }

  async function openDocumentFile(file: EventDocument) {
    setDocumentOpenError(null);

    try {
      await onOpenDocument(file);
    } catch (openError) {
      setDocumentOpenError(getUserFacingErrorMessage(openError, "Impossible d'ouvrir le document."));
    }
  }

  async function downloadDocumentFile(file: EventDocument) {
    setDocumentOpenError(null);

    try {
      await onDownloadDocument(file);
    } catch (downloadError) {
      setDocumentOpenError(getUserFacingErrorMessage(downloadError, "Impossible de télécharger le document."));
    }
  }

  async function addOptionItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOption) return;

    setSavingOptionItem(true);
    setOptionItemError(null);

    try {
      await onCreateOptionItem(selectedOption, optionItemInput);
      setOptionItemInput("");
      setAddingOptionItem(false);
    } catch (saveError) {
      console.error("Unable to add option detail item", saveError);
      setOptionItemError(getUserFacingErrorMessage(saveError, "Impossible d'ajouter cette note."));
    } finally {
      setSavingOptionItem(false);
    }
  }

  async function removeOptionItem(optionItem: EventOptionItem) {
    if (!selectedOption) return;

    setOptionItemError(null);

    try {
      await onDeleteOptionItem(selectedOption, optionItem);
    } catch (deleteError) {
      console.error("Unable to delete option detail item", deleteError);
      setOptionItemError(getUserFacingErrorMessage(deleteError, "Impossible de supprimer cette note."));
    }
  }

  function startEditingOptionItem(optionItem: EventOptionItem) {
    setEditingOptionItemId(optionItem.id);
    setEditingOptionItemInput(optionItem.label);
    setOptionItemError(null);
  }

  function cancelEditingOptionItem() {
    setEditingOptionItemId(null);
    setEditingOptionItemInput("");
    setSavingEditedOptionItemId(null);
  }

  async function saveEditedOptionItem(optionItem: EventOptionItem) {
    if (!selectedOption) return;

    const nextLabel = editingOptionItemInput.trim();
    if (!nextLabel) {
      setOptionItemError("La note ne peut pas être vide.");
      return;
    }

    setSavingEditedOptionItemId(optionItem.id);
    setOptionItemError(null);

    try {
      await onUpdateOptionItem(selectedOption, optionItem, nextLabel);
      cancelEditingOptionItem();
    } catch (updateError) {
      console.error("Unable to update option detail item", updateError);
      setOptionItemError(getUserFacingErrorMessage(updateError, "Impossible de modifier cette note."));
      setSavingEditedOptionItemId(null);
    }
  }

  async function renameSelectedOption(label: string) {
    if (!selectedOption) return;
    setTitleRenameError(null);

    try {
      await onRenameOption(selectedOption, label);
    } catch (renameError) {
      setTitleRenameError(getUserFacingErrorMessage(renameError, "Impossible de renommer l'option."));
      throw renameError;
    }
  }

  async function changeSelectedOptionCompletedBy(value: string, customLabel?: string) {
    if (!selectedOption) return;
    const choice = completedByOverrideChoices.find((item) => item.value === value);
    if (!choice) return;
    const nextCustomLabel = customLabel?.trim();
    if (choice.value === "externe" && !nextCustomLabel) {
      setCompletedByOverrideChoiceValue("externe");
      return;
    }

    setSavingCompletedByOverride(true);
    setCompletedByOverrideError(null);

    try {
      await onChangeOptionCompletedBy(selectedOption, choice, nextCustomLabel);
      setCompletedByOverrideChoiceValue(choice.value);
    } catch (overrideError) {
      setCompletedByOverrideError(getUserFacingErrorMessage(overrideError, "Impossible de modifier le champ Fait par."));
    } finally {
      setSavingCompletedByOverride(false);
    }
  }

  async function commitCompletedByExternalName() {
    if (!selectedOption || completedByOverrideChoiceValue !== "externe") return;
    const nextName = completedByExternalName.trim();
    if (!nextName) return;
    if (nextName === selectedOption.completedByLabel && selectedOption.completedByProfileId === null) return;
    await changeSelectedOptionCompletedBy("externe", nextName);
  }

  async function renameSelectedLink(label: string) {
    if (!selectedLink) return;
    setTitleRenameError(null);

    try {
      await onRenameLink(selectedLink, label);
    } catch (renameError) {
      setTitleRenameError(getUserFacingErrorMessage(renameError, "Impossible de renommer le lien."));
      throw renameError;
    }
  }

  async function renameSelectedDocumentGroup(label: string) {
    if (!selectedDocumentGroup) return;
    setTitleRenameError(null);

    try {
      await onRenameDocumentGroup(selectedDocumentGroup, label);
    } catch (renameError) {
      setTitleRenameError(getUserFacingErrorMessage(renameError, "Impossible de renommer le document."));
      throw renameError;
    }
  }

  if (!selection) return null;

  if (selection.type === "link" && selectedLink) {
    const linkState = getLinkState(selectedLink);
    const linkTone = getLinkTone(linkState);

    return (
      <Card className="w-full border-sky-200 bg-white p-4 sm:p-5">
        <div className="link-detail-block flex w-full min-w-0 flex-col gap-3">
          <div className="top-row flex w-full min-w-0 items-center justify-between gap-3">
            <div className={cn("flex min-w-0 items-center gap-2 text-base font-semibold", linkTone.text)}>
          <InlineEditableTitle
            value={selectedLink.label}
            onSave={renameSelectedLink}
            className="truncate"
            inputClassName="border-sky-200 text-sky-950 focus:border-sky-400"
            editable={canRenameSelectedLink}
          />
            </div>
          </div>
          <div className="url-editor-row flex w-full min-w-0 flex-col gap-2">
            {linkEntryDrafts.map((draft, index) => {
              const entryCompleted = isLinkEntryDraftComplete(draft, selectedLinkIsPlatform);
              const canEditEntry = canEditLinkEntryDraft(draft);
              const rowKey = draft.id ?? `draft-${index}`;

              return (
                <div key={rowKey} className={cn("flex w-full min-w-0 flex-col gap-2", selectedLinkIsPlatform && index > 0 && "pt-1")}>
                  <LinkValueRow
                    value={draft.url}
                    placeholder={selectedLinkIsPlatform ? "URL" : "https://..."}
                    icon={Link}
                    copied={copiedLinkField === getCopiedLinkField(index, "url")}
                    copyLabel="Copier l'URL"
                    completed={entryCompleted}
                    onChange={(value) => updateLinkEntryDraft(index, "url", value)}
                    onCommit={(value) => saveLinkEntryDraft(index, "url", value)}
                    onCopy={() => void copyLinkValue(draft.url, getCopiedLinkField(index, "url"))}
                    openable
                    editable={canEditEntry}
                  />
                  {selectedLinkIsPlatform && (
                    <LinkValueRow
                      value={draft.streamKey}
                      placeholder="Clé de stream"
                      icon={KeyRound}
                      copied={copiedLinkField === getCopiedLinkField(index, "streamKey")}
                      copyLabel="Copier la clé de stream"
                      completed={entryCompleted}
                      onChange={(value) => updateLinkEntryDraft(index, "streamKey", value)}
                      onCommit={(value) => saveLinkEntryDraft(index, "streamKey", value)}
                      onCopy={() => void copyLinkValue(draft.streamKey, getCopiedLinkField(index, "streamKey"))}
                      editable={canEditEntry}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {linkSaveError && (
            <div className="text-base font-medium text-rose-700">
              {linkSaveError}
            </div>
          )}
          {titleRenameError && <div className="text-base font-medium text-rose-700">{titleRenameError}</div>}
        </div>
      </Card>
    );
  }

  if (selection.type === "document" && selectedDocumentGroup) {
    const documentTone = getDocumentTone(selectedDocumentGroup.files.length > 0);
    const Icon = getDocumentGroupIcon(selectedDocumentGroup);

    return (
      <Card className="w-full border-amber-200 bg-white p-4 sm:p-5">
        <div className="flex w-full min-w-0 flex-col gap-3">
          <div className="flex w-full min-w-0 items-center justify-between gap-3">
            <div className={cn("flex min-w-0 items-center gap-2 text-base font-semibold", documentTone.text)}>
              <Icon className={cn("h-5 w-5 shrink-0", documentTone.icon)} />
              <InlineEditableTitle
                value={selectedDocumentGroup.label}
                onSave={renameSelectedDocumentGroup}
                className="truncate"
                inputClassName="border-amber-200 text-amber-950 focus:border-amber-400"
                editable={canRenameSelectedDocumentGroup}
              />
            </div>
          </div>
          {canEdit && (
            <div
              data-no-event-swipe
              onDragOver={(dragEvent) => {
                dragEvent.preventDefault();
                setDraggingDocumentFiles(true);
              }}
              onDragLeave={() => setDraggingDocumentFiles(false)}
              onDrop={(dropEvent) => {
                dropEvent.preventDefault();
                setDraggingDocumentFiles(false);
                void uploadFilesToSelectedGroup(dropEvent.dataTransfer.files);
              }}
              className={cn(
                "rounded-xl border border-amber-200 bg-white p-2 transition",
                draggingDocumentFiles && "border-amber-300 bg-amber-50",
              )}
            >
              <label className="flex min-h-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-amber-200 bg-amber-50/60 px-3 text-center text-base font-semibold text-amber-800 transition hover:bg-amber-100">
                {uploadingDocumentFiles ? "Envoi..." : "Déposer ou choisir"}
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(inputEvent) => {
                    if (inputEvent.target.files) {
                      void uploadFilesToSelectedGroup(inputEvent.target.files);
                      inputEvent.target.value = "";
                    }
                  }}
                />
              </label>
            </div>
          )}
          {selectedDocumentGroup.files.length > 0 && (
            <div className="flex flex-col gap-2">
              {selectedDocumentGroup.files.map((file) => {
                const FileIcon = getDocumentFileIcon(file);
                const canDeleteFile = canManageCreatedEntity(permissions, profile, file);
                return (
                  <div key={file.id} data-no-event-swipe className="flex w-full min-w-0 items-center gap-2">
                    <div className={cn("group inline-flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-full border px-3 py-1.5", documentTone.surface, documentTone.border)}>
                      <button
                        onClick={() => void openDocumentFile(file)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        aria-label={`Ouvrir ${file.fileName}`}
                        title="Ouvrir"
                      >
                        <FileIcon className={cn("h-4 w-4 shrink-0", documentTone.icon)} />
                        <span className={cn("min-w-0 truncate text-base font-semibold", documentTone.text)}>{file.fileName}</span>
                        <span className="shrink-0 text-base font-medium text-amber-700/70">{formatFileSize(file.fileSize)}</span>
                      </button>
                      {canDeleteFile && (
                        <button
                          onClick={() => void removeDocumentFile(file)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-amber-500 opacity-100 transition hover:bg-white/70 hover:text-amber-800 focus:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                          aria-label="Supprimer ce fichier"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => void downloadDocumentFile(file)}
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition hover:bg-amber-100",
                        documentTone.surface,
                        documentTone.border,
                        documentTone.icon,
                      )}
                      aria-label="Télécharger ce fichier"
                      title="Télécharger"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {selectedDocumentGroup.files.length === 0 && (
            <div className="text-base font-medium text-amber-700/70">Aucun fichier</div>
          )}
          {titleRenameError && <div className="text-base font-medium text-rose-700">{titleRenameError}</div>}
          {documentOpenError && <div className="text-base font-medium text-rose-700">{documentOpenError}</div>}
        </div>
      </Card>
    );
  }

  if (!selectedOption) return null;

  const optionTone = getOptionTone(selectedOption.status);
  const persistedCompletedByChoiceValue =
    completedByOverrideChoices.find((choice) => choice.value !== "externe" && (choice.initials === selectedOption.completedByInitials || choice.label === selectedOption.completedByLabel))?.value
    ?? (selectedOption.completedByInitials === "EXT" || (selectedOption.completedByLabel && !completedByOverrideChoices.some((choice) => choice.value !== "externe" && choice.label === selectedOption.completedByLabel)) ? "externe" : "");
  const completedByChoiceValue = completedByOverrideChoiceValue || persistedCompletedByChoiceValue;
  const completedByDisplay = getCompletedByNameForDisplay(selectedOption) ?? "Non renseigné";
  const canOverrideCompletedBy = permissions.canManageEvents && selectedOption.status === "completed";

  return (
    <Card className="border-emerald-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className={cn("flex min-w-0 items-center gap-2 text-base font-semibold", optionTone.text)}>
          <InlineEditableTitle
            value={selectedOption.label}
            onSave={renameSelectedOption}
            className="truncate"
            inputClassName="border-emerald-200 text-emerald-950 focus:border-emerald-400"
            editable={canRenameSelectedOption}
          />
        </div>
        {canEdit && (
          <button
            onClick={() => void onToggleOption(selectedOption)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-base font-semibold transition",
              optionTone.surface,
              optionTone.border,
              optionTone.text,
              selectedOption.status === "completed" ? "hover:bg-emerald-100" : "hover:bg-emerald-50",
            )}
            aria-label={selectedOption.status === "completed" ? "Marquer incomplet" : "Marquer terminé"}
          >
            {selectedOption.status === "completed" ? "Fait" : "À faire"}
          </button>
        )}
      </div>
      {titleRenameError && <div className="mt-2 text-base font-medium text-rose-700">{titleRenameError}</div>}
      {canOverrideCompletedBy && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
          <span className="text-base font-semibold text-emerald-800">Fait par</span>
          <div className="flex min-w-0 items-center gap-2">
            <span className="max-w-28 truncate text-base font-semibold text-emerald-900">{completedByDisplay}</span>
            <select
              value={completedByChoiceValue}
              disabled={savingCompletedByOverride}
              onChange={(event) => {
                const nextValue = event.target.value;
                setCompletedByOverrideChoiceValue(nextValue);
                if (nextValue === "externe") {
                  const nextExternalName = completedByExternalName.trim() || (selectedOption.completedByLabel && selectedOption.completedByLabel !== "Externe" ? selectedOption.completedByLabel : "");
                  setCompletedByExternalName(nextExternalName);
                  if (nextExternalName) {
                    void changeSelectedOptionCompletedBy("externe", nextExternalName);
                  }
                  return;
                }
                void changeSelectedOptionCompletedBy(nextValue);
              }}
              className="h-8 rounded-full border border-emerald-200 bg-white px-3 text-base font-semibold text-emerald-800 outline-none transition focus:border-emerald-500 disabled:text-emerald-400"
              aria-label="Modifier le champ Fait par"
            >
              <option value="" disabled>
                Choisir
              </option>
              {completedByOverrideChoices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
          {completedByChoiceValue === "externe" && (
            <input
              value={completedByExternalName}
              onChange={(event) => setCompletedByExternalName(event.target.value)}
              onBlur={() => void commitCompletedByExternalName()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCompletedByExternalName(selectedOption.completedByLabel && selectedOption.completedByLabel !== "Externe" ? selectedOption.completedByLabel : "");
                  event.currentTarget.blur();
                }
              }}
              placeholder="Prénom"
              disabled={savingCompletedByOverride}
              className="h-8 w-full rounded-full border border-emerald-200 bg-white px-3 text-base font-semibold text-emerald-800 outline-none transition placeholder:text-emerald-300 focus:border-emerald-500 disabled:text-emerald-400 sm:w-40"
            />
          )}
        </div>
      )}
      {completedByOverrideError && <div className="mt-2 text-base font-medium text-rose-700">{completedByOverrideError}</div>}
      <div className="mt-3">
        <div className="flex flex-col gap-2">
          {canEdit && !addingOptionItem ? (
            <button
              onClick={() => setAddingOptionItem(true)}
              className="flex h-8 w-fit shrink-0 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-base font-semibold leading-none text-emerald-700 transition hover:bg-emerald-100"
              aria-label="Ajouter une note"
              title="Ajouter une note"
            >
              <span className="text-base leading-none">+</span>
              <span>Ajouter une note</span>
            </button>
          ) : canEdit ? (
            <form onSubmit={addOptionItem} className="flex min-w-0 flex-col gap-2">
              <textarea
                required
                rows={3}
                value={optionItemInput}
                onChange={(event) => setOptionItemInput(event.target.value)}
                placeholder="Nouvelle note"
                className="min-h-20 w-full resize-none rounded-xl border border-emerald-200 bg-white px-3 py-2 text-base font-medium text-stone-950 outline-none transition placeholder:text-stone-300 focus:border-emerald-400"
              />
              <button disabled={savingOptionItem} className="h-9 w-fit shrink-0 rounded-xl bg-emerald-600 px-3 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:bg-stone-300">
                Ajouter
              </button>
            </form>
          ) : null}
        {selectedOption.items.map((item) => {
          const canManageNote = canManageCreatedEntity(permissions, profile, item);
          const isEditingNote = editingOptionItemId === item.id;
          const isSavingEditedNote = savingEditedOptionItemId === item.id;
          return (
            <div key={item.id} className={cn("group flex min-h-12 w-full items-start gap-3 rounded-xl border px-3 py-2.5", optionTone.surface, optionTone.border)}>
              {isEditingNote ? (
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <textarea
                    rows={3}
                    value={editingOptionItemInput}
                    onChange={(event) => setEditingOptionItemInput(event.target.value)}
                    className="min-h-20 w-full resize-none rounded-xl border border-emerald-200 bg-white px-3 py-2 text-base font-medium text-stone-950 outline-none transition placeholder:text-stone-300 focus:border-emerald-400"
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveEditedOptionItem(item)}
                      disabled={isSavingEditedNote}
                      className="h-8 rounded-full bg-emerald-600 px-3 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:bg-stone-300"
                    >
                      Valider
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditingOptionItem}
                      disabled={isSavingEditedNote}
                      className="h-8 rounded-full border border-emerald-200 bg-white px-3 text-base font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:text-stone-300"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className={cn("min-w-0 flex-1 whitespace-pre-wrap text-base font-medium leading-relaxed", optionTone.text)}>{item.label}</p>
                  {canManageNote && (
                    <div className="flex shrink-0 items-center gap-1 opacity-100 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                      <button
                        onClick={() => startEditingOptionItem(item)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-emerald-500 transition hover:bg-white/70 hover:text-emerald-800 focus:opacity-100"
                        aria-label="Modifier cette note"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void removeOptionItem(item)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-emerald-500 transition hover:bg-white/70 hover:text-emerald-800 focus:opacity-100"
                        aria-label="Supprimer cette note"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        </div>
        {optionItemError && <div className="text-base font-medium text-rose-700">{optionItemError}</div>}
      </div>
    </Card>
  );
}

function splitStoredDetails(details: string | null) {
  return (details ?? "")
    .split(/\n|,/)
    .map((detail) => detail.trim())
    .filter(Boolean);
}

function CreateEventModal({
  selectedDateKey,
  event,
  onClose,
  onSubmit,
}: {
  selectedDateKey: string;
  event: ProductionEvent | null;
  onClose: () => void;
  onSubmit: (input: CreateEventInput) => Promise<void>;
}) {
  const isEditing = Boolean(event);
  const [form, setForm] = useState<CreateEventInput>({
    clientName: event?.clientName ?? "",
    eventName: event?.eventName ?? "",
    date: event?.date ?? selectedDateKey,
    clientArrivalTime: event ? toTimeInputValue(event.clientArrivalTime) : "08:30",
    startTime: event ? toTimeInputValue(event.startTime) : "10:00",
    endTime: event ? toTimeInputValue(event.endTime) : "11:30",
    endOfDayTime: event ? toTimeInputValue(event.endOfDayTime) : "13:00",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const normalizedForm = normalizeEventTimeInput(form);
      setForm(normalizedForm);
      await onSubmit(normalizedForm);
    } catch (createError) {
      setError(getUserFacingErrorMessage(createError, isEditing ? "Impossible de modifier l'événement." : "Impossible de créer l'événement."));
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
          <h2 className="text-base font-semibold text-stone-950">{isEditing ? "Modifier l'événement" : "Créer un événement"}</h2>
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
            <button
              type="button"
              onClick={() => setDatePickerOpen(true)}
              className={cn(formInputClassName, "flex items-center text-left")}
            >
              {formatFullDate(form.date)}
            </button>
          </Field>
          <Field label="Arrivée client">
            <TimeTextInput value={form.clientArrivalTime} onChange={(value) => updateField("clientArrivalTime", value)} className={formInputClassName} />
          </Field>
          <Field label="Début">
            <TimeTextInput value={form.startTime} onChange={(value) => updateField("startTime", value)} className={formInputClassName} />
          </Field>
          <Field label="Fin">
            <TimeTextInput value={form.endTime} onChange={(value) => updateField("endTime", value)} className={formInputClassName} />
          </Field>
          <Field label="Fin journée">
            <TimeTextInput value={form.endOfDayTime} onChange={(value) => updateField("endOfDayTime", value)} className={formInputClassName} />
          </Field>
        </div>

        {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-base font-semibold text-stone-600">
            Annuler
          </button>
          <button disabled={submitting} className="rounded-full bg-[#bb2720] px-4 py-2 text-base font-semibold text-white disabled:bg-stone-300">
            {submitting ? (isEditing ? "Modification..." : "Création...") : isEditing ? "Modifier" : "Créer"}
          </button>
        </div>

        {datePickerOpen && (
          <SharedDatePicker
            selectedDate={form.date}
            onClose={() => setDatePickerOpen(false)}
            onSelectDate={(date) => {
              updateField("date", date);
              setDatePickerOpen(false);
            }}
          />
        )}
      </form>
    </div>
  );
}

function NativeMstvIcsImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (events: NativeMstvIcsReviewEvent[]) => Promise<void>;
}) {
  const [fileName, setFileName] = useState("");
  const [reviewEvents, setReviewEvents] = useState<NativeMstvIcsReviewEvent[]>([]);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importableCount = reviewEvents.filter((event) => !event.skipped).length;
  const skippedCount = reviewEvents.length - importableCount;

  async function loadExistingImportIds() {
    if (!supabase) throw new Error("Configuration Supabase manquante.");

    const { data, error: loadError } = await supabase
      .from("events")
      .select("external_import_id")
      .eq("imported_from", nativeMstvIcsImportSource)
      .not("external_import_id", "is", null);

    if (loadError) throw loadError;
    return new Set((data ?? []).map((row) => row.external_import_id).filter(Boolean));
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".ics") && file.type !== "text/calendar") {
      setError("Importez un fichier .ics exporté depuis Apple Calendar.");
      return;
    }

    setParsing(true);
    setError(null);
    setFileName(file.name);

    try {
      const icsText = await file.text();
      if (!icsText.includes("BEGIN:VCALENDAR") || !icsText.includes("BEGIN:VEVENT")) {
        throw new Error("Ce fichier ne ressemble pas à un calendrier ICS valide.");
      }

      const existingImportIds = await loadExistingImportIds();
      const nextReviewEvents = buildNativeMstvIcsReviewEvents(icsText, existingImportIds);
      if (nextReviewEvents.length === 0) {
        throw new Error("Aucun événement lisible trouvé dans ce fichier ICS.");
      }

      setReviewEvents(nextReviewEvents);
      setStep("review");
    } catch (parseError) {
      console.error("Native MSTV ICS import parsing failed", parseError);
      setError(getUserFacingErrorMessage(parseError, "Impossible de lire ce calendrier ICS."));
    } finally {
      setParsing(false);
    }
  }

  async function confirmImport() {
    setImporting(true);
    setError(null);

    try {
      await onImport(reviewEvents);
    } catch (importError) {
      console.error("Native MSTV ICS import failed", importError);
      setError(getUserFacingErrorMessage(importError, "Impossible d'importer ce calendrier."));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-stone-950/10 p-3 sm:items-center sm:justify-center sm:p-6">
      <div className="flex max-h-[86vh] w-full flex-col rounded-3xl border border-stone-200 bg-white p-5 sm:max-w-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-stone-950">Importer calendrier MSTV</h2>
            <p className="mt-1 text-base font-medium text-stone-500">
              {step === "review" ? `${reviewEvents.length} événement${reviewEvents.length > 1 ? "s" : ""} détecté${reviewEvents.length > 1 ? "s" : ""}` : "Migration Apple Calendar en événements MSTV natifs."}
            </p>
            {fileName && <p className="mt-1 truncate text-sm font-semibold text-stone-400">{fileName}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 px-3 py-1.5 text-base font-semibold text-stone-600">
            Fermer
          </button>
        </div>

        {error && <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        {step === "upload" ? (
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void handleFile(event.dataTransfer.files.item(0));
            }}
            className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center transition hover:bg-stone-100/70"
          >
            <FileText className="mb-3 h-7 w-7 text-stone-500" />
            <span className="text-base font-semibold text-stone-800">{parsing ? "Lecture du calendrier..." : "Déposez le fichier .ics ici"}</span>
            <span className="mt-1 text-base font-medium text-stone-500">ou cliquez pour sélectionner le fichier exporté</span>
            <input
              type="file"
              accept=".ics,text/calendar"
              disabled={parsing}
              onChange={(event) => {
                void handleFile(event.target.files?.item(0) ?? null);
                event.target.value = "";
              }}
              className="hidden"
            />
          </label>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-sm font-semibold text-emerald-700">À importer</p>
                <p className="text-lg font-semibold text-emerald-950">{importableCount}</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2">
                <p className="text-sm font-semibold text-stone-500">Ignorés</p>
                <p className="text-lg font-semibold text-stone-800">{skippedCount}</p>
              </div>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-stone-200">
              {reviewEvents.map((event) => (
                <div key={event.externalImportId} className="grid gap-2 border-b border-stone-100 px-3 py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-base font-semibold text-stone-950">{event.sourceTitle}</p>
                      {event.skipped && <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-500">{event.skipReason}</span>}
                    </div>
                    <p className="mt-0.5 text-base font-medium text-stone-600">
                      {event.clientName} · {event.eventName}
                    </p>
                    {(event.location || event.description) && (
                      <p className="mt-1 line-clamp-2 text-sm font-medium text-stone-400">
                        {[event.location, event.description].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="text-left text-base font-semibold text-stone-500 sm:text-right">
                    <p>{formatFullDate(event.date)}</p>
                    <p>{formatTimeRange(event.startTime, event.endTime) || "Journée"}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setStep("upload")} disabled={importing} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-base font-semibold text-stone-600 disabled:text-stone-300">
                Changer de fichier
              </button>
              <button
                type="button"
                onClick={() => void confirmImport()}
                disabled={importing || importableCount === 0}
                className="rounded-full bg-[#bb2720] px-4 py-2 text-base font-semibold text-white disabled:bg-stone-300"
              >
                {importing ? "Import..." : "Importer"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function QuoteImportModal({
  accessToken,
  online,
  initialFile,
  selectedDateKey,
  events,
  onClose,
  onCreateEvent,
  onUpdateEvent,
}: {
  accessToken: string | null;
  online: boolean;
  initialFile?: File | null;
  selectedDateKey: string;
  events: ProductionEvent[];
  onClose: () => void;
  onCreateEvent: (input: CreateEventInput) => Promise<void>;
  onUpdateEvent: (event: ProductionEvent, input: CreateEventInput) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [form, setForm] = useState<CreateEventInput>({
    clientName: "",
    eventName: "",
    date: selectedDateKey,
    clientArrivalTime: "",
    startTime: "",
    endTime: "",
    endOfDayTime: "",
    optionLabels: [],
  });
  const [serviceText, setServiceText] = useState("");
  const [step, setStep] = useState<"upload" | "review" | "resolve">("upload");
  const [resolution, setResolution] = useState<QuoteImportResolution | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const initialFileProcessedRef = useRef<File | null>(null);

  function updateField<Key extends keyof CreateEventInput>(key: Key, value: CreateEventInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!isPdfFile(file)) {
      setError("Importez un fichier PDF.");
      return;
    }
    if (!online || (typeof navigator !== "undefined" && !navigator.onLine)) {
      setError("L’import PDF nécessite une connexion.");
      return;
    }

    setExtracting(true);
    setError(null);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fallbackDate", selectedDateKey);
      const currentAccessToken = await getCurrentSupabaseAccessToken(accessToken);
      if (!currentAccessToken) {
        throw new Error("Votre session a expiré. Reconnectez-vous.");
      }

      const response = await fetch(getAppApiUrl("/api/quotes/extract-pdf", "Import PDF momentanément indisponible."), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${currentAccessToken}`,
        },
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as { extracted?: QuoteExtractionResult; error?: string } | null;

      if (!response.ok || !payload?.extracted) {
        throw new Error(payload?.error || "Impossible d'extraire les données du devis.");
      }

      const extracted = payload.extracted;
      setForm({
        clientName: extracted.clientName,
        eventName: "Événement",
        date: extracted.date,
        clientArrivalTime: "",
        startTime: extracted.startTime,
        endTime: extracted.endTime,
        endOfDayTime: "",
        optionLabels: extracted.services,
        quoteReference: extracted.quoteReference || null,
        quoteVersion: extracted.quoteVersion || null,
        sourceQuoteText: extracted.sourceQuoteText || null,
      });
      setServiceText(extracted.services.join("\n"));
      setResolution(null);
      setStep("review");
    } catch (extractError) {
      console.error("Failed to extract quote PDF on server", {
        fileName: file.name,
        fileType: file.type || "(empty)",
        fileSize: file.size,
        error: getDebugError(extractError),
      });
      setError(getUserFacingErrorMessage(extractError, "Le fichier PDF n’a pas pu être lu."));
    } finally {
      setExtracting(false);
    }
  }

  useEffect(() => {
    if (!initialFile || initialFileProcessedRef.current === initialFile) return;
    initialFileProcessedRef.current = initialFile;
    void handleFile(initialFile);
  }, [initialFile]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const normalizedForm = normalizeEventTimeInput({
        ...form,
        optionLabels: uniqueLabels(serviceText.split(/\n|,/).map((service) => service.trim()).filter(Boolean)),
      });
      const existingEvent = findMatchingQuoteEvent(events, normalizedForm);
      if (existingEvent) {
        setResolution({
          existingEvent,
          input: normalizedForm,
          differences: getQuoteImportDifferences(existingEvent, normalizedForm),
        });
        setStep("resolve");
        return;
      }

      await onCreateEvent(normalizedForm);
    } catch (submitError) {
      setError(getUserFacingErrorMessage(submitError, "Impossible de créer l'événement depuis ce devis."));
    } finally {
      setSubmitting(false);
    }
  }

  async function createNewEventFromResolution() {
    if (!resolution) return;
    setSubmitting(true);
    setError(null);

    try {
      await onCreateEvent(resolution.input);
    } catch (submitError) {
      setError(getUserFacingErrorMessage(submitError, "Impossible de créer l'événement depuis ce devis."));
    } finally {
      setSubmitting(false);
    }
  }

  async function updateExistingEventFromResolution() {
    if (!resolution) return;
    setSubmitting(true);
    setError(null);

    try {
      await onUpdateEvent(resolution.existingEvent, resolution.input);
    } catch (submitError) {
      setError(getUserFacingErrorMessage(submitError, "Impossible de mettre à jour l'événement depuis ce devis."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-stone-950/10 p-3 sm:items-center sm:justify-center sm:p-6">
      <form onSubmit={handleSubmit} className="w-full rounded-3xl border border-stone-200 bg-white p-5 sm:max-w-2xl sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-950">
              {step === "upload" ? "Importer un devis ou une facture" : step === "resolve" ? "Un événement existant semble correspondre à ce document." : "Voici ce que j'ai compris"}
            </h2>
            {fileName && <p className="mt-1 truncate text-base font-medium text-stone-500">{fileName}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 px-3 py-1.5 text-base font-semibold text-stone-600">
            Fermer
          </button>
        </div>

        {step === "upload" ? (
          <label
            onDragEnter={(event) => {
              if (!hasFileDragItem(event.dataTransfer)) return;
              event.preventDefault();
              setDropActive(hasPotentialPdfDragItem(event.dataTransfer));
            }}
            onDragOver={(event) => {
              if (!hasFileDragItem(event.dataTransfer)) return;
              event.preventDefault();
              const canDropPdf = hasPotentialPdfDragItem(event.dataTransfer);
              event.dataTransfer.dropEffect = canDropPdf ? "copy" : "none";
              setDropActive(canDropPdf);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setDropActive(false);
            }}
            onDrop={(event) => {
              if (!hasFileDragItem(event.dataTransfer)) return;
              event.preventDefault();
              setDropActive(false);
              void handleFile(getPdfFileFromTransfer(event.dataTransfer) ?? getFirstFileFromTransfer(event.dataTransfer));
            }}
            className={cn(
              "flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed px-4 py-8 text-center transition",
              dropActive ? "border-[#bb2720]/50 bg-[#bb2720]/[0.06]" : "border-stone-300 bg-stone-50 hover:bg-stone-100/70",
            )}
          >
            <FileText className={cn("mb-3 h-7 w-7", dropActive ? "text-[#bb2720]" : "text-stone-500")} />
            <span className="text-base font-semibold text-stone-800">{extracting ? "Lecture du PDF..." : "Déposez un PDF ici"}</span>
            <span className="mt-1 text-base font-medium text-stone-500">ou cliquez pour sélectionner un fichier</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              disabled={extracting}
              onChange={(event) => void handleFile(event.target.files?.item(0) ?? null)}
              className="hidden"
            />
          </label>
        ) : step === "resolve" && resolution ? (
          <div className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-3">
                <p className="text-base font-semibold text-stone-500">Événement existant</p>
                <p className="mt-1 text-base font-semibold text-stone-950">{resolution.existingEvent.clientName}</p>
                <p className="mt-1 text-base font-medium text-stone-500">{formatFullDate(resolution.existingEvent.date)}</p>
              </div>
              <div className="rounded-2xl border border-[#bb2720]/20 bg-[#bb2720]/[0.04] px-3 py-3">
                <p className="text-base font-semibold text-[#bb2720]">Nouveau PDF</p>
                <p className="mt-1 text-base font-semibold text-stone-950">{resolution.input.clientName}</p>
                <p className="mt-1 text-base font-medium text-stone-500">{formatFullDate(resolution.input.date)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2">
              <p className="mb-2 text-base font-semibold text-stone-600">Différences détectées</p>
              {resolution.differences.length > 0 ? (
                <div className="flex flex-col divide-y divide-stone-100">
                  {resolution.differences.map((difference) => (
                    <div key={`${difference.label}-${difference.previousValue}-${difference.nextValue}`} className="grid gap-1 py-2 sm:grid-cols-[7rem_1fr_1fr] sm:items-center">
                      <span className="text-base font-semibold text-stone-500">{difference.label}</span>
                      <span className="text-base font-medium text-stone-500">{difference.previousValue}</span>
                      <span className="text-base font-semibold text-stone-950">{difference.nextValue}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-base font-medium text-stone-500">Aucune différence majeure détectée.</p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client">
                <input required value={form.clientName} onChange={(event) => updateField("clientName", event.target.value)} className={formInputClassName} />
              </Field>
              <Field label="Date">
                <button
                  type="button"
                  onClick={() => setDatePickerOpen(true)}
                  className={cn(formInputClassName, "flex items-center text-left")}
                >
                  {formatFullDate(form.date)}
                </button>
              </Field>
              <Field label="Début">
                <TimeTextInput value={form.startTime} onChange={(value) => updateField("startTime", value)} className={formInputClassName} />
              </Field>
              <Field label="Fin">
                <TimeTextInput value={form.endTime} onChange={(value) => updateField("endTime", value)} className={formInputClassName} />
              </Field>
            </div>

            <label className="mt-3 block text-base font-semibold text-stone-500">
              <span className="mb-1.5 block">Services / options détectés</span>
              <textarea
                value={serviceText}
                onChange={(event) => setServiceText(event.target.value)}
                rows={4}
                className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-3 py-2 text-base font-medium text-stone-950 outline-none transition focus:border-[#bb2720]/50"
                placeholder="Un service par ligne"
              />
            </label>
          </>
        )}

        {datePickerOpen && (
          <SharedDatePicker
            selectedDate={form.date}
            onClose={() => setDatePickerOpen(false)}
            onSelectDate={(date) => {
              updateField("date", date);
              setDatePickerOpen(false);
            }}
          />
        )}

        {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="mt-6 flex justify-end gap-2">
          {step === "review" && (
            <button type="button" onClick={() => setStep("upload")} disabled={submitting} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-base font-semibold text-stone-600 disabled:text-stone-300">
              Remplacer le PDF
            </button>
          )}
          {step === "resolve" && (
            <button type="button" onClick={() => setStep("review")} disabled={submitting} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-base font-semibold text-stone-600 disabled:text-stone-300">
              Retour
            </button>
          )}
          <button type="button" onClick={onClose} disabled={submitting || extracting} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-base font-semibold text-stone-600 disabled:text-stone-300">
            Annuler
          </button>
          {step === "review" && (
            <button disabled={submitting} className="rounded-full bg-[#bb2720] px-4 py-2 text-base font-semibold text-white disabled:bg-stone-300">
              {submitting ? "Création..." : "Créer l'événement"}
            </button>
          )}
          {step === "resolve" && (
            <>
              <button type="button" onClick={() => void createNewEventFromResolution()} disabled={submitting} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-base font-semibold text-stone-700 disabled:text-stone-300">
                Créer un nouvel événement
              </button>
              <button type="button" onClick={() => void updateExistingEventFromResolution()} disabled={submitting} className="rounded-full bg-[#bb2720] px-4 py-2 text-base font-semibold text-white disabled:bg-stone-300">
                {submitting ? "Mise à jour..." : "Mettre à jour l'événement existant"}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

function getActivityValueLabel(value: ActivityValue) {
  if (!value) return "";

  if (typeof value.date === "string") return formatFullDate(value.date);
  if (typeof value.field === "string") {
    const field = value.field as EventTimeField;
    const label = ["clientArrivalTime", "startTime", "endTime", "endOfDayTime"].includes(field) ? getEventTimeFieldLabel(field) : "Horaire";
    const time = typeof value.value === "string" && value.value ? value.value : "--:--";
    return `${label} · ${time}`;
  }
  if (typeof value.label === "string") return value.label;
  if (typeof value.fileName === "string") return value.fileName;
  if (typeof value.status === "string") return value.status;

  return "";
}

function canRestoreActivity(entry: EventActivityLog) {
  if (entry.actionType === "event_date_changed") return typeof entry.previousValue?.date === "string";
  if (entry.actionType === "event_time_changed") {
    return typeof entry.previousValue?.field === "string" && "value" in (entry.previousValue ?? {});
  }
  return false;
}

function EventHistorySheet({
  event,
  entries,
  loading,
  error,
  restoringActivityId,
  onClose,
  onRestore,
  canRestore,
}: {
  event: ProductionEvent;
  entries: EventActivityLog[];
  loading: boolean;
  error: string | null;
  restoringActivityId: string | null;
  onClose: () => void;
  onRestore: (entry: EventActivityLog) => Promise<void>;
  canRestore: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-stone-950/10 p-3 sm:items-center sm:justify-center sm:p-6">
      <div className="flex max-h-[82vh] w-full flex-col rounded-3xl border border-stone-200 bg-white p-4 sm:max-w-lg sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-stone-950">Historique</h2>
            <p className="mt-1 truncate text-base font-medium text-stone-500">
              {event.clientName} · {event.eventName}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-base font-semibold text-stone-600 transition hover:bg-stone-50">
            Fermer
          </button>
        </div>

        {error && <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading && <div className="rounded-2xl bg-stone-50 px-4 py-3 text-base font-medium text-stone-500">Chargement...</div>}
          {!loading && entries.length === 0 && !error && (
            <div className="rounded-2xl bg-stone-50 px-4 py-3 text-base font-medium text-stone-500">Aucun historique pour le moment.</div>
          )}
          <div className="space-y-2">
            {entries.map((entry) => {
              const previousLabel = getActivityValueLabel(entry.previousValue);
              const nextLabel = getActivityValueLabel(entry.newValue);
              const isRestorable = canRestore && canRestoreActivity(entry);
              const isRestoring = restoringActivityId === entry.id;

              return (
                <div key={entry.id} className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-stone-900">{entry.description}</p>
                      <p className="mt-1 text-sm font-medium text-stone-500">{formatHistoryTimestamp(entry.createdAt)}</p>
                    </div>
                    {isRestorable && (
                      <button
                        type="button"
                        onClick={() => void onRestore(entry)}
                        disabled={isRestoring}
                        className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 disabled:text-stone-300"
                      >
                        {isRestoring ? "..." : "Restaurer"}
                      </button>
                    )}
                  </div>
                  {(previousLabel || nextLabel) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-stone-500">
                      {previousLabel && <span className="rounded-full bg-white px-2 py-1">{previousLabel}</span>}
                      {previousLabel && nextLabel && <span>→</span>}
                      {nextLabel && <span className="rounded-full bg-[#bb2720]/[0.07] px-2 py-1 text-[#bb2720]">{nextLabel}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrashEventsSheet({
  events,
  loading,
  error,
  restoringEventId,
  onClose,
  onRestore,
  onPermanentDeleteRequest,
  canRestore,
  canPermanentDelete,
}: {
  events: ProductionEvent[];
  loading: boolean;
  error: string | null;
  restoringEventId: string | null;
  onClose: () => void;
  onRestore: (event: ProductionEvent) => Promise<void>;
  onPermanentDeleteRequest: (event: ProductionEvent) => void;
  canRestore: boolean;
  canPermanentDelete: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-stone-950/10 p-3 sm:items-center sm:justify-center sm:p-6">
      <div className="flex max-h-[82vh] w-full flex-col rounded-3xl border border-stone-200 bg-white p-4 sm:max-w-2xl sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-stone-950">Corbeille</h2>
            <p className="mt-1 text-base font-medium text-stone-500">Événements supprimés restaurables.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-base font-semibold text-stone-600 transition hover:bg-stone-50">
            Fermer
          </button>
        </div>

        {error && <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading && <div className="rounded-2xl bg-stone-50 px-4 py-3 text-base font-medium text-stone-500">Chargement...</div>}
          {!loading && events.length === 0 && !error && (
            <div className="rounded-2xl bg-stone-50 px-4 py-3 text-base font-medium text-stone-500">La corbeille est vide.</div>
          )}
          <div className="space-y-2">
            {events.map((event) => {
              const isRestoring = restoringEventId === event.id;
              return (
                <div key={event.id} className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-stone-950">{event.clientName}</p>
                      <p className="truncate text-base font-medium text-stone-500">{event.eventName}</p>
                      <p className="mt-2 text-sm font-semibold text-stone-500">
                        {formatFullDate(event.date)}
                        {event.deletedAt && ` · Supprimé le ${formatHistoryTimestamp(event.deletedAt)}`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {canRestore && (
                      <button
                        type="button"
                        onClick={() => void onRestore(event)}
                        disabled={isRestoring}
                        className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-base font-semibold text-stone-600 transition hover:bg-stone-100 disabled:text-stone-300"
                      >
                        {isRestoring ? "Restauration..." : "Restaurer"}
                      </button>
                    )}
                    {canPermanentDelete && (
                      <button
                        type="button"
                        onClick={() => onPermanentDeleteRequest(event)}
                        disabled={isRestoring}
                        className="rounded-full border border-[#bb2720]/20 bg-white px-3 py-1.5 text-base font-semibold text-[#bb2720] transition hover:bg-[#bb2720]/[0.05] disabled:text-stone-300"
                      >
                        Supprimer définitivement
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function UserManagementSheet({
  profiles,
  currentProfileId,
  loading,
  error,
  updatingProfileId,
  onClose,
  onUpdateRole,
}: {
  profiles: UserProfile[];
  currentProfileId: string | null;
  loading: boolean;
  error: string | null;
  updatingProfileId: string | null;
  onClose: () => void;
  onUpdateRole: (profile: UserProfile, role: UserRole) => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-stone-950/10 p-3 sm:items-center sm:justify-center sm:p-6">
      <div className="flex max-h-[82vh] w-full flex-col rounded-3xl border border-stone-200 bg-white p-4 sm:max-w-2xl sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-stone-950">Gestion utilisateurs</h2>
            <p className="mt-1 text-base font-medium text-stone-500">Rôles de l'équipe MSTV.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-base font-semibold text-stone-600 transition hover:bg-stone-50">
            Fermer
          </button>
        </div>

        {error && <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading && <div className="rounded-2xl bg-stone-50 px-4 py-3 text-base font-medium text-stone-500">Chargement...</div>}
          {!loading && profiles.length === 0 && !error && (
            <div className="rounded-2xl bg-stone-50 px-4 py-3 text-base font-medium text-stone-500">Aucun utilisateur pour le moment.</div>
          )}
          <div className="space-y-2">
            {profiles.map((userProfile) => {
              const displayName = getProfileDisplayName(userProfile) ?? "Utilisateur";
              const isUpdating = updatingProfileId === userProfile.id;
              const isCurrentProfile = currentProfileId === userProfile.id;

              return (
                <div key={userProfile.id} className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-stone-950">
                        {displayName}
                        {isCurrentProfile && <span className="ml-2 text-sm font-semibold text-[#bb2720]">Vous</span>}
                      </p>
                      <p className="mt-1 truncate text-base font-medium text-stone-500">{userProfile.email ?? "Email non renseigné"}</p>
                      <p className="mt-1 text-sm font-semibold text-stone-400">Créé le {formatHistoryTimestamp(userProfile.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                      <select
                        value={userProfile.role}
                        disabled={isUpdating || isCurrentProfile}
                        onChange={(event) => void onUpdateRole(userProfile, event.target.value as UserRole)}
                        className="h-10 rounded-full border border-stone-200 bg-white px-3 text-base font-semibold text-stone-700 outline-none transition focus:border-[#bb2720]/40 disabled:bg-stone-100 disabled:text-stone-400"
                        aria-label={`Rôle de ${displayName}`}
                      >
                        {userRoleOptions.map((role) => (
                          <option key={role} value={role}>
                            {getRoleLabel(role)}
                          </option>
                        ))}
                      </select>
                      {isCurrentProfile && <p className="text-xs font-semibold text-stone-400">Vous ne pouvez pas modifier votre propre rôle.</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExternalCalendarColorPalette({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const customColor = normalizeHexColor(value) ?? "#64748b";
  const customSelected = Boolean(normalizeHexColor(value));

  return (
    <div className="flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3" aria-label="Couleur du calendrier">
      {externalCalendarColorOptions.map((colorOption) => {
        const isSelected = value === colorOption.value;
        return (
          <button
            key={colorOption.value}
            type="button"
            onClick={() => onChange(colorOption.value)}
            disabled={disabled}
            aria-label={colorOption.label}
            aria-pressed={isSelected}
            title={colorOption.label}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full transition disabled:cursor-default disabled:opacity-50",
              colorOption.swatchClassName,
              isSelected ? `ring-2 ring-offset-2 ring-offset-white ${colorOption.selectedClassName}` : "ring-0 hover:ring-2 hover:ring-stone-200 hover:ring-offset-2 hover:ring-offset-white",
            )}
          >
            {isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
          </button>
        );
      })}
      <label
        aria-label="Personnaliser…"
        title="Personnaliser…"
        className={cn(
          "relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-full transition",
          disabled ? "cursor-default opacity-50" : "cursor-pointer",
          customSelected ? "ring-2 ring-stone-300 ring-offset-2 ring-offset-white" : "ring-0 hover:ring-2 hover:ring-stone-200 hover:ring-offset-2 hover:ring-offset-white",
        )}
        style={{ backgroundColor: customColor }}
      >
        {customSelected ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : <Palette className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />}
        <input
          type="color"
          value={customColor}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
          aria-label="Couleur personnalisée"
        />
      </label>
    </div>
  );
}

function ExternalCalendarsSheet({
  calendars,
  events,
  permissions,
  profile,
  loading,
  error,
  syncingCalendarId,
  syncProgress,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onSync,
}: {
  calendars: ExternalCalendar[];
  events: ExternalCalendarEvent[];
  permissions: AppPermissions;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  syncingCalendarId: string | null;
  syncProgress: ExternalCalendarSyncProgress | null;
  onClose: () => void;
  onCreate: (input: { name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility }) => Promise<void>;
  onUpdate: (calendar: ExternalCalendar, input: { name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility }) => Promise<void>;
  onDelete: (calendar: ExternalCalendar) => Promise<void>;
  onSync: (calendar: ExternalCalendar) => Promise<ExternalCalendarSyncResult>;
}) {
  const [view, setView] = useState<"list" | "add" | "detail">("list");
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const defaultVisibility: ExternalCalendarVisibility = permissions.canManageEvents ? "admin_only" : "private";
  const [draft, setDraft] = useState<{ name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility }>({
    name: "",
    icsUrl: "",
    color: "",
    visibility: defaultVisibility,
  });
  const [savingNew, setSavingNew] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const selectedCalendar = selectedCalendarId ? calendars.find((calendar) => calendar.id === selectedCalendarId) ?? null : null;
  const selectedCalendarEvents = selectedCalendar ? events.filter((event) => event.externalCalendarId === selectedCalendar.id) : [];
  const canCreateExternalCalendar = Boolean(profile?.id);
  const isMobileFormView = view === "add" || view === "detail";

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      visibility: permissions.canManageEvents ? current.visibility : "private",
    }));
  }, [permissions.canManageEvents]);

  useEffect(() => {
    if (view === "detail" && selectedCalendarId && !selectedCalendar) {
      setSelectedCalendarId(null);
      setView("list");
    }
  }, [selectedCalendar, selectedCalendarId, view]);

  async function handleCreate() {
    setLocalError(null);
    if (!draft.name.trim() || !draft.icsUrl.trim() || !draft.color.trim()) {
      setLocalError("Nom, URL ICS et couleur obligatoires.");
      return;
    }

    setSavingNew(true);
    try {
      await onCreate(draft);
      setDraft({ name: "", icsUrl: "", color: "", visibility: defaultVisibility });
      setView("list");
    } catch (createError) {
      setLocalError(getUserFacingErrorMessage(createError, "Impossible d'ajouter ce calendrier."));
    } finally {
      setSavingNew(false);
    }
  }

  function returnToList() {
    setLocalError(null);
    setSelectedCalendarId(null);
    setView("list");
  }

  function cancelForm() {
    setLocalError(null);
    if (view === "add") {
      setDraft({ name: "", icsUrl: "", color: "", visibility: defaultVisibility });
    }
    setSelectedCalendarId(null);
    setView("list");
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex bg-stone-950/10",
        isMobileFormView ? "items-stretch p-0 sm:items-center sm:justify-center sm:p-6" : "items-end p-3 sm:items-center sm:justify-center sm:p-6",
      )}
    >
      <div
        className={cn(
          "flex w-full flex-col bg-white",
          isMobileFormView
            ? "h-[100dvh] max-h-[100dvh] rounded-none border-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] sm:h-auto sm:max-h-[86vh] sm:max-w-2xl sm:rounded-3xl sm:border sm:border-stone-200 sm:p-5"
            : "max-h-[86vh] rounded-3xl border border-stone-200 p-4 sm:max-w-2xl sm:p-5",
        )}
      >
        {isMobileFormView && (
          <div className="mb-5 flex items-center justify-between sm:hidden">
            <button type="button" onClick={cancelForm} className="rounded-full px-1 py-1 text-base font-semibold text-stone-500">
              Annuler
            </button>
            <h2 className="text-base font-semibold text-stone-950">{view === "detail" ? "Modifier le calendrier" : "Ajouter un calendrier"}</h2>
            <span className="w-[58px]" aria-hidden="true" />
          </div>
        )}

        <div className={cn("mb-4 flex items-start justify-between gap-3", isMobileFormView && "hidden sm:flex")}>
          <div className="flex min-w-0 items-start gap-2">
            {view !== "list" && (
              <button
                type="button"
                onClick={returnToList}
                className="-ml-1 mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100"
                aria-label="Retour"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-stone-950">
                {view === "add" ? "Ajouter un calendrier" : view === "detail" ? selectedCalendar?.name ?? "Calendrier" : "Calendriers externes"}
              </h2>
              <p className="mt-1 text-base font-medium text-stone-500">Flux ICS en lecture seule.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-base font-semibold text-stone-600 transition hover:bg-stone-50">
            Fermer
          </button>
        </div>

        {(error || localError) && <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{localError || error}</div>}

        <div className={cn("no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain", isMobileFormView && "pb-8 sm:pb-0")}>
          {view === "list" && (
            <ExternalCalendarsListView
              calendars={calendars}
              events={events}
              loading={loading}
              error={error}
              canCreate={canCreateExternalCalendar}
              onSelect={(calendar) => {
                setLocalError(null);
                setSelectedCalendarId(calendar.id);
                setView("detail");
              }}
              onAdd={() => {
                setLocalError(null);
                setDraft({ name: "", icsUrl: "", color: "", visibility: defaultVisibility });
                setView("add");
              }}
            />
          )}

          {view === "add" && (
            <ExternalCalendarAddView
              draft={draft}
              permissions={permissions}
              saving={savingNew}
              onChange={setDraft}
              onCreate={handleCreate}
            />
          )}

          {view === "detail" && selectedCalendar && (
            <ExternalCalendarSettingsDetail
              calendar={selectedCalendar}
              events={selectedCalendarEvents}
              permissions={permissions}
              profile={profile}
              syncing={syncingCalendarId === selectedCalendar.id}
              syncProgress={syncProgress?.calendarId === selectedCalendar.id ? syncProgress : null}
              onUpdate={onUpdate}
              onDelete={async (calendar) => {
                await onDelete(calendar);
                setSelectedCalendarId(null);
                setView("list");
              }}
              onSync={onSync}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ExternalCalendarColorDot({ color, className }: { color: string | null; className?: string }) {
  const tone = getExternalCalendarTone(color);
  return <span style={tone.dotStyle} className={cn("h-3.5 w-3.5 shrink-0 rounded-full", tone.dot, className)} />;
}

function getExternalCalendarStatusLine(events: ExternalCalendarEvent[]) {
  const latestSync = events
    .map((event) => event.lastSyncedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  if (!latestSync) return "Jamais synchronisé";
  return `${events.length} événement${events.length > 1 ? "s" : ""} · Synchro ${formatHistoryTimestamp(latestSync)}`;
}

function ExternalCalendarsListView({
  calendars,
  events,
  loading,
  error,
  canCreate,
  onSelect,
  onAdd,
}: {
  calendars: ExternalCalendar[];
  events: ExternalCalendarEvent[];
  loading: boolean;
  error: string | null;
  canCreate: boolean;
  onSelect: (calendar: ExternalCalendar) => void;
  onAdd: () => void;
}) {
  if (loading) {
    return <div className="rounded-2xl bg-stone-50 px-4 py-3 text-base font-medium text-stone-500">Chargement...</div>;
  }

  return (
    <div className="space-y-2">
      {calendars.length === 0 && !error && (
        <div className="rounded-2xl bg-stone-50 px-4 py-3 text-base font-medium text-stone-500">Aucun calendrier externe pour le moment.</div>
      )}
      {calendars.map((calendar) => {
        const calendarEvents = events.filter((event) => event.externalCalendarId === calendar.id);
        return (
          <button
            key={calendar.id}
            type="button"
            onClick={() => onSelect(calendar)}
            className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3 text-left transition hover:bg-stone-100/80"
          >
            <ExternalCalendarColorDot color={calendar.color} />
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-base font-semibold text-stone-950">{calendar.name}</span>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-500 ring-1 ring-stone-200">
                  {getExternalCalendarVisibilityLabel(calendar.visibility)}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-sm font-semibold text-stone-400">{getExternalCalendarStatusLine(calendarEvents)}</span>
            </span>
            <ChevronRight className="h-5 w-5 text-stone-300" />
          </button>
        );
      })}
      {canCreate && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-3 flex w-full items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-3 text-base font-semibold text-stone-600 transition hover:bg-stone-50"
        >
          Ajouter un calendrier
        </button>
      )}
    </div>
  );
}

function ExternalCalendarAddView({
  draft,
  permissions,
  saving,
  onChange,
  onCreate,
}: {
  draft: { name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility };
  permissions: AppPermissions;
  saving: boolean;
  onChange: Dispatch<SetStateAction<{ name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility }>>;
  onCreate: () => Promise<void>;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
      <div className="grid gap-2">
        <input
          value={draft.name}
          onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))}
          placeholder="Nom"
          className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-base font-semibold text-stone-950 outline-none transition placeholder:text-stone-300 focus:border-[#bb2720]/40"
        />
        <input
          value={draft.icsUrl}
          onChange={(event) => onChange((current) => ({ ...current, icsUrl: event.target.value }))}
          onBlur={() => onChange((current) => ({ ...current, icsUrl: normalizeExternalCalendarIcsUrl(current.icsUrl) }))}
          placeholder="URL ICS"
          inputMode="url"
          className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-base font-medium text-stone-950 outline-none transition placeholder:text-stone-300 focus:border-[#bb2720]/40"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
          <ExternalCalendarColorPalette
            value={draft.color}
            onChange={(nextColor) => onChange((current) => ({ ...current, color: nextColor }))}
          />
          <select
            value={draft.visibility}
            onChange={(event) => onChange((current) => ({ ...current, visibility: event.target.value as ExternalCalendarVisibility }))}
            className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-base font-semibold text-stone-700 outline-none"
          >
            {permissions.canManageEvents && <option value="admin_only">Admin uniquement</option>}
            {permissions.canManageEvents && <option value="team">Toute l'équipe</option>}
            <option value="private">Privé</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => void onCreate()}
          disabled={saving || !draft.name.trim() || !draft.icsUrl.trim() || !draft.color.trim()}
          className="justify-self-end rounded-full border border-stone-200 bg-white px-3 py-1.5 text-base font-semibold text-stone-600 transition hover:bg-stone-100 disabled:text-stone-300"
        >
          {saving ? "Ajout..." : "Ajouter"}
        </button>
      </div>
    </div>
  );
}

function ExternalCalendarSettingsDetail({
  calendar,
  events,
  permissions,
  profile,
  syncing,
  syncProgress,
  onUpdate,
  onDelete,
  onSync,
}: {
  calendar: ExternalCalendar;
  events: ExternalCalendarEvent[];
  permissions: AppPermissions;
  profile: UserProfile | null;
  syncing: boolean;
  syncProgress: ExternalCalendarSyncProgress | null;
  onUpdate: (calendar: ExternalCalendar, input: { name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility }) => Promise<void>;
  onDelete: (calendar: ExternalCalendar) => Promise<void>;
  onSync: (calendar: ExternalCalendar) => Promise<ExternalCalendarSyncResult>;
}) {
  const [draft, setDraft] = useState<{ name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility }>({
    name: calendar.name,
    icsUrl: calendar.icsUrl,
    color: calendar.color ?? "indigo",
    visibility: calendar.visibility,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const canManage = canManageExternalCalendar(permissions, profile, calendar);
  const hasChanges =
    draft.name.trim() !== calendar.name ||
    draft.icsUrl.trim() !== calendar.icsUrl ||
    draft.color !== (calendar.color ?? "indigo") ||
    draft.visibility !== calendar.visibility;

  useEffect(() => {
    setDraft({
      name: calendar.name,
      icsUrl: calendar.icsUrl,
      color: calendar.color ?? "indigo",
      visibility: calendar.visibility,
    });
  }, [calendar.color, calendar.icsUrl, calendar.name, calendar.visibility]);

  async function handleSave() {
    setRowError(null);
    setSyncSummary(null);
    setSaving(true);
    try {
      await onUpdate(calendar, draft);
    } catch (saveError) {
      setRowError(getUserFacingErrorMessage(saveError, "Impossible d'enregistrer ce calendrier."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setRowError(null);
    setSyncSummary(null);
    setDeleting(true);
    try {
      await onDelete(calendar);
    } catch (deleteError) {
      setRowError(getUserFacingErrorMessage(deleteError, "Impossible de supprimer ce calendrier."));
      setDeleting(false);
    }
  }

  async function handleSync() {
    setRowError(null);
    setSyncSummary(null);
    setSaving(true);
    try {
      if (hasChanges) {
        await onUpdate(calendar, draft);
      }
      const result = await onSync({ ...calendar, ...draft });
      setSyncSummary(`${result.synced.toLocaleString("fr-FR")} événement${result.synced > 1 ? "s" : ""} synchronisé${result.synced > 1 ? "s" : ""}.`);
    } catch (syncError) {
      setRowError(getUserFacingErrorMessage(syncError, "Impossible de synchroniser ce calendrier."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <input
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            readOnly={!canManage}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-stone-950 outline-none"
            aria-label="Nom du calendrier"
          />
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-sm font-semibold text-indigo-700">{getExternalCalendarVisibilityLabel(calendar.visibility)}</span>
        </div>
        <p className="text-sm font-semibold text-stone-400">
          {getExternalCalendarStatusLine(events)}
        </p>
        <input
          value={draft.icsUrl}
          onChange={(event) => setDraft((current) => ({ ...current, icsUrl: event.target.value }))}
          onBlur={() => setDraft((current) => ({ ...current, icsUrl: normalizeExternalCalendarIcsUrl(current.icsUrl) }))}
          placeholder="URL ICS"
          inputMode="url"
          readOnly={!canManage}
          className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-base font-medium text-stone-950 outline-none transition placeholder:text-stone-300 focus:border-[#bb2720]/40"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
          <ExternalCalendarColorPalette
            value={draft.color}
            onChange={(nextColor) => setDraft((current) => ({ ...current, color: nextColor }))}
            disabled={!canManage}
          />
          <select
            value={draft.visibility}
            onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as ExternalCalendarVisibility }))}
            disabled={!canManage || !permissions.canManageEvents}
            className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-base font-semibold text-stone-700 outline-none"
          >
            {permissions.canManageEvents && <option value="admin_only">Admin uniquement</option>}
            {permissions.canManageEvents && <option value="team">Toute l'équipe</option>}
            <option value="private">Privé</option>
          </select>
        </div>
        {rowError && <p className="text-sm font-semibold text-rose-600">{rowError}</p>}
        {syncProgress && (
          <p className="text-sm font-semibold text-indigo-600">
            Synchronisation... {syncProgress.synced.toLocaleString("fr-FR")} / {syncProgress.total.toLocaleString("fr-FR")}
          </p>
        )}
        {syncSummary && !syncing && <p className="text-sm font-semibold text-emerald-600">{syncSummary}</p>}
        <div className="flex justify-end gap-2">
          {canManage && hasChanges && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-base font-semibold text-stone-600 transition hover:bg-stone-100 disabled:text-stone-300"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={!canManage || syncing || saving || !draft.icsUrl.trim()}
            className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-base font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:border-stone-200 disabled:bg-white disabled:text-stone-300"
          >
            {syncProgress
              ? `${syncProgress.synced.toLocaleString("fr-FR")} / ${syncProgress.total.toLocaleString("fr-FR")}`
              : syncing
                ? "Synchronisation..."
                : "Synchroniser"}
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting || syncing || saving}
              className="rounded-full border border-[#bb2720]/20 bg-white px-3 py-1.5 text-base font-semibold text-[#bb2720] transition hover:bg-[#bb2720]/[0.05] disabled:text-stone-300"
            >
              {deleting ? "Suppression..." : "Supprimer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function getExternalEventDescriptionView(description?: string | null) {
  if (!description?.trim()) {
    return {
      usefulLines: [] as string[],
      joinUrls: [] as string[],
      notesText: null as string | null,
    };
  }

  const normalized = description.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const urlMatches = Array.from(new Set(normalized.match(/https?:\/\/[^\s<>"')]+/g) ?? []));
  const technicalLinePattern =
    /^([-_=]{5,}|Microsoft Teams$|Need help\?|Learn More|Meeting options|Legal|Privacy and security|For organizers:|Join with a video conferencing device|Video ID:)/i;
  const usefulLinePattern =
    /(rejoindre|join|teams|réunion|meeting|passcode|code secret|mot de passe|conference|conférence|numéro|number|ID de réunion|meeting id|https?:\/\/)/i;
  const readableLines = lines.filter((line) => !technicalLinePattern.test(line));
  const usefulLines = readableLines.filter((line) => usefulLinePattern.test(line)).slice(0, 8);
  const fallbackLines = usefulLines.length > 0 ? usefulLines : readableLines.slice(0, 5);
  const notesText = normalized.length > 520 || readableLines.length > fallbackLines.length + 2 ? normalized : null;

  return {
    usefulLines: fallbackLines,
    joinUrls: urlMatches.slice(0, 4),
    notesText,
  };
}

function ExternalCalendarEventDetails({
  event,
  onClose,
}: {
  event: ExternalCalendarEvent;
  onClose: () => void;
}) {
  const tone = getExternalCalendarTone(event.calendarColor);
  const dateLabel = event.allDay ? formatFullDate(event.startTime.slice(0, 10)) : formatFullDate(formatDateKey(new Date(event.startTime)));
  const timeRange = formatExternalEventTimeRange(event);
  const descriptionView = getExternalEventDescriptionView(event.description);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-stone-950/10 p-3 sm:items-center sm:justify-center sm:p-6"
      onPointerDown={(pointerEvent) => {
        if (pointerEvent.target === pointerEvent.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white p-4 sm:max-h-[min(760px,calc(100dvh-3rem))] sm:max-w-lg sm:p-5"
        onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cn("mb-1 text-sm font-semibold", tone.meta)}>{event.calendarName}</p>
            <h2 className="text-base font-semibold text-stone-950" style={{ overflowWrap: "anywhere" }}>
              {event.title}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-base font-semibold text-stone-600 transition hover:bg-stone-50">
            Fermer
          </button>
        </div>
        <div className="mobile-no-scrollbar min-h-0 overflow-y-auto overscroll-contain">
          <div style={tone.bgStyle} className={cn("grid min-w-0 gap-3 rounded-2xl px-4 py-3", tone.bg)}>
            <p className={cn("text-base font-semibold", tone.title)} style={{ overflowWrap: "anywhere" }}>
              {dateLabel}
            </p>
            {timeRange && (
              <p className={cn("text-base font-medium", tone.meta)} style={{ overflowWrap: "anywhere" }}>
                {timeRange}
              </p>
            )}
            {event.location && (
              <p className="text-base font-medium text-stone-600" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                {event.location}
              </p>
            )}
            {descriptionView.usefulLines.length > 0 && (
              <div className="grid gap-2">
                {descriptionView.usefulLines.map((line, index) => (
                  <p key={`${line}-${index}`} className="whitespace-pre-wrap text-base font-medium leading-relaxed text-stone-600" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                    {line}
                  </p>
                ))}
              </div>
            )}
            {descriptionView.joinUrls.length > 0 && (
              <div className="grid gap-1">
                {descriptionView.joinUrls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn("text-base font-semibold underline decoration-current/30 underline-offset-4", tone.title)}
                    style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                  >
                    {url}
                  </a>
                ))}
              </div>
            )}
            {descriptionView.notesText && (
              <div className="min-w-0 rounded-2xl bg-white/70 px-3 py-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-normal text-stone-400">Notes</p>
                <div
                  className="mobile-no-scrollbar max-h-56 overflow-y-auto overscroll-contain whitespace-pre-wrap text-sm font-medium leading-relaxed text-stone-600"
                  style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                >
                  {descriptionView.notesText}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DuplicateEventDialog({
  request,
  onClose,
  onConfirm,
}: {
  request: DuplicateEventRequest;
  onClose: () => void;
  onConfirm: (request: DuplicateEventRequest) => Promise<void>;
}) {
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setDuplicating(true);
    setError(null);

    try {
      await onConfirm(request);
    } catch (duplicateError) {
      setError(getUserFacingErrorMessage(duplicateError, "Impossible de dupliquer l'événement."));
      setDuplicating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-stone-950/10 p-3 sm:items-center sm:justify-center sm:p-6">
      <div className="w-full rounded-3xl border border-stone-200 bg-white p-5 sm:max-w-md sm:p-6">
        <div className="mb-5">
          <p className="truncate text-base font-semibold text-stone-950">{request.event.clientName}</p>
          <p className="mt-1 truncate text-base text-stone-500">{request.event.eventName}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-stone-50 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-normal text-stone-400">Date source</p>
              <p className="mt-1 text-base font-semibold text-stone-800">{formatFullDate(request.event.date)}</p>
            </div>
            <div className="rounded-2xl bg-[#bb2720]/[0.06] px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-normal text-[#bb2720]/70">Nouvelle date</p>
              <p className="mt-1 text-base font-semibold text-[#bb2720]">{formatFullDate(request.date)}</p>
            </div>
          </div>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={duplicating}
            className="rounded-full border border-stone-200 bg-white px-4 py-2 text-base font-semibold text-stone-600 disabled:text-stone-300"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={duplicating}
            className="rounded-full bg-[#bb2720] px-4 py-2 text-base font-semibold text-white disabled:bg-stone-300"
          >
            {duplicating ? "Duplication..." : "Dupliquer"}
          </button>
        </div>
      </div>
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
  onConfirm: (event: ProductionEvent) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    console.log("Delete event confirmation clicked", {
      eventId: event.id,
      clientName: event.clientName,
      eventName: event.eventName,
    });
    setDeleting(true);
    setError(null);

    try {
      await onConfirm(event);
    } catch (deleteError) {
      setError(getUserFacingErrorMessage(deleteError, "Impossible de supprimer l'événement."));
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-stone-950/10 p-3 sm:items-center sm:justify-center sm:p-6">
      <div className="w-full rounded-3xl border border-stone-200 bg-white p-5 sm:max-w-md sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-stone-950">Placer cet événement dans la corbeille ?</h2>
          <p className="mt-2 text-base font-medium text-stone-500">Vous pourrez le restaurer depuis la Corbeille.</p>
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
            {deleting ? "Déplacement..." : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PermanentDeleteEventDialog({
  event,
  onClose,
  onConfirm,
}: {
  event: ProductionEvent;
  onClose: () => void;
  onConfirm: (event: ProductionEvent) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setDeleting(true);
    setError(null);

    try {
      await onConfirm(event);
    } catch (deleteError) {
      setError(getUserFacingErrorMessage(deleteError, "Impossible de supprimer définitivement l'événement."));
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-stone-950/15 p-3 sm:items-center sm:justify-center sm:p-6">
      <div className="w-full rounded-3xl border border-rose-200 bg-white p-5 sm:max-w-md sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-stone-950">Supprimer définitivement cet événement ?</h2>
          <p className="mt-2 text-base font-medium text-rose-700">Cette action est irréversible.</p>
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

function SharedDatePicker({
  selectedDate,
  onClose,
  onSelectDate,
  confirmationTitle,
}: {
  selectedDate: string;
  onClose: () => void;
  onSelectDate: (date: string) => Promise<void> | void;
  confirmationTitle?: string;
}) {
  const [pickerMonth, setPickerMonth] = useState(() => new Date(`${selectedDate}T12:00:00`));
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerSwipeStartRef = useRef<{ pointerId: number; x: number; y: number; axis: "horizontal" | "vertical" | null } | null>(null);
  const pickerPagerRef = useRef<HTMLDivElement | null>(null);
  const pickerTransitioningRef = useRef(false);
  const pickerTransitionTimeoutRef = useRef<number | null>(null);
  const suppressPickerClickRef = useRef(false);
  const [pickerPagerOffset, setPickerPagerOffset] = useState(0);
  const [pickerTransitionEnabled, setPickerTransitionEnabled] = useState(false);
  const [pickerAnimatingDirection, setPickerAnimatingDirection] = useState<-1 | 1 | null>(null);
  const weekdays = ["L", "M", "M", "J", "V", "S", "D"];
  const monthData = useMemo(() => getCalendarMonthData(pickerMonth, []), [pickerMonth]);
  const previousMonthData = useMemo(() => getCalendarMonthData(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1), []), [pickerMonth]);
  const nextMonthData = useMemo(() => getCalendarMonthData(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1), []), [pickerMonth]);

  useEffect(() => {
    return () => {
      if (pickerTransitionTimeoutRef.current) {
        window.clearTimeout(pickerTransitionTimeoutRef.current);
      }
    };
  }, []);

  function selectDate(dateKey: string) {
    if (dateKey === selectedDate) {
      onClose();
      return;
    }

    if (!confirmationTitle) {
      void applyDate(dateKey);
      return;
    }

    setPendingDate(dateKey);
    setError(null);
  }

  async function applyDate(dateKey: string) {
    setSaving(true);
    setError(null);

    try {
      await onSelectDate(dateKey);
    } catch (saveError) {
      setError(getUserFacingErrorMessage(saveError, "Impossible de modifier la date."));
      setSaving(false);
    }
  }

  async function confirmDateChange() {
    if (!pendingDate) return;
    await applyDate(pendingDate);
  }

  function changePickerMonth(delta: -1 | 1) {
    if (saving || pickerTransitioningRef.current) return;

    const viewportWidth = pickerPagerRef.current?.clientWidth ?? 0;
    const pageStep = getSwipePageStep(viewportWidth);
    pickerTransitioningRef.current = true;
    pickerSwipeStartRef.current = null;
    setPickerTransitionEnabled(true);
    setPickerAnimatingDirection(delta);
    setPickerPagerOffset(delta === 1 ? -pageStep : pageStep);

    if (pickerTransitionTimeoutRef.current) {
      window.clearTimeout(pickerTransitionTimeoutRef.current);
    }

    pickerTransitionTimeoutRef.current = window.setTimeout(() => {
      setPickerTransitionEnabled(false);
      setPickerMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
      setPickerAnimatingDirection(null);
      setPickerPagerOffset(0);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          pickerTransitioningRef.current = false;
          pickerTransitionTimeoutRef.current = null;
        });
      });
    }, PAGE_TRANSITION_MS);
  }

  function handlePickerSwipePointerDown(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (saving || pendingDate || pointerEvent.pointerType === "mouse" || pickerTransitioningRef.current) return;

    pickerSwipeStartRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      axis: null,
    };
    setPickerTransitionEnabled(false);
    setPickerPagerOffset(0);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  function handlePickerSwipePointerMove(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (pickerTransitioningRef.current) return;

    const swipeStart = pickerSwipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== pointerEvent.pointerId) return;

    const deltaX = pointerEvent.clientX - swipeStart.x;
    const deltaY = pointerEvent.clientY - swipeStart.y;

    if (!swipeStart.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 8) {
      swipeStart.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
    }

    if (swipeStart.axis === "horizontal") {
      suppressPickerClickRef.current = true;
      pointerEvent.preventDefault();
      const viewportWidth = pickerPagerRef.current?.clientWidth ?? pointerEvent.currentTarget.clientWidth;
      const pageStep = getSwipePageStep(viewportWidth);
      setPickerPagerOffset(Math.max(-pageStep, Math.min(pageStep, deltaX)));
    }
  }

  function handlePickerSwipePointerUp(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (pickerTransitioningRef.current) return;

    const swipeStart = pickerSwipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== pointerEvent.pointerId) return;

    const deltaX = pointerEvent.clientX - swipeStart.x;
    const deltaY = pointerEvent.clientY - swipeStart.y;
    const viewportWidth = pickerPagerRef.current?.clientWidth ?? pointerEvent.currentTarget.clientWidth;
    const swipeThreshold = getSwipeThreshold(viewportWidth);
    pickerSwipeStartRef.current = null;
    window.setTimeout(() => {
      suppressPickerClickRef.current = false;
    }, 0);

    if (swipeStart.axis !== "horizontal" || Math.abs(deltaX) < swipeThreshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      setPickerTransitionEnabled(true);
      setPickerPagerOffset(0);
      window.setTimeout(() => {
        if (!pickerTransitioningRef.current) {
          setPickerTransitionEnabled(false);
        }
      }, PAGE_TRANSITION_MS);
      return;
    }

    changePickerMonth(deltaX < 0 ? 1 : -1);
  }

  function resetPickerSwipe() {
    if (pickerTransitioningRef.current) return;

    pickerSwipeStartRef.current = null;
    suppressPickerClickRef.current = false;
    setPickerTransitionEnabled(false);
    setPickerPagerOffset(0);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/10 p-3 sm:items-center sm:p-6"
      onPointerDown={(pointerEvent) => {
        if (pointerEvent.target === pointerEvent.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-3 sm:p-4" onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}>
        <div
          ref={pickerPagerRef}
          className="overflow-hidden"
          style={{ touchAction: "pan-y" }}
          onPointerDown={handlePickerSwipePointerDown}
          onPointerMove={handlePickerSwipePointerMove}
          onPointerUp={handlePickerSwipePointerUp}
          onPointerCancel={resetPickerSwipe}
        >
          <div
            className="flex w-full"
            style={{
              gap: PAGE_GAP,
              transform: `translate3d(calc(-100% - ${PAGE_GAP}px + ${pickerPagerOffset}px), 0, 0)`,
              transition: pickerTransitionEnabled ? `transform ${PAGE_TRANSITION_MS}ms ${PAGE_TRANSITION_EASING}` : undefined,
            }}
          >
            <DatePickerMonthPage
              monthData={previousMonthData}
              selectedDate={selectedDate}
              weekdays={weekdays}
              saving={saving}
              interactive={false}
              onPreviousMonth={() => changePickerMonth(-1)}
              onNextMonth={() => changePickerMonth(1)}
              onSelectDate={selectDate}
            />
            <DatePickerMonthPage
              monthData={monthData}
              selectedDate={selectedDate}
              weekdays={weekdays}
              saving={saving}
              interactive={!pickerAnimatingDirection}
              onPreviousMonth={() => changePickerMonth(-1)}
              onNextMonth={() => changePickerMonth(1)}
              onSelectDate={(dateKey) => {
                if (suppressPickerClickRef.current) return;
                selectDate(dateKey);
              }}
            />
            <DatePickerMonthPage
              monthData={nextMonthData}
              selectedDate={selectedDate}
              weekdays={weekdays}
              saving={saving}
              interactive={false}
              onPreviousMonth={() => changePickerMonth(-1)}
              onNextMonth={() => changePickerMonth(1)}
              onSelectDate={selectDate}
            />
          </div>
        </div>

        {error && <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="mt-3 flex justify-end px-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-stone-200 bg-white px-4 py-2 text-base font-semibold text-stone-600 transition hover:bg-stone-50 disabled:text-stone-300"
          >
            Annuler
          </button>
        </div>
      </div>

      {pendingDate && (
        <div
          className="absolute inset-0 flex items-end justify-center bg-stone-950/10 p-3 sm:items-center sm:p-6"
          onPointerDown={(pointerEvent) => {
            if (pointerEvent.target === pointerEvent.currentTarget && !saving) {
              onClose();
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-4 sm:p-5" onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-2xl bg-stone-50 px-3 py-3 text-left transition hover:bg-stone-100 disabled:opacity-60"
              >
                <p className="text-xs font-semibold uppercase tracking-normal text-stone-400">Ancienne date</p>
                <p className="mt-1 text-base font-semibold text-stone-800">{formatFullDate(selectedDate)}</p>
              </button>
              <button
                type="button"
                onClick={() => void confirmDateChange()}
                disabled={saving}
                className="rounded-2xl bg-[#bb2720]/[0.06] px-3 py-3 text-left transition hover:bg-[#bb2720]/10 disabled:opacity-60"
              >
                <p className="text-xs font-semibold uppercase tracking-normal text-[#bb2720]/70">Nouvelle date</p>
                <p className="mt-1 text-base font-semibold text-[#bb2720]">{formatFullDate(pendingDate)}</p>
              </button>
            </div>

            {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function DatePickerMonthPage({
  monthData,
  selectedDate,
  weekdays,
  saving,
  interactive,
  onPreviousMonth,
  onNextMonth,
  onSelectDate,
}: {
  monthData: ReturnType<typeof getCalendarMonthData>;
  selectedDate: string;
  weekdays: string[];
  saving: boolean;
  interactive: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (dateKey: string) => void;
}) {
  return (
    <div className={cn("w-full shrink-0 px-1", !interactive && "pointer-events-none")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPreviousMonth}
          disabled={saving}
          className={cn(calendarArrowClassName, "hidden sm:flex")}
          aria-label="Mois précédent"
          tabIndex={interactive ? 0 : -1}
        >
          ←
        </button>
        <p className="text-base font-semibold text-stone-950">
          {monthData.monthTitle} {monthData.year}
        </p>
        <button
          type="button"
          onClick={onNextMonth}
          disabled={saving}
          className={cn(calendarArrowClassName, "hidden sm:flex")}
          aria-label="Mois suivant"
          tabIndex={interactive ? 0 : -1}
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7">
        {weekdays.map((weekday, index) => (
          <span key={`${weekday}-${index}`} className="py-2 text-center text-xs font-semibold text-stone-400">
            {weekday}
          </span>
        ))}
        {Array.from({ length: monthData.leadingEmptyDays }).map((_, index) => (
          <span key={`empty-start-${index}`} className="aspect-square" />
        ))}
        {monthData.calendarDays.map((day) => {
          const isSelected = day.dateKey === selectedDate;
          return (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => onSelectDate(day.dateKey)}
              disabled={saving}
              className="flex aspect-square items-center justify-center rounded-full text-base font-semibold text-stone-800 transition hover:bg-stone-100 disabled:text-stone-300"
              tabIndex={interactive ? 0 : -1}
            >
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", isSelected && "bg-[#bb2720] text-white")}>{day.day}</span>
            </button>
          );
        })}
        {Array.from({ length: monthData.trailingEmptyDays }).map((_, index) => (
          <span key={`empty-end-${index}`} className="aspect-square" />
        ))}
      </div>
    </div>
  );
}

function DocumentPreviewModal({
  preview,
  onClose,
  onDownload,
}: {
  preview: DocumentPreview;
  onClose: () => void;
  onDownload: (file: EventDocument) => Promise<void>;
}) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const FileIcon = getDocumentFileIcon(preview.file);

  async function downloadPreviewFile() {
    setDownloadError(null);

    try {
      await onDownload(preview.file);
    } catch (error) {
      setDownloadError(getUserFacingErrorMessage(error, "Impossible de télécharger le document."));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-stone-950/20 p-3 sm:p-6">
      <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white">
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-stone-200 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <FileIcon className="h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-stone-950">{preview.file.fileName}</p>
              <p className="text-base font-medium text-stone-500">{formatFileSize(preview.file.fileSize)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void downloadPreviewFile()}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-800 transition hover:bg-amber-100"
              aria-label="Télécharger ce document"
              title="Télécharger"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50"
              aria-label="Fermer l'aperçu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {downloadError && <div className="shrink-0 border-b border-rose-100 bg-rose-50 px-4 py-2 text-base font-medium text-rose-700">{downloadError}</div>}

        <div className="min-h-0 flex-1 bg-stone-100">
          {preview.kind === "image" ? (
            <div className="flex h-full min-h-0 items-center justify-center overflow-auto p-3 sm:p-5">
              <img src={preview.url} alt={preview.file.fileName} className="max-h-full max-w-full rounded-2xl object-contain" />
            </div>
          ) : (
            <iframe title={preview.file.fileName} src={preview.url} className="h-full w-full border-0 bg-white" />
          )}
        </div>
      </div>
    </div>
  );
}

const formInputClassName =
  "h-11 w-full rounded-2xl border border-stone-200 bg-white px-3 text-base font-medium text-stone-950 outline-none transition focus:border-[#bb2720]/50";

function TimeTextInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  function commitValue() {
    onChange(normalizeCompactTimeInput(value));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="HH:mm"
      value={value}
      onChange={(event) => onChange(sanitizeTimeDraft(event.target.value))}
      onBlur={commitValue}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitValue();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-base font-semibold text-stone-500">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status, large = false }: { status: EventStatus; large?: boolean }) {
  return (
    <span className={cn("inline-flex items-center rounded-full text-base font-bold ring-1", large ? "px-3 py-1.5" : "px-2.5 py-1 leading-tight", statusStyles[status])}>
      {large && status === "Prêt" ? "PRÊT" : status}
    </span>
  );
}

function TimelineKeyboardAccessoryBar({
  keyboardHeight,
  onConfirm,
}: {
  keyboardHeight: number;
  onConfirm: () => Promise<void>;
}) {
  useEffect(() => {
    console.log("Timeline keyboard accessory: OK bar rendered", { keyboardHeight });
  }, [keyboardHeight]);

  return (
    <div
      className="fixed inset-x-0 z-[100] border-t border-stone-200/80 bg-white/95 px-4 py-1.5"
      style={{ bottom: `${Math.max(0, Math.round(keyboardHeight))}px` }}
    >
      <div className="mx-auto flex h-11 max-w-7xl items-center justify-end">
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void onConfirm()}
          className="rounded-full bg-stone-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-stone-600 active:bg-stone-600"
        >
          OK
        </button>
      </div>
    </div>
  );
}

function formatNotificationRelativeTime(dateValue: string) {
  const timestamp = new Date(dateValue).getTime();
  if (Number.isNaN(timestamp)) return "";
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "À l'instant";
  if (diffMinutes < 60) return `${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} j`;
  return formatHistoryTimestamp(dateValue);
}

function NotificationMenu({
  notifications,
  unreadCount,
  open,
  setOpen,
  onOpenNotification,
  onMarkAllRead,
}: {
  notifications: AppNotification[];
  unreadCount: number;
  open: boolean;
  setOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  onOpenNotification: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapperRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, setOpen]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-white bg-[#bb2720]" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-stone-200 bg-white/95 text-left backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-stone-950">Notifications</p>
              <p className="text-xs font-medium text-stone-500">
                {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Tout est à jour"}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#bb2720] transition hover:bg-[#bb2720]/[0.06]"
              >
                Tout lire
              </button>
            )}
          </div>
          <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-1.5">
            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm font-medium text-stone-400">Aucune notification</div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => onOpenNotification(notification)}
                  className={cn(
                    "block w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-stone-50",
                    !notification.readAt && "bg-[#bb2720]/[0.04]",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        notification.readAt ? "bg-stone-200" : "bg-[#bb2720]",
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-stone-900">{notification.title}</span>
                        <span className="shrink-0 text-xs font-medium text-stone-400">{formatNotificationRelativeTime(notification.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug text-stone-500">{notification.body}</span>
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderIcon({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50"
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function SyncStatusIndicator({
  online,
  pendingCount,
  syncing,
  error,
}: {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
  error: string | null;
}) {
  const visible = !online || pendingCount > 0 || syncing || Boolean(error);
  if (!visible) return null;

  const label = !online
    ? pendingCount > 0
      ? `${pendingCount} en attente`
      : "Hors ligne"
    : syncing
      ? "Synchro"
      : error
        ? "Erreur synchro"
        : `${pendingCount} en attente`;

  return (
    <div
      className={cn(
        "flex h-10 min-w-10 items-center justify-center rounded-full border px-2 text-sm font-semibold sm:px-3",
        error
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : !online
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-sky-200 bg-sky-50 text-sky-700",
      )}
      title={error ?? label}
      aria-live="polite"
    >
      <span className="sm:hidden">{error ? "!" : !online ? "HL" : pendingCount}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

function AccountMenu({
  profile,
  email,
  canManageExternalCalendars,
  onOpenExternalCalendars,
  onLogout,
}: {
  profile: UserProfile | null;
  email?: string;
  canManageUsers: boolean;
  onOpenUserManagement: () => void;
  canManageExternalCalendars: boolean;
  onOpenExternalCalendars: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const displayName = getProfileDisplayName(profile) ?? email ?? "Utilisateur";
  const initials = getProfileInitials(profile, email);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapperRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
        aria-label="Compte"
        title={displayName}
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-52 rounded-2xl border border-stone-200 bg-white/95 p-1 text-right backdrop-blur-xl">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-stone-950">{displayName}</p>
            <p className="mt-0.5 truncate text-xs font-medium text-stone-500">{profile ? getRoleLabel(profile.role) : email}</p>
          </div>
          {canManageExternalCalendars && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenExternalCalendars();
              }}
              className="block w-full rounded-xl px-3 py-2 text-right text-sm font-medium text-stone-700 transition hover:bg-[#bb2720]/[0.05] hover:text-stone-950"
            >
              Calendriers externes
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void onLogout();
            }}
            className="block w-full rounded-xl px-3 py-2 text-right text-sm font-medium text-stone-700 transition hover:bg-[#bb2720]/[0.05] hover:text-stone-950"
          >
            Déconnexion
          </button>
        </div>
      )}
    </div>
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
  onAdd?: () => void;
}) {
  const activeTone = tone === "option" ? getOptionTone("completed") : tone === "link" ? getLinkTone("available") : getDocumentTone(true);
  const addTone = cn(activeTone.surface, activeTone.border, activeTone.hover, activeTone.text);

  return (
    <div className={cn("mb-2 flex min-w-0 items-center gap-1.5 sm:mb-3 sm:gap-2", align === "right" ? "justify-end" : "justify-start")}>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-base font-semibold leading-none transition active:scale-95", addTone)}
          aria-label={addLabel}
          title={addLabel}
        >
          +
        </button>
      )}
      <h2
        className={cn(
          "min-w-0 flex-1 truncate text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-stone-500 sm:text-base sm:tracking-[0.16em]",
          align === "right" && "text-right",
        )}
      >
        {label}
      </h2>
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
      : tone === "link"
        ? "bg-sky-600 hover:bg-sky-700 disabled:bg-stone-300"
        : "bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300";

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

function InlineGridDeleteConfirmation({
  tone,
  deleting,
  onCancel,
  onConfirm,
}: {
  tone: ItemKind;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const toneClassName =
    tone === "option"
      ? "bg-emerald-50/80"
      : tone === "link"
        ? "bg-sky-50/80"
        : "bg-amber-50/80";

  return (
    <div className={cn("flex min-h-[4.75rem] min-w-0 flex-1 items-center justify-center rounded-[0.65rem] px-2 py-3 transition sm:min-h-20 sm:px-3", toneClassName)}>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onCancel();
          }}
          disabled={deleting}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-stone-200 bg-white/80 text-stone-500 transition hover:bg-white hover:text-stone-800 disabled:text-stone-300"
          aria-label="Annuler"
          title="Annuler"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onConfirm();
        }}
        disabled={deleting}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[#bb2720]/90 text-white transition hover:bg-[#a9231d] disabled:bg-stone-300"
          aria-label="Supprimer"
          title="Supprimer"
      >
          <Trash2 className="h-3.5 w-3.5" />
      </button>
      </div>
    </div>
  );
}

function CompactGridDeleteDialog({
  deleting,
  onCancel,
  onConfirm,
}: {
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/10 p-3 sm:items-center sm:p-6">
      <div data-grid-delete-dialog className="w-full max-w-xs rounded-3xl border border-stone-200 bg-white p-4">
        <p className="text-center text-base font-semibold text-stone-950">Supprimer cet élément ?</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-full border border-stone-200 bg-white px-4 py-2 text-base font-semibold text-stone-600 transition hover:bg-stone-50 disabled:text-stone-300"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-full bg-[#bb2720] px-4 py-2 text-base font-semibold text-white transition hover:bg-[#a9231d] disabled:bg-stone-300"
          >
            {deleting ? "Suppression..." : "Supprimer"}
          </button>
        </div>
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

function FullScreenStatus({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "error" }) {
  return (
    <main className="flex h-screen h-[100svh] items-center justify-center bg-[#f7f9fb] p-4 text-stone-950">
      <div
        className={cn(
          "rounded-3xl border bg-white px-5 py-4 text-base font-semibold",
          tone === "error" ? "border-rose-200 text-rose-700" : "border-stone-200 text-stone-600",
        )}
      >
        {children}
      </div>
    </main>
  );
}

function UpdatePasswordScreen({
  email,
  onComplete,
  onCancel,
}: {
  email?: string;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  async function submitPassword(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!supabase) {
      setError("Service momentanément indisponible.");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(getUserFacingErrorMessage(updateError, "Impossible de mettre à jour le mot de passe."));
      setSubmitting(false);
      return;
    }

    setCompleted(true);
    setSubmitting(false);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname || "/");
    }
  }

  return (
    <main className="flex h-screen h-[100svh] items-center justify-center bg-[#f7f9fb] p-4 text-stone-950">
      <form onSubmit={submitPassword} className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-5 sm:p-6">
        <div className="mb-6 flex items-center gap-3">
          <img src="/brand/mon-studio-tv-icon.png" alt="Mon Studio TV" className="h-11 w-auto" />
          <div>
            <h1 className="text-base font-semibold text-stone-950">Nouveau mot de passe</h1>
            <p className="mt-1 truncate text-base font-medium text-stone-500">{email ?? "MSTV Production OS"}</p>
          </div>
        </div>

        {completed ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-base font-semibold text-emerald-700">
            Mot de passe mis à jour.
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nouveau mot de passe"
              className={formInputClassName}
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              placeholder="Confirmer"
              className={formInputClassName}
            />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={completed ? onComplete : onCancel}
            disabled={submitting}
            className="h-11 flex-1 rounded-full border border-stone-200 bg-white text-base font-semibold text-stone-600 transition hover:bg-stone-50 disabled:text-stone-300"
          >
            {completed ? "Continuer" : "Annuler"}
          </button>
          {!completed && (
            <button type="submit" disabled={submitting} className="h-11 flex-1 rounded-full bg-[#bb2720] text-base font-semibold text-white transition hover:bg-[#a7211b] disabled:bg-stone-300">
              {submitting ? "Mise à jour..." : "Valider"}
            </button>
          )}
        </div>
      </form>
    </main>
  );
}

function LoginScreen({ error }: { error: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function submitLogin(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!supabase) {
      setLoginError("Service momentanément indisponible.");
      return;
    }

    setSubmitting(true);
    setLoginError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setLoginError(getUserFacingErrorMessage(signInError, "Impossible de se connecter."));
      setSubmitting(false);
    }
  }

  async function sendPasswordReset() {
    if (!supabase) {
      setLoginError("Service momentanément indisponible.");
      return;
    }

    const targetEmail = email.trim();
    if (!targetEmail) {
      setLoginError("Entrez votre email pour recevoir le lien de réinitialisation.");
      return;
    }

    setResetSending(true);
    setLoginError(null);
    setResetMessage(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: getPasswordResetRedirectUrl(),
    });

    if (resetError) {
      setLoginError(getUserFacingErrorMessage(resetError, "Impossible d'envoyer l'email de réinitialisation."));
    } else {
      setResetMessage("Un email de réinitialisation vous a été envoyé.");
    }

    setResetSending(false);
  }

  return (
    <main className="flex h-screen h-[100svh] items-center justify-center bg-[#f7f9fb] p-4 text-stone-950">
      <form onSubmit={submitLogin} className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-5 sm:p-6">
        <div className="mb-6 flex items-center gap-3">
          <img src="/brand/mon-studio-tv-icon.png" alt="Mon Studio TV" className="h-11 w-auto" />
          <div>
            <h1 className="text-base font-semibold text-stone-950">MSTV Production OS</h1>
            <p className="mt-1 text-base font-medium text-stone-500">Connexion</p>
          </div>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className={formInputClassName}
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mot de passe"
            className={formInputClassName}
          />
        </div>

        {(loginError || error) && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">
            {loginError ?? error}
          </div>
        )}
        {resetMessage && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-700">
            {resetMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 h-11 w-full rounded-full bg-[#bb2720] text-base font-semibold text-white transition hover:bg-[#a7211b] disabled:bg-stone-300"
        >
          {submitting ? "Connexion..." : "Se connecter"}
        </button>
        <button
          type="button"
          onClick={() => void sendPasswordReset()}
          disabled={resetSending}
          className="mt-3 w-full text-center text-sm font-semibold text-stone-500 transition hover:text-[#bb2720] disabled:text-stone-300"
        >
          {resetSending ? "Envoi..." : "Mot de passe oublié ?"}
        </button>
      </form>
    </main>
  );
}
