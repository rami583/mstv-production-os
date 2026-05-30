"use client";

import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  Import,
  KeyRound,
  ListTodo,
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
  WifiOff,
  Webcam,
  X,
  type LucideIcon,
} from "lucide-react";
import { Network } from "@capacitor/network";
import {
  useCallback,
  useEffect,
  forwardRef,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
  type TouchEvent as ReactTouchEvent,
  type TransitionEvent as ReactTransitionEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { EventEditorModal } from "@/components/events/EventEditorModal";
import { MstvDatePicker } from "@/components/ui/MstvDatePicker";
import { MstvModalPanel, MstvModalSurface, mstvModalPanelClassName } from "@/components/ui/MstvModalSurface";
import { MstvPopover } from "@/components/ui/MstvPopover";
import type { Session } from "@supabase/supabase-js";
import {
  publicHolidays,
  schoolHolidaysZoneC,
  type CalendarMarker,
} from "@/lib/calendar-markers";
import {
  getEventCalendarBadge,
  getExternalContextDetails,
  getPrimaryExternalEventLink,
  getProductionEventDisplay,
  getProductionEventDisplayLine,
} from "@/lib/events/display";
import {
  normalizeCompactTimeInput,
  normalizeEventTimeInput,
  sanitizeTimeDraft,
  toTimeInputValue,
  type EventEditorExternalCalendar,
  type EventEditorFormInput,
} from "@/lib/events/editor";
import {
  buildExternalCalendarVisibilityState,
  canViewCalendar,
  getExternalCalendarProviderKey,
  isExternalEventLinkVisible as isExternalEventLinkVisibleByCalendarState,
  isLegacyExternalCalendarEventVisible,
  isProductionEventVisible as isProductionEventVisibleByCalendarState,
  normalizeProviderCalendarKey,
  type CalendarVisibilityViewer,
} from "@/lib/events/visibility";
import { useNativeKeyboardVisibility } from "@/lib/use-native-keyboard-visibility";
import { uiMotion, uiMotionClasses } from "@/lib/ui-motion";
import { mstvLayerClassNames } from "@/lib/ui-layers";
import { mstvRadiusClassNames } from "@/lib/ui-radii";
import { cn } from "@/lib/utils";
import {
  supabase,
  type CompletionStatus,
  type Database,
  type EventStatus,
  type LinkStatus,
} from "@/lib/supabase";

type Screen = "calendar" | "detail" | "tasks";
type ItemKind = "option" | "link" | "document";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventOptionRow = Database["public"]["Tables"]["event_options"]["Row"];
type EventOptionItemRow = Database["public"]["Tables"]["event_option_items"]["Row"];
type EventLinkRow = Database["public"]["Tables"]["event_links"]["Row"];
type EventLinkEntryRow = Database["public"]["Tables"]["event_link_entries"]["Row"];
type EventDocumentRow = Database["public"]["Tables"]["event_documents"]["Row"];
type EventDocumentGroupRow = Database["public"]["Tables"]["event_document_groups"]["Row"];
type EventActivityLogRow = Database["public"]["Tables"]["event_activity_log"]["Row"];
type EventActivityReadRow = Database["public"]["Tables"]["event_activity_reads"]["Row"];
type EventActivityItemReadRow = Database["public"]["Tables"]["event_activity_item_reads"]["Row"];
type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ExternalCalendarRow = Database["public"]["Tables"]["external_calendars"]["Row"];
type ExternalCalendarEventRow = Database["public"]["Tables"]["external_calendar_events"]["Row"];
type ExternalEventLinkRow = Database["public"]["Tables"]["external_event_links"]["Row"];

type UserRole = "admin" | "team";
type ExternalCalendarVisibility = "admin_only" | "team" | "private";
type ExternalCalendarProviderType = "google" | "microsoft" | "apple_caldav" | "ics_read_only";
type ExternalCalendarSyncCapability = "read_only" | "bidirectional";
type ExternalCalendarRole = "business_primary" | "external_context";
type ProductionEventRole = "production" | "external_context";
type ExternalCalendarSyncProgress = {
  calendarId: string;
  synced: number;
  total: number;
};
type ExternalCalendarSyncResult = {
  synced: number;
  total: number;
  created?: number;
  updated?: number;
  unchanged?: number;
  conflicts?: number;
  deleted?: number;
};
type GoogleAutoSyncStatus = {
  state: "idle" | "syncing" | "error";
  lastSyncedAt: string | null;
  error: string | null;
};
type GooglePullSyncErrorPayload = {
  success?: boolean;
  stage?: string | null;
  message?: string | null;
  error?:
    | string
    | {
        message?: string | null;
        code?: string | null;
        details?: string | null;
        hint?: string | null;
      }
    | null;
};
type GooglePullSyncApiResponse = Partial<ExternalCalendarSyncResult> & GooglePullSyncErrorPayload;
type ApplePullSyncDiagnostics = {
  triggerSource?: string;
  routeStartedAt?: string;
  routeFinishedAt?: string;
  routeDurationMs?: number;
  requestedSyncWindow?: boolean;
  syncWindowStart?: string;
  syncWindowEnd?: string;
  enabledAppleCalendars?: number;
  calDavRequestStartedAt?: string | null;
  calDavRequestFinishedAt?: string | null;
  calDavDurationMs?: number;
  calDavEventsFetched?: number;
  rawResponseCount?: number;
};
type ApplePullSyncApiResponse = GooglePullSyncApiResponse & {
  skipped?: number;
  diagnostics?: ApplePullSyncDiagnostics;
};
type AppleConnectFailurePayload = {
  error?: string | null;
  message?: string | null;
  stage?: string | null;
  status?: number | null;
  details?: string | null;
};
type AppleConnectUserError = Error & {
  userMessage?: string;
};

const EXTERNAL_CALENDAR_UPSERT_BATCH_SIZE = 250;
const EXTERNAL_CALENDAR_FETCH_PAGE_SIZE = 1000;
const GOOGLE_AUTO_SYNC_INTERVAL_MS = 3 * 60 * 1000;
const GOOGLE_AUTO_SYNC_MIN_GAP_MS = 45 * 1000;
const APPLE_AUTO_SYNC_MIN_GAP_MS = 45 * 1000;
const APPLE_AUTO_SYNC_LAUNCH_DELAY_MS = 900;
const APPLE_FOREGROUND_SYNC_DEBOUNCE_MS = 2500;

function isNetworkDebugEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("debugNetwork") === "1" || window.localStorage.getItem("mstv.debugNetwork") === "1";
  } catch {
    return false;
  }
}

function getApproxJsonBytes(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return null;
  }
}

function logNetworkDebug(eventName: string, payload: Record<string, unknown>) {
  if (!isNetworkDebugEnabled()) return;
  console.info(`[MSTV network] ${eventName}`, payload);
}

type EventQueryRow = EventRow & {
  event_options: EventOptionRow[] | null;
  event_links: EventLinkRow[] | null;
  event_documents?: EventDocumentRow[] | null;
};

type ExternalCalendarEventQueryRow = ExternalCalendarEventRow & {
  external_calendars: ExternalCalendarRow | null;
};

type ExternalEventLinkQueryRow = ExternalEventLinkRow & {
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
  taskId: string | null;
  externalAssigneeName: string | null;
  taskDueDate: string | null;
  taskNotes: string | null;
  completedByProfileId: string | null;
  completedByLabel: string | null;
  completedByInitials: string | null;
  completedAt: string | null;
  createdAt: string;
  items: EventOptionItem[];
} & CreatorMetadata;

type OptionTaskAssignment =
  | { type: "profile"; profileId: string }
  | { type: "external"; name: string | null }
  | { type: "none" };

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
  createdByProfileId: string | null;
  createdAt: string;
};

type EventUnreadActivity = Pick<
  EventActivityLog,
  "id" | "eventId" | "actionType" | "entityType" | "entityId" | "newValue" | "createdBy" | "createdByProfileId" | "createdAt"
>;

type EventActivityRead = {
  eventId: string;
  profileId: string;
  readAt: string;
};

type EventActivityItemRead = EventActivityRead & {
  itemKey: string;
};

type EventUnreadSummary = {
  count: number;
  hasMetadata: boolean;
  itemKeys: Set<string>;
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

type TaskStatus = "todo" | "done";
type TaskPriority = "urgent" | "normal" | "low";

type AppTask = {
  id: string;
  title: string;
  eventId: string | null;
  assignedProfileId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  sortOrder: number | null;
  dueDate: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type TaskCreateInput = {
  title: string;
  eventId?: string | null;
  assignedProfileId?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  priority?: TaskPriority;
  sortOrder?: number | null;
};

type TaskUpdatePatch = Partial<Pick<AppTask, "title" | "eventId" | "assignedProfileId" | "dueDate" | "notes" | "status" | "priority" | "sortOrder">>;

type TaskDiagnosticProfile = {
  id: string;
  email: string | null;
  name: string | null;
  role: UserRole;
};

type TaskCreateDiagnostic = {
  currentUserId: string | null;
  currentUserRole: UserRole | null;
  assignedProfileId: string | null;
  assignedProfile: TaskDiagnosticProfile | null;
  eventId: string | null;
  taskTitle: string;
  dueDate: string | null;
  supabaseErrorCode: string | null;
  supabaseErrorMessage: string | null;
  supabaseErrorDetails: string | null;
  supabaseErrorHint: string | null;
};

type TaskCreateError = Error & {
  taskCreateDiagnostic?: TaskCreateDiagnostic;
  userMessage?: string;
};

type OptionAssignmentDiagnostic = {
  optionId: string;
  assigneeType: OptionTaskAssignment["type"];
  assignedProfileId: string | null;
  externalAssigneeName: string | null;
  linkedTaskId: string | null;
  stage: string;
  supabaseErrorCode: string | null;
  supabaseErrorMessage: string | null;
  supabaseErrorDetails: string | null;
  supabaseErrorHint: string | null;
};

type ExternalCalendar = {
  id: string;
  name: string;
  icsUrl: string;
  color: string | null;
  visibility: ExternalCalendarVisibility;
  providerType: ExternalCalendarProviderType;
  providerAccountId: string | null;
  providerCalendarId: string | null;
  syncCapability: ExternalCalendarSyncCapability;
  syncEnabled: boolean;
  calendarRole: ExternalCalendarRole;
  sortOrder: number | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncFinishedAt: string | null;
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
  calendarSyncEnabled: boolean;
  calendarProviderType: ExternalCalendarProviderType | null;
  calendarCreatedByProfileId: string | null;
};

type ExternalEventLink = {
  id: string;
  eventId: string;
  externalCalendarId: string;
  providerType: ExternalCalendarProviderType;
  providerCalendarId: string;
  externalEventId: string;
  externalEventUid: string | null;
  syncStatus: string;
  lastSyncedAt: string | null;
  lastExternalUpdatedAt: string | null;
  conflictDetectedAt: string | null;
  conflictReason: string | null;
  lastSyncError: string | null;
  deletedLocallyAt: string | null;
  deletedExternallyAt: string | null;
  calendarName: string;
  calendarColor: string | null;
  calendarProviderAccountId: string | null;
  calendarProviderType: ExternalCalendarProviderType;
  calendarSyncCapability: ExternalCalendarSyncCapability;
  calendarSyncEnabled: boolean;
  calendarVisibility: ExternalCalendarVisibility;
  calendarCreatedByProfileId: string | null;
  calendarRole: ExternalCalendarRole;
  rawExternalEvent: Record<string, unknown> | null;
};

function areExternalCalendarsEqual(left: ExternalCalendar, right: ExternalCalendar) {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.icsUrl === right.icsUrl &&
    left.color === right.color &&
    left.visibility === right.visibility &&
    left.providerType === right.providerType &&
    left.providerAccountId === right.providerAccountId &&
    left.providerCalendarId === right.providerCalendarId &&
    left.syncCapability === right.syncCapability &&
    left.syncEnabled === right.syncEnabled &&
    left.calendarRole === right.calendarRole &&
    left.sortOrder === right.sortOrder &&
    left.lastSyncStatus === right.lastSyncStatus &&
    left.lastSyncError === right.lastSyncError &&
    left.lastSyncFinishedAt === right.lastSyncFinishedAt &&
    left.createdByProfileId === right.createdByProfileId &&
    left.createdByName === right.createdByName &&
    left.createdAt === right.createdAt
  );
}

function mergeExternalCalendarList(current: ExternalCalendar[], next: ExternalCalendar[]) {
  const currentById = new Map(current.map((calendar) => [calendar.id, calendar]));
  let changed = current.length !== next.length;
  const merged = next.map((nextCalendar) => {
    const existingCalendar = currentById.get(nextCalendar.id);
    if (existingCalendar && areExternalCalendarsEqual(existingCalendar, nextCalendar)) {
      return existingCalendar;
    }
    changed = true;
    return nextCalendar;
  });

  if (!changed && merged.every((calendar, index) => calendar === current[index])) {
    return current;
  }

  return merged;
}

function getExternalCalendarGroupKey(calendar: ExternalCalendar) {
  return `${calendar.providerType}:${calendar.providerAccountId ?? "local"}`;
}

function compareExternalCalendarDisplayOrder(left: ExternalCalendar, right: ExternalCalendar) {
  const leftSortOrder = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const rightSortOrder = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftSortOrder !== rightSortOrder) return leftSortOrder - rightSortOrder;

  const leftCreatedAt = Date.parse(left.createdAt) || 0;
  const rightCreatedAt = Date.parse(right.createdAt) || 0;
  if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt;

  return left.name.localeCompare(right.name, "fr", { sensitivity: "base" });
}

function isCreatableExternalCalendar(calendar: ExternalCalendar) {
  return (
    (calendar.providerType === "google" || calendar.providerType === "apple_caldav") &&
    calendar.syncCapability === "bidirectional" &&
    calendar.syncEnabled &&
    Boolean(calendar.providerAccountId) &&
    Boolean(calendar.providerCalendarId)
  );
}

function sortExternalCalendarsForDisplay<T extends { storedCalendar: ExternalCalendar | null; calendar: { name?: string; summary?: string } }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    if (left.storedCalendar && right.storedCalendar) {
      return compareExternalCalendarDisplayOrder(left.storedCalendar, right.storedCalendar);
    }
    if (left.storedCalendar) return -1;
    if (right.storedCalendar) return 1;
    const leftName = left.calendar.name ?? left.calendar.summary ?? "";
    const rightName = right.calendar.name ?? right.calendar.summary ?? "";
    return leftName.localeCompare(rightName, "fr", { sensitivity: "base" });
  });
}

type GoogleCalendarAccount = {
  id: string;
  email: string | null;
  displayName: string | null;
  connectionStatus: string;
  syncCapability: ExternalCalendarSyncCapability;
  lastSyncAt: string | null;
  lastError: string | null;
};

type AppleCalendarAccount = GoogleCalendarAccount;

type GoogleProviderCalendar = {
  providerCalendarId: string;
  summary: string;
  primary: boolean;
  accessRole: string | null;
  writable: boolean;
  enabled: boolean;
  externalCalendarId: string | null;
  color: string | null;
  visibility: ExternalCalendarVisibility;
  calendarRole: ExternalCalendarRole;
};

type AppleProviderCalendar = {
  providerCalendarId: string;
  name: string;
  color: string | null;
  enabled: boolean;
  externalCalendarId: string | null;
  visibility: ExternalCalendarVisibility;
  calendarRole: ExternalCalendarRole;
};

type ProductionEvent = {
  id: string;
  clientName: string;
  eventName: string;
  date: string;
  isAllDay: boolean;
  clientArrivalTime: string | null;
  startTime: string | null;
  endTime: string | null;
  endOfDayTime: string | null;
  location: string | null;
  notes: string | null;
  status: EventStatus;
  deletedAt: string | null;
  deletedBy: string | null;
  quoteReference: string | null;
  quoteVersion: string | null;
  sourceQuoteText: string | null;
  lastQuoteImportedAt: string | null;
  importedFrom: string | null;
  externalImportId: string | null;
  eventRole: ProductionEventRole;
  createdAt: string;
  updatedAt: string;
  createdByProfileId: string | null;
  createdByRole: UserRole | null;
  createdByName: string | null;
  options: EventOption[];
  links: EventLink[];
  documentGroups: EventDocumentGroup[];
  externalLinks: ExternalEventLink[];
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

type CreateEventInput = EventEditorFormInput;

type QuoteExtractionResult = {
  clientName: string;
  eventName: string;
  date: string;
  isAllDay: boolean;
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
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string | null;
  description: string | null;
  skipped: boolean;
  skipReason: string | null;
};

type NativeMstvIcsImportFailure = {
  externalImportId: string;
  sourceTitle: string;
  reason: string;
};

type NativeMstvIcsImportProgress = {
  processed: number;
  total: number;
};

type NativeMstvIcsImportResult = {
  importedCount: number;
  skippedCount: number;
  duplicateCount: number;
  failedCount: number;
  remainingCount: number;
  failures: NativeMstvIcsImportFailure[];
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
  cacheVersion?: number;
  viewerProfileId?: string | null;
  viewerRole?: string | null;
  events: ProductionEvent[];
  tasks?: AppTask[];
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

type LocalCacheWriteMeta = {
  lastWarningAt: number;
  suppressedCount: number;
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
  "event_activity_reads",
  "event_activity_item_reads",
  "tasks",
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
    swatchClassName: "bg-[#8e8e8e]",
    selectedClassName: "ring-[#8e8e8e]/35",
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
const EVENT_SWIPE_THRESHOLD_RATIO = 0.18;
const EVENT_SWIPE_THRESHOLD_MIN = 58;
const EVENT_SWIPE_THRESHOLD_MAX = 124;
const EVENT_SWIPE_AXIS_ACTIVATION_PX = 8;
const EVENT_SWIPE_HORIZONTAL_DOMINANCE = 1.5;
const EVENT_SWIPE_AXIS_DOMINANCE = 1.2;
const EVENT_SWIPE_VELOCITY_THRESHOLD_PX_PER_MS = 0.65;
const EVENT_SWIPE_VELOCITY_MIN_DISTANCE_PX = 34;
const EVENT_DETAIL_CAROUSEL_TRANSITION_MS = uiMotion.duration.medium;
const EVENT_DETAIL_CAROUSEL_EASING = uiMotion.easing.standard;
const EVENT_DETAIL_CAROUSEL_GAP_PX = 16;
const EVENT_DETAIL_ACTIVE_EDIT_SELECTOR = "input, textarea, select, [contenteditable='true']";
const EVENT_DETAIL_SWIPE_BLOCK_SELECTOR = "button, a, [data-no-event-swipe]";
const TASK_DETAIL_SWIPE_THRESHOLD_PX = 60;
const TASK_DETAIL_SWIPE_VELOCITY_THRESHOLD_PX_PER_MS = 0.65;
const TASK_DETAIL_SWIPE_VELOCITY_MIN_DISTANCE_PX = 34;
const TASK_DETAIL_SWIPE_HORIZONTAL_DOMINANCE = 1.5;
const TASK_DETAIL_SWIPE_AXIS_DOMINANCE = 1.2;
const TASK_DETAIL_SWIPE_PANEL_GAP_PX = 16;
const TASK_DETAIL_ACTIVE_EDIT_SELECTOR = "input, textarea, select, [contenteditable='true']";
const TASK_DETAIL_SWIPE_BLOCK_SELECTOR = "[data-task-swipe-block]";
const TASK_ROW_SWIPE_ACTION_WIDTH = 112;
const TASK_ROW_FULL_SWIPE_RATIO = 0.65;

function getSwipePageStep(viewportWidth: number) {
  return viewportWidth + PAGE_GAP;
}

function getTaskDetailSwipePageStep(viewportWidth: number) {
  return viewportWidth + TASK_DETAIL_SWIPE_PANEL_GAP_PX;
}

function getEventDetailSwipePageStep(viewportWidth: number) {
  return viewportWidth + EVENT_DETAIL_CAROUSEL_GAP_PX;
}

function getSwipeThreshold(viewportWidth: number) {
  return Math.min(PAGE_SWIPE_THRESHOLD_MAX, Math.max(PAGE_SWIPE_THRESHOLD_MIN, viewportWidth * PAGE_SWIPE_THRESHOLD_RATIO));
}

function getEventSwipeThreshold(viewportWidth: number) {
  return Math.min(EVENT_SWIPE_THRESHOLD_MAX, Math.max(EVENT_SWIPE_THRESHOLD_MIN, viewportWidth * EVENT_SWIPE_THRESHOLD_RATIO));
}

function shouldShowEventDetailDesktopControls() {
  if (typeof window === "undefined") return false;
  const isCoarseOrTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const isSmallScreen = window.matchMedia("(max-width: 639px)").matches;
  return !(isCoarseOrTouch && isSmallScreen);
}

const iosKeyboardGuardProps = { "data-ios-keyboard-guard": "true" } as const;

function createLocalId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function isNetworkOrUnavailableError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|network|load failed|fetch failed|internet|offline|timeout|unavailable/i.test(message);
}

function getRawErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      name?: unknown;
    };
    return [record.message, record.code, record.details, record.hint, record.name]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" · ") || String(error);
  }
  return String(error ?? "");
}

const sessionExpiredMessage = "Votre session a expiré. Veuillez vous reconnecter.";

function isInvalidRefreshTokenError(error: unknown) {
  const normalizedMessage = getRawErrorMessage(error).toLocaleLowerCase("fr-FR");
  return /invalid refresh token|refresh token not found|refresh token.*not found|refresh token.*revoked|invalid grant.*refresh/.test(normalizedMessage);
}

function isSessionExpiredError(error: unknown) {
  const normalizedMessage = getRawErrorMessage(error).toLocaleLowerCase("fr-FR");
  return isInvalidRefreshTokenError(error) || /votre session a expiré|session expirée|session expiree/.test(normalizedMessage);
}

function isAppAuthSessionError(error: unknown) {
  const normalizedMessage = getRawErrorMessage(error).toLocaleLowerCase("fr-FR");
  if (isSessionExpiredError(error)) return true;
  return /auth session missing|no current user|user.*not authenticated|jwt expired|invalid jwt|supabase auth/.test(normalizedMessage);
}

function getEventEditorDiagnostic(error: unknown): EventEditorDiagnostic | null {
  if (!error || typeof error !== "object") return null;
  return (error as Error & { eventEditorDiagnostic?: EventEditorDiagnostic }).eventEditorDiagnostic ?? null;
}

function isExternalCalendarSyncError(error: unknown) {
  const diagnostic = getEventEditorDiagnostic(error);
  const normalizedMessage = getRawErrorMessage(error).toLocaleLowerCase("fr-FR");
  const diagnosticSource = [diagnostic?.stage, diagnostic?.routeCalled, diagnostic?.selectedProvider]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase("fr-FR");

  return /apple|google|calendar|calendrier|caldav|oauth|provider|autorisation/.test(`${normalizedMessage} ${diagnosticSource}`);
}

function getExternalCalendarSyncUserMessage(error: unknown, fallback = "L’événement MSTV a été enregistré, mais la synchronisation du calendrier lié a échoué.") {
  const diagnostic = getEventEditorDiagnostic(error);
  const normalizedMessage = getRawErrorMessage(error).toLocaleLowerCase("fr-FR");

  console.warn("[MSTV event sync] secondary external calendar sync failed after local save", {
    stage: diagnostic?.stage ?? null,
    routeCalled: diagnostic?.routeCalled ?? null,
    responseStatus: diagnostic?.responseStatus ?? null,
    responseJson: diagnostic?.responseJson ?? null,
    selectedCalendarId: diagnostic?.selectedCalendarId ?? null,
    selectedProvider: diagnostic?.selectedProvider ?? null,
    error: getDebugError(error),
  });

  if (/apple/.test(normalizedMessage) || diagnostic?.selectedProvider === "apple_caldav") {
    return "L’événement a été modifié dans MSTV, mais la mise à jour Apple Calendar a échoué.";
  }
  if (/google/.test(normalizedMessage) || diagnostic?.selectedProvider === "google") {
    return "L’événement a été modifié dans MSTV, mais la mise à jour Google Calendar a échoué.";
  }
  return fallback;
}

function getProfileLoadUserMessage(error: unknown) {
  const normalizedMessage = getRawErrorMessage(error).toLocaleLowerCase("fr-FR");

  if (isSessionExpiredError(error)) return sessionExpiredMessage;
  if (isNetworkOrUnavailableError(error)) return "Hors ligne. Connectez-vous une première fois avec du réseau pour préparer l'accès hors ligne.";
  if (/profil utilisateur introuvable|profile not found|no profile/.test(normalizedMessage)) {
    return "Profil utilisateur introuvable. Contactez un administrateur.";
  }
  if (/row-level security|rls|permission denied|not authorized|unauthorized|forbidden|policy/.test(normalizedMessage)) {
    return "Impossible de charger votre profil. Contactez un administrateur.";
  }
  return "Impossible de charger le profil utilisateur.";
}

function getUserFacingErrorMessage(error: unknown, fallback = "Une erreur est survenue.") {
  const rawMessage = getRawErrorMessage(error).trim();
  const normalizedMessage = rawMessage.toLocaleLowerCase("fr-FR");
  const externalCalendarSyncError = isExternalCalendarSyncError(error);

  if (!rawMessage) return fallback;
  if (isInvalidRefreshTokenError(error) && !externalCalendarSyncError) return sessionExpiredMessage;
  if (isNetworkOrUnavailableError(error)) return "Connexion réseau indisponible.";
  if (!externalCalendarSyncError && /invalid login credentials|invalid credentials|email not confirmed|invalid grant/.test(normalizedMessage)) {
    return "Email ou mot de passe incorrect.";
  }
  if (/password should be at least|weak password|password.*characters/.test(normalizedMessage)) {
    return "Le mot de passe doit contenir au moins 6 caractères.";
  }
  if (/rate limit|too many requests|over request rate limit/.test(normalizedMessage)) {
    return "Trop de tentatives. Réessayez dans quelques instants.";
  }
  if (isAppAuthSessionError(error) && !externalCalendarSyncError) {
    return sessionExpiredMessage;
  }
  if (isAppAuthSessionError(error) && externalCalendarSyncError) return fallback;
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

function getGooglePullSyncErrorDetails(payload: GooglePullSyncErrorPayload | null) {
  const errorObject = payload && typeof payload.error === "object" && payload.error !== null ? payload.error : null;

  return {
    stage: payload?.stage ?? null,
    message: errorObject?.message ?? (typeof payload?.error === "string" ? payload.error : null),
    code: errorObject?.code ?? null,
    details: errorObject?.details ?? null,
    hint: errorObject?.hint ?? null,
  };
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

function getSerializedPayloadSize(value: string) {
  if (typeof Blob !== "undefined") {
    return new Blob([value]).size;
  }
  return value.length;
}

function getLocalCacheErrorSignature(error: unknown) {
  if (error && typeof error === "object") {
    const record = error as { name?: unknown; message?: unknown };
    return `${typeof record.name === "string" ? record.name : "Error"}:${typeof record.message === "string" ? record.message : getRawErrorMessage(error)}`;
  }
  return getRawErrorMessage(error);
}

function warnLocalCacheWriteFailed(key: string, error: unknown, payloadSizeBytes: number) {
  const signature = `${key}:${getLocalCacheErrorSignature(error)}`;
  const now = Date.now();
  const previous = localCacheWriteWarnings.get(signature);

  if (previous && now - previous.lastWarningAt < localCacheWarningThrottleMs) {
    localCacheWriteWarnings.set(signature, {
      ...previous,
      suppressedCount: previous.suppressedCount + 1,
    });
    return;
  }

  const errorRecord = error && typeof error === "object" ? (error as { name?: unknown; message?: unknown }) : null;
  console.warn("Failed to write local cache.", {
    key,
    payloadSizeBytes,
    payloadSizeKb: Math.round(payloadSizeBytes / 1024),
    errorName: typeof errorRecord?.name === "string" ? errorRecord.name : error instanceof Error ? error.name : typeof error,
    errorMessage: typeof errorRecord?.message === "string" ? errorRecord.message : getRawErrorMessage(error),
    suppressedCount: previous?.suppressedCount ?? 0,
  });

  localCacheWriteWarnings.set(signature, {
    lastWarningAt: now,
    suppressedCount: 0,
  });
}

function setLocalStorageJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  let serializedValue = "";
  try {
    serializedValue = JSON.stringify(value);
    window.localStorage.setItem(key, serializedValue);
  } catch (error) {
    warnLocalCacheWriteFailed(key, error, getSerializedPayloadSize(serializedValue));
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

function clearSupabaseAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && /^sb-.*-auth-token$/.test(key)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn("Failed to clear Supabase auth cache.", getDebugError(error));
  }
}

function clearCachedAuthState(userId?: string | null) {
  const cachedUserId = userId ?? getCachedAuthSession()?.user.id ?? null;
  if (cachedUserId) {
    removeLocalStorageKey(`${cachedProfileKeyPrefix}${cachedUserId}`);
    removeLocalStorageKey(`${cachedProfileMetaKeyPrefix}${cachedUserId}`);
    removeLocalStorageKey(`${cachedAppDataKeyPrefix}${cachedUserId}`);
    removeLocalStorageKey(`${cachedNotificationsKeyPrefix}${cachedUserId}`);
  }
  removeLocalStorageKey(cachedAuthSessionKey);
  clearSupabaseAuthStorage();
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

function sanitizeEventForCache(event: ProductionEvent): ProductionEvent {
  return {
    ...event,
    sourceQuoteText: null,
    notes: event.notes && event.notes.length > 800 ? `${event.notes.slice(0, 800)}...` : event.notes,
    options: event.options.slice(0, maxCachedOptionsPerEvent).map((option) => ({
      ...option,
      details: null,
      items: [],
    })),
    links: event.links.slice(0, maxCachedLinksPerEvent).map((link) => ({
      ...link,
      entries: [],
    })),
    documentGroups: [],
  };
}

function sanitizeExternalCalendarEventForCache(event: ExternalCalendarEvent): ExternalCalendarEvent {
  return {
    ...event,
    description: event.description && event.description.length > 800 ? `${event.description.slice(0, 800)}...` : event.description,
    rawEvent: null,
  };
}

function getCalendarVisibilityViewer(profile: UserProfile | null, fallbackId?: string | null): CalendarVisibilityViewer {
  return {
    id: profile?.id ?? fallbackId ?? null,
    role: profile?.role ?? null,
  };
}

function getVisibleProductionEventsForSelection(events: ProductionEvent[], externalCalendars: ExternalCalendar[], viewer: CalendarVisibilityViewer) {
  const visibilityState = buildExternalCalendarVisibilityState(externalCalendars, viewer);
  return events
    .filter((event) => isProductionEventVisibleByCalendarState(event, visibilityState, { nativeMstvIcsImportSource }))
    .sort((a, b) => eventSortValue(a) - eventSortValue(b));
}

function resolveSelectedEventIdForVisibleEvents(input: {
  currentSelectedId: string | null;
  requestedSelectedId?: string | null;
  events: ProductionEvent[];
  externalCalendars: ExternalCalendar[];
  viewer: CalendarVisibilityViewer;
}) {
  if (input.requestedSelectedId === null) return null;

  const visibleEvents = getVisibleProductionEventsForSelection(input.events, input.externalCalendars, input.viewer);

  if (input.requestedSelectedId !== undefined) {
    if (visibleEvents.some((event) => event.id === input.requestedSelectedId)) return input.requestedSelectedId;
    return visibleEvents[0]?.id ?? null;
  }

  if (input.currentSelectedId && visibleEvents.some((event) => event.id === input.currentSelectedId)) {
    return input.currentSelectedId;
  }

  return visibleEvents[0]?.id ?? null;
}

function getProductionEventNetworkCounts(events: ProductionEvent[]) {
  return {
    events: events.length,
    options: events.reduce((total, event) => total + event.options.length, 0),
    optionItems: events.reduce((total, event) => total + event.options.reduce((optionTotal, option) => optionTotal + option.items.length, 0), 0),
    links: events.reduce((total, event) => total + event.links.length, 0),
    linkEntries: events.reduce((total, event) => total + event.links.reduce((linkTotal, link) => linkTotal + link.entries.length, 0), 0),
    documentGroups: events.reduce((total, event) => total + event.documentGroups.length, 0),
    documents: events.reduce(
      (total, event) => total + event.documentGroups.reduce((groupTotal, group) => groupTotal + group.files.length, 0),
      0,
    ),
    externalLinks: events.reduce((total, event) => total + event.externalLinks.length, 0),
  };
}

function prepareCachedAppData(data: Omit<CachedAppData, "cachedAt">, viewer: CalendarVisibilityViewer): Omit<CachedAppData, "cachedAt"> {
  const visibilityState = buildExternalCalendarVisibilityState(data.externalCalendars, viewer);
  const sortedProductionEvents = data.events
    .filter((event) => isProductionEventVisibleByCalendarState(event, visibilityState, { nativeMstvIcsImportSource }))
    .sort((a, b) => eventSortValue(a) - eventSortValue(b));
  const recentProductionEvents = sortedProductionEvents.slice(-maxCachedProductionEvents);
  const sortedExternalEvents = data.externalCalendarEvents
    .filter((event) => isLegacyExternalCalendarEventVisible(event, visibilityState))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const recentExternalEvents = sortedExternalEvents.slice(-maxCachedExternalCalendarEvents);

  return {
    cacheVersion: cachedAppDataVersion,
    viewerProfileId: viewer.id ?? null,
    viewerRole: viewer.role ?? null,
    events: recentProductionEvents.map(sanitizeEventForCache),
    tasks: (data.tasks ?? []).slice(0, 400),
    externalCalendars: data.externalCalendars,
    externalCalendarEvents: recentExternalEvents.map(sanitizeExternalCalendarEventForCache),
  };
}

function cacheAppData(userId: string, data: Omit<CachedAppData, "cachedAt">, profile: UserProfile | null = getCachedUserProfile(userId)) {
  const cachePayload = prepareCachedAppData(data, getCalendarVisibilityViewer(profile, userId));
  setLocalStorageJson(`${cachedAppDataKeyPrefix}${userId}`, {
    ...cachePayload,
    cachedAt: new Date().toISOString(),
  } satisfies CachedAppData);
}

function getCachedAppData(userId: string) {
  const key = `${cachedAppDataKeyPrefix}${userId}`;
  const cachedData = getLocalStorageJson<CachedAppData>(key);
  if (!cachedData) return null;

  if (cachedData.cacheVersion !== cachedAppDataVersion) {
    removeLocalStorageKey(key);
    return null;
  }

  const cachedProfile = getCachedUserProfile(userId);
  if (cachedData.viewerRole && cachedProfile?.role && cachedData.viewerRole !== cachedProfile.role) {
    removeLocalStorageKey(key);
    return null;
  }

  return {
    ...prepareCachedAppData(cachedData, getCalendarVisibilityViewer(cachedProfile, userId)),
    cachedAt: cachedData.cachedAt,
  } satisfies CachedAppData;
}

function cacheNotifications(userId: string, notifications: AppNotification[]) {
  setLocalStorageJson(`${cachedNotificationsKeyPrefix}${userId}`, notifications.slice(0, 80));
}

function getCachedNotifications(userId: string) {
  return getLocalStorageJson<AppNotification[]>(`${cachedNotificationsKeyPrefix}${userId}`) ?? [];
}

const statusStyles: Record<EventStatus, string> = {
  Brouillon: "bg-neutral-100 text-neutral-600",
  "En préparation": "bg-amber-100 text-amber-800",
  "En attente client": "bg-sky-100 text-sky-800",
  Prêt: "bg-emerald-100 text-emerald-800",
  "En direct": "bg-rose-100 text-rose-800",
  Terminé: "bg-neutral-200 text-neutral-700",
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
  { keywords: ["plateforme", "plate-forme", "plate forme", "platform", "livemaker", "evenement"], icon: MonitorPlay },
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

const platformLinkLabels = new Set(["plateforme", "plateformedediffusion", "evenementplateforme", "eventplateforme"]);
const eventDocumentsBucket = "event-documents";
const nativeMstvIcsImportSource = "apple_ics_mstv";
const pendingSyncDbName = "mstv-production-os-sync";
const pendingSyncStoreName = "pending_actions";
const relatedDataFetchBatchSize = 200;
const nativeMstvIcsImportBatchSize = 100;
const supabaseFetchPageSize = 1000;
const noCreatableCalendarMessage = "Aucun calendrier synchronisé actif n’est disponible pour créer cet événement.";
const legacyLocalCalendarImportDisabledMessage = "L’import vers le calendrier local MSTV n’est plus disponible. Choisissez un calendrier Apple ou Google synchronisé.";
const maxUrgentTasksPerPerson = 3;
const maxUrgentTasksMessage = "Impossible de marquer plus de 3 tâches urgentes pour cette personne.";
const cachedAuthSessionKey = "mstv.cachedAuthSession";
const cachedProfileKeyPrefix = "mstv.cachedProfile.";
const cachedProfileMetaKeyPrefix = "mstv.cachedProfileMeta.";
const cachedAppDataKeyPrefix = "mstv.cachedAppData.";
const cachedNotificationsKeyPrefix = "mstv.cachedNotifications.";
const cachedAppDataVersion = 4;
const importantNotificationTypes = new Set([
  "event_created",
  "event_date_changed",
  "event_time_changed",
  "event_deleted",
  "google_calendar_sync_success",
  "google_calendar_sync_failed",
]);
const modalBackdropClassName = cn("fixed inset-0 flex bg-black/35", mstvLayerClassNames.modal);
const notificationLayerClassName = cn("fixed inset-0 flex bg-black/35", mstvLayerClassNames.notification);
const modalSheetPositionClassName = "items-end p-3 sm:items-center sm:justify-center sm:p-6";
const modalPanelClassName = mstvModalPanelClassName;
const uiTextPrimaryClassName = "text-neutral-950";
const uiTextMutedClassName = "text-neutral-500";
const uiErrorMessageClassName = "rounded-2xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700";
const uiNeutralButtonClassName = cn(mstvRadiusClassNames.control, "bg-neutral-50 px-4 py-2 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:text-neutral-300");
const uiDestructiveButtonClassName = cn(mstvRadiusClassNames.control, "bg-[#bb2720] px-4 py-2 text-base font-semibold text-white transition hover:bg-[#a0201b] disabled:bg-neutral-300");
const calendarArrowClassName =
  "flex h-9 w-9 items-center justify-center rounded-full text-base text-[#bb2720] transition hover:bg-[#bb2720]/[0.08] disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent";
const weekendColumnTintStyle: React.CSSProperties = {
  backgroundColor: "var(--app-weekend-background)",
};
const localCacheWarningThrottleMs = 60_000;
const maxCachedProductionEvents = 600;
const maxCachedExternalCalendarEvents = 1200;
const maxCachedOptionsPerEvent = 24;
const maxCachedLinksPerEvent = 24;
const localCacheWriteWarnings = new Map<string, LocalCacheWriteMeta>();

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

function useEscapeToClose(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onClose]);
}

function handleModalBackdropPointerDown(pointerEvent: ReactPointerEvent<HTMLDivElement>, onClose: () => void) {
  if (pointerEvent.target === pointerEvent.currentTarget) {
    onClose();
  }
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getMonthSyncWindow(monthDate: Date) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 2, 1);
  return { start, end };
}

function getProductionEventSignature(events: ProductionEvent[]) {
  return events
    .map((event) => `${event.id}:${event.updatedAt ?? ""}:${event.deletedAt ?? ""}`)
    .sort()
    .join("|");
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
      title: "text-neutral-950",
      meta: "text-neutral-600",
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
      title: "text-neutral-950",
      meta: "text-neutral-600",
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

  if (normalizedColor.includes("grey") || normalizedColor.includes("gray") || normalizedColor.includes("gris") || normalizedColor.includes("stone") || normalizedColor.includes("neutral")) {
    return {
      dot: "bg-neutral-400/85",
      bg: "bg-neutral-100/80",
      stripe: "bg-neutral-400",
      title: "text-neutral-950",
      meta: "text-neutral-600",
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
  if (event.allDay) return "Jour entier";

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
      iso: `${year}-${month}-${day}T12:00:00.000Z`,
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
        allDay: event.allDay,
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

function formatEventTimeRange(event: Pick<ProductionEvent, "isAllDay" | "clientArrivalTime" | "startTime" | "endTime" | "endOfDayTime">) {
  if (event.isAllDay) return "Jour entier";
  return formatTimeRange(event.clientArrivalTime || event.startTime, event.endOfDayTime || event.endTime);
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
    clientArrivalTime: "Début",
    startTime: "Début live/tournage",
    endTime: "Fin live/tournage",
    endOfDayTime: "Fin",
  };

  return labels[field];
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
  const match = value.match(/\b(?:de\s+)?(\d{1,2})\s*(?:(?:h|H)\s*(\d{2})?|:\s*(\d{2}))\s*(?:-|–|—|à|a|jusqu(?:'|’)?a)\s*(\d{1,2})\s*(?:(?:h|H)\s*(\d{2})?|:\s*(\d{2}))\b/i);
  if (!match) return { startTime: "", endTime: "" };

  return {
    startTime: parseFrenchTimeMatch(match[1], match[2] ?? match[3]),
    endTime: parseFrenchTimeMatch(match[4], match[5] ?? match[6]),
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
    isAllDay: false,
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

type EventEditorDiagnostic = {
  stage?: string | null;
  routeCalled?: string | null;
  responseStatus?: number | null;
  responseJson?: unknown;
  error?: unknown;
  selectedCalendarId?: string | null;
  selectedProvider?: string | null;
};

function createEventEditorDiagnosticError(error: unknown, diagnostic: EventEditorDiagnostic) {
  const rawMessage =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message.trim()
        : typeof error === "string" && error.trim()
          ? error.trim()
          : "Erreur inconnue.";
  const wrappedError = new Error(rawMessage);
  (wrappedError as Error & { eventEditorDiagnostic?: EventEditorDiagnostic }).eventEditorDiagnostic = {
    ...diagnostic,
    error: diagnostic.error ?? getDebugError(error),
  };
  return wrappedError;
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
  const primaryTime = event.clientArrivalTime || event.startTime;
  return new Date(`${event.date}T${toTimeInputValue(primaryTime) || "00:00"}:00`).getTime();
}

function normalizeLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCompactLabel(label: string) {
  return normalizeLabel(label).replace(/[^a-z0-9]+/g, "");
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

  addDifference("Nom du client", existingEvent.clientName, input.clientName);
  addDifference("Date", formatFullDate(existingEvent.date), formatFullDate(input.date));
  addDifference("Début", toTimeInputValue(existingEvent.clientArrivalTime), input.clientArrivalTime);
  addDifference("Fin", toTimeInputValue(existingEvent.endOfDayTime), input.endOfDayTime);

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

  if (isPlatform) {
    const primaryDraft = nonEmptyDrafts[0] ?? emptyDraft;
    return [
      {
        ...primaryDraft,
        url: primaryDraft.url ?? "",
        streamKey: primaryDraft.streamKey ?? "",
      },
    ];
  }

  if (nonEmptyDrafts.length > 0) {
    return nonEmptyDrafts;
  }

  return [
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

function mapTask(row: TaskRow): AppTask {
  return {
    id: row.id,
    title: row.title,
    eventId: row.event_id ?? null,
    assignedProfileId: row.assigned_profile_id ?? null,
    status: row.status,
    priority: row.priority ?? "normal",
    sortOrder: row.sort_order ?? null,
    dueDate: row.due_date ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? null,
  };
}

function getProfileDisplayName(profile: UserProfile | null) {
  if (!profile) return null;
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  return fullName || "Utilisateur";
}

function getProfileOptionLabel(profile: UserProfile) {
  return getProfileDisplayName(profile) ?? profile.email ?? "Utilisateur";
}

function getProfileFirstNameLabel(profile: UserProfile) {
  return profile.firstName?.trim() || getProfileDisplayName(profile)?.split(/\s+/)[0] || profile.email?.split("@")[0] || "Utilisateur";
}

function getTaskDiagnosticProfile(profile: UserProfile | null): TaskDiagnosticProfile | null {
  if (!profile) return null;
  return {
    id: profile.id,
    email: profile.email,
    name: getProfileDisplayName(profile),
    role: profile.role,
  };
}

function getSupabaseErrorField(error: unknown, field: "code" | "message" | "details" | "hint") {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value : null;
}

function getPreciseTaskCreateMessage(error: unknown) {
  const code = getSupabaseErrorField(error, "code");
  const message = getSupabaseErrorField(error, "message") ?? getRawErrorMessage(error);
  const details = getSupabaseErrorField(error, "details");
  const hint = getSupabaseErrorField(error, "hint");
  const combined = [message, details, hint].filter(Boolean).join(" ").toLocaleLowerCase("fr-FR");

  if (code === "23503" && combined.includes("assigned_profile_id")) {
    return "le profil assigné n'existe pas dans MSTV.";
  }
  if (code === "23503" && combined.includes("created_by")) {
    return "votre profil MSTV n'est pas lié correctement à votre session.";
  }
  if (code === "23502" && combined.includes("event_id")) {
    return "la base de données n'autorise pas encore les tâches sans événement lié.";
  }
  if (code === "42501" || /row-level security|rls|policy|permission denied|not authorized|unauthorized|forbidden/.test(combined)) {
    return "droits Supabase insuffisants pour créer cette tâche.";
  }
  if (code === "23514" && /tasks_status_check|status/.test(combined)) {
    return "statut de tâche invalide.";
  }
  if (code === "23514" && /tasks_priority_check|priority/.test(combined)) {
    return "priorité de tâche invalide.";
  }
  if (code === "23514" || /tasks_title_not_blank|check constraint/.test(combined)) {
    return "données de tâche invalides.";
  }
  if (code === "42703" || /column .* does not exist|schema cache|pgrst204/.test(combined)) {
    return "la structure Supabase des tâches n'est pas à jour.";
  }
  return getUserFacingErrorMessage(error, "erreur Supabase inconnue.");
}

function createTaskInsertError(error: unknown, diagnostic: TaskCreateDiagnostic): TaskCreateError {
  const preciseMessage = getPreciseTaskCreateMessage(error);
  const wrappedError = new Error(`Impossible d'ajouter la tâche : ${preciseMessage}`) as TaskCreateError;
  wrappedError.userMessage = wrappedError.message;
  wrappedError.taskCreateDiagnostic = diagnostic;
  return wrappedError;
}

function getTaskCreateUserMessage(error: unknown) {
  if (error && typeof error === "object" && "userMessage" in error) {
    const message = (error as TaskCreateError).userMessage;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `Impossible d'ajouter la tâche : ${getPreciseTaskCreateMessage(error)}`;
}

function getTaskCreateDiagnostic(error: unknown) {
  if (!error || typeof error !== "object") return null;
  return (error as TaskCreateError).taskCreateDiagnostic ?? null;
}

function getPreciseOptionAssignmentMessage(error: unknown) {
  const code = getSupabaseErrorField(error, "code");
  const message = getSupabaseErrorField(error, "message") ?? getRawErrorMessage(error);
  const details = getSupabaseErrorField(error, "details");
  const hint = getSupabaseErrorField(error, "hint");
  const combined = [message, details, hint].filter(Boolean).join(" ").toLocaleLowerCase("fr-FR");

  if (code === "42703" || /external_assignee_name|task_due_date|task_notes|column .* does not exist|schema cache|pgrst204/.test(combined)) {
    return "la structure Supabase des options n'est pas à jour.";
  }
  if (code === "23503" && combined.includes("task_id")) {
    return "la tâche liée à cette option n'existe plus.";
  }
  if (code === "23503" && combined.includes("completed_by_profile_id")) {
    return "le profil assigné n'existe pas dans MSTV.";
  }
  if (code === "42501" || /row-level security|rls|policy|permission denied|not authorized|unauthorized|forbidden/.test(combined)) {
    return "droits Supabase insuffisants pour modifier cette assignation.";
  }
  return getUserFacingErrorMessage(error, "erreur Supabase inconnue.");
}

function createOptionAssignmentError(error: unknown, diagnostic: OptionAssignmentDiagnostic) {
  const preciseMessage = getPreciseOptionAssignmentMessage(error);
  console.error("[MSTV options] assignment failed", diagnostic);
  return new Error(`Impossible de modifier l’assignation : ${preciseMessage}`);
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

const deployedAppOrigin = "https://mstv-production-os.vercel.app";

function isLocalhostHost(value: string) {
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

function isLocalhostUrl(value: string) {
  try {
    return isLocalhostHost(new URL(value).hostname);
  } catch {
    return false;
  }
}

function getNativeAppApiBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configuredUrl) return deployedAppOrigin;

  if ((isTauriRuntime() || isCapacitorRuntime()) && isLocalhostUrl(configuredUrl)) {
    return deployedAppOrigin;
  }

  return configuredUrl;
}

function getAppApiUrl(path: string, unavailableMessage = "Service momentanément indisponible.") {
  if (typeof window === "undefined") return path;
  const needsDeployedApiOrigin = isCapacitorRuntime() || isTauriRuntime();
  if (needsDeployedApiOrigin) {
    const baseUrl = getNativeAppApiBaseUrl();
    if (baseUrl) {
      return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
    }
    throw new Error(unavailableMessage);
  }
  return path;
}

function getAppleConnectUserMessage(error: unknown, fallback = "Impossible de connecter Apple Calendar.") {
  if (error && typeof error === "object" && "userMessage" in error) {
    const message = (error as AppleConnectUserError).userMessage;
    if (message) return message;
  }
  return getUserFacingErrorMessage(error, fallback);
}

async function getCurrentSupabaseAccessToken(fallbackToken?: string | null) {
  if (!supabase) return fallbackToken ?? "";

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.access_token ?? fallbackToken ?? "";
  } catch (sessionError) {
    if (isInvalidRefreshTokenError(sessionError)) {
      console.info("Supabase session refresh token is no longer valid; reconnect required.");
      throw new Error(sessionExpiredMessage);
    }
    console.warn("Unable to refresh Supabase session before API call.", getDebugError(sessionError));
    return fallbackToken ?? "";
  }
}

function isPdfFile(file: File | null | undefined) {
  return Boolean(file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")));
}

function hasFileDragItem(dataTransfer: DataTransfer) {
  return (
    Array.from(dataTransfer.types ?? []).includes("Files") ||
    dataTransfer.files.length > 0 ||
    Array.from(dataTransfer.items).some((item) => item.kind === "file")
  );
}

function hasPotentialPdfDragItem(dataTransfer: DataTransfer) {
  const files = getFilesFromTransfer(dataTransfer);
  if (files.length > 0) return files.some(isPdfFile);

  return Array.from(dataTransfer.items).some((item) => {
    if (item.kind !== "file") return false;
    return !item.type || item.type === "application/pdf" || item.type === "application/x-pdf";
  });
}

function getFilesFromTransfer(dataTransfer: DataTransfer) {
  const files = Array.from(dataTransfer.files).filter(Boolean);
  if (files.length > 0) return files;

  return Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

function getFirstFileFromTransfer(dataTransfer: DataTransfer) {
  return getFilesFromTransfer(dataTransfer)[0] ?? null;
}

function getPdfFileFromTransfer(dataTransfer: DataTransfer) {
  return getFilesFromTransfer(dataTransfer).find(isPdfFile) ?? null;
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

function normalizeExternalCalendarProviderType(providerType: string | null | undefined): ExternalCalendarProviderType {
  if (providerType === "google") return "google";
  if (providerType === "microsoft") return "microsoft";
  if (providerType === "apple_caldav") return "apple_caldav";
  return "ics_read_only";
}

function normalizeExternalCalendarSyncCapability(syncCapability: string | null | undefined): ExternalCalendarSyncCapability {
  return syncCapability === "bidirectional" ? "bidirectional" : "read_only";
}

function normalizeExternalCalendarRole(role: string | null | undefined): ExternalCalendarRole {
  return role === "business_primary" ? "business_primary" : "external_context";
}

function normalizeProductionEventRole(role: string | null | undefined): ProductionEventRole {
  return role === "external_context" ? "external_context" : "production";
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
    admin_only: "Admins uniquement",
    team: "Toute l’équipe",
    private: "Moi uniquement",
  };
  return labels[visibility];
}

function getExternalCalendarProviderLabel(providerType: ExternalCalendarProviderType) {
  const labels: Record<ExternalCalendarProviderType, string> = {
    google: "Google",
    microsoft: "Outlook",
    apple_caldav: "Apple",
    ics_read_only: "ICS",
  };
  return labels[providerType];
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
    createdByProfileId: row.created_by_profile_id ?? null,
    createdAt: row.created_at,
  };
}

function mapEventUnreadActivity(row: EventActivityLogRow): EventUnreadActivity {
  const activity = mapEventActivityLog(row);
  return {
    id: activity.id,
    eventId: activity.eventId,
    actionType: activity.actionType,
    entityType: activity.entityType,
    entityId: activity.entityId,
    newValue: activity.newValue,
    createdBy: activity.createdBy,
    createdByProfileId: activity.createdByProfileId,
    createdAt: activity.createdAt,
  };
}

function mapEventActivityRead(row: EventActivityReadRow): EventActivityRead {
  return {
    eventId: row.event_id,
    profileId: row.profile_id,
    readAt: row.read_at,
  };
}

function mapEventActivityItemRead(row: EventActivityItemReadRow): EventActivityItemRead {
  return {
    eventId: row.event_id,
    profileId: row.profile_id,
    itemKey: row.item_key,
    readAt: row.read_at,
  };
}

function isTrackedUnreadActivity(activity: EventUnreadActivity) {
  if (/delete|deleted|suppression/.test(activity.actionType)) return false;
  const entityType = activity.entityType ?? "event";
  return ["event", "option", "option_item", "link", "link_entry", "document", "document_group", "task"].includes(entityType);
}

function isUnreadActivityCreatedByProfile(activity: EventUnreadActivity, profile: UserProfile | null) {
  if (!profile) return false;
  if (activity.createdByProfileId && activity.createdByProfileId === profile.id) return true;
  const createdBy = activity.createdBy?.trim().toLocaleLowerCase("fr-FR");
  if (!createdBy) return false;
  const possibleNames = [
    getProfileDisplayName(profile),
    profile.firstName,
    profile.email?.split("@")[0],
  ]
    .map((value) => value?.trim().toLocaleLowerCase("fr-FR"))
    .filter((value): value is string => Boolean(value));
  return possibleNames.includes(createdBy);
}

function getUnreadActivityItemKey(activity: EventUnreadActivity, event: ProductionEvent | null, tasks: AppTask[]) {
  if (!event) return null;
  const entityId = activity.entityId;
  const entityType = activity.entityType ?? "event";

  if (entityType === "option" && entityId) return `option:${entityId}`;

  if (entityType === "option_item" && entityId) {
    const option = event.options.find((item) => item.items.some((optionItem) => optionItem.id === entityId));
    return option ? `option:${option.id}` : null;
  }

  if (entityType === "link" && entityId) return `link:${entityId}`;

  if (entityType === "link_entry" && entityId) {
    const link = event.links.find((item) => item.entries.some((entry) => entry.id === entityId));
    return link ? `link:${link.id}` : null;
  }

  if (entityType === "document_group" && entityId) return `document:${entityId}`;

  if (entityType === "document" && entityId) {
    const groupId = typeof activity.newValue?.groupId === "string" ? activity.newValue.groupId : null;
    if (groupId) return `document:${groupId}`;
    const group = event.documentGroups.find((item) => item.files.some((file) => file.id === entityId));
    return group ? `document:${group.id}` : null;
  }

  if (entityType === "task" && entityId) {
    const option = event.options.find((item) => item.taskId === entityId);
    if (option) return `option:${option.id}`;
    const task = tasks.find((item) => item.id === entityId);
    if (task?.eventId === event.id) return null;
  }

  return null;
}

function buildUnreadChangeSummaries(
  activities: EventUnreadActivity[],
  reads: EventActivityRead[],
  itemReads: EventActivityItemRead[],
  profile: UserProfile | null,
  events: ProductionEvent[],
  tasks: AppTask[],
) {
  const readAtByEventId = new Map(reads.map((read) => [read.eventId, read.readAt]));
  const itemReadAtByEventAndKey = new Map(itemReads.map((read) => [`${read.eventId}:${read.itemKey}`, read.readAt]));
  const eventById = new Map(events.map((event) => [event.id, event]));
  const summaries = new Map<string, EventUnreadSummary>();
  const countedTargetsByEventId = new Map<string, Set<string>>();

  activities.forEach((activity) => {
    if (!isTrackedUnreadActivity(activity)) return;
    if (isUnreadActivityCreatedByProfile(activity, profile)) return;

    const event = eventById.get(activity.eventId) ?? null;
    const summary = summaries.get(activity.eventId) ?? { count: 0, hasMetadata: false, itemKeys: new Set<string>() };
    const itemKey = getUnreadActivityItemKey(activity, event, tasks);
    const eventReadAt = readAtByEventId.get(activity.eventId);
    const itemReadAt = itemKey ? itemReadAtByEventAndKey.get(`${activity.eventId}:${itemKey}`) : null;
    const unreadForEventBadge = !eventReadAt || activity.createdAt > eventReadAt;

    if (unreadForEventBadge) {
      const targetKey = itemKey ?? "event:metadata";
      const countedTargets = countedTargetsByEventId.get(activity.eventId) ?? new Set<string>();
      if (!countedTargets.has(targetKey)) {
        countedTargets.add(targetKey);
        countedTargetsByEventId.set(activity.eventId, countedTargets);
        summary.count += 1;
      }
      if (!itemKey) summary.hasMetadata = true;
    }

    if (itemKey && (!itemReadAt || activity.createdAt > itemReadAt)) {
      summary.itemKeys.add(itemKey);
    }

    if (summary.count > 0 || summary.hasMetadata || summary.itemKeys.size > 0) {
      summaries.set(activity.eventId, summary);
    }
  });

  return summaries;
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
      taskId: option.task_id ?? null,
      externalAssigneeName: option.external_assignee_name ?? null,
      taskDueDate: option.task_due_date ?? null,
      taskNotes: option.task_notes ?? null,
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
    isAllDay: Boolean(row.is_all_day),
    clientArrivalTime: toTimeInputValue(row.client_arrival_time) || null,
    startTime: toTimeInputValue(row.start_time) || null,
    endTime: toTimeInputValue(row.end_time) || null,
    endOfDayTime: toTimeInputValue(row.end_of_day_time) || null,
    location: row.location ?? null,
    notes: row.notes ?? null,
    status: row.status,
    deletedAt: row.deleted_at ?? null,
    deletedBy: row.deleted_by ?? null,
    quoteReference: row.quote_reference ?? null,
    quoteVersion: row.quote_version ?? null,
    sourceQuoteText: row.source_quote_text ?? null,
    lastQuoteImportedAt: row.last_quote_imported_at ?? null,
    importedFrom: row.imported_from ?? null,
    externalImportId: row.external_import_id ?? null,
    eventRole: normalizeProductionEventRole(row.event_role),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...mapCreatorMetadata(row),
    options,
    links,
    documentGroups: [],
    externalLinks: [],
  };
}

function mapExternalEventLink(row: ExternalEventLinkQueryRow): ExternalEventLink {
  const calendar = row.external_calendars;
  return {
    id: row.id,
    eventId: row.event_id,
    externalCalendarId: row.external_calendar_id,
    providerType: normalizeExternalCalendarProviderType(row.provider_type),
    providerCalendarId: row.provider_calendar_id,
    externalEventId: row.external_event_id,
    externalEventUid: row.external_event_uid ?? null,
    syncStatus: row.sync_status,
    lastSyncedAt: row.last_synced_at,
    lastExternalUpdatedAt: row.last_external_updated_at,
    conflictDetectedAt: row.conflict_detected_at,
    conflictReason: row.conflict_reason,
    lastSyncError: row.last_sync_error,
    deletedLocallyAt: row.deleted_locally_at ?? null,
    deletedExternallyAt: row.deleted_externally_at ?? null,
    calendarName: calendar?.name ?? "Calendrier",
    calendarColor: calendar?.color ?? null,
    calendarProviderAccountId: calendar?.provider_account_id ?? null,
    calendarProviderType: normalizeExternalCalendarProviderType(calendar?.provider_type ?? row.provider_type),
    calendarSyncCapability: normalizeExternalCalendarSyncCapability(calendar?.sync_capability ?? "read_only"),
    calendarSyncEnabled: Boolean(calendar?.sync_enabled ?? false),
    calendarVisibility: normalizeExternalCalendarVisibility(calendar?.visibility),
    calendarCreatedByProfileId: calendar?.created_by_profile_id ?? null,
    calendarRole: normalizeExternalCalendarRole(calendar?.calendar_role),
    rawExternalEvent: row.raw_external_event ?? null,
  };
}

function getEventGoogleLinks(event: ProductionEvent) {
  return event.externalLinks.filter((link) => link.providerType === "google" && link.calendarSyncCapability === "bidirectional");
}

function getEventAppleLinks(event: ProductionEvent) {
  return event.externalLinks.filter((link) => link.providerType === "apple_caldav" && link.calendarSyncCapability === "bidirectional");
}

function getEventWritableExternalLinks(event: ProductionEvent) {
  return event.externalLinks.filter(
    (link) =>
      (link.providerType === "google" || link.providerType === "apple_caldav") &&
      link.calendarSyncCapability === "bidirectional",
  );
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
    icsUrl: row.ics_url ?? "",
    color: row.color,
    visibility: normalizeExternalCalendarVisibility(row.visibility),
    providerType: normalizeExternalCalendarProviderType(row.provider_type),
    providerAccountId: row.provider_account_id ?? null,
    providerCalendarId: row.provider_calendar_id ?? null,
    syncCapability: normalizeExternalCalendarSyncCapability(row.sync_capability),
    syncEnabled: Boolean(row.sync_enabled),
    calendarRole: normalizeExternalCalendarRole(row.calendar_role),
    sortOrder: row.sort_order ?? null,
    lastSyncStatus: row.last_sync_status ?? null,
    lastSyncError: row.last_sync_error ?? null,
    lastSyncFinishedAt: row.last_sync_finished_at ?? null,
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
    rawEvent: row.raw_event ?? null,
    lastSyncedAt: row.last_synced_at,
    calendarName: row.external_calendars?.name ?? "Calendrier",
    calendarColor: row.external_calendars?.color ?? null,
    calendarVisibility: normalizeExternalCalendarVisibility(row.external_calendars?.visibility),
    calendarSyncEnabled: Boolean(row.external_calendars?.sync_enabled ?? false),
    calendarProviderType: row.external_calendars?.provider_type ? normalizeExternalCalendarProviderType(row.external_calendars.provider_type) : null,
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

function withExternalEventLinks(events: ProductionEvent[], links: ExternalEventLink[]) {
  const linksByEventId = new Map<string, ExternalEventLink[]>();

  for (const link of links) {
    const eventLinks = linksByEventId.get(link.eventId) ?? [];
    eventLinks.push(link);
    linksByEventId.set(link.eventId, eventLinks);
  }

  return events.map((event) => ({
    ...event,
    externalLinks: linksByEventId.get(event.id) ?? [],
  }));
}

async function fetchDocumentRowsForEvents(eventIds: string[]) {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  const groupRows: EventDocumentGroupRow[] = [];
  const documentRows: EventDocumentRow[] = [];
  const loadErrors: Array<{ batchIndex: number; batchSize: number; groupError?: unknown; documentError?: unknown }> = [];
  const batches = chunkArray(eventIds, relatedDataFetchBatchSize);

  for (const [batchIndex, eventIdBatch] of batches.entries()) {
    const [{ data: groupData, error: groupError }, { data: documentData, error: documentError }] = await Promise.all([
      supabase
        .from("event_document_groups")
        .select("*")
        .in("event_id", eventIdBatch)
        .order("created_at", { ascending: true }),
      supabase
        .from("event_documents")
        .select("*")
        .in("event_id", eventIdBatch)
        .order("created_at", { ascending: true }),
    ]);

    if (groupError || documentError) {
      loadErrors.push({
        batchIndex: batchIndex + 1,
        batchSize: eventIdBatch.length,
        groupError,
        documentError,
      });
      continue;
    }

    groupRows.push(...((groupData ?? []) as EventDocumentGroupRow[]));
    documentRows.push(...((documentData ?? []) as EventDocumentRow[]));
  }

  return { groupRows, documentRows, loadErrors };
}

async function fetchEvents(filter: "active" | "deleted" = "active") {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  const rows: EventQueryRow[] = [];
  let from = 0;

  while (true) {
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

    const { data, error } = await query.range(from, from + supabaseFetchPageSize - 1);
    if (error) throw error;

    const pageRows = (data ?? []) as EventQueryRow[];
    rows.push(...pageRows);

    if (pageRows.length < supabaseFetchPageSize) break;
    from += supabaseFetchPageSize;
  }

  logNetworkDebug("events-loaded", {
    filter,
    count: rows.length,
    firstDate: rows[0]?.date ?? null,
    lastDate: rows.at(-1)?.date ?? null,
  });

  let events = rows.map(mapEvent);
  const eventIds = events.map((event) => event.id);
  const optionIds = events.flatMap((event) => event.options.map((option) => option.id));
  const linkIds = events.flatMap((event) => event.links.map((link) => link.id));

  if (eventIds.length > 0) {
    try {
      const { groupRows, documentRows, loadErrors } = await fetchDocumentRowsForEvents(eventIds);
      events = withDocumentGroups(events, groupRows.map(mapEventDocumentGroup), documentRows.map(mapEventDocument));

      if (loadErrors.length > 0) {
        console.warn("Document groups/files could not be fully loaded; continuing with empty document lists for affected events.", {
          eventCount: eventIds.length,
          batchSize: relatedDataFetchBatchSize,
          failedBatches: loadErrors.map((loadError) => ({
            batchIndex: loadError.batchIndex,
            batchSize: loadError.batchSize,
            groupError: loadError.groupError ? getDebugError(loadError.groupError) : null,
            documentError: loadError.documentError ? getDebugError(loadError.documentError) : null,
          })),
        });
      }
    } catch (documentLoadError) {
      console.warn("Document groups/files could not be loaded; continuing with empty document lists.", {
        eventCount: eventIds.length,
        error: getDebugError(documentLoadError),
      });
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

  if (eventIds.length > 0) {
    let externalLinkQuery = supabase
      .from("external_event_links")
      .select("*, external_calendars (*)")
      .in("event_id", eventIds)
      .order("created_at", { ascending: true });
    if (filter !== "deleted") {
      externalLinkQuery = externalLinkQuery.is("deleted_locally_at", null);
    }
    const { data: externalLinkData, error: externalLinkError } = await externalLinkQuery;

    if (externalLinkError) {
      console.warn("External event links could not be loaded; continuing without Google sync status.", getDebugError(externalLinkError));
    } else {
      events = withExternalEventLinks(events, ((externalLinkData ?? []) as ExternalEventLinkQueryRow[]).map(mapExternalEventLink));
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

async function fetchAuthenticatedProfile(session: Session) {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  console.info("[MSTV auth] authenticated profile query result", {
    sessionUserId: session.user.id,
    sessionEmail: session.user.email ?? null,
    profileFound: Boolean(data),
    profileEmail: data?.email ?? null,
    profileRole: data?.role ?? null,
    error: error ? getDebugError(error) : null,
  });

  if (error) throw error;
  if (!data) {
    throw new Error("Profil utilisateur introuvable. Contactez un administrateur.");
  }

  const nextEmail = session.user.email ?? null;
  if (nextEmail && data.email !== nextEmail) {
    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update({ email: nextEmail })
      .eq("id", session.user.id)
      .select()
      .single();

    if (updateError) {
      console.info("Profile email refresh skipped.", getDebugError(updateError));
      return mapUserProfile(data);
    }
    return mapUserProfile(updatedProfile);
  }

  return mapUserProfile(data);
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

async function fetchTasks() {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  const rows: TaskRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("status", { ascending: false })
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, from + supabaseFetchPageSize - 1);

    if (error) throw error;

    const pageRows = (data ?? []) as TaskRow[];
    rows.push(...pageRows);
    if (pageRows.length < supabaseFetchPageSize) break;
    from += supabaseFetchPageSize;
  }

  return rows.map(mapTask);
}

async function fetchUnreadChangeData(profileId: string) {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  try {
    const [activityResult, readsResult, itemReadsResult] = await Promise.all([
      supabase
        .from("event_activity_log")
        .select("id,event_id,action_type,entity_type,entity_id,description,previous_value,new_value,created_by,created_by_profile_id,created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("event_activity_reads")
        .select("*")
        .eq("profile_id", profileId),
      supabase
        .from("event_activity_item_reads")
        .select("*")
        .eq("profile_id", profileId),
    ]);

    if (activityResult.error) throw activityResult.error;
    if (readsResult.error) throw readsResult.error;
    if (itemReadsResult.error) throw itemReadsResult.error;

    return {
      activities: ((activityResult.data ?? []) as EventActivityLogRow[]).map(mapEventUnreadActivity),
      reads: ((readsResult.data ?? []) as EventActivityReadRow[]).map(mapEventActivityRead),
      itemReads: ((itemReadsResult.data ?? []) as EventActivityItemReadRow[]).map(mapEventActivityItemRead),
    };
  } catch (unreadError) {
    const rawMessage = getRawErrorMessage(unreadError).toLocaleLowerCase("fr-FR");
    if (/event_activity_reads|event_activity_item_reads|created_by_profile_id|schema cache|column .* does not exist|relation .* does not exist|pgrst204|pgrst205|42p01|42703/.test(rawMessage)) {
      console.warn("Unread change badges are disabled until the Supabase migration is applied.", getDebugError(unreadError));
      return { activities: [], reads: [], itemReads: [] };
    }
    throw unreadError;
  }
}

async function fetchNativeMstvIcsImportIds() {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  const importIds = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("events")
      .select("id, external_import_id")
      .eq("imported_from", nativeMstvIcsImportSource)
      .not("external_import_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + supabaseFetchPageSize - 1);

    if (error) throw error;

    for (const row of data ?? []) {
      if (row.external_import_id) {
        importIds.add(row.external_import_id);
      }
    }

    if (!data || data.length < supabaseFetchPageSize) break;
    from += supabaseFetchPageSize;
  }

  return importIds;
}

async function fetchExternalCalendars() {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  const { data, error } = await supabase
    .from("external_calendars")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapExternalCalendar);
}

async function fetchExternalCalendarEvents() {
  if (!supabase) {
    throw new Error("Configuration Supabase manquante.");
  }

  // Legacy ICS/Webcal read-only storage. Google/Apple/Microsoft provider events
  // should be represented as native events linked through external_event_links.
  const rows: ExternalCalendarEventQueryRow[] = [];
  let from = 0;

  while (true) {
    const to = from + EXTERNAL_CALENDAR_FETCH_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("external_calendar_events")
      .select(
        `
          id,
          external_calendar_id,
          external_event_id,
          title,
          description,
          location,
          start_time,
          end_time,
          all_day,
          last_synced_at,
          external_calendars (*)
        `,
      )
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
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [externalCalendarSettingsOpen, setExternalCalendarSettingsOpen] = useState(false);
  const [externalCalendarDetail, setExternalCalendarDetail] = useState<ExternalCalendarEvent | null>(null);
  const [managedProfiles, setManagedProfiles] = useState<UserProfile[]>([]);
  const [taskProfiles, setTaskProfiles] = useState<UserProfile[]>([]);
  const [managedProfilesLoading, setManagedProfilesLoading] = useState(false);
  const [managedProfilesError, setManagedProfilesError] = useState<string | null>(null);
  const [updatingProfileId, setUpdatingProfileId] = useState<string | null>(null);
  const [externalCalendars, setExternalCalendars] = useState<ExternalCalendar[]>([]);
  const [externalCalendarEvents, setExternalCalendarEvents] = useState<ExternalCalendarEvent[]>([]);
  const [externalCalendarSettingsLoading, setExternalCalendarSettingsLoading] = useState(false);
  const [externalCalendarSettingsError, setExternalCalendarSettingsError] = useState<string | null>(null);
  const [syncingExternalCalendarId, setSyncingExternalCalendarId] = useState<string | null>(null);
  const [externalCalendarSyncProgress, setExternalCalendarSyncProgress] = useState<ExternalCalendarSyncProgress | null>(null);
  const [googleCalendarAccounts, setGoogleCalendarAccounts] = useState<GoogleCalendarAccount[]>([]);
  const [googleCalendarsByAccountId, setGoogleCalendarsByAccountId] = useState<Record<string, GoogleProviderCalendar[]>>({});
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);
  const [connectingGoogleCalendar, setConnectingGoogleCalendar] = useState(false);
  const [updatingGoogleCalendarKey, setUpdatingGoogleCalendarKey] = useState<string | null>(null);
  const [appleCalendarAccounts, setAppleCalendarAccounts] = useState<AppleCalendarAccount[]>([]);
  const [appleCalendarsByAccountId, setAppleCalendarsByAccountId] = useState<Record<string, AppleProviderCalendar[]>>({});
  const [appleCalendarLoading, setAppleCalendarLoading] = useState(false);
  const [connectingAppleCalendar, setConnectingAppleCalendar] = useState(false);
  const [googleAutoSyncStatus, setGoogleAutoSyncStatus] = useState<GoogleAutoSyncStatus>({
    state: "idle",
    lastSyncedAt: null,
    error: null,
  });
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [tasksNavigationRequest, setTasksNavigationRequest] = useState(0);
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
  const [unreadActivities, setUnreadActivities] = useState<EventUnreadActivity[]>([]);
  const [eventActivityReads, setEventActivityReads] = useState<EventActivityRead[]>([]);
  const [eventActivityItemReads, setEventActivityItemReads] = useState<EventActivityItemRead[]>([]);
  const [restoringActivityId, setRestoringActivityId] = useState<string | null>(null);
  const [eventDetailCarousel, setEventDetailCarousel] = useState<{ direction: -1 | 1; targetId: string } | null>(null);
  const [showEventDetailDesktopControls, setShowEventDetailDesktopControls] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const processingPendingActionsRef = useRef(false);
  const pendingNetworkSyncTimeoutRef = useRef<number | null>(null);
  const googleSyncInFlightRef = useRef(false);
  const googleAutoSyncRunningRef = useRef(false);
  const googleAutoSyncLastStartedAtRef = useRef(0);
  const appleSyncInFlightRef = useRef(false);
  const appleAutoSyncRunningRef = useRef(false);
  const appleAutoSyncLastStartedAtRef = useRef(0);
  const appleAutoSyncLaunchKeyRef = useRef<string | null>(null);
  const appleForegroundSyncLastTriggeredAtRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const visibleAppleSyncWindowRef = useRef<{ start: Date; end: Date } | null>(null);
  const visibleProductionEventsRef = useRef<ProductionEvent[]>([]);
  const activeUnreadDetailEventIdRef = useRef<string | null>(null);
  const unreadItemKeysByDetailEventRef = useRef<Map<string, string[]>>(new Map());
  const onlineRef = useRef(online);
  const processPendingSyncQueueRef = useRef<((options?: { forceOnline?: boolean }) => Promise<void>) | null>(null);
  const googleCalendarBootstrapKeyRef = useRef<string | null>(null);
  const appleCalendarBootstrapKeyRef = useRef<string | null>(null);
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
      setTasks(cachedState.appData.tasks ?? []);
      setExternalCalendars(cachedState.appData.externalCalendars);
      setExternalCalendarEvents(cachedState.appData.externalCalendarEvents);
      setSelectedId((current) => {
        return resolveSelectedEventIdForVisibleEvents({
          currentSelectedId: current,
          events: cachedState.appData?.events ?? [],
          externalCalendars: cachedState.appData?.externalCalendars ?? [],
          viewer: getCalendarVisibilityViewer(cachedState.profile, cachedState.session?.user.id ?? null),
        });
      });
    }

    setLoading(false);
    setAuthLoading(false);
  }

  async function handleInvalidAuthSession(message = sessionExpiredMessage) {
    const userId = authSession?.user.id ?? profile?.id ?? getCachedAuthSession()?.user.id ?? null;
    clearCachedAuthState(userId);
    try {
      await supabase?.auth.signOut({ scope: "local" });
    } catch (signOutError) {
      console.info("Local sign-out after expired session could not complete.", getDebugError(signOutError));
    }
    setAuthSession(null);
    setProfile(null);
    setEvents([]);
    setUnreadActivities([]);
    setEventActivityReads([]);
    setEventActivityItemReads([]);
    setExternalCalendars([]);
    setExternalCalendarEvents([]);
    setNotifications([]);
    setNotificationsHydrated(false);
    setSelectedId(null);
    setScreen("calendar");
    setCreateMenuOpen(false);
    setQuoteImportOpen(false);
    setExternalCalendarSettingsOpen(false);
    setLoading(false);
    setAuthLoading(false);
    setAuthError(message);
  }

  async function getServerApiAccessToken(fallbackToken?: string | null) {
    try {
      const accessToken = await getCurrentSupabaseAccessToken(fallbackToken);
      if (!accessToken) {
        throw new Error(sessionExpiredMessage);
      }
      return accessToken;
    } catch (accessTokenError) {
      if (isSessionExpiredError(accessTokenError)) {
        await handleInvalidAuthSession();
        throw new Error(sessionExpiredMessage);
      }
      throw accessTokenError;
    }
  }

  const isSelectedDateToday = selectedDateKey === todayKey;
  const yearLabel = String(visibleMonth.getFullYear());
  const permissions = useMemo(() => getPermissionsForRole(profile?.role ?? "team"), [profile?.role]);
  const headerProfile = profile;
  const headerSession = authSession;
  const headerPermissions = useMemo(() => getPermissionsForRole(headerProfile?.role ?? "team"), [headerProfile?.role]);
  const headerCanOpenTrash = headerPermissions.canRestoreEvents || headerPermissions.canPermanentDeleteEvents;
  const actorName = getProfileDisplayName(profile);
  const externalCalendarVisibilityState = useMemo(
    () => buildExternalCalendarVisibilityState(externalCalendars, getCalendarVisibilityViewer(profile, authSession?.user.id ?? null)),
    [authSession?.user.id, externalCalendars, profile?.id, profile?.role],
  );
  const isExternalEventLinkVisible = useCallback(
    (link: ExternalEventLink) => isExternalEventLinkVisibleByCalendarState(link, externalCalendarVisibilityState),
    [externalCalendarVisibilityState],
  );
  const isExternalCalendarEventVisible = useCallback(
    (event: ExternalCalendarEvent) => isLegacyExternalCalendarEventVisible(event, externalCalendarVisibilityState),
    [externalCalendarVisibilityState],
  );
  const isProductionEventVisible = useCallback(
    (event: ProductionEvent) => isProductionEventVisibleByCalendarState(event, externalCalendarVisibilityState, { nativeMstvIcsImportSource }),
    [externalCalendarVisibilityState],
  );
  const visibleExternalCalendarEvents = useMemo(
    () => externalCalendarEvents.filter(isExternalCalendarEventVisible),
    [externalCalendarEvents, isExternalCalendarEventVisible],
  );
  const visibleProductionEvents = useMemo(
    () => events.filter(isProductionEventVisible),
    [events, isProductionEventVisible],
  );
  const unreadChangeSummaries = useMemo(
    () => buildUnreadChangeSummaries(unreadActivities, eventActivityReads, eventActivityItemReads, profile, visibleProductionEvents, tasks),
    [eventActivityItemReads, eventActivityReads, profile?.id, profile?.email, profile?.firstName, profile?.lastName, tasks, unreadActivities, visibleProductionEvents],
  );
  const chronologicalEvents = useMemo(() => [...visibleProductionEvents].sort((a, b) => eventSortValue(a) - eventSortValue(b)), [visibleProductionEvents]);
  const selectedEvent = useMemo(() => {
    if (selectedId) return chronologicalEvents.find((item) => item.id === selectedId) ?? null;
    return chronologicalEvents[0] ?? null;
  }, [chronologicalEvents, selectedId]);
  const visibleAppleSyncWindow = useMemo(() => {
    if (screen === "detail" && selectedEvent?.date) {
      const eventDate = new Date(`${selectedEvent.date}T12:00:00`);
      if (Number.isFinite(eventDate.getTime())) return getMonthSyncWindow(eventDate);
    }
    if (yearOverviewOpen) {
      return {
        start: new Date(visibleMonth.getFullYear() - 1, 11, 1),
        end: new Date(visibleMonth.getFullYear() + 1, 1, 1),
      };
    }
    return getMonthSyncWindow(visibleMonth);
  }, [screen, selectedEvent?.date, visibleMonth, yearOverviewOpen]);
  const selectedEventIndex = selectedEvent ? chronologicalEvents.findIndex((item) => item.id === selectedEvent.id) : -1;
  const hasPreviousEvent = selectedEventIndex > 0;
  const hasNextEvent = selectedEventIndex >= 0 && selectedEventIndex < chronologicalEvents.length - 1;
  const previousDetailEvent = hasPreviousEvent ? chronologicalEvents[selectedEventIndex - 1] : null;
  const nextDetailEvent = hasNextEvent ? chronologicalEvents[selectedEventIndex + 1] : null;
  const writableGoogleCalendars = useMemo(
    () =>
      externalCalendars.filter((calendar) => calendar.providerType === "google" && isCreatableExternalCalendar(calendar)),
    [externalCalendars],
  );
  const writableAppleCalendars = useMemo(
    () =>
      externalCalendars.filter((calendar) => calendar.providerType === "apple_caldav" && isCreatableExternalCalendar(calendar)),
    [externalCalendars],
  );
  const writableExternalCalendars = useMemo(
    () => [...writableGoogleCalendars, ...writableAppleCalendars].sort(compareExternalCalendarDisplayOrder),
    [writableAppleCalendars, writableGoogleCalendars],
  );

  useEffect(() => {
    visibleAppleSyncWindowRef.current = visibleAppleSyncWindow;
  }, [visibleAppleSyncWindow]);

  useEffect(() => {
    visibleProductionEventsRef.current = visibleProductionEvents;
  }, [visibleProductionEvents]);

  useEffect(() => {
    setEventDetailCarousel(null);
  }, [screen, selectedId]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const coarsePointerQuery = window.matchMedia("(hover: none), (pointer: coarse)");
    const smallScreenQuery = window.matchMedia("(max-width: 639px)");

    function updateEventDetailControlsVisibility() {
      setShowEventDetailDesktopControls(shouldShowEventDetailDesktopControls());
    }

    updateEventDetailControlsVisibility();
    coarsePointerQuery.addEventListener("change", updateEventDetailControlsVisibility);
    smallScreenQuery.addEventListener("change", updateEventDetailControlsVisibility);

    return () => {
      coarsePointerQuery.removeEventListener("change", updateEventDetailControlsVisibility);
      smallScreenQuery.removeEventListener("change", updateEventDetailControlsVisibility);
    };
  }, []);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

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
        email: session?.user.email ?? null,
        online: typeof navigator === "undefined" ? true : navigator.onLine,
      });
      setAuthSession(session);
      setAuthError(null);

      if (!session) {
        console.info("[MSTV offline boot] no session available");
        setProfile(null);
        setEvents([]);
        setTasks([]);
        setTaskProfiles([]);
        setExternalCalendars([]);
        setExternalCalendarEvents([]);
        setNotifications([]);
        setNotificationsHydrated(false);
        setSelectedId(null);
        setLoading(false);
        return;
      }

      try {
        const nextProfile = await fetchAuthenticatedProfile(session);
        console.info("[MSTV offline boot] live profile loaded", {
          userId: session.user.id,
          email: session.user.email ?? null,
          profileEmail: nextProfile.email,
          profileRole: nextProfile.role,
        });
        cacheAuthSession(session);
        cacheUserProfile(nextProfile);
        if (!cancelled) {
          setProfile(nextProfile);
        }
      } catch (profileError) {
        if (isInvalidRefreshTokenError(profileError)) {
          console.info("[MSTV offline boot] invalid refresh token while loading profile; reconnect required.");
          await handleInvalidAuthSession();
          return;
        }
        const cachedProfile = getCachedUserProfile(session.user.id);
        const canUseCachedProfile =
          Boolean(cachedProfile) &&
          (isNetworkOrUnavailableError(profileError) || (typeof navigator !== "undefined" && !navigator.onLine));
        console.info("[MSTV offline boot] live profile failed", {
          userId: session.user.id,
          email: session.user.email ?? null,
          networkLike: isNetworkOrUnavailableError(profileError),
          cachedProfileFound: Boolean(cachedProfile),
          cachedProfileEmail: cachedProfile?.email ?? null,
          cachedProfileRole: cachedProfile?.role ?? null,
          fallbackAllowed: canUseCachedProfile,
          error: getDebugError(profileError),
        });
        if (cachedProfile && canUseCachedProfile) {
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
          setAuthError(getProfileLoadUserMessage(profileError));
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
          email: cachedState.session.user.email ?? null,
          cachedProfileEmail: cachedState.profile.email,
          cachedProfileRole: cachedState.profile.role,
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
          sessionUserId: data.session?.user.id ?? null,
          sessionEmail: data.session?.user.email ?? null,
          hasError: Boolean(error),
          error: error ? getDebugError(error) : null,
        });

        if (isInvalidRefreshTokenError(error)) {
          console.info("[MSTV offline boot] invalid refresh token from getSession; reconnect required.");
          await handleInvalidAuthSession();
          if (!cancelled) setAuthLoading(false);
          return;
        }

        if (data.session) {
          if (
            cachedState &&
            (cachedState.session.user.id !== data.session.user.id ||
              (data.session.user.email && cachedState.profile.email && cachedState.profile.email !== data.session.user.email))
          ) {
            console.info("[MSTV offline boot] clearing stale cached auth/profile mismatch", {
              cachedUserId: cachedState.session.user.id,
              cachedEmail: cachedState.profile.email,
              liveUserId: data.session.user.id,
              liveEmail: data.session.user.email ?? null,
            });
            clearCachedAuthState(cachedState.session.user.id);
          }
          cacheAuthSession(data.session);
          await loadAuthenticatedProfile(data.session);
          if (!cancelled) setAuthLoading(false);
          return;
        }

        const cachedSession = getCachedAuthSession();
        if (cachedSession) {
          const canUseCachedSession = Boolean(error) || isNetworkOrUnavailableError(error) || (typeof navigator !== "undefined" && !navigator.onLine);
          console.info("[MSTV offline boot] cached session fallback evaluated", {
            userId: cachedSession.user.id,
            email: cachedSession.user.email ?? null,
            fallbackAllowed: canUseCachedSession,
          });
          if (canUseCachedSession) {
            setOnline(false);
            await loadAuthenticatedProfile(cachedSession);
            if (!cancelled) setAuthLoading(false);
            return;
          }
          clearCachedAuthState(cachedSession.user.id);
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
        if (isInvalidRefreshTokenError(sessionError)) {
          console.info("[MSTV offline boot] invalid refresh token thrown by getSession; reconnect required.");
          await handleInvalidAuthSession();
          if (!cancelled) setAuthLoading(false);
          return;
        }
        console.error("[MSTV offline boot] getSession threw", sessionError);
        const cachedSession = getCachedAuthSession();
        if (cachedSession && (isNetworkOrUnavailableError(sessionError) || (typeof navigator !== "undefined" && !navigator.onLine))) {
          console.info("[MSTV offline boot] cached session fallback used after getSession throw", {
            userId: cachedSession.user.id,
            email: cachedSession.user.email ?? null,
          });
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
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const googleStatus = searchParams.get("calendarGoogle");
    if (!googleStatus) return;

    setExternalCalendarSettingsOpen(true);
    if (googleStatus === "connected") {
      setExternalCalendarSettingsError(null);
      void refreshGoogleCalendarAccounts();
      void refreshExternalCalendarSettings({ silent: true });
    } else {
      setExternalCalendarSettingsError(searchParams.get("message") || "Connexion Google Calendar impossible.");
    }

    searchParams.delete("calendarGoogle");
    searchParams.delete("message");
    const nextSearch = searchParams.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`);
  }, [authSession?.user.id, online]);

  useEffect(() => {
    function preventNativeFileDrop(dragEvent: DragEvent) {
      if (!dragEvent.dataTransfer || !hasFileDragItem(dragEvent.dataTransfer)) return;
      dragEvent.preventDefault();
      if (dragEvent.type === "dragover") {
        dragEvent.dataTransfer.dropEffect = hasPotentialPdfDragItem(dragEvent.dataTransfer) ? "copy" : "none";
      }
    }

    window.addEventListener("dragover", preventNativeFileDrop, { capture: true });
    window.addEventListener("drop", preventNativeFileDrop, { capture: true });
    return () => {
      window.removeEventListener("dragover", preventNativeFileDrop, { capture: true });
      window.removeEventListener("drop", preventNativeFileDrop, { capture: true });
    };
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
    if (!authSession || !profile) return;
    if (!online) {
      const cachedData = getCachedAppData(authSession.user.id);
      if (cachedData) {
        setEvents(cachedData.events);
        setTasks(cachedData.tasks ?? []);
        setExternalCalendars(cachedData.externalCalendars);
        setExternalCalendarEvents(cachedData.externalCalendarEvents);
        setSelectedId((current) => {
          return resolveSelectedEventIdForVisibleEvents({
            currentSelectedId: current,
            events: cachedData.events,
            externalCalendars: cachedData.externalCalendars,
            viewer: getCalendarVisibilityViewer(profile, authSession.user.id),
          });
        });
      }
      setLoading(false);
      setError(null);
      return;
    }
    void reloadData(undefined, { source: "auth-online" });
  }, [authSession?.user.id, profile?.id, online]);

  useEffect(() => {
    if (!historyOpen || !selectedEvent) return;
    void refreshActivityLog(selectedEvent.id);
  }, [historyOpen, selectedEvent?.id]);

  useEffect(() => {
    if (screen !== "detail" || !selectedEvent || !profile?.id || !online) return;
    const unreadSummary = unreadChangeSummaries.get(selectedEvent.id);
    const unreadCount = unreadSummary?.count ?? 0;
    if (unreadCount === 0) return;

    const readTimer = window.setTimeout(() => {
      void markEventChangesRead(selectedEvent.id);
    }, 1400);

    return () => window.clearTimeout(readTimer);
  }, [online, profile?.id, screen, selectedEvent?.id, unreadChangeSummaries]);

  useEffect(() => {
    if (screen !== "detail" || !selectedEvent?.id) return;
    const unreadSummary = unreadChangeSummaries.get(selectedEvent.id);
    unreadItemKeysByDetailEventRef.current.set(selectedEvent.id, unreadSummary ? Array.from(unreadSummary.itemKeys) : []);
  }, [screen, selectedEvent?.id, unreadChangeSummaries]);

  useEffect(() => {
    const currentDetailEventId = screen === "detail" && selectedEvent?.id ? selectedEvent.id : null;
    const previousDetailEventId = activeUnreadDetailEventIdRef.current;

    if (previousDetailEventId && previousDetailEventId !== currentDetailEventId) {
      const remainingItemKeys = unreadItemKeysByDetailEventRef.current.get(previousDetailEventId) ?? [];
      void markEventChangesRead(previousDetailEventId);
      if (remainingItemKeys.length > 0) {
        void markEventItemsRead(previousDetailEventId, remainingItemKeys);
      }
      unreadItemKeysByDetailEventRef.current.delete(previousDetailEventId);
    }

    activeUnreadDetailEventIdRef.current = currentDetailEventId;
  }, [screen, selectedEvent?.id]);

  useEffect(() => {
    if (!trashOpen) return;
    void refreshTrash();
  }, [trashOpen]);

  useEffect(() => {
    if (screen !== "tasks") return;
    void refreshTasks({ silent: tasks.length > 0 });
    if (taskProfiles.length === 0) {
      void refreshTaskProfiles();
    }
  }, [screen]);

  useEffect(() => {
    if (!userManagementOpen || !permissions.canManageUsers) return;
    void refreshManagedProfiles();
  }, [userManagementOpen, permissions.canManageUsers]);

  useEffect(() => {
    if (!authSession?.user.id || !profile || !online) return;
    void refreshTaskProfiles();
  }, [authSession?.user.id, profile?.id, online]);

  useEffect(() => {
    if (!externalCalendarSettingsOpen) return;
    void refreshExternalCalendarSettings({ silent: externalCalendars.length > 0 });
    void refreshGoogleCalendarAccounts();
    void refreshAppleCalendarAccounts();
  }, [externalCalendarSettingsOpen]);

  useEffect(() => {
    if (!authSession?.user.id || !profile || !online) return;
    if (googleCalendarBootstrapKeyRef.current === authSession.user.id) return;

    googleCalendarBootstrapKeyRef.current = authSession.user.id;
    void refreshGoogleCalendarAccounts();
  }, [authSession?.user.id, online, profile?.id]);

  useEffect(() => {
    if (!authSession?.user.id || !profile || !online) return;
    if (appleCalendarBootstrapKeyRef.current === authSession.user.id) return;

    appleCalendarBootstrapKeyRef.current = authSession.user.id;
    void refreshAppleCalendarAccounts();
  }, [authSession?.user.id, online, profile?.id]);

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
            const nextProfile = await fetchAuthenticatedProfile(currentSession);
            cacheUserProfile(nextProfile);
            if (!disposed) {
              setProfile(nextProfile);
            }

            await reloadData(undefined, { silent: true, source: "realtime" });
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
              await refreshExternalCalendarSettings({ silent: true });
            }
          } catch (realtimeError) {
            if (isSessionExpiredError(realtimeError)) {
              await handleInvalidAuthSession();
              return;
            }
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

  async function reloadData(nextSelectedId?: string | null, options: { silent?: boolean; source?: string } = {}) {
    const source = options.source ?? "unspecified";
    const startedAt = new Date().toISOString();
    const startMs = performance.now();
    logNetworkDebug("reloadData:start", {
      source,
      startedAt,
      silent: Boolean(options.silent),
      requestedSelectedId: nextSelectedId ?? null,
      currentSelectedId: selectedIdRef.current,
    });
    if (!options.silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const [nextEvents, nextExternalCalendars, nextExternalEvents, nextTasks, nextUnreadData] = await Promise.all([
        fetchEvents(),
        fetchExternalCalendars(),
        fetchExternalCalendarEvents(),
        fetchTasks(),
        profile?.id ? fetchUnreadChangeData(profile.id) : Promise.resolve({ activities: [], reads: [], itemReads: [] }),
      ]);
      const eventCounts = getProductionEventNetworkCounts(nextEvents);
      logNetworkDebug("reloadData:complete", {
        source,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - startMs),
        fromCache: false,
        counts: {
          ...eventCounts,
          externalCalendars: nextExternalCalendars.length,
          legacyExternalCalendarEvents: nextExternalEvents.length,
          tasks: nextTasks.length,
          unreadChanges: nextUnreadData.activities.length,
          readReceipts: nextUnreadData.reads.length,
          itemReadReceipts: nextUnreadData.itemReads.length,
        },
        approxJsonBytes: {
          events: getApproxJsonBytes(nextEvents),
          externalCalendars: getApproxJsonBytes(nextExternalCalendars),
          legacyExternalCalendarEvents: getApproxJsonBytes(nextExternalEvents),
          tasks: getApproxJsonBytes(nextTasks),
          unreadChanges: getApproxJsonBytes(nextUnreadData.activities),
          readReceipts: getApproxJsonBytes(nextUnreadData.reads),
          itemReadReceipts: getApproxJsonBytes(nextUnreadData.itemReads),
        },
      });
      if (authSession?.user.id) {
        cacheAppData(authSession.user.id, {
          events: nextEvents,
          tasks: nextTasks,
          externalCalendars: nextExternalCalendars,
          externalCalendarEvents: nextExternalEvents,
        }, profile);
      }
      setEvents(nextEvents);
      setTasks(nextTasks);
      setUnreadActivities(nextUnreadData.activities);
      setEventActivityReads(nextUnreadData.reads);
      setEventActivityItemReads(nextUnreadData.itemReads);
      setExternalCalendars((current) => mergeExternalCalendarList(current, nextExternalCalendars));
      setExternalCalendarEvents(nextExternalEvents);
      setSelectedId((current) => {
        return resolveSelectedEventIdForVisibleEvents({
          currentSelectedId: current,
          requestedSelectedId: nextSelectedId,
          events: nextEvents,
          externalCalendars: nextExternalCalendars,
          viewer: getCalendarVisibilityViewer(profile, authSession?.user.id ?? null),
        });
      });
      return {
        events: nextEvents,
        externalCalendars: nextExternalCalendars,
        externalCalendarEvents: nextExternalEvents,
        tasks: nextTasks,
        fromCache: false,
      };
    } catch (supabaseError) {
      const cachedData = authSession?.user.id ? getCachedAppData(authSession.user.id) : null;
      if (cachedData && isNetworkOrUnavailableError(supabaseError)) {
        logNetworkDebug("reloadData:cache-fallback", {
          source,
          startedAt,
          durationMs: Math.round(performance.now() - startMs),
          error: getRawErrorMessage(supabaseError),
          counts: {
            ...getProductionEventNetworkCounts(cachedData.events),
            externalCalendars: cachedData.externalCalendars.length,
            legacyExternalCalendarEvents: cachedData.externalCalendarEvents.length,
          },
        });
        setEvents(cachedData.events);
        setTasks(cachedData.tasks ?? []);
        setExternalCalendars(cachedData.externalCalendars);
        setExternalCalendarEvents(cachedData.externalCalendarEvents);
        setSelectedId((current) => {
          return resolveSelectedEventIdForVisibleEvents({
            currentSelectedId: current,
            requestedSelectedId: nextSelectedId,
            events: cachedData.events,
            externalCalendars: cachedData.externalCalendars,
            viewer: getCalendarVisibilityViewer(profile, authSession?.user.id ?? null),
          });
        });
        setError(null);
        setOnline(false);
        return {
          events: cachedData.events,
          externalCalendars: cachedData.externalCalendars,
          externalCalendarEvents: cachedData.externalCalendarEvents,
          fromCache: true,
        };
      } else {
        logNetworkDebug("reloadData:error", {
          source,
          startedAt,
          durationMs: Math.round(performance.now() - startMs),
          error: getRawErrorMessage(supabaseError),
        });
        setError(getUserFacingErrorMessage(supabaseError, "Impossible de charger les données."));
      }
      return null;
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
      console.error("Failed to load user profiles.", getDebugError(profilesError));
      setManagedProfilesError(getUserFacingErrorMessage(profilesError, "Impossible de charger les utilisateurs."));
    } finally {
      setManagedProfilesLoading(false);
    }
  }

  async function refreshTaskProfiles() {
    try {
      setTaskProfiles(await fetchProfiles());
    } catch (profilesError) {
      console.warn("Failed to load task assignees.", getDebugError(profilesError));
      setTaskProfiles(profile ? [profile] : []);
    }
  }

  async function refreshExternalCalendarSettings(options: { silent?: boolean } = {}) {
    const startMs = performance.now();
    logNetworkDebug("calendar-settings-refresh:start", {
      silent: Boolean(options.silent),
      opened: externalCalendarSettingsOpen,
      startedAt: new Date().toISOString(),
    });
    if (!options.silent) {
      setExternalCalendarSettingsLoading(true);
    }
    setExternalCalendarSettingsError(null);

    try {
      const [nextCalendars, nextEvents] = await Promise.all([
        fetchExternalCalendars(),
        fetchExternalCalendarEvents(),
      ]);
      logNetworkDebug("calendar-settings-refresh:complete", {
        durationMs: Math.round(performance.now() - startMs),
        externalCalendars: nextCalendars.length,
        legacyExternalCalendarEvents: nextEvents.length,
        approxJsonBytes: {
          externalCalendars: getApproxJsonBytes(nextCalendars),
          legacyExternalCalendarEvents: getApproxJsonBytes(nextEvents),
        },
      });
      const nextMergedCalendars = mergeExternalCalendarList(externalCalendars, nextCalendars);
      setExternalCalendars((current) => mergeExternalCalendarList(current, nextCalendars));
      setExternalCalendarEvents(nextEvents);
      setSelectedId((current) =>
        resolveSelectedEventIdForVisibleEvents({
          currentSelectedId: current,
          events,
          externalCalendars: nextMergedCalendars,
          viewer: getCalendarVisibilityViewer(profile, authSession?.user.id ?? null),
        }),
      );
    } catch (calendarError) {
      console.error("Failed to load external calendars. Apply supabase/migrations/023_external_calendars.sql if needed.", calendarError);
      setExternalCalendarSettingsError("Impossible de charger les calendriers.");
    } finally {
      if (!options.silent) {
        setExternalCalendarSettingsLoading(false);
      }
    }
  }

  function mergeRefetchedExternalCalendar(row: ExternalCalendarRow) {
    const mappedCalendar = mapExternalCalendar(row);
    setExternalCalendars((current) => {
      const existingIndex = current.findIndex((calendar) => calendar.id === mappedCalendar.id);
      if (existingIndex === -1) return [...current, mappedCalendar];
      return current.map((calendar) => (calendar.id === mappedCalendar.id ? mappedCalendar : calendar));
    });
    setExternalCalendarEvents((current) =>
      current.map((event) => (
        event.externalCalendarId === mappedCalendar.id
          ? {
              ...event,
              calendarName: mappedCalendar.name,
              calendarColor: mappedCalendar.color,
              calendarVisibility: mappedCalendar.visibility,
              calendarSyncEnabled: mappedCalendar.syncEnabled,
              calendarProviderType: mappedCalendar.providerType,
              calendarCreatedByProfileId: mappedCalendar.createdByProfileId,
            }
          : event
      )),
    );
    setEvents((current) =>
      current.map((event) => ({
        ...event,
        externalLinks: event.externalLinks.map((link) => (
          link.externalCalendarId === mappedCalendar.id
            ? {
                ...link,
                calendarName: mappedCalendar.name,
                calendarColor: mappedCalendar.color,
                calendarProviderAccountId: mappedCalendar.providerAccountId,
                calendarProviderType: mappedCalendar.providerType,
                calendarSyncCapability: mappedCalendar.syncCapability,
                calendarSyncEnabled: mappedCalendar.syncEnabled,
                calendarVisibility: mappedCalendar.visibility,
                calendarCreatedByProfileId: mappedCalendar.createdByProfileId,
              }
            : link
        )),
      })),
    );
    if (mappedCalendar.providerType === "google" && mappedCalendar.providerAccountId && mappedCalendar.providerCalendarId) {
      const providerAccountId = mappedCalendar.providerAccountId;
      const providerCalendarId = normalizeProviderCalendarKey(mappedCalendar.providerCalendarId);
      setGoogleCalendarsByAccountId((current) => {
        const accountCalendars = current[providerAccountId] ?? [];
        if (accountCalendars.length === 0) return current;
        return {
          ...current,
          [providerAccountId]: accountCalendars.map((calendar) => (
            normalizeProviderCalendarKey(calendar.providerCalendarId) === providerCalendarId
              ? {
                  ...calendar,
                  externalCalendarId: mappedCalendar.id,
                  color: mappedCalendar.color,
                  visibility: mappedCalendar.visibility,
                  enabled: mappedCalendar.syncEnabled,
                }
              : calendar
          )),
        };
      });
    }
    if (mappedCalendar.providerType === "apple_caldav" && mappedCalendar.providerAccountId && mappedCalendar.providerCalendarId) {
      const providerAccountId = mappedCalendar.providerAccountId;
      const providerCalendarId = normalizeProviderCalendarKey(mappedCalendar.providerCalendarId);
      setAppleCalendarsByAccountId((current) => {
        const accountCalendars = current[providerAccountId] ?? [];
        if (accountCalendars.length === 0) return current;
        return {
          ...current,
          [providerAccountId]: accountCalendars.map((calendar) => (
            normalizeProviderCalendarKey(calendar.providerCalendarId) === providerCalendarId
              ? {
                  ...calendar,
                  externalCalendarId: mappedCalendar.id,
                  color: mappedCalendar.color,
                  visibility: mappedCalendar.visibility,
                  enabled: mappedCalendar.syncEnabled,
                }
              : calendar
          )),
        };
      });
    }
    return mappedCalendar;
  }

  async function refreshGoogleCalendarAccounts() {
    if (!authSession || !online) return;

    setGoogleCalendarLoading(true);
    try {
      const accessToken = await getServerApiAccessToken(authSession.access_token);
      const response = await fetch(getAppApiUrl("/api/calendar/google/calendars", "Google Calendar momentanément indisponible."), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "list" }),
      });
      const payload = (await response.json().catch(() => null)) as {
        accounts?: GoogleCalendarAccount[];
        calendarsByAccountId?: Record<string, GoogleProviderCalendar[]>;
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Impossible de charger Google Calendar.");
      }

      const nextAccounts = payload?.accounts ?? [];
      const nextCalendarsByAccountId = payload?.calendarsByAccountId ?? {};
      setGoogleCalendarAccounts(nextAccounts);
      setGoogleCalendarsByAccountId(nextCalendarsByAccountId);
      void refreshExternalCalendarSettings({ silent: true });

      if (nextAccounts.length === 0) {
        setExternalCalendarSettingsError(null);
      } else {
        const connectedAccounts = nextAccounts.filter((account) => account.connectionStatus === "connected");
        const loadedCalendarCount = connectedAccounts.reduce((count, account) => count + (nextCalendarsByAccountId[account.id]?.length ?? 0), 0);
        setExternalCalendarSettingsError(connectedAccounts.length > 0 && loadedCalendarCount === 0 ? "Compte Google connecté, mais impossible de charger les calendriers." : null);
      }
    } catch (googleError) {
      setExternalCalendarSettingsError(getUserFacingErrorMessage(googleError, "Impossible de charger Google Calendar."));
    } finally {
      setGoogleCalendarLoading(false);
    }
  }

  async function refreshAppleCalendarAccounts() {
    if (!authSession || !online) return;

    setAppleCalendarLoading(true);
    try {
      const accessToken = await getServerApiAccessToken(authSession.access_token);
      const response = await fetch(getAppApiUrl("/api/calendar/apple/calendars", "Apple Calendar momentanément indisponible."), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "list" }),
      });
      const payload = (await response.json().catch(() => null)) as {
        accounts?: AppleCalendarAccount[];
        calendarsByAccountId?: Record<string, AppleProviderCalendar[]>;
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Impossible de charger Apple Calendar.");
      }

      setAppleCalendarAccounts(payload?.accounts ?? []);
      setAppleCalendarsByAccountId(payload?.calendarsByAccountId ?? {});
      void refreshExternalCalendarSettings({ silent: true });
    } catch (appleError) {
      setExternalCalendarSettingsError(getUserFacingErrorMessage(appleError, "Impossible de charger Apple Calendar."));
    } finally {
      setAppleCalendarLoading(false);
    }
  }

  async function connectAppleCalendar(input: { appleId: string; appPassword: string }) {
    if (!authSession) throw new Error(sessionExpiredMessage);

    setConnectingAppleCalendar(true);
    setExternalCalendarSettingsError(null);
    const routePath = "/api/calendar/apple/connect";
    try {
      const routeCalled = getAppApiUrl(routePath, "Connexion Apple Calendar momentanément indisponible.");
      const accessToken = await getServerApiAccessToken(authSession.access_token);
      const response = await fetch(routeCalled, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(input),
      });
      const payload = (await response.json().catch(() => null)) as AppleConnectFailurePayload | null;

      if (!response.ok) {
        const routeMessage = payload?.error ?? payload?.message ?? "Connexion Apple Calendar refusée.";
        const userMessage = `Impossible de connecter Apple Calendar : ${routeMessage}`;
        const error = new Error(userMessage) as AppleConnectUserError;
        error.userMessage = userMessage;
        throw error;
      }

      await refreshAppleCalendarAccounts();
      await refreshExternalCalendarSettings({ silent: true });
    } catch (connectError) {
      const userMessage = getAppleConnectUserMessage(connectError, "Impossible de connecter Apple Calendar.");
      const error = new Error(userMessage) as AppleConnectUserError;
      error.userMessage = userMessage;
      setExternalCalendarSettingsError(userMessage);
      throw error;
    } finally {
      setConnectingAppleCalendar(false);
    }
  }

  async function disconnectAppleCalendar(account: AppleCalendarAccount) {
    if (!authSession || !supabase) throw new Error(sessionExpiredMessage);

    setConnectingAppleCalendar(true);
    setExternalCalendarSettingsError(null);
    try {
      const now = new Date().toISOString();
      const { error: accountError } = await supabase
        .from("external_calendar_accounts")
        .update({
          connection_status: "disconnected",
          last_error: null,
          updated_at: now,
        })
        .eq("id", account.id)
        .eq("user_id", authSession.user.id)
        .eq("provider_type", "apple_caldav");

      if (accountError) throw accountError;

      const { error: calendarError } = await supabase
        .from("external_calendars")
        .update({
          sync_enabled: false,
          last_sync_status: "idle",
          last_sync_error: null,
        })
        .eq("provider_account_id", account.id)
        .eq("created_by_profile_id", authSession.user.id)
        .eq("provider_type", "apple_caldav");

      if (calendarError) throw calendarError;

      removeLocalStorageKey(`${cachedAppDataKeyPrefix}${authSession.user.id}`);
      await refreshAppleCalendarAccounts();
      await refreshExternalCalendarSettings({ silent: true });
      await reloadData(selectedId, { silent: true, source: "apple-connect" });
    } catch (disconnectError) {
      setExternalCalendarSettingsError(getUserFacingErrorMessage(disconnectError, "Impossible de déconnecter Apple Calendar."));
    } finally {
      setConnectingAppleCalendar(false);
    }
  }

  async function connectGoogleCalendar() {
    if (!authSession) throw new Error(sessionExpiredMessage);

    setConnectingGoogleCalendar(true);
    setExternalCalendarSettingsError(null);
    try {
      const accessToken = await getServerApiAccessToken(authSession.access_token);
      const response = await fetch(getAppApiUrl("/api/calendar/google/connect", "Connexion Google momentanément indisponible."), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json().catch(() => null)) as { authUrl?: string; error?: string } | null;

      if (!response.ok || !payload?.authUrl) {
        throw new Error(payload?.error ?? "Impossible de lancer la connexion Google.");
      }

      window.location.assign(payload.authUrl);
    } catch (connectError) {
      setExternalCalendarSettingsError(getUserFacingErrorMessage(connectError, "Impossible de connecter Google Calendar."));
    } finally {
      setConnectingGoogleCalendar(false);
    }
  }

  async function disconnectGoogleCalendar(account: GoogleCalendarAccount) {
    if (!authSession) throw new Error(sessionExpiredMessage);

    setUpdatingGoogleCalendarKey(`disconnect:${account.id}`);
    setExternalCalendarSettingsError(null);
    try {
      const accessToken = await getServerApiAccessToken(authSession.access_token);
      const response = await fetch(getAppApiUrl("/api/calendar/google/disconnect", "Déconnexion Google momentanément indisponible."), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ accountId: account.id }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Impossible de déconnecter Google Calendar.");
      }

      if (supabase) {
        const { error: calendarDisableError } = await supabase
          .from("external_calendars")
          .update({
            sync_enabled: false,
            last_sync_status: "idle",
            last_sync_error: null,
          })
          .eq("provider_account_id", account.id)
          .eq("created_by_profile_id", authSession.user.id)
          .eq("provider_type", "google");
        if (calendarDisableError) throw calendarDisableError;
      }
      removeLocalStorageKey(`${cachedAppDataKeyPrefix}${authSession.user.id}`);
      await refreshGoogleCalendarAccounts();
      await refreshExternalCalendarSettings({ silent: true });
      await reloadData(selectedId, { silent: true, source: "google-disconnect" });
    } catch (disconnectError) {
      setExternalCalendarSettingsError(getUserFacingErrorMessage(disconnectError, "Impossible de déconnecter Google Calendar."));
    } finally {
      setUpdatingGoogleCalendarKey(null);
    }
  }

  async function syncGoogleEventAction(action: "create" | "update" | "delete", eventId: string, externalCalendarId?: string | null) {
    if (!authSession) {
      throw new Error(sessionExpiredMessage);
    }
    if (!online) {
      throw new Error("La synchronisation Google nécessite une connexion.");
    }

    const selectedCalendar = externalCalendarId ? externalCalendars.find((calendar) => calendar.id === externalCalendarId) ?? null : null;
    if (!selectedCalendar && externalCalendarId) {
      console.warn("External calendar selected for Google sync was not found.", { eventId, externalCalendarId });
    }

    const accessToken = await getServerApiAccessToken(authSession.access_token);
    const response = await fetch(getAppApiUrl("/api/calendar/google/events", "Synchronisation Google Calendar momentanément indisponible."), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, eventId, externalCalendarId }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string; externalEventId?: string; synced?: number } | null;

    if (!response.ok) {
      throw createEventEditorDiagnosticError(new Error(payload?.error ?? "Synchronisation calendrier impossible."), {
        stage: `google_${action}_route`,
        routeCalled: "/api/calendar/google/events",
        responseStatus: response.status,
        responseJson: payload,
        selectedCalendarId: externalCalendarId ?? null,
        selectedProvider: "google",
      });
    }

    return payload;
  }

  async function syncAppleEventAction(action: "create" | "update" | "delete" | "move", eventId: string, externalCalendarId?: string | null) {
    if (!authSession) {
      throw new Error(sessionExpiredMessage);
    }
    if (!online) {
      throw new Error("La synchronisation Apple nécessite une connexion.");
    }

    const accessToken = await getServerApiAccessToken(authSession.access_token);
    const response = await fetch(getAppApiUrl("/api/calendar/apple/events", "Synchronisation Apple Calendar momentanément indisponible."), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, eventId, externalCalendarId }),
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
      externalEventId?: string;
      synced?: number;
      warning?: string;
    } | null;
    if (!response.ok) {
      const routeMessage = payload?.message ?? payload?.error ?? "Synchronisation Apple Calendar impossible.";
      console.error("Apple event sync route failed", {
        action,
        eventId,
        externalCalendarId: externalCalendarId ?? null,
        status: response.status,
        message: routeMessage,
      });
      throw createEventEditorDiagnosticError(new Error(action === "move" ? "Déplacement Apple impossible." : routeMessage), {
        stage: `apple_${action}_route`,
        routeCalled: "/api/calendar/apple/events",
        responseStatus: response.status,
        responseJson: payload,
        selectedCalendarId: externalCalendarId ?? null,
        selectedProvider: "apple_caldav",
      });
    }

    return payload;
  }

  async function syncProviderEventAction(action: "create" | "update" | "delete", eventId: string, externalCalendarId?: string | null) {
    const selectedCalendar = externalCalendarId ? externalCalendars.find((calendar) => calendar.id === externalCalendarId) ?? null : null;
    if (externalCalendarId && !selectedCalendar) {
      throw new Error("Calendrier introuvable.");
    }

    if (selectedCalendar?.providerType === "apple_caldav") {
      return syncAppleEventAction(action, eventId, externalCalendarId);
    }
    if (selectedCalendar?.providerType === "google") {
      return syncGoogleEventAction(action, eventId, externalCalendarId);
    }

    const event = events.find((item) => item.id === eventId) ?? null;
    const hasAppleLinks = event ? getEventAppleLinks(event).length > 0 : false;
    const hasGoogleLinks = event ? getEventGoogleLinks(event).length > 0 : false;
    const results: Array<{ error?: string; externalEventId?: string; synced?: number } | null | undefined> = [];
    if (hasGoogleLinks) results.push(await syncGoogleEventAction(action, eventId));
    if (hasAppleLinks) results.push(await syncAppleEventAction(action, eventId));
    return {
      synced: results.reduce((count, result) => count + (result?.synced ?? (result?.externalEventId ? 1 : 0)), 0),
      externalEventId: results.find((result) => result?.externalEventId)?.externalEventId,
    };
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
        provider_type: "ics_read_only",
        calendar_role: "external_context",
        sync_capability: "read_only",
        sync_enabled: true,
        created_by_profile_id: profile.id,
        created_by_name: actorName,
      });

    if (insertError) throw insertError;
    await refreshExternalCalendarSettings({ silent: true });
  }

  async function reorderExternalCalendars(orderedCalendars: ExternalCalendar[]) {
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    const supabaseClient = supabase;
    if (orderedCalendars.some((calendar) => !canManageExternalCalendar(permissions, profile, calendar))) {
      throw new Error("Vous ne pouvez modifier que vos calendriers.");
    }
    const firstCalendar = orderedCalendars[0];
    if (!firstCalendar) return;
    const groupKey = getExternalCalendarGroupKey(firstCalendar);
    if (orderedCalendars.some((calendar) => !calendar.syncEnabled || getExternalCalendarGroupKey(calendar) !== groupKey)) return;

    const activeGroupCalendars = externalCalendars
      .filter((item) => item.syncEnabled && getExternalCalendarGroupKey(item) === groupKey)
      .sort(compareExternalCalendarDisplayOrder);
    const orderedIds = new Set(orderedCalendars.map((calendar) => calendar.id));
    const reorderedGroup = [
      ...orderedCalendars,
      ...activeGroupCalendars.filter((calendar) => !orderedIds.has(calendar.id)),
    ];
    const updates = reorderedGroup.map((item, index) => ({
      id: item.id,
      sortOrder: index + 1,
    }));
    const updateById = new Map(updates.map((item) => [item.id, item.sortOrder]));
    const previousCalendars = externalCalendars;

    setExternalCalendars((current) =>
      current.map((item) => (
        updateById.has(item.id)
          ? { ...item, sortOrder: updateById.get(item.id) ?? item.sortOrder }
          : item
      )),
    );

    const results = await Promise.all(
      updates.map((item) =>
        supabaseClient
          .from("external_calendars")
          .update({ sort_order: item.sortOrder })
          .eq("id", item.id),
      ),
    );
    const updateError = results.find((result) => result.error)?.error;
    if (updateError) {
      setExternalCalendars(previousCalendars);
      throw updateError;
    }
  }

  async function updateExternalCalendar(
    calendar: ExternalCalendar,
    input: { name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility; syncEnabled?: boolean },
  ) {
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    if (!canManageExternalCalendar(permissions, profile, calendar)) {
      throw new Error("Vous ne pouvez modifier que vos calendriers.");
    }
    const visibility = permissions.canManageEvents ? input.visibility : "private";
    const icsUrl = normalizeExternalCalendarIcsUrl(input.icsUrl);

    if ((calendar.providerType === "google" || calendar.providerType === "apple_caldav") && calendar.providerAccountId && calendar.providerCalendarId) {
      const accessToken = await getServerApiAccessToken(authSession?.access_token);
      const apiPath = calendar.providerType === "google" ? "/api/calendar/google/calendars" : "/api/calendar/apple/calendars";
      const response = await fetch(getAppApiUrl(apiPath, "Calendrier momentanément indisponible."), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "update_settings",
          accountId: calendar.providerAccountId,
          calendarId: calendar.id,
          providerCalendarId: calendar.providerCalendarId,
          color: input.color,
          visibility,
          enabled: input.syncEnabled ?? calendar.syncEnabled,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; calendarId?: string | null; calendar?: ExternalCalendarRow | null } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Impossible de modifier ce calendrier.");
      }
      if (payload?.calendar) mergeRefetchedExternalCalendar(payload.calendar);
      await refreshExternalCalendarSettings({ silent: true });
      if (calendar.providerType === "google") {
        await refreshGoogleCalendarAccounts();
      } else {
        await refreshAppleCalendarAccounts();
      }
      if (payload?.calendar) mergeRefetchedExternalCalendar(payload.calendar);
      return;
    }

    const { error: updateError } = await supabase
      .from("external_calendars")
      .update({
        name: input.name.trim(),
        ics_url: icsUrl,
        color: input.color,
        visibility,
        provider_type: calendar.providerType,
        calendar_role: calendar.calendarRole ?? "external_context",
        sync_capability: calendar.syncCapability,
        sync_enabled: input.syncEnabled ?? calendar.syncEnabled,
      })
      .eq("id", calendar.id);

    if (updateError) throw updateError;
    await refreshExternalCalendarSettings({ silent: true });
    if (calendar.providerType === "google") {
      await refreshGoogleCalendarAccounts();
    } else if (calendar.providerType === "apple_caldav") {
      await refreshAppleCalendarAccounts();
    }
  }

  async function syncExternalCalendar(
    calendar: ExternalCalendar,
    options: { postSyncRefresh?: boolean; source?: string } = {},
  ): Promise<ExternalCalendarSyncResult> {
    const postSyncRefresh = options.postSyncRefresh ?? true;
    const source = options.source ?? "manual";
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    if (!canManageExternalCalendar(permissions, profile, calendar)) {
      throw new Error("Vous ne pouvez synchroniser que vos calendriers.");
    }
    if (!online) {
      throw new Error("La synchronisation du calendrier nécessite une connexion.");
    }

    const isGoogleBidirectionalCalendar = calendar.providerType === "google" && calendar.syncCapability === "bidirectional";
    const isAppleBidirectionalCalendar = calendar.providerType === "apple_caldav" && calendar.syncCapability === "bidirectional";
    if (isGoogleBidirectionalCalendar && googleSyncInFlightRef.current) {
      throw new Error("Synchronisation Google déjà en cours.");
    }
    if (isAppleBidirectionalCalendar && (appleSyncInFlightRef.current || appleAutoSyncRunningRef.current)) {
      throw new Error("Synchronisation Apple déjà en cours.");
    }
    if (isGoogleBidirectionalCalendar) {
      googleSyncInFlightRef.current = true;
    }
    if (isAppleBidirectionalCalendar) {
      appleSyncInFlightRef.current = true;
    }

    setSyncingExternalCalendarId(calendar.id);
    setExternalCalendarSyncProgress(null);
    setExternalCalendarSettingsError(null);

    try {
      const accessToken = await getServerApiAccessToken(authSession?.access_token);
      const syncStartMs = performance.now();
      logNetworkDebug("provider-sync:start", {
        source,
        calendarId: calendar.id,
        calendarName: calendar.name,
        providerType: calendar.providerType,
        postSyncRefresh,
      });

      if (calendar.providerType === "google" && calendar.syncCapability === "bidirectional") {
        const response = await fetch(getAppApiUrl("/api/calendar/google/sync", "Synchronisation Google Calendar momentanément indisponible."), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ externalCalendarId: calendar.id }),
        });
        const syncPayload = (await response.json().catch(() => null)) as GooglePullSyncApiResponse | null;
        if (!response.ok || syncPayload?.success === false) {
          const diagnostic = getGooglePullSyncErrorDetails(syncPayload);
          console.error("Google pull sync failed response", {
            status: response.status,
            payload: syncPayload,
            stage: diagnostic.stage,
            errorMessage: diagnostic.message,
            errorCode: diagnostic.code,
            errorDetails: diagnostic.details,
            errorHint: diagnostic.hint,
          });
          throw new Error(syncPayload?.message?.trim() || "Impossible de synchroniser Google Calendar.");
        }
        if (postSyncRefresh) {
          await refreshExternalCalendarSettings({ silent: true });
          await reloadData(selectedId, { silent: true, source: source === "manual" ? "google-manual-sync" : source });
        }
        logNetworkDebug("provider-sync:complete", {
          source,
          calendarId: calendar.id,
          providerType: calendar.providerType,
          durationMs: Math.round(performance.now() - syncStartMs),
          synced: syncPayload?.synced ?? 0,
          created: syncPayload?.created ?? 0,
          updated: syncPayload?.updated ?? 0,
          deleted: syncPayload?.deleted ?? 0,
          postSyncRefresh,
        });
        return {
          synced: syncPayload?.synced ?? 0,
          total: syncPayload?.total ?? 0,
          created: syncPayload?.created ?? 0,
          updated: syncPayload?.updated ?? 0,
          unchanged: syncPayload?.unchanged ?? 0,
          conflicts: syncPayload?.conflicts ?? 0,
          deleted: syncPayload?.deleted ?? 0,
        };
      }

      if (calendar.providerType === "apple_caldav") {
        const response = await fetch(getAppApiUrl("/api/calendar/apple/sync", "Synchronisation Apple Calendar momentanément indisponible."), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ externalCalendarId: calendar.id, triggerSource: "manual" }),
        });
        const syncPayload = (await response.json().catch(() => null)) as ApplePullSyncApiResponse | null;
        if (!response.ok || syncPayload?.success === false) {
          console.error("Apple pull sync failed response", {
            status: response.status,
            payload: syncPayload,
          });
          throw new Error(syncPayload?.message?.trim() || "Impossible de synchroniser Apple Calendar.");
        }
        if (postSyncRefresh) {
          await refreshExternalCalendarSettings({ silent: true });
          await reloadData(selectedId, { silent: true, source: source === "manual" ? "apple-manual-sync" : source });
        }
        logNetworkDebug("provider-sync:complete", {
          source,
          calendarId: calendar.id,
          providerType: calendar.providerType,
          durationMs: Math.round(performance.now() - syncStartMs),
          synced: syncPayload?.synced ?? 0,
          created: syncPayload?.created ?? 0,
          updated: syncPayload?.updated ?? 0,
          deleted: syncPayload?.deleted ?? 0,
          postSyncRefresh,
        });
        return {
          synced: syncPayload?.synced ?? 0,
          total: syncPayload?.total ?? 0,
          created: syncPayload?.created ?? 0,
          updated: syncPayload?.updated ?? 0,
          unchanged: syncPayload?.unchanged ?? 0,
          conflicts: syncPayload?.conflicts ?? 0,
          deleted: syncPayload?.deleted ?? 0,
        };
      }

      if (calendar.providerType !== "ics_read_only" || calendar.syncCapability !== "read_only") {
        throw new Error("Ce calendrier n'utilise pas la synchronisation ICS.");
      }
      if (!calendar.icsUrl.trim()) {
        throw new Error("Ajoutez une URL ICS avant de synchroniser.");
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
        const apiErrorMessage = errorPayload?.error ?? response.statusText;
        if (response.status === 401 || isSessionExpiredError(apiErrorMessage)) {
          await handleInvalidAuthSession();
          throw new Error(sessionExpiredMessage);
        }
        console.error("External calendar ICS fetch API failed", {
          calendarId: calendar.id,
          status: response.status,
          error: apiErrorMessage,
        });
        throw new Error(apiErrorMessage || "Impossible de récupérer le flux ICS.");
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

      await refreshExternalCalendarSettings({ silent: true });
      if (rows.length >= 100) {
        await createNotification({
          type: "external_calendar_sync_completed",
          title: "Calendrier synchronisé",
          body: `${calendar.name}: ${rows.length} événements synchronisés.`,
        });
      }
      return { synced: rows.length, total: parsedEvents.length };
    } finally {
      if (isGoogleBidirectionalCalendar) {
        googleSyncInFlightRef.current = false;
      }
      if (isAppleBidirectionalCalendar) {
        appleSyncInFlightRef.current = false;
      }
      setSyncingExternalCalendarId(null);
      setExternalCalendarSyncProgress(null);
    }
  }

  async function syncAppleCalendarSilently(input: {
    calendar: ExternalCalendar;
    syncWindow: { start: Date; end: Date };
    source: "interval" | "online" | "foreground" | "launch";
    enabledAppleCalendars: number;
    reloadAfter?: boolean;
  }) {
    const { calendar, syncWindow, source, enabledAppleCalendars, reloadAfter = true } = input;
    const syncStartedAt = new Date().toISOString();
    const syncStartMs = performance.now();
    const beforeVisibleEvents = visibleProductionEventsRef.current;
    const beforeVisibleSignature = getProductionEventSignature(beforeVisibleEvents);
    logNetworkDebug("apple-sync:start", {
      source,
      calendarId: calendar.id,
      calendarName: calendar.name,
      enabledAppleCalendars,
      reloadAfter,
      syncStartedAt,
      syncWindowStart: syncWindow.start.toISOString(),
      syncWindowEnd: syncWindow.end.toISOString(),
    });

    const accessToken = await getServerApiAccessToken(authSession?.access_token);
    const requestStartMs = performance.now();
    const response = await fetch(getAppApiUrl("/api/calendar/apple/sync", "Synchronisation Apple Calendar momentanément indisponible."), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        externalCalendarId: calendar.id,
        syncWindowStart: syncWindow.start.toISOString(),
        syncWindowEnd: syncWindow.end.toISOString(),
        triggerSource: source,
      }),
    });
    const requestDurationMs = Math.round(performance.now() - requestStartMs);
    const syncPayload = (await response.json().catch(() => null)) as ApplePullSyncApiResponse | null;
    if (!response.ok || syncPayload?.success === false) {
      logNetworkDebug("apple-sync:failed", {
        source,
        calendarId: calendar.id,
        status: response.status,
        requestDurationMs,
        payload: syncPayload,
      });
      throw new Error(syncPayload?.message?.trim() || "Impossible de synchroniser Apple Calendar.");
    }
    let reloadResult: Awaited<ReturnType<typeof reloadData>> = null;
    let reloadDurationMs: number | null = null;
    if (reloadAfter) {
      const reloadStartMs = performance.now();
      reloadResult = await reloadData(selectedIdRef.current, { silent: true, source: `apple-auto-${source}` });
      reloadDurationMs = Math.round(performance.now() - reloadStartMs);
    }
    const viewer = getCalendarVisibilityViewer(profile, authSession?.user.id ?? null);
    const afterVisibleEvents = reloadResult
      ? getVisibleProductionEventsForSelection(reloadResult.events, reloadResult.externalCalendars, viewer)
      : beforeVisibleEvents;
    const afterVisibleSignature = reloadResult ? getProductionEventSignature(afterVisibleEvents) : "";
    logNetworkDebug("apple-sync:complete", {
      source,
      calendarId: calendar.id,
      calendarName: calendar.name,
      enabledAppleCalendars,
      reloadAfter,
      syncStartedAt,
      syncFinishedAt: new Date().toISOString(),
      syncWindowStart: syncWindow.start.toISOString(),
      syncWindowEnd: syncWindow.end.toISOString(),
      requestedSyncWindowAccepted: syncPayload?.diagnostics?.requestedSyncWindow ?? null,
      routeSyncWindowStart: syncPayload?.diagnostics?.syncWindowStart ?? null,
      routeSyncWindowEnd: syncPayload?.diagnostics?.syncWindowEnd ?? null,
      requestDurationMs,
      routeDurationMs: syncPayload?.diagnostics?.routeDurationMs ?? null,
      calDavRequestStartedAt: syncPayload?.diagnostics?.calDavRequestStartedAt ?? null,
      calDavRequestFinishedAt: syncPayload?.diagnostics?.calDavRequestFinishedAt ?? null,
      calDavDurationMs: syncPayload?.diagnostics?.calDavDurationMs ?? null,
      rawResponseCount: syncPayload?.diagnostics?.rawResponseCount ?? null,
      eventsFetched: syncPayload?.diagnostics?.calDavEventsFetched ?? syncPayload?.synced ?? 0,
      created: syncPayload?.created ?? 0,
      updated: syncPayload?.updated ?? 0,
      deleted: syncPayload?.deleted ?? 0,
      skipped: syncPayload?.skipped ?? 0,
      totalSyncDurationMs: Math.round(performance.now() - syncStartMs),
      reloadDataCalled: reloadAfter,
      reloadDurationMs,
      reloadFromCache: reloadResult?.fromCache ?? null,
      visibleEventsBefore: beforeVisibleEvents.length,
      visibleEventsAfter: afterVisibleEvents.length,
      visibleEventsChanged: reloadAfter ? beforeVisibleSignature !== afterVisibleSignature : null,
    });
    return syncPayload;
  }

  useEffect(() => {
    if (typeof window === "undefined" || !hasMounted) return;

    async function runAutomaticGoogleSync(source: "interval" | "online" | "visible") {
      if (!authSession || !profile) return;
      if (!onlineRef.current) return;
      if (document.visibilityState !== "visible") return;
      if (writableGoogleCalendars.length === 0) return;
      if (googleAutoSyncRunningRef.current || googleSyncInFlightRef.current || syncingExternalCalendarId) return;

      const now = Date.now();
      if (now - googleAutoSyncLastStartedAtRef.current < GOOGLE_AUTO_SYNC_MIN_GAP_MS) return;

      googleAutoSyncRunningRef.current = true;
      googleAutoSyncLastStartedAtRef.current = now;
      setGoogleAutoSyncStatus((current) => ({ ...current, state: "syncing", error: null }));
      const syncResults: ExternalCalendarSyncResult[] = [];

      try {
        const batchStartMs = performance.now();
        for (const calendar of writableGoogleCalendars) {
          if (!onlineRef.current || document.visibilityState !== "visible") break;
          const result = await syncExternalCalendar(calendar, { postSyncRefresh: false, source: `google-auto-${source}` });
          syncResults.push(result);
        }
        if (syncResults.length > 0) {
          await reloadData(selectedIdRef.current, { silent: true, source: `google-auto-${source}-batch` });
        }
        logNetworkDebug("google-sync:batch-complete", {
          source,
          finishedAt: new Date().toISOString(),
          enabledGoogleCalendars: writableGoogleCalendars.length,
          syncedCalendars: syncResults.length,
          synced: syncResults.reduce((total, result) => total + (result.synced ?? 0), 0),
          created: syncResults.reduce((total, result) => total + (result.created ?? 0), 0),
          updated: syncResults.reduce((total, result) => total + (result.updated ?? 0), 0),
          deleted: syncResults.reduce((total, result) => total + (result.deleted ?? 0), 0),
          totalDurationMs: Math.round(performance.now() - batchStartMs),
          reloadDataCalled: syncResults.length > 0,
        });
        setGoogleAutoSyncStatus({
          state: "idle",
          lastSyncedAt: new Date().toISOString(),
          error: null,
        });
      } catch (syncError) {
        if (syncResults.length > 0) {
          await reloadData(selectedIdRef.current, { silent: true, source: `google-auto-${source}-partial` });
        }
        const message = getUserFacingErrorMessage(syncError, "Erreur de synchronisation Google.");
        console.error("Automatic Google Calendar sync failed", {
          source,
          message,
          technicalMessage: getRawErrorMessage(syncError),
        });
        setGoogleAutoSyncStatus((current) => ({
          state: "error",
          lastSyncedAt: current.lastSyncedAt,
          error: message,
        }));
      } finally {
        googleAutoSyncRunningRef.current = false;
      }
    }

    async function runAutomaticAppleSync(source: "interval" | "online" | "foreground" | "launch") {
      const attemptedAt = new Date().toISOString();
      if (!authSession || !profile) {
        logNetworkDebug("apple-sync:skipped", { source, attemptedAt, reason: "missing_session_or_profile" });
        return;
      }
      if (loading) {
        logNetworkDebug("apple-sync:skipped", { source, attemptedAt, reason: "initial_data_loading" });
        return;
      }
      if (!onlineRef.current) {
        logNetworkDebug("apple-sync:skipped", { source, attemptedAt, reason: "offline" });
        return;
      }
      if (document.visibilityState !== "visible") {
        logNetworkDebug("apple-sync:skipped", { source, attemptedAt, reason: "not_visible", visibilityState: document.visibilityState });
        return;
      }
      if (writableAppleCalendars.length === 0) {
        logNetworkDebug("apple-sync:skipped", { source, attemptedAt, reason: "no_enabled_apple_calendars" });
        return;
      }
      if (appleAutoSyncRunningRef.current || appleSyncInFlightRef.current || syncingExternalCalendarId) {
        logNetworkDebug("apple-sync:skipped", {
          source,
          attemptedAt,
          reason: "sync_in_flight",
          appleAutoSyncRunning: appleAutoSyncRunningRef.current,
          appleSyncInFlight: appleSyncInFlightRef.current,
          syncingExternalCalendarId,
        });
        return;
      }

      const now = Date.now();
      if (source === "foreground") {
        const foregroundDebounceRemainingMs = APPLE_FOREGROUND_SYNC_DEBOUNCE_MS - (now - appleForegroundSyncLastTriggeredAtRef.current);
        if (foregroundDebounceRemainingMs > 0) {
          logNetworkDebug("apple-sync:skipped", {
            source,
            attemptedAt,
            reason: "foreground_debounced",
            foregroundDebounceRemainingMs,
          });
          return;
        }
        appleForegroundSyncLastTriggeredAtRef.current = now;
      }
      const throttleRemainingMs = APPLE_AUTO_SYNC_MIN_GAP_MS - (now - appleAutoSyncLastStartedAtRef.current);
      if (source !== "foreground" && throttleRemainingMs > 0) {
        logNetworkDebug("apple-sync:skipped", {
          source,
          attemptedAt,
          reason: "throttled",
          throttleRemainingMs,
          lastStartedAtMs: appleAutoSyncLastStartedAtRef.current,
        });
        return;
      }

      appleAutoSyncRunningRef.current = true;
      appleAutoSyncLastStartedAtRef.current = now;
      const syncResults: ApplePullSyncApiResponse[] = [];

      try {
        const syncWindow = visibleAppleSyncWindowRef.current ?? getMonthSyncWindow(new Date());
        const batchStartMs = performance.now();
        const beforeVisibleEvents = visibleProductionEventsRef.current;
        const beforeVisibleSignature = getProductionEventSignature(beforeVisibleEvents);
        for (const calendar of writableAppleCalendars) {
          if (!onlineRef.current || document.visibilityState !== "visible") break;
          const syncResult = await syncAppleCalendarSilently({
            calendar,
            syncWindow,
            source,
            enabledAppleCalendars: writableAppleCalendars.length,
            reloadAfter: false,
          });
          syncResults.push(syncResult ?? {});
        }
        const reloadStartMs = performance.now();
        const reloadResult = syncResults.length > 0
          ? await reloadData(selectedIdRef.current, { silent: true, source: `apple-auto-${source}-batch` })
          : null;
        const reloadDurationMs = syncResults.length > 0 ? Math.round(performance.now() - reloadStartMs) : null;
        const viewer = getCalendarVisibilityViewer(profile, authSession?.user.id ?? null);
        const afterVisibleEvents = reloadResult
          ? getVisibleProductionEventsForSelection(reloadResult.events, reloadResult.externalCalendars, viewer)
          : beforeVisibleEvents;
        logNetworkDebug("apple-sync:batch-complete", {
          source,
          attemptedAt,
          finishedAt: new Date().toISOString(),
          enabledAppleCalendars: writableAppleCalendars.length,
          syncedCalendars: syncResults.length,
          syncWindowStart: syncWindow.start.toISOString(),
          syncWindowEnd: syncWindow.end.toISOString(),
          routeDurationMsTotal: syncResults.reduce((total, result) => total + (result.diagnostics?.routeDurationMs ?? 0), 0),
          calDavDurationMsTotal: syncResults.reduce((total, result) => total + (result.diagnostics?.calDavDurationMs ?? 0), 0),
          eventsFetched: syncResults.reduce((total, result) => total + (result.diagnostics?.calDavEventsFetched ?? result.synced ?? 0), 0),
          created: syncResults.reduce((total, result) => total + (result.created ?? 0), 0),
          updated: syncResults.reduce((total, result) => total + (result.updated ?? 0), 0),
          deleted: syncResults.reduce((total, result) => total + (result.deleted ?? 0), 0),
          skipped: syncResults.reduce((total, result) => total + (result.skipped ?? 0), 0),
          totalDurationMs: Math.round(performance.now() - batchStartMs),
          reloadDataCalled: syncResults.length > 0,
          reloadDurationMs,
          reloadFromCache: reloadResult?.fromCache ?? null,
          visibleEventsBefore: beforeVisibleEvents.length,
          visibleEventsAfter: afterVisibleEvents.length,
          visibleEventsChanged: reloadResult ? beforeVisibleSignature !== getProductionEventSignature(afterVisibleEvents) : null,
        });
      } catch (syncError) {
        if (syncResults.length > 0) {
          await reloadData(selectedIdRef.current, { silent: true, source: `apple-auto-${source}-partial` });
        }
        console.error("Automatic Apple Calendar sync failed", {
          source,
          message: getUserFacingErrorMessage(syncError, "Erreur de synchronisation Apple."),
          technicalMessage: getRawErrorMessage(syncError),
        });
      } finally {
        appleAutoSyncRunningRef.current = false;
      }
    }

    async function runAutomaticExternalCalendarSync(source: "interval" | "online") {
      await runAutomaticGoogleSync(source);
      await runAutomaticAppleSync(source);
    }

    const intervalId = window.setInterval(() => {
      logNetworkDebug("auto-sync:interval-fired", { firedAt: new Date().toISOString(), intervalMs: GOOGLE_AUTO_SYNC_INTERVAL_MS });
      void runAutomaticExternalCalendarSync("interval");
    }, GOOGLE_AUTO_SYNC_INTERVAL_MS);

    function handleOnline() {
      logNetworkDebug("auto-sync:online-fired", { triggeredAt: new Date().toISOString() });
      void runAutomaticExternalCalendarSync("online");
    }

    function handleForeground(source: "visibilitychange" | "focus" | "pageshow") {
      if (document.visibilityState !== "visible") return;
      logNetworkDebug("auto-sync:foreground-fired", { source, triggeredAt: new Date().toISOString() });
      void runAutomaticAppleSync("foreground");
      void runAutomaticGoogleSync("visible");
    }

    function handleVisibilityChange() {
      handleForeground("visibilitychange");
    }

    function handleFocus() {
      handleForeground("focus");
    }

    function handlePageShow() {
      handleForeground("pageshow");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let launchSyncTimer: number | null = null;
    const launchKey = authSession && profile && writableAppleCalendars.length > 0
      ? `${authSession.user.id}:${writableAppleCalendars.map((calendar) => calendar.id).sort().join(",")}`
      : null;
    if (launchKey && appleAutoSyncLaunchKeyRef.current !== launchKey) {
      logNetworkDebug("apple-sync:launch-scheduled", {
        scheduledAt: new Date().toISOString(),
        delayMs: APPLE_AUTO_SYNC_LAUNCH_DELAY_MS,
        enabledAppleCalendars: writableAppleCalendars.length,
      });
      launchSyncTimer = window.setTimeout(() => {
        appleAutoSyncLaunchKeyRef.current = launchKey;
        logNetworkDebug("apple-sync:launch-fired", { triggeredAt: new Date().toISOString() });
        void runAutomaticAppleSync("launch");
      }, APPLE_AUTO_SYNC_LAUNCH_DELAY_MS);
    }

    return () => {
      if (launchSyncTimer !== null) {
        window.clearTimeout(launchSyncTimer);
      }
      window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authSession, hasMounted, loading, online, profile, syncingExternalCalendarId, writableAppleCalendars, writableGoogleCalendars]);

  async function deleteExternalCalendar(calendar: ExternalCalendar) {
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    if (!canManageExternalCalendar(permissions, profile, calendar)) {
      throw new Error("Vous ne pouvez supprimer que vos calendriers.");
    }

    if ((calendar.providerType === "google" || calendar.providerType === "apple_caldav") && calendar.providerAccountId && calendar.providerCalendarId) {
      const accessToken = await getServerApiAccessToken(authSession?.access_token);
      const apiPath = calendar.providerType === "google" ? "/api/calendar/google/calendars" : "/api/calendar/apple/calendars";
      const response = await fetch(getAppApiUrl(apiPath, "Calendrier momentanément indisponible."), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "remove",
          accountId: calendar.providerAccountId,
          calendarId: calendar.id,
          providerCalendarId: calendar.providerCalendarId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; calendarId?: string | null; calendar?: ExternalCalendarRow | null } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Impossible de retirer ce calendrier.");
      }
      if (payload?.calendar) mergeRefetchedExternalCalendar(payload.calendar);
      await refreshExternalCalendarSettings({ silent: true });
      if (calendar.providerType === "google") {
        await refreshGoogleCalendarAccounts();
      } else {
        await refreshAppleCalendarAccounts();
      }
      if (payload?.calendar) mergeRefetchedExternalCalendar(payload.calendar);
      return;
    }

    const { error: deleteError } = await supabase
      .from("external_calendars")
      .delete()
      .eq("id", calendar.id);

    if (deleteError) throw deleteError;
    await refreshExternalCalendarSettings({ silent: true });
  }

  async function fetchActivityLog(eventId: string) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }
    const supabaseClient = supabase;

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

  async function markEventChangesRead(eventId: string) {
    if (!supabase || !profile?.id || !online) return;
    const readAt = new Date().toISOString();
    const read: EventActivityRead = { eventId, profileId: profile.id, readAt };

    setEventActivityReads((current) => {
      const withoutEvent = current.filter((item) => item.eventId !== eventId || item.profileId !== profile.id);
      return [...withoutEvent, read];
    });

    const { error: readError } = await supabase
      .from("event_activity_reads")
      .upsert(
        {
          event_id: eventId,
          profile_id: profile.id,
          read_at: readAt,
        },
        { onConflict: "event_id,profile_id" },
      );

    if (readError) {
      console.warn("Failed to mark event changes as read.", {
        eventId,
        profileId: profile.id,
        error: getDebugError(readError),
      });
    }
  }

  async function markEventItemsRead(eventId: string, itemKeys: string[]) {
    if (!supabase || !profile?.id || !online) return;
    const uniqueItemKeys = Array.from(new Set(itemKeys.filter(Boolean)));
    if (uniqueItemKeys.length === 0) return;

    const readAt = new Date().toISOString();
    const itemReads: EventActivityItemRead[] = uniqueItemKeys.map((itemKey) => ({ eventId, profileId: profile.id, itemKey, readAt }));

    setEventActivityItemReads((current) => {
      const itemKeySet = new Set(uniqueItemKeys);
      const withoutItems = current.filter((item) => item.eventId !== eventId || item.profileId !== profile.id || !itemKeySet.has(item.itemKey));
      return [...withoutItems, ...itemReads];
    });

    const { error: itemReadError } = await supabase
      .from("event_activity_item_reads")
      .upsert(
        uniqueItemKeys.map((itemKey) => ({
          event_id: eventId,
          profile_id: profile.id,
          item_key: itemKey,
          read_at: readAt,
        })),
        { onConflict: "event_id,profile_id,item_key" },
      );

    if (itemReadError) {
      console.warn("Failed to mark event item changes as read.", {
        eventId,
        profileId: profile.id,
        itemKeys: uniqueItemKeys,
        error: getDebugError(itemReadError),
      });
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
        created_by_profile_id: profile?.id ?? null,
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
    setUnreadActivities((current) => [mapEventUnreadActivity(data), ...current].slice(0, 1000));
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
      created_by_profile_id: profile?.id ?? null,
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
    const startMs = performance.now();
    logNetworkDebug("notifications-refresh:start", {
      silent: Boolean(options.silent),
      startedAt: new Date().toISOString(),
    });

    try {
      const nextNotifications = await fetchNotifications(profile.id);
      logNetworkDebug("notifications-refresh:complete", {
        durationMs: Math.round(performance.now() - startMs),
        count: nextNotifications.length,
        approxJsonBytes: getApproxJsonBytes(nextNotifications),
      });
      setNotifications(nextNotifications);
      cacheNotifications(profile.id, nextNotifications);
    } catch (notificationsError) {
      logNetworkDebug("notifications-refresh:error", {
        durationMs: Math.round(performance.now() - startMs),
        error: getRawErrorMessage(notificationsError),
      });
      if (!options.silent) {
        console.warn("Failed to load notifications.", notificationsError);
      }
    } finally {
      setNotificationsHydrated(true);
    }
  }

  async function refreshTasks(options: { silent?: boolean } = {}) {
    if (!supabase || !online) return;
    if (!options.silent) {
      setTasksLoading(true);
    }
    setTasksError(null);

    try {
      const nextTasks = await fetchTasks();
      setTasks(nextTasks);
      if (authSession?.user.id) {
        cacheAppData(authSession.user.id, {
          events,
          tasks: nextTasks,
          externalCalendars,
          externalCalendarEvents,
        }, profile);
      }
    } catch (taskLoadError) {
      console.error("Failed to load tasks.", getDebugError(taskLoadError));
      setTasksError(getUserFacingErrorMessage(taskLoadError, "Impossible de charger les tâches."));
    } finally {
      if (!options.silent) {
        setTasksLoading(false);
      }
    }
  }

  function upsertTaskInState(task: AppTask) {
    setTasks((current) => {
      const existingIndex = current.findIndex((item) => item.id === task.id);
      if (existingIndex === -1) return [task, ...current];
      return current.map((item) => (item.id === task.id ? task : item));
    });
  }

  async function createTask(input: TaskCreateInput) {
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    const title = input.title.trim();
    if (!title) throw new Error("Le titre de la tâche est obligatoire.");
    const canCreateTask = permissions.canManageEvents || input.assignedProfileId === profile?.id;
    if (!canCreateTask) throw new Error("Création de tâche non autorisée.");
    const assignedProfile = taskProfiles.find((userProfile) => userProfile.id === input.assignedProfileId) ?? null;
    const nextSortOrder = input.sortOrder ?? getNextTaskSortOrder(tasks, input.assignedProfileId ?? null);
    const payload: Database["public"]["Tables"]["tasks"]["Insert"] = {
      title,
      event_id: input.eventId ?? null,
      assigned_profile_id: input.assignedProfileId ?? null,
      status: "todo",
      priority: permissions.canManageEvents ? input.priority ?? "normal" : "normal",
      sort_order: nextSortOrder,
      due_date: input.dueDate || null,
      notes: input.notes?.trim() || null,
      created_by: authSession?.user.id ?? profile?.id ?? null,
    };
    const diagnosticBase: Omit<TaskCreateDiagnostic, "supabaseErrorCode" | "supabaseErrorMessage" | "supabaseErrorDetails" | "supabaseErrorHint"> = {
      currentUserId: authSession?.user.id ?? profile?.id ?? null,
      currentUserRole: profile?.role ?? null,
      assignedProfileId: input.assignedProfileId ?? null,
      assignedProfile: getTaskDiagnosticProfile(assignedProfile),
      eventId: input.eventId ?? null,
      taskTitle: title,
      dueDate: input.dueDate || null,
    };

    console.info("[MSTV tasks] create payload", diagnosticBase);

    const { data, error: insertError } = await supabase
      .from("tasks")
      .insert(payload)
      .select()
      .single();

    if (insertError) {
      const diagnostic: TaskCreateDiagnostic = {
        ...diagnosticBase,
        supabaseErrorCode: getSupabaseErrorField(insertError, "code"),
        supabaseErrorMessage: getSupabaseErrorField(insertError, "message"),
        supabaseErrorDetails: getSupabaseErrorField(insertError, "details"),
        supabaseErrorHint: getSupabaseErrorField(insertError, "hint"),
      };
      console.error("[MSTV tasks] create failed", diagnostic);
      throw createTaskInsertError(insertError, diagnostic);
    }
    const createdTask = mapTask(data);
    upsertTaskInState(createdTask);
    if (createdTask.eventId) {
      await logEventActivity({
        eventId: createdTask.eventId,
        actionType: "task_created",
        entityType: "task",
        entityId: createdTask.id,
        description: `Tâche ${createdTask.title} créée`,
        newValue: {
          title: createdTask.title,
          assignedProfileId: createdTask.assignedProfileId,
          dueDate: createdTask.dueDate,
          status: createdTask.status,
        },
      });
    }
    return createdTask;
  }

  async function updateTask(task: AppTask, patch: TaskUpdatePatch) {
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    const assignedToCurrentProfile = Boolean(profile?.id && task.assignedProfileId === profile.id);
    const createdByCurrentProfile = Boolean(profile?.id && task.createdBy === profile.id);
    const statusOnlyFields = new Set(["status"]);
    const reorderOnlyFields = new Set(["sortOrder"]);
    const ownAllowedFields = new Set(["title", "dueDate", "notes", "status", "sortOrder"]);
    const patchKeys = Object.keys(patch);
    const canUpdateTask = permissions.canManageEvents ||
      (assignedToCurrentProfile && patchKeys.every((key) => statusOnlyFields.has(key))) ||
      (assignedToCurrentProfile && !isTaskUrgent(task) && patchKeys.every((key) => reorderOnlyFields.has(key))) ||
      (assignedToCurrentProfile && createdByCurrentProfile && patchKeys.every((key) => ownAllowedFields.has(key) && (key !== "sortOrder" || !isTaskUrgent(task))));
    if (!canUpdateTask) throw new Error("Modification de tâche non autorisée.");
    if (patch.priority === "urgent" && !isTaskUrgent(task) && task.status === "todo") {
      const urgentSiblingCount = task.assignedProfileId ? countActiveUrgentTasksForProfile(tasks, task.assignedProfileId, task.id) : 0;
      if (urgentSiblingCount >= maxUrgentTasksPerPerson) {
        throw new Error(maxUrgentTasksMessage);
      }
    }

    const payload: Database["public"]["Tables"]["tasks"]["Update"] = {};
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title) throw new Error("Le titre de la tâche est obligatoire.");
      payload.title = title;
    }
    if (patch.assignedProfileId !== undefined) payload.assigned_profile_id = patch.assignedProfileId || null;
    if (patch.eventId !== undefined && permissions.canManageEvents) payload.event_id = patch.eventId || null;
    if (patch.dueDate !== undefined) payload.due_date = patch.dueDate || null;
    if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.priority !== undefined && permissions.canManageEvents) payload.priority = patch.priority;
    if (patch.sortOrder !== undefined && (permissions.canManageEvents || (assignedToCurrentProfile && !isTaskUrgent(task)))) payload.sort_order = patch.sortOrder;

    const { data, error: updateError } = await supabase
      .from("tasks")
      .update(payload)
      .eq("id", task.id)
      .select()
      .single();

    if (updateError) throw updateError;
    const updatedTask = mapTask(data);
    upsertTaskInState(updatedTask);

    const sortOnlyUpdate = patchKeys.length === 1 && patch.sortOrder !== undefined;
    const activityEventId = updatedTask.eventId ?? task.eventId;
    if (activityEventId && !sortOnlyUpdate) {
      await logEventActivity({
        eventId: activityEventId,
        actionType: "task_updated",
        entityType: "task",
        entityId: updatedTask.id,
        description: `Tâche ${updatedTask.title} modifiée`,
        previousValue: {
          title: task.title,
          assignedProfileId: task.assignedProfileId,
          dueDate: task.dueDate,
          notes: task.notes,
          status: task.status,
          priority: task.priority,
          eventId: task.eventId,
        },
        newValue: {
          title: updatedTask.title,
          assignedProfileId: updatedTask.assignedProfileId,
          dueDate: updatedTask.dueDate,
          notes: updatedTask.notes,
          status: updatedTask.status,
          priority: updatedTask.priority,
          eventId: updatedTask.eventId,
        },
      });
    }
  }

  async function reorderTasksForAssignee(orderedTasks: AppTask[], assignedProfileId: string | null) {
    const canReorderTasks = permissions.canManageEvents ||
      (
        assignedProfileId === profile?.id &&
        orderedTasks.every((task) => task.assignedProfileId === profile?.id && !isTaskUrgent(task))
      );
    if (!canReorderTasks) throw new Error("Modification de tâche non autorisée.");
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    const supabaseClient = supabase;
    if (orderedTasks.some((task) => task.assignedProfileId !== assignedProfileId || task.status !== "todo")) return;

    const updates = orderedTasks.map((task, index) => ({
      id: task.id,
      sortOrder: index + 1,
    }));
    const updateById = new Map(updates.map((item) => [item.id, item.sortOrder]));
    const previousTasks = tasks;

    setTasks((current) =>
      current.map((task) => (
        updateById.has(task.id)
          ? { ...task, sortOrder: updateById.get(task.id) ?? task.sortOrder }
          : task
      )),
    );

    const results = await Promise.all(
      updates.map((item) =>
        supabaseClient
          .from("tasks")
          .update({ sort_order: item.sortOrder })
          .eq("id", item.id),
      ),
    );
    const updateError = results.find((result) => result.error)?.error;
    if (updateError) {
      setTasks(previousTasks);
      throw updateError;
    }
  }

  async function deleteTask(task: AppTask) {
    const canDeleteTask = permissions.canManageEvents || Boolean(profile?.id && task.assignedProfileId === profile.id && task.createdBy === profile.id);
    if (!canDeleteTask) throw new Error("Suppression de tâche non autorisée.");
    if (!supabase) throw new Error("Configuration Supabase manquante.");

    const { error: deleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("id", task.id);

    if (deleteError) throw deleteError;
    setTasks((current) => current.filter((item) => item.id !== task.id));
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
    if (!importantNotificationTypes.has(input.type)) return;
    if (!profile?.id) return;
    const persist = options.persist ?? true;
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
    setCachedNotifications((current) => current.filter((item) => item.id !== notification.id));

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
      throw new Error(noCreatableCalendarMessage);
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
        await reloadData(selectedId, { silent: true, source: "pending-sync-replay" });
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

  function openTasksFromHeader() {
    setCreateMenuOpen(false);
    setScreen("tasks");
    setTasksNavigationRequest((request) => request + 1);
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

  function startEventDetailCarousel(delta: -1 | 1) {
    if (eventDetailCarousel) return;
    const targetEvent = chronologicalEvents[selectedEventIndex + delta];
    if (!targetEvent) return;
    setEventDetailCarousel({ direction: delta, targetId: targetEvent.id });
  }

  function finishEventDetailCarousel(targetId: string) {
    setSelectedId(targetId);
    setEventDetailCarousel(null);
  }

  function renderEventDetailPanel(eventToRender: ProductionEvent) {
    const eventIndex = chronologicalEvents.findIndex((item) => item.id === eventToRender.id);
    const panelHasPrevious = eventIndex > 0;
    const panelHasNext = eventIndex >= 0 && eventIndex < chronologicalEvents.length - 1;

    return (
      <ProductionDetail
        event={eventToRender}
        hasPrevious={panelHasPrevious}
        hasNext={panelHasNext}
        goPrevious={() => startEventDetailCarousel(-1)}
        goNext={() => startEventDetailCarousel(1)}
        showHeaderControls={showEventDetailDesktopControls}
        onEditEvent={() => {
          if (!permissions.canManageEvents) return;
          setEditingEvent(eventToRender);
          setEditingReturnScreen("detail");
          setCreateModalOpen(true);
        }}
        onAssignOptionTask={assignOptionTask}
        onUpdateOptionTaskDueDate={updateOptionTaskDueDate}
        onUpdateOptionTaskNotes={updateOptionTaskNotes}
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
        tasks={tasks}
        profiles={taskProfiles}
        unreadSummary={unreadChangeSummaries.get(eventToRender.id) ?? null}
        onMarkItemRead={(itemKey) => void markEventItemsRead(eventToRender.id, [itemKey])}
        onUpdateTask={updateTask}
        permissions={permissions}
        profile={profile}
      />
    );
  }

  function openQuoteImport(file: File | null = null) {
    if (file) {
      console.info("Quote PDF import handler called", {
        source: "openQuoteImport",
        fileName: file.name,
        fileType: file.type || "(empty)",
        fileSize: file.size,
      });
    }
    setQuoteImportFile(file);
    setQuoteImportOpen(true);
    setCreateMenuOpen(false);
  }

  function openQuoteImportFromDrop(dataTransfer: DataTransfer, source: string) {
    const files = getFilesFromTransfer(dataTransfer);
    const pdfFile = files.find(isPdfFile) ?? null;
    console.info("Quote PDF drop event", {
      source,
      fileCount: files.length,
      firstFileName: files[0]?.name ?? null,
      firstFileType: files[0]?.type || null,
      firstFileSize: files[0]?.size ?? null,
      pdfFileName: pdfFile?.name ?? null,
      importHandlerCalled: Boolean(pdfFile),
    });

    if (!pdfFile) {
      setGlobalQuoteDragActive(false);
      setError("Déposez un fichier PDF.");
      return;
    }

    setGlobalQuoteDragActive(false);
    setError(null);
    openQuoteImport(pdfFile);
  }

  function openNativeMstvIcsImport() {
    if (!permissions.canManageEvents) return;
    setError(legacyLocalCalendarImportDisabledMessage);
    setCreateMenuOpen(false);
  }

  async function createEvent(input: CreateEventInput) {
    assertCanManageEvents();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const normalizedInput = normalizeEventTimeInput(input);
    const eventId = createLocalId();
    const selectedCreateCalendar = normalizedInput.syncExternalCalendarId
      ? writableExternalCalendars.find((calendar) => calendar.id === normalizedInput.syncExternalCalendarId) ?? null
      : null;
    const createDiagnosticBase = {
      selectedCalendarId: normalizedInput.syncExternalCalendarId ?? null,
      selectedProvider: selectedCreateCalendar?.providerType ?? null,
    } satisfies EventEditorDiagnostic;
    if (!selectedCreateCalendar) {
      throw createEventEditorDiagnosticError(new Error(noCreatableCalendarMessage), {
        ...createDiagnosticBase,
        stage: "calendar_selection",
        routeCalled: "createEvent",
        responseStatus: null,
        responseJson: {
          availableCreatableCalendars: writableExternalCalendars.map((calendar) => ({
            id: calendar.id,
            name: calendar.name,
            providerType: calendar.providerType,
          })),
        },
      });
    }
    const eventInsertPayload: Database["public"]["Tables"]["events"]["Insert"] = {
      id: eventId,
      client_name: normalizedInput.clientName,
      event_name: normalizedInput.eventName,
      date: normalizedInput.date,
      is_all_day: normalizedInput.isAllDay,
      client_arrival_time: normalizedInput.clientArrivalTime || null,
      start_time: normalizedInput.startTime || null,
      end_time: normalizedInput.endTime || null,
      end_of_day_time: normalizedInput.endOfDayTime || null,
      location: normalizedInput.location.trim() || null,
      notes: normalizedInput.notes.trim() || null,
      event_role: "production",
      quote_reference: normalizedInput.quoteReference?.trim() || null,
      quote_version: normalizedInput.quoteVersion?.trim() || null,
      source_quote_text: normalizedInput.sourceQuoteText?.trim() || null,
      last_quote_imported_at: normalizedInput.sourceQuoteText || normalizedInput.quoteReference ? new Date().toISOString() : null,
      ...getCreatorInsertPayload(profile),
    };
    const optionDefinitions = uniqueLabels(normalizedInput.optionLabels ?? []).map((label) => {
      const defaultOption = defaultOptions.find((option) => normalizeLabel(option.label) === normalizeLabel(label));
      return {
        label,
        details: defaultOption?.details ?? "",
      };
    });
    if (!online) {
      throw new Error("Connexion Internet requise pour créer un événement dans un calendrier synchronisé.");
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert(eventInsertPayload)
      .select()
      .single();

    if (eventError) {
      console.error("MSTV event insert failed before Google sync", getDebugError(eventError));
      if (isNetworkOrUnavailableError(eventError)) {
        throw createEventEditorDiagnosticError(new Error("Connexion Internet requise pour créer un événement dans un calendrier synchronisé."), {
          ...createDiagnosticBase,
          stage: "supabase_event_insert",
          routeCalled: "supabase.events.insert",
          responseStatus: null,
          responseJson: {
            message: eventError.message,
            code: eventError.code,
            details: eventError.details,
            hint: eventError.hint,
          },
        });
      }
      throw createEventEditorDiagnosticError(eventError, {
        ...createDiagnosticBase,
        stage: "supabase_event_insert",
        routeCalled: "supabase.events.insert",
        responseStatus: null,
        responseJson: {
          message: eventError.message,
          code: eventError.code,
          details: eventError.details,
          hint: eventError.hint,
        },
      });
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

      if (optionError) {
        throw createEventEditorDiagnosticError(optionError, {
          ...createDiagnosticBase,
          stage: "supabase_option_insert",
          routeCalled: "supabase.event_options.insert",
          responseStatus: null,
          responseJson: {
            message: optionError.message,
            code: optionError.code,
            details: optionError.details,
            hint: optionError.hint,
          },
        });
      }
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
      if (optionItemError) {
        throw createEventEditorDiagnosticError(optionItemError, {
          ...createDiagnosticBase,
          stage: "supabase_option_item_insert",
          routeCalled: "supabase.event_option_items.insert",
          responseStatus: null,
          responseJson: {
            message: optionItemError.message,
            code: optionItemError.code,
            details: optionItemError.details,
            hint: optionItemError.hint,
          },
        });
      }
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
    await createNotification(
      {
        type: "event_created",
        title: "Événement créé",
        body: `${normalizedInput.clientName} - ${normalizedInput.eventName}`,
        relatedEventId: event.id,
      },
      { dedupe: true },
    );

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

    if (normalizedInput.syncExternalCalendarId) {
      try {
        await syncProviderEventAction("create", event.id, normalizedInput.syncExternalCalendarId);
        await createNotification(
          {
            type: "google_calendar_sync_success",
            title: "Événement synchronisé avec le calendrier.",
            body: `${normalizedInput.clientName} - ${normalizedInput.eventName}`,
            relatedEventId: event.id,
          },
          { persist: false },
        );
      } catch (googleSyncError) {
        console.error("External calendar event create failed", getDebugError(googleSyncError));
        await createNotification(
          {
            type: "google_calendar_sync_failed",
            title: "Synchronisation calendrier échouée",
            body: "L’événement MSTV a été enregistré, mais la synchronisation du calendrier lié a échoué.",
            relatedEventId: event.id,
          },
          { persist: false },
        );
        setError(getUserFacingErrorMessage(googleSyncError, "L’événement MSTV a été enregistré, mais la synchronisation du calendrier lié a échoué."));
        throw createEventEditorDiagnosticError(googleSyncError, {
          ...createDiagnosticBase,
          ...((googleSyncError as { eventEditorDiagnostic?: EventEditorDiagnostic } | null)?.eventEditorDiagnostic ?? {}),
          stage: (googleSyncError as { eventEditorDiagnostic?: EventEditorDiagnostic } | null)?.eventEditorDiagnostic?.stage ?? "provider_event_create",
        });
      }
    }

    await reloadData(event.id, { source: "create-event" });
    setSelectedDateKey(event.date);
    setVisibleMonth(new Date(`${event.date}T12:00:00`));
    setScreen("detail");
  }

  async function importNativeMstvIcsEvents(
    reviewEvents: NativeMstvIcsReviewEvent[],
    onProgress?: (progress: NativeMstvIcsImportProgress) => void,
  ): Promise<NativeMstvIcsImportResult> {
    void reviewEvents;
    void onProgress;
    assertCanManageEvents();
    throw new Error(legacyLocalCalendarImportDisabledMessage);
  }

  async function updateEvent(event: ProductionEvent, input: CreateEventInput, nextScreen: Screen = "calendar") {
    assertCanManageEvents();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const normalizedInput = normalizeEventTimeInput(input);
    const currentWritableLinks = getEventWritableExternalLinks(event);
    const currentAppleLink = getEventAppleLinks(event)[0] ?? null;
    const currentExternalLink = currentWritableLinks.length === 1 ? currentWritableLinks[0] : currentAppleLink;
    const currentExternalCalendarId = currentExternalLink?.externalCalendarId ?? null;
    const requestedExternalCalendarId = normalizedInput.syncExternalCalendarId ?? null;
    const calendarSelectionChanged = requestedExternalCalendarId !== currentExternalCalendarId;
    const updatePayload: Database["public"]["Tables"]["events"]["Update"] = {
      client_name: normalizedInput.clientName,
      event_name: normalizedInput.eventName,
      date: normalizedInput.date,
      is_all_day: normalizedInput.isAllDay,
      client_arrival_time: normalizedInput.clientArrivalTime || null,
      start_time: normalizedInput.startTime || null,
      end_time: normalizedInput.endTime || null,
      end_of_day_time: normalizedInput.endOfDayTime || null,
      location: normalizedInput.location.trim() || null,
      notes: normalizedInput.notes.trim() || null,
    };

    const { data, error: updateError } = await supabase
      .from("events")
      .update(updatePayload)
      .eq("id", event.id)
      .select()
      .single();

    if (updateError) {
      console.error("MSTV event update failed before Google sync", getDebugError(updateError));
      throw updateError;
    }

    const updatedEvent: ProductionEvent = {
      ...event,
      clientName: data.client_name,
      eventName: data.event_name,
      date: data.date,
      isAllDay: Boolean(data.is_all_day),
      clientArrivalTime: toTimeInputValue(data.client_arrival_time) || null,
      startTime: toTimeInputValue(data.start_time) || null,
      endTime: toTimeInputValue(data.end_time) || null,
      endOfDayTime: toTimeInputValue(data.end_of_day_time) || null,
      location: data.location ?? null,
      notes: data.notes ?? null,
      status: data.status,
      deletedAt: data.deleted_at ?? null,
      deletedBy: data.deleted_by ?? null,
      quoteReference: data.quote_reference ?? null,
      quoteVersion: data.quote_version ?? null,
      sourceQuoteText: data.source_quote_text ?? null,
      lastQuoteImportedAt: data.last_quote_imported_at ?? null,
      importedFrom: data.imported_from ?? null,
      externalImportId: data.external_import_id ?? null,
      eventRole: normalizeProductionEventRole(data.event_role),
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
      await createNotification(
        {
          type: "event_date_changed",
          title: "Date modifiée",
          body: `${updatedEvent.clientName} - ${formatFullDate(updatedEvent.date)}`,
          relatedEventId: event.id,
        },
        { dedupe: true },
      );
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
      await createNotification(
        {
          type: "event_time_changed",
          title: "Horaire modifié",
          body: `${updatedEvent.clientName} - ${getEventTimeFieldLabel(field)}: ${formatTime(nextValue) || "Non défini"}`,
          relatedEventId: event.id,
        },
        { dedupe: true },
      );
    }

    const linkedExternalEventCount = currentWritableLinks.length;
    if (calendarSelectionChanged || normalizedInput.syncExternalCalendarId || linkedExternalEventCount > 0) {
      try {
        let syncPayload: { error?: string; externalEventId?: string; synced?: number; warning?: string } | null | undefined;
        if (calendarSelectionChanged && requestedExternalCalendarId) {
          const requestedCalendar = externalCalendars.find((calendar) => calendar.id === requestedExternalCalendarId) ?? null;
          if (!requestedCalendar) {
            throw new Error("Calendrier introuvable.");
          }
          if (currentExternalLink?.providerType === "apple_caldav" && requestedCalendar.providerType === "apple_caldav") {
            syncPayload = await syncAppleEventAction("move", updatedEvent.id, requestedExternalCalendarId);
            if (!syncPayload?.externalEventId && (syncPayload?.synced ?? 0) === 0) {
              throw new Error("Le changement de calendrier Apple n’a pas été appliqué.");
            }
          } else if (!currentExternalLink) {
            syncPayload = await syncProviderEventAction("create", updatedEvent.id, requestedExternalCalendarId);
          } else {
            throw new Error("Le changement de calendrier est disponible pour Apple Calendar pour le moment.");
          }
        } else if (calendarSelectionChanged && !requestedExternalCalendarId && linkedExternalEventCount > 0) {
          syncPayload = await syncProviderEventAction("delete", updatedEvent.id);
        } else {
          syncPayload = await syncProviderEventAction("update", updatedEvent.id);
        }
        if (syncPayload?.externalEventId || (syncPayload?.synced ?? 0) > 0) {
          await createNotification(
            {
              type: "google_calendar_sync_success",
              title: "Événement synchronisé avec le calendrier.",
              body: `${updatedEvent.clientName} - ${updatedEvent.eventName}`,
              relatedEventId: updatedEvent.id,
            },
            { persist: false },
          );
        }
        if (syncPayload?.warning) {
          setError(syncPayload.warning);
        }
        await reloadData(updatedEvent.id, { silent: true, source: "edit-event-calendar-move" });
      } catch (googleSyncError) {
        console.error("External calendar event update failed", getDebugError(googleSyncError));
        await createNotification(
          {
            type: "google_calendar_sync_failed",
            title: "Synchronisation calendrier échouée",
            body: "L’événement MSTV a été enregistré, mais la synchronisation du calendrier lié a échoué.",
            relatedEventId: updatedEvent.id,
          },
          { persist: false },
        );
        setError(getExternalCalendarSyncUserMessage(googleSyncError));
        await reloadData(updatedEvent.id, { silent: true, source: "edit-event" });
        throw googleSyncError;
      }
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
      is_all_day: normalizedInput.isAllDay,
      client_arrival_time: normalizedInput.clientArrivalTime || null,
      start_time: normalizedInput.startTime || null,
      end_time: normalizedInput.endTime || null,
      end_of_day_time: normalizedInput.endOfDayTime || null,
      location: normalizedInput.location.trim() || null,
      notes: normalizedInput.notes.trim() || null,
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
        isAllDay: event.isAllDay,
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
        isAllDay: normalizedInput.isAllDay,
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

    if (event.date !== normalizedInput.date) {
      await createNotification(
        {
          type: "event_date_changed",
          title: "Date modifiée",
          body: `${normalizedInput.clientName} - ${formatFullDate(normalizedInput.date)}`,
          relatedEventId: event.id,
        },
        { dedupe: true },
      );
    }

    for (const field of ["clientArrivalTime", "startTime", "endTime", "endOfDayTime"] as EventTimeField[]) {
      const previousValue = toTimeInputValue(event[field]) || null;
      const nextValue = toTimeInputValue(normalizedInput[field]) || null;
      if (previousValue === nextValue) continue;

      await createNotification(
        {
          type: "event_time_changed",
          title: "Horaire modifié",
          body: `${normalizedInput.clientName} - ${getEventTimeFieldLabel(field)}: ${formatTime(nextValue) || "Non défini"}`,
          relatedEventId: event.id,
        },
        { dedupe: true },
      );
    }

    await reloadData(event.id, { source: "import-quote" });
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

    const sourceWritableCalendarIds = getEventWritableExternalLinks(sourceEvent).map((link) => link.externalCalendarId);
    const targetCalendar =
      writableExternalCalendars.find((calendar) => sourceWritableCalendarIds.includes(calendar.id)) ??
      writableExternalCalendars[0] ??
      null;

    if (!targetCalendar) {
      throw new Error(noCreatableCalendarMessage);
    }

    if (!online) {
      throw new Error("Connexion Internet requise pour créer un événement dans un calendrier synchronisé.");
    }

    const { data: duplicatedEvent, error: eventError } = await supabase
      .from("events")
      .insert({
        client_name: sourceEvent.clientName,
        event_name: sourceEvent.eventName,
        date: normalizedDate,
        is_all_day: sourceEvent.isAllDay,
        client_arrival_time: sourceEvent.clientArrivalTime || null,
        start_time: sourceEvent.startTime || null,
        end_time: sourceEvent.endTime || null,
        end_of_day_time: sourceEvent.endOfDayTime || null,
        location: sourceEvent.location || null,
        notes: sourceEvent.notes || null,
        status: sourceEvent.status,
        event_role: "production",
        quote_reference: sourceEvent.quoteReference,
        quote_version: sourceEvent.quoteVersion,
        source_quote_text: sourceEvent.sourceQuoteText,
        last_quote_imported_at: sourceEvent.lastQuoteImportedAt,
        ...getCreatorInsertPayload(profile),
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
          status: "incomplete" as CompletionStatus,
          details: option.details,
          external_assignee_name: option.externalAssigneeName,
          task_due_date: option.taskDueDate,
          task_notes: option.taskNotes,
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
                  createdByProfileId: link.createdByProfileId,
                  createdByRole: link.createdByRole,
                  createdByName: link.createdByName,
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

    try {
      await syncProviderEventAction("create", duplicatedEvent.id, targetCalendar.id);
    } catch (syncError) {
      console.error("Duplicated event external calendar sync failed", getDebugError(syncError));
      throw syncError;
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
        externalCalendarId: targetCalendar.id,
      },
      newValue: {
        date: normalizedDate,
      },
    });
    await createNotification(
      {
        type: "event_created",
        title: "Événement créé",
        body: `${sourceEvent.clientName} - ${sourceEvent.eventName}`,
        relatedEventId: duplicatedEvent.id,
      },
      { dedupe: true },
    );

    await reloadData(duplicatedEvent.id, { source: "duplicate-event" });
    setSelectedDateKey(normalizedDate);
    setVisibleMonth(new Date(`${normalizedDate}T12:00:00`));
    setSelectedId(duplicatedEvent.id);
    setScreen("detail");
  }

  async function updateEventTime(event: ProductionEvent, field: EventTimeField, value: string, activityDescription = "Horaire modifié") {
    assertCanManageEvents();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }
    const eventDisplayLine = getProductionEventDisplayLine(event);

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
      if (previousValue !== nextValue) {
        await createNotification(
          {
            type: "event_time_changed",
            title: "Horaire modifié",
            body: `${eventDisplayLine} - ${getEventTimeFieldLabel(field)}: ${formatTime(nextValue) || "Non défini"}`,
            relatedEventId: event.id,
          },
          { dedupe: true },
        );
      }
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
        if (previousValue !== nextValue) {
          await createNotification(
            {
              type: "event_time_changed",
              title: "Horaire modifié",
              body: `${eventDisplayLine} - ${getEventTimeFieldLabel(field)}: ${formatTime(nextValue) || "Non défini"}`,
              relatedEventId: event.id,
            },
            { dedupe: true },
          );
        }
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
              isAllDay: Boolean(data.is_all_day),
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
      await createNotification(
        {
          type: "event_time_changed",
          title: "Horaire modifié",
          body: `${eventDisplayLine} - ${getEventTimeFieldLabel(field)}: ${formatTime(updatedValue) || "Non défini"}`,
          relatedEventId: event.id,
        },
        { dedupe: true },
      );
      if (getEventWritableExternalLinks(event).length > 0) {
        try {
          const syncPayload = await syncProviderEventAction("update", event.id);
          if ((syncPayload?.synced ?? 0) > 0) {
            await createNotification(
              {
                type: "google_calendar_sync_success",
                title: "Événement synchronisé avec le calendrier.",
                body: eventDisplayLine,
                relatedEventId: event.id,
              },
              { persist: false },
            );
          }
        } catch (googleSyncError) {
          console.error("External calendar time update failed", getDebugError(googleSyncError));
          await createNotification(
            {
              type: "google_calendar_sync_failed",
              title: "Synchronisation calendrier échouée",
              body: "L’événement MSTV a été enregistré, mais la synchronisation du calendrier lié a échoué.",
              relatedEventId: event.id,
            },
            { persist: false },
          );
          setError(getExternalCalendarSyncUserMessage(googleSyncError));
        } finally {
          await reloadData(event.id, { silent: true, source: "delete-event" });
        }
      }
    }
  }

  async function updateEventDate(event: ProductionEvent, nextDate: string, activityDescription = "Date modifiée") {
    assertCanManageEvents();
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }
    const eventDisplayLine = getProductionEventDisplayLine(event);

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
      if (event.date !== normalizedDate) {
        await createNotification(
          {
            type: "event_date_changed",
            title: "Date modifiée",
            body: `${eventDisplayLine} - ${formatFullDate(normalizedDate)}`,
            relatedEventId: event.id,
          },
          { dedupe: true },
        );
      }
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
        if (event.date !== normalizedDate) {
          await createNotification(
            {
              type: "event_date_changed",
              title: "Date modifiée",
              body: `${eventDisplayLine} - ${formatFullDate(normalizedDate)}`,
              relatedEventId: event.id,
            },
            { dedupe: true },
          );
        }
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
      await createNotification(
        {
          type: "event_date_changed",
          title: "Date modifiée",
          body: `${eventDisplayLine} - ${formatFullDate(data.date)}`,
          relatedEventId: event.id,
        },
        { dedupe: true },
      );
      if (getEventWritableExternalLinks(event).length > 0) {
        try {
          const syncPayload = await syncProviderEventAction("update", event.id);
          if ((syncPayload?.synced ?? 0) > 0) {
            await createNotification(
              {
                type: "google_calendar_sync_success",
                title: "Événement synchronisé avec le calendrier.",
                body: eventDisplayLine,
                relatedEventId: event.id,
              },
              { persist: false },
            );
          }
        } catch (googleSyncError) {
          console.error("External calendar date update failed", getDebugError(googleSyncError));
          await createNotification(
            {
              type: "google_calendar_sync_failed",
              title: "Synchronisation calendrier échouée",
              body: "L’événement MSTV a été enregistré, mais la synchronisation du calendrier lié a échoué.",
              relatedEventId: event.id,
            },
            { persist: false },
          );
          setError(getExternalCalendarSyncUserMessage(googleSyncError));
        } finally {
          await reloadData(event.id, { silent: true, source: "restore-event" });
        }
      }
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

  async function assignOptionTask(option: EventOption, assignment: OptionTaskAssignment) {
    assertCanManageEvents();
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    const supabaseClient = supabase;

    const currentLinkedTask = option.taskId ? tasks.find((task) => task.id === option.taskId) ?? null : null;
    const assignedProfileId = assignment.type === "profile" ? assignment.profileId : null;
    const externalAssigneeName = assignment.type === "external" ? assignment.name?.trim() || null : null;
    let failedStage = "préparation";

    try {
    const assignedProfile = assignedProfileId ? taskProfiles.find((userProfile) => userProfile.id === assignedProfileId) ?? null : null;
    failedStage = "validation_profil";
    if (assignedProfileId && !assignedProfile) {
      throw new Error("Profil assigné introuvable.");
    }

    async function updateOptionAssignmentState(input: {
      task: AppTask | null;
      externalName: string | null;
      dueDate: string | null;
      notes: string | null;
    }) {
      const { task, externalName, dueDate, notes } = input;
      const assigneeLabel = task && assignedProfile ? getProfileOptionLabel(assignedProfile) : null;
      const assigneeInitials = assignedProfile ? getProfileInitials(assignedProfile, assignedProfile.email ?? undefined) : null;
      const assignmentLabel = assigneeLabel ?? externalName;
      const completed = Boolean(task?.assignedProfileId && task.status === "done");
      const updatePayload: Database["public"]["Tables"]["event_options"]["Update"] = {
        task_id: task?.id ?? null,
        external_assignee_name: externalName,
        task_due_date: dueDate,
        task_notes: notes?.trim() || null,
        status: completed ? "completed" : "incomplete",
        completed_by_profile_id: completed ? task?.assignedProfileId ?? null : null,
        completed_by_label: completed ? assigneeLabel : null,
        completed_by_initials: completed ? assigneeInitials : null,
        completed_at: completed ? (task?.completedAt ?? new Date().toISOString()) : null,
      };

      failedStage = "update_option";
      const { error: updateError } = await supabaseClient
        .from("event_options")
        .update(updatePayload)
        .eq("id", option.id);

      if (updateError) throw updateError;

      setEvents((current) =>
        current.map((event) =>
          event.id === option.eventId
            ? {
                ...event,
                options: event.options.map((item) =>
                  item.id === option.id
                    ? {
                        ...item,
                        taskId: updatePayload.task_id ?? null,
                        externalAssigneeName: updatePayload.external_assignee_name ?? null,
                        taskDueDate: updatePayload.task_due_date ?? null,
                        taskNotes: updatePayload.task_notes ?? null,
                        status: updatePayload.status ?? item.status,
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

      await logEventActivity({
        eventId: option.eventId,
        actionType: "option_task_assignment_changed",
        entityType: "option",
        entityId: option.id,
        description: assignmentLabel ? `Option ${option.label} assignée à ${assignmentLabel}` : `Assignation de l'option ${option.label} retirée`,
        previousValue: {
          taskId: option.taskId,
          externalAssigneeName: option.externalAssigneeName,
          taskDueDate: option.taskDueDate,
          taskNotes: option.taskNotes,
          completedByProfileId: option.completedByProfileId,
          completedByLabel: option.completedByLabel,
          status: option.status,
        },
        newValue: {
          taskId: updatePayload.task_id ?? null,
          assignedProfileId: task?.assignedProfileId ?? null,
          externalAssigneeName: externalName,
          taskDueDate: updatePayload.task_due_date ?? null,
          taskNotes: updatePayload.task_notes ?? null,
          status: updatePayload.status,
        },
      });
    }

    if (assignment.type !== "profile") {
      const preservedDueDate = currentLinkedTask?.dueDate ?? option.taskDueDate ?? null;
      const preservedNotes = currentLinkedTask?.notes ?? option.taskNotes ?? null;
      if (currentLinkedTask) {
        failedStage = "unlink_existing_task";
        await updateTask(currentLinkedTask, {
          assignedProfileId: null,
          sortOrder: null,
          status: "todo",
        });
      }
      await updateOptionAssignmentState({
        task: null,
        externalName: externalAssigneeName,
        dueDate: preservedDueDate,
        notes: preservedNotes,
      });
      if (currentLinkedTask) {
        failedStage = "delete_unlinked_task";
        const { error: deleteTaskError } = await supabaseClient.from("tasks").delete().eq("id", currentLinkedTask.id);
        if (deleteTaskError) {
          console.warn("[MSTV options] unable to delete unlinked option task", {
            optionId: option.id,
            taskId: currentLinkedTask.id,
            errorCode: deleteTaskError.code,
            errorMessage: deleteTaskError.message,
            errorDetails: deleteTaskError.details,
            errorHint: deleteTaskError.hint,
          });
        } else {
          setTasks((current) => current.filter((task) => task.id !== currentLinkedTask.id));
        }
      }
      return;
    }

    if (currentLinkedTask) {
      const nextSortOrder = getNextTaskSortOrder(tasks, assignedProfileId);
      const nextDueDate = currentLinkedTask.dueDate ?? option.taskDueDate ?? null;
      const nextNotes = currentLinkedTask.notes ?? option.taskNotes ?? null;
      failedStage = "update_existing_task";
      await updateTask(currentLinkedTask, {
        title: option.label,
        assignedProfileId,
        sortOrder: nextSortOrder,
        dueDate: nextDueDate,
        notes: nextNotes,
      });
      await updateOptionAssignmentState({
        task: {
          ...currentLinkedTask,
          title: option.label,
          assignedProfileId,
          sortOrder: nextSortOrder,
          dueDate: nextDueDate,
          notes: nextNotes,
        },
        externalName: null,
        dueDate: nextDueDate,
        notes: nextNotes,
      });
      return;
    }

    const createdTaskDueDate = option.taskDueDate ?? events.find((event) => event.id === option.eventId)?.date ?? null;
    failedStage = "create_internal_task";
    const createdTask = await createTask({
      title: option.label,
      eventId: option.eventId,
      assignedProfileId,
      priority: "normal",
      dueDate: createdTaskDueDate,
      notes: option.taskNotes,
    });
    await updateOptionAssignmentState({
      task: createdTask,
      externalName: null,
      dueDate: createdTask.dueDate,
      notes: createdTask.notes,
    });
    } catch (assignmentError) {
      const diagnostic: OptionAssignmentDiagnostic = {
        optionId: option.id,
        assigneeType: assignment.type,
        assignedProfileId,
        externalAssigneeName,
        linkedTaskId: option.taskId,
        stage: failedStage,
        supabaseErrorCode: getSupabaseErrorField(assignmentError, "code"),
        supabaseErrorMessage: getSupabaseErrorField(assignmentError, "message"),
        supabaseErrorDetails: getSupabaseErrorField(assignmentError, "details"),
        supabaseErrorHint: getSupabaseErrorField(assignmentError, "hint"),
      };
      throw createOptionAssignmentError(assignmentError, diagnostic);
    }
  }

  async function updateOptionTaskDueDate(option: EventOption, dueDate: string | null) {
    assertCanManageEvents();
    if (!supabase) throw new Error("Configuration Supabase manquante.");
    const supabaseClient = supabase;
    const currentLinkedTask = option.taskId ? tasks.find((task) => task.id === option.taskId) ?? null : null;

    async function updateOptionDueDateState(task: AppTask | null, nextDueDate: string | null) {
      const assignedProfile = task?.assignedProfileId ? taskProfiles.find((userProfile) => userProfile.id === task.assignedProfileId) ?? null : null;
      const assigneeLabel = assignedProfile ? getProfileOptionLabel(assignedProfile) : null;
      const assigneeInitials = assignedProfile ? getProfileInitials(assignedProfile, assignedProfile.email ?? undefined) : null;
      const completed = Boolean(task?.assignedProfileId && task.status === "done");
      const updatePayload: Database["public"]["Tables"]["event_options"]["Update"] = {
        task_id: task?.id ?? null,
        external_assignee_name: option.externalAssigneeName ?? null,
        task_due_date: nextDueDate,
        task_notes: task?.notes ?? option.taskNotes ?? null,
        status: completed ? "completed" : "incomplete",
        completed_by_profile_id: completed ? task?.assignedProfileId ?? null : null,
        completed_by_label: completed ? assigneeLabel : null,
        completed_by_initials: completed ? assigneeInitials : null,
        completed_at: completed ? (task?.completedAt ?? new Date().toISOString()) : null,
      };

      const { error: updateError } = await supabaseClient
        .from("event_options")
        .update(updatePayload)
        .eq("id", option.id);

      if (updateError) throw updateError;

      setEvents((current) =>
        current.map((event) =>
          event.id === option.eventId
            ? {
                ...event,
                options: event.options.map((item) =>
                  item.id === option.id
                    ? {
                        ...item,
                        taskId: updatePayload.task_id ?? null,
                        externalAssigneeName: updatePayload.external_assignee_name ?? null,
                        taskDueDate: updatePayload.task_due_date ?? null,
                        taskNotes: updatePayload.task_notes ?? null,
                        status: updatePayload.status ?? item.status,
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

    if (currentLinkedTask?.assignedProfileId) {
      await updateTask(currentLinkedTask, { dueDate });
      await updateOptionDueDateState({ ...currentLinkedTask, dueDate }, dueDate);
      return;
    }

    await updateOptionDueDateState(null, dueDate);
  }

  async function updateOptionTaskNotes(option: EventOption, notes: string | null) {
    assertCanManageEvents();
    if (!supabase) throw new Error("Configuration Supabase manquante.");

    const nextNotes = notes?.trim() || null;
    const updatePayload: Database["public"]["Tables"]["event_options"]["Update"] = {
      task_notes: nextNotes,
    };

    const { error: updateError } = await supabase
      .from("event_options")
      .update(updatePayload)
      .eq("id", option.id);

    if (updateError) throw updateError;

    setEvents((current) =>
      current.map((event) =>
        event.id === option.eventId
          ? {
              ...event,
              options: event.options.map((item) => (
                item.id === option.id ? { ...item, taskNotes: nextNotes } : item
              )),
            }
          : event,
      ),
    );
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
    const supabaseClient = supabase;

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
        taskId: null,
        externalAssigneeName: null,
        taskDueDate: null,
        taskNotes: null,
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

    async function createTeamOptionTaskIfNeeded(option: EventOption) {
      if (permissions.canManageEvents || !profile?.id || option.taskId || option.externalAssigneeName) return option;

      try {
        const linkedEvent = events.find((event) => event.id === option.eventId) ?? null;
        const createdTask = await createTask({
          title: option.label,
          eventId: option.eventId,
          assignedProfileId: profile.id,
          priority: "normal",
          dueDate: option.taskDueDate ?? linkedEvent?.date ?? null,
          notes: option.taskNotes,
        });
        const updatePayload: Database["public"]["Tables"]["event_options"]["Update"] = {
          task_id: createdTask.id,
          task_due_date: createdTask.dueDate,
          task_notes: createdTask.notes,
          status: createdTask.status === "done" ? "completed" : "incomplete",
          completed_by_profile_id: createdTask.status === "done" ? createdTask.assignedProfileId : null,
          completed_by_label: null,
          completed_by_initials: null,
          completed_at: createdTask.status === "done" ? createdTask.completedAt ?? new Date().toISOString() : null,
        };

        const { error: updateError } = await supabaseClient
          .from("event_options")
          .update(updatePayload)
          .eq("id", option.id);

        if (updateError) throw updateError;

        const linkedOption: EventOption = {
          ...option,
          taskId: createdTask.id,
          taskDueDate: createdTask.dueDate,
          taskNotes: createdTask.notes,
          status: updatePayload.status ?? option.status,
          completedByProfileId: updatePayload.completed_by_profile_id ?? null,
          completedByLabel: updatePayload.completed_by_label ?? null,
          completedByInitials: updatePayload.completed_by_initials ?? null,
          completedAt: updatePayload.completed_at ?? null,
        };

        setEvents((current) =>
          current.map((event) =>
            event.id === option.eventId
              ? {
                  ...event,
                  options: event.options.map((item) => (item.id === option.id ? linkedOption : item)),
                }
              : event,
          ),
        );

        return linkedOption;
      } catch (taskLinkError) {
        console.warn("[MSTV options] unable to create default task for team-created option", {
          optionId: option.id,
          eventId: option.eventId,
          creatorProfileId: profile.id,
          errorCode: getSupabaseErrorField(taskLinkError, "code"),
          errorMessage: getSupabaseErrorField(taskLinkError, "message"),
          errorDetails: getSupabaseErrorField(taskLinkError, "details"),
          errorHint: getSupabaseErrorField(taskLinkError, "hint"),
        });
        return option;
      }
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

    const { data, error: insertError } = await supabaseClient
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
      taskId: data.task_id ?? null,
      externalAssigneeName: data.external_assignee_name ?? null,
      taskDueDate: data.task_due_date ?? null,
      taskNotes: data.task_notes ?? null,
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

    return createTeamOptionTaskIfNeeded(option);
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

    if (option.taskId && permissions.canManageEvents) {
      const linkedTask = tasks.find((task) => task.id === option.taskId) ?? null;
      if (linkedTask) {
        await deleteTask(linkedTask);
      }
    }

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

    if (option.taskId && permissions.canManageEvents) {
      const linkedTask = tasks.find((task) => task.id === option.taskId) ?? null;
      if (linkedTask) {
        await updateTask(linkedTask, { title: nextLabel });
      }
    }

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
    const activity: PendingActivityPayload = {
      eventId: option.eventId,
      actionType: "option_item_created",
      entityType: "option_item",
      entityId: localItemId,
      description: "Note ajoutée",
      newValue: { label: nextLabel, optionId: option.id },
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
        payload: { values: insertPayload, activity },
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
          payload: { values: insertPayload, activity },
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
    await logEventActivity({
      ...activity,
      entityId: optionItem.id,
    });

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
      newValue: { label: nextLabel, optionId: option.id },
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
                links: event.links.some((item) => item.id === link.id)
                  ? event.links.map((item) => (item.id === link.id ? link : item))
                  : [...event.links, link],
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
    logNetworkDebug("storage-upload:start", {
      eventId: group.eventId,
      groupId: group.id,
      fileName: file.name,
      fileSize: file.size,
      storagePath,
    });

    const { error: uploadError } = await supabase.storage.from(eventDocumentsBucket).upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });

    if (uploadError) {
      logNetworkDebug("storage-upload:error", {
        eventId: group.eventId,
        groupId: group.id,
        fileName: file.name,
        fileSize: file.size,
        error: getRawErrorMessage(uploadError),
      });
      throw uploadError;
    }

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
    logNetworkDebug("storage-upload:complete", {
      eventId: group.eventId,
      groupId: group.id,
      documentId: document.id,
      fileName: document.fileName,
      fileSize: document.fileSize,
    });

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
    logNetworkDebug("storage-signed-url:start", {
      action: "open",
      documentId: file.id,
      eventId: file.eventId,
      fileName: file.fileName,
      fileSize: file.fileSize,
      objectPath,
    });
    const { data, error: signedUrlError } = await supabase.storage.from(eventDocumentsBucket).createSignedUrl(objectPath, 10 * 60);

    if (signedUrlError) throw signedUrlError;
    logNetworkDebug("storage-signed-url:complete", {
      action: "open",
      documentId: file.id,
      eventId: file.eventId,
      fileName: file.fileName,
      fileSize: file.fileSize,
    });

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
    logNetworkDebug("storage-signed-url:start", {
      action: "download",
      documentId: file.id,
      eventId: file.eventId,
      fileName: file.fileName,
      fileSize: file.fileSize,
      objectPath,
    });
    const { data, error: signedUrlError } = await supabase.storage
      .from(eventDocumentsBucket)
      .createSignedUrl(objectPath, 60, { download: file.fileName });

    if (signedUrlError) throw signedUrlError;
    logNetworkDebug("storage-signed-url:complete", {
      action: "download",
      documentId: file.id,
      eventId: file.eventId,
      fileName: file.fileName,
      fileSize: file.fileSize,
    });

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
    const eventDisplayLine = getProductionEventDisplayLine(eventToDelete);
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
      await createNotification(
        {
          type: "event_deleted",
          title: "Événement placé dans la corbeille",
          body: eventDisplayLine,
          relatedEventId: eventId,
        },
        { dedupe: true },
      );
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
    await createNotification(
      {
        type: "event_deleted",
        title: "Événement placé dans la corbeille",
        body: eventDisplayLine,
        relatedEventId: eventId,
      },
      { dedupe: true },
    );

    const externalLinksToDelete = getEventWritableExternalLinks(eventToDelete);
    console.info("Event trash external calendar sync decision", {
      eventId,
      linkedExternalEventFound: externalLinksToDelete.length > 0,
      linkCount: externalLinksToDelete.length,
      deleteLinkedProviderEvents: true,
    });
    if (externalLinksToDelete.length > 0) {
      try {
        const syncPayload = await syncProviderEventAction("delete", eventId);
        if ((syncPayload?.synced ?? 0) > 0) {
          await createNotification(
            {
              type: "google_calendar_sync_success",
              title: "Événement supprimé du calendrier lié.",
              body: eventDisplayLine,
              relatedEventId: eventId,
            },
            { persist: false },
          );
        }
      } catch (googleSyncError) {
        console.error("Linked calendar event delete failed", getDebugError(googleSyncError));
        await createNotification(
          {
            type: "google_calendar_sync_failed",
            title: "Suppression calendrier échouée",
            body: "L’événement MSTV a été placé dans la corbeille, mais la suppression du calendrier lié a échoué.",
            relatedEventId: eventId,
          },
          { persist: false },
        );
        setError(getUserFacingErrorMessage(googleSyncError, "L’événement MSTV a été placé dans la corbeille, mais la suppression du calendrier lié a échoué."));
      }
    }

    applyOptimisticSoftDelete(deletedEvent.updated_at);
    await reloadData(null, { source: "permanent-delete-event" });
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
      const providerLinksToRestore = getEventWritableExternalLinks(eventToRestore).filter(
        (link) => link.deletedLocallyAt || link.deletedExternallyAt,
      );
      let providerRestoreFailed = false;
      for (const link of providerLinksToRestore) {
        try {
          await syncProviderEventAction("create", eventToRestore.id, link.externalCalendarId);
        } catch (providerRestoreError) {
          providerRestoreFailed = true;
          console.error("Linked calendar event restore failed", {
            eventId: eventToRestore.id,
            externalCalendarId: link.externalCalendarId,
            providerType: link.providerType,
            error: getDebugError(providerRestoreError),
          });
        }
      }
      if (providerRestoreFailed) {
        const warning = "L'événement a été restauré dans MSTV, mais pas encore dans le calendrier externe.";
        setTrashError(warning);
        setError(warning);
        await createNotification(
          {
            type: "google_calendar_sync_failed",
            title: "Restauration calendrier incomplète",
            body: warning,
            relatedEventId: eventToRestore.id,
          },
          { persist: false },
        );
      }
      await reloadData(eventToRestore.id, { silent: true, source: "restore-event" });
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
    clearCachedAuthState(userId);
    setAuthSession(null);
    setProfile(null);
    setEvents([]);
    setNotifications([]);
    setTasks([]);
    setTaskProfiles([]);
    setNotificationsHydrated(false);
    setSelectedId(null);
    setScreen("calendar");
    setCreateMenuOpen(false);
  }

  if (!hasMounted || authLoading) {
    return (
      <>
        <FullScreenStatus>Chargement...</FullScreenStatus>
        {hasMounted && <OfflineBanner online={online} />}
      </>
    );
  }

  if (passwordRecoveryOpen) {
    if (!authSession) {
      return (
        <>
          <FullScreenStatus>Préparation de la réinitialisation...</FullScreenStatus>
          <OfflineBanner online={online} />
        </>
      );
    }

    return (
      <>
        <UpdatePasswordScreen
          email={authSession.user.email}
          onComplete={() => setPasswordRecoveryOpen(false)}
          onCancel={() => setPasswordRecoveryOpen(false)}
        />
        <OfflineBanner online={online} />
      </>
    );
  }

  if (!authSession) {
    return (
      <>
        <LoginScreen error={authError} />
        <OfflineBanner online={online} />
      </>
    );
  }

  if (authError && !profile) {
    return (
      <>
        <AuthRecoveryScreen message={authError} onReset={() => void handleInvalidAuthSession(authError)} />
        <OfflineBanner online={online} />
      </>
    );
  }

  return (
    <main className="relative h-[var(--app-height)] min-h-[var(--app-height)] overflow-hidden bg-[var(--app-background)] text-neutral-950">
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
          if (!hasFileDragItem(event.dataTransfer)) return;
          event.preventDefault();
          event.stopPropagation();
          if (!permissions.canManageEvents) {
            setGlobalQuoteDragActive(false);
            setError("Import de devis réservé aux admins.");
            return;
          }
          openQuoteImportFromDrop(event.dataTransfer, "app-shell");
        }}
        className="relative mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top)+var(--app-viewport-offset-top))] sm:px-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pt-[calc(1.5rem+env(safe-area-inset-top)+var(--app-viewport-offset-top))] lg:px-8"
      >
        <AppHeader
          screen={screen}
          setScreen={setScreen}
          yearLabel={yearLabel}
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
          googleAutoSyncStatus={googleAutoSyncStatus}
          notifications={notifications}
          notificationsHydrated={notificationsHydrated}
          notificationsOpen={notificationsOpen && !yearOverviewOpen}
          setNotificationsOpen={setNotificationsOpen}
          searchActive={searchOpen}
          onOpenNotification={handleNotificationOpen}
          onDismissNotification={markNotificationRead}
          onOpenTasks={() => {
            openTasksFromHeader();
          }}
          onImportQuote={() => {
            if (!headerPermissions.canManageEvents) return;
            openQuoteImport();
          }}
          onImportNativeMstvCalendar={openNativeMstvIcsImport}
          onSearch={() => setSearchOpen(true)}
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
          canImportNativeMstvCalendar={false}
          canDuplicateEvent={false}
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
          {loading && <StatusMessage>Chargement du calendrier...</StatusMessage>}

          {!loading && screen === "calendar" && (
            <CalendarDashboard
              events={visibleProductionEvents}
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
              unreadChangeSummaries={unreadChangeSummaries}
            />
          )}

          {!loading && screen === "tasks" && (
            <TeamTasksSheet
              tasks={tasks}
              events={visibleProductionEvents}
              profiles={taskProfiles}
              currentProfile={profile}
              permissions={permissions}
              loading={tasksLoading}
              error={tasksError}
              navigationRequest={tasksNavigationRequest}
              onClose={() => setScreen("calendar")}
              onCreateTask={createTask}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
              onReorderTasks={reorderTasksForAssignee}
              onOpenEvent={openEvent}
            />
          )}

          {!loading && screen === "detail" && selectedEvent && (
            <EventDetailCarousel
              currentEvent={selectedEvent}
              previousEvent={previousDetailEvent}
              nextEvent={nextDetailEvent}
              direction={eventDetailCarousel?.direction ?? null}
              targetId={eventDetailCarousel?.targetId ?? null}
              onNavigateDirection={startEventDetailCarousel}
              onTransitionComplete={finishEventDetailCarousel}
              renderPanel={renderEventDetailPanel}
            />
          )}

          {!loading && screen === "detail" && !selectedEvent && (
            <StatusMessage>Aucune production à afficher.</StatusMessage>
          )}
        </div>
      </div>

      <OfflineBanner online={online} />

      {globalQuoteDragActive && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/10 p-4">
          <div className="flex items-center gap-3 rounded-full bg-white px-5 py-3 text-base font-semibold text-neutral-800 shadow-sm shadow-black/5">
            <Import className="h-5 w-5 text-[#bb2720]" />
            Déposer le devis pour l'importer
          </div>
        </div>
      )}

      {yearOverviewOpen && (
        <YearOverviewOverlay
          initialYear={visibleMonth.getFullYear()}
          events={visibleProductionEvents}
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
          googleAutoSyncStatus={googleAutoSyncStatus}
          notifications={notifications}
          notificationsHydrated={notificationsHydrated}
          notificationsOpen={notificationsOpen}
          setNotificationsOpen={setNotificationsOpen}
          searchActive={searchOpen}
          onOpenNotification={handleNotificationOpen}
          onDismissNotification={markNotificationRead}
          onOpenTasks={() => {
            setYearOverviewOpen(false);
            openTasksFromHeader();
          }}
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
          canImportNativeMstvCalendar={false}
          canOpenTrash={permissions.canRestoreEvents || permissions.canPermanentDeleteEvents}
          onSelectMonth={selectYearOverviewMonth}
        />
      )}

      {createModalOpen && (
        <EventEditorModal
          selectedDateKey={selectedDateKey}
          event={editingEvent}
          syncCalendars={writableExternalCalendars}
          DatePickerComponent={MstvDatePicker}
          formatFullDate={formatFullDate}
          getUserFacingErrorMessage={getUserFacingErrorMessage}
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
          syncCalendars={writableExternalCalendars}
          events={visibleProductionEvents}
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
          onAuthExpired={handleInvalidAuthSession}
        />
      )}

      {nativeMstvIcsImportOpen && (
        <NativeMstvIcsImportModal
          onClose={() => setNativeMstvIcsImportOpen(false)}
          onImport={importNativeMstvIcsEvents}
        />
      )}

      {duplicateDatePickerEvent && (
        <MstvDatePicker
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
          googleAccounts={googleCalendarAccounts}
          googleCalendarsByAccountId={googleCalendarsByAccountId}
          googleLoading={googleCalendarLoading}
          connectingGoogle={connectingGoogleCalendar}
          appleAccounts={appleCalendarAccounts}
          appleCalendarsByAccountId={appleCalendarsByAccountId}
          appleLoading={appleCalendarLoading}
          connectingApple={connectingAppleCalendar}
          loading={externalCalendarSettingsLoading}
          error={externalCalendarSettingsError}
          syncingCalendarId={syncingExternalCalendarId}
          syncProgress={externalCalendarSyncProgress}
          onClose={() => setExternalCalendarSettingsOpen(false)}
          onCreate={createExternalCalendar}
          onUpdate={updateExternalCalendar}
          onReorder={reorderExternalCalendars}
          onConnectGoogle={connectGoogleCalendar}
          onDisconnectGoogle={disconnectGoogleCalendar}
          onConnectApple={connectAppleCalendar}
          onDisconnectApple={disconnectAppleCalendar}
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
              if (isSessionExpiredError(syncError)) {
                setExternalCalendarSettingsError(null);
                throw syncError;
              }
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

    </main>
  );
}

function AppHeader({
  screen,
  setScreen,
  yearLabel,
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
  googleAutoSyncStatus,
  notifications,
  notificationsHydrated,
  notificationsOpen,
  setNotificationsOpen,
  searchActive,
  onOpenNotification,
  onDismissNotification,
  onOpenTasks,
  onImportQuote,
  onImportNativeMstvCalendar,
  onSearch,
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
  googleAutoSyncStatus: GoogleAutoSyncStatus;
  notifications: AppNotification[];
  notificationsHydrated: boolean;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  searchActive: boolean;
  onOpenNotification: (notification: AppNotification) => void;
  onDismissNotification: (notification: AppNotification) => void;
  onOpenTasks: () => void;
  onImportQuote: () => void;
  onImportNativeMstvCalendar: () => void;
  onSearch: () => void;
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
  const createMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const hasCreateMenuActions = canImportQuote || canCreateEvent || canDuplicateEvent || canDeleteEvent || canOpenTrash;
  const unreadNotificationCount = notifications.filter((notification) => !notification.readAt && importantNotificationTypes.has(notification.type)).length;

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
          <HeaderIcon label="Tâches" icon={ListTodo} active={screen === "tasks"} onClick={onOpenTasks} />
          <HeaderIcon label="Rechercher" icon={Search} active={searchActive} onClick={onSearch} />
          <NotificationMenu
            notifications={notifications}
            hydrated={notificationsHydrated}
            unreadCount={unreadNotificationCount}
            open={notificationsOpen}
            setOpen={setNotificationsOpen}
            onOpenNotification={onOpenNotification}
            onDismissNotification={onDismissNotification}
          />
          {hasCreateMenuActions && (
            <div className="relative">
              <button
                ref={createMenuButtonRef}
                onClick={() => setCreateMenuOpen((current) => !current)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#bb2720] text-base font-semibold leading-none text-white transition hover:bg-[#bb2720] active:bg-[#bb2720] focus:bg-[#bb2720] focus-visible:bg-[#bb2720] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bb2720]/35"
                aria-label="Créer"
                aria-pressed={createMenuOpen}
              >
                +
              </button>
              <MstvPopover
                open={createMenuOpen}
                anchorRef={createMenuButtonRef}
                onClose={() => setCreateMenuOpen(false)}
                placement="bottom-end"
                matchAnchorWidth={false}
                minWidth={224}
                maxWidth={224}
              >
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
              </MstvPopover>
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
          {(screen === "calendar" || screen === "detail" || screen === "tasks") && (
            <button
              type="button"
              onClick={onOpenYearOverview}
              className="rounded-full border border-transparent bg-white px-2.5 py-1.5 text-base font-semibold text-neutral-700 transition hover:bg-neutral-50 sm:px-3"
            >
              {yearLabel}
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
          {(screen === "calendar" || screen === "detail" || screen === "tasks") && (
            <button
              onClick={goToday}
              className={cn(
                "rounded-full border px-2.5 py-2 text-base font-semibold transition sm:px-3",
                isSelectedDateToday
                  ? "border-transparent bg-[#bb2720]/[0.07] text-[#bb2720] hover:bg-[#bb2720]/[0.11]"
                  : "border-transparent bg-white text-neutral-700 hover:bg-neutral-50",
              )}
              aria-pressed={isSelectedDateToday}
            >
              Aujourd'hui
            </button>
          )}
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
  const hasActions = canImportQuote || canCreateEvent || canDuplicateEvent || canDeleteEvent || canOpenTrash;

  return (
    <div className="grid gap-0.5">
      {!hasActions && (
        <div className="px-4 py-3 text-right text-base font-medium text-neutral-400">
          Aucune action
        </div>
      )}
      {canImportQuote && (
        <button
          onClick={onImportQuote}
          className="block w-full rounded-xl px-4 py-3 text-right text-base font-medium text-neutral-700 transition hover:bg-[#bb2720]/[0.05] hover:text-neutral-950"
        >
          Importer un devis
        </button>
      )}
      {canCreateEvent && (
        <button
          onClick={onCreateEvent}
          className="block w-full rounded-xl px-4 py-3 text-right text-base font-medium text-neutral-700 transition hover:bg-[#bb2720]/[0.05] hover:text-neutral-950"
        >
          Créer un événement
        </button>
      )}
      {canDuplicateEvent && (
        <button
          onClick={onDuplicateEvent}
          className="block w-full rounded-xl px-4 py-3 text-right text-base font-medium text-neutral-700 transition hover:bg-[#bb2720]/[0.05] hover:text-neutral-950"
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
          className="flex w-full items-center justify-end rounded-xl px-4 py-3 text-neutral-500 transition hover:bg-[#bb2720]/[0.05] hover:text-neutral-800"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function getEventSearchText(event: ProductionEvent) {
  const display = getProductionEventDisplay(event);
  return normalizeLabel(
    [
      display.title,
      display.subtitle,
      event.date,
      formatFullDate(event.date),
      formatEventTimeRange(event),
      event.location,
      event.notes,
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

  useEscapeToClose(onClose);

  return (
    <div
      className={cn(modalBackdropClassName, "p-3 sm:p-6")}
      onPointerDown={(pointerEvent) => handleModalBackdropPointerDown(pointerEvent, onClose)}
    >
      <div
        className={cn(modalPanelClassName, "mx-auto flex h-full w-full max-w-2xl flex-col overflow-hidden p-3 sm:h-auto sm:max-h-[min(760px,calc(var(--app-height)-3rem))]")}
        onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
      >
        <div className="shrink-0 border-b border-neutral-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-xl bg-neutral-50 px-4">
              <Search className="h-4 w-4 shrink-0 text-neutral-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher"
                className="min-w-0 flex-1 bg-transparent text-base font-semibold text-neutral-950 outline-none placeholder:text-neutral-300"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-2xl px-3 text-base font-semibold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
            >
              Annuler
            </button>
          </div>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pt-3">
          {!normalizedQuery && (
            <div className="grid min-h-52 place-items-center rounded-2xl bg-neutral-50 px-6 py-8 text-center">
              <div>
                <Search className="mx-auto h-5 w-5 text-neutral-300" />
                <p className="mt-3 text-base font-semibold text-neutral-500">Rechercher un client, un événement ou une date.</p>
              </div>
            </div>
          )}
          {normalizedQuery && results.length === 0 && (
            <div className="grid min-h-52 place-items-center rounded-2xl bg-neutral-50 px-6 py-8 text-center">
              <p className="text-base font-semibold text-neutral-500">Aucun résultat</p>
            </div>
          )}
          {results.length > 0 && (
            <div className="space-y-1.5">
              {results.map((event) => {
                const timeRange = formatEventTimeRange(event);
                const display = getProductionEventDisplay(event);
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onOpenEvent(event.id)}
                    className="grid w-full grid-cols-[3px_1fr] items-center gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-neutral-50"
                  >
                    <span className="h-full min-h-14 rounded-full bg-[#bb2720]" />
                    <span className="min-w-0">
                      <span className="block truncate text-base font-semibold leading-snug text-neutral-950">{display.title}</span>
                      {display.subtitle && <span className="block truncate text-base font-medium text-neutral-500">{display.subtitle}</span>}
                      <span className="mt-1 block truncate text-sm font-semibold text-neutral-400">
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

function TeamTasksSheet({
  tasks,
  events,
  profiles,
  currentProfile,
  permissions,
  loading,
  error,
  navigationRequest,
  onClose,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onReorderTasks,
  onOpenEvent,
}: {
  tasks: AppTask[];
  events: ProductionEvent[];
  profiles: UserProfile[];
  currentProfile: UserProfile | null;
  permissions: AppPermissions;
  loading: boolean;
  error: string | null;
  navigationRequest: number;
  onClose: () => void;
  onCreateTask: (input: TaskCreateInput) => Promise<AppTask>;
  onUpdateTask: (task: AppTask, patch: TaskUpdatePatch) => Promise<void>;
  onDeleteTask: (task: AppTask) => Promise<void>;
  onReorderTasks: (orderedTasks: AppTask[], assignedProfileId: string | null) => Promise<void>;
  onOpenEvent: (eventId: string) => void;
}) {
  const nativeKeyboard = useNativeKeyboardVisibility<HTMLDivElement>();
  const suppressTaskOpenRef = useRef(false);
  const taskDetailSwipeStartRef = useRef<{ pointerId: number; x: number; y: number; startedAt: number; axis: "horizontal" | "vertical" | null } | null>(null);
  const suppressTaskDetailClickRef = useRef(false);
  const taskDetailViewportRef = useRef<HTMLDivElement | null>(null);
  const taskDetailTransitioningRef = useRef(false);
  const taskDetailTransitionTimeoutRef = useRef<number | null>(null);
  const lastTasksNavigationRequestRef = useRef(navigationRequest);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(() => currentProfile?.id ?? null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetailPagerOffset, setTaskDetailPagerOffset] = useState(0);
  const [taskDetailPagerTransitionEnabled, setTaskDetailPagerTransitionEnabled] = useState(false);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const [deleteTaskCandidate, setDeleteTaskCandidate] = useState<AppTask | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);
  const [deleteTaskError, setDeleteTaskError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 8,
      },
    }),
  );
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const taskPeople = useMemo(() => {
    if (!permissions.canManageEvents) return currentProfile ? [currentProfile] : [];
    return profiles.length > 0 ? profiles : currentProfile ? [currentProfile] : [];
  }, [currentProfile, permissions.canManageEvents, profiles]);
  const activeProfile = taskPeople.find((person) => person.id === selectedProfileId) ?? taskPeople[0] ?? null;
  const activeProfileId = activeProfile?.id ?? null;
  const canCreateForActiveProfile = Boolean(activeProfileId && (permissions.canManageEvents || activeProfileId === currentProfile?.id));
  const personTasks = useMemo(() => tasks.filter((task) => task.assignedProfileId === activeProfileId), [activeProfileId, tasks]);
  const todoTasks = useMemo(() => sortTaskQueue(personTasks.filter((task) => task.status === "todo")), [personTasks]);
  const doneTasks = useMemo(() => (
    [...personTasks]
      .filter((task) => task.status === "done")
      .sort((left, right) => (right.completedAt ?? right.updatedAt).localeCompare(left.completedAt ?? left.updatedAt))
      .slice(0, 12)
  ), [personTasks]);
  const todoTasksById = useMemo(() => new Map(todoTasks.map((task) => [task.id, task])), [todoTasks]);
  const profileRoleById = useMemo(() => new Map(profiles.map((person) => [person.id, person.role])), [profiles]);
  const orderedTodoTasks = useMemo(() => {
    const knownTasks = orderIds.map((id) => todoTasksById.get(id)).filter((task): task is AppTask => Boolean(task));
    const knownIds = new Set(knownTasks.map((task) => task.id));
    const mergedTasks = [...knownTasks, ...todoTasks.filter((task) => !knownIds.has(task.id))];
    return [...mergedTasks.filter(isTaskUrgent), ...mergedTasks.filter((task) => !isTaskUrgent(task))];
  }, [orderIds, todoTasks, todoTasksById]);
  const urgentTodoTasks = useMemo(() => orderedTodoTasks.filter(isTaskUrgent), [orderedTodoTasks]);
  const normalTodoTasks = useMemo(() => orderedTodoTasks.filter((task) => !isTaskUrgent(task)), [orderedTodoTasks]);
  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null;
  const selectedTaskNavigationTasks = useMemo(() => {
    if (!selectedTask) return [];
    return selectedTask.status === "done" ? doneTasks : orderedTodoTasks;
  }, [doneTasks, orderedTodoTasks, selectedTask]);
  const selectedTaskNavigationIndex = selectedTask ? selectedTaskNavigationTasks.findIndex((task) => task.id === selectedTask.id) : -1;
  const previousTaskDetailTask = selectedTaskNavigationIndex > 0 ? selectedTaskNavigationTasks[selectedTaskNavigationIndex - 1] : null;
  const nextTaskDetailTask = selectedTaskNavigationIndex >= 0 && selectedTaskNavigationIndex < selectedTaskNavigationTasks.length - 1 ? selectedTaskNavigationTasks[selectedTaskNavigationIndex + 1] : null;

  useEscapeToClose(onClose);

  useEffect(() => {
    setSelectedProfileId((currentId) => {
      if (currentId && taskPeople.some((person) => person.id === currentId)) return currentId;
      const currentUserPerson = currentProfile?.id ? taskPeople.find((person) => person.id === currentProfile.id) ?? null : null;
      return currentUserPerson?.id ?? taskPeople[0]?.id ?? null;
    });
  }, [currentProfile?.id, taskPeople]);

  useEffect(() => {
    if (draggingId) return;
    const nextIds = todoTasks.map((task) => task.id);
    setOrderIds((currentIds) => (currentIds.join("|") === nextIds.join("|") ? currentIds : nextIds));
  }, [draggingId, todoTasks]);

  useEffect(() => {
    if (navigationRequest === lastTasksNavigationRequestRef.current) return;
    lastTasksNavigationRequestRef.current = navigationRequest;

    if (selectedTask) {
      closeSelectedTaskEditor();
      return;
    }

    if (currentProfile?.id && taskPeople.some((person) => person.id === currentProfile.id)) {
      setSelectedProfileId(currentProfile.id);
    }
  }, [currentProfile?.id, navigationRequest, selectedTask, taskPeople]);

  useEffect(() => {
    return () => {
      if (taskDetailTransitionTimeoutRef.current !== null) {
        window.clearTimeout(taskDetailTransitionTimeoutRef.current);
      }
    };
  }, []);

  function canMoveTask(task: AppTask) {
    if (task.status !== "todo") return false;
    if (permissions.canManageEvents) return true;
    return Boolean(activeProfileId && currentProfile?.id && activeProfileId === currentProfile.id && task.assignedProfileId === currentProfile.id && !isTaskUrgent(task));
  }

  const sortableTodoTasks = useMemo(() => orderedTodoTasks.filter(canMoveTask), [activeProfileId, currentProfile?.id, orderedTodoTasks, permissions.canManageEvents]);
  const sortableTaskIds = useMemo(() => sortableTodoTasks.map((task) => task.id), [sortableTodoTasks]);
  const canSortAnyVisibleTasks = sortableTodoTasks.length > 1;

  function selectPerson(profileId: string) {
    if (!permissions.canManageEvents && profileId !== currentProfile?.id) return;
    setSelectedTaskId(null);
    setLocalError(null);
    setDragError(null);
    setSelectedProfileId(profileId);
  }

  async function persistDragOrder(nextIds: string[], previousIds: string[]) {
    const nextTasks = nextIds
      .map((id) => todoTasksById.get(id))
      .filter((task): task is AppTask => Boolean(task));

    try {
      await onReorderTasks(nextTasks, activeProfileId);
    } catch (reorderError) {
      setOrderIds(previousIds);
      setDragError(getUserFacingErrorMessage(reorderError, "Impossible d'enregistrer l'ordre des tâches."));
    }
  }

  function handleTaskDragStart(event: DragStartEvent) {
    suppressTaskOpenRef.current = true;
    setDraggingId(String(event.active.id));
    setDragError(null);
  }

  function handleTaskDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    window.setTimeout(() => {
      suppressTaskOpenRef.current = false;
    }, 250);
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;

    const previousIds = sortableTaskIds;
    const oldIndex = previousIds.indexOf(activeId);
    const newIndex = previousIds.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const nextIds = arrayMove(previousIds, oldIndex, newIndex);
    setOrderIds(nextIds);
    void persistDragOrder(nextIds, previousIds);
  }

  function handleTaskDragCancel() {
    setDraggingId(null);
    window.setTimeout(() => {
      suppressTaskOpenRef.current = false;
    }, 250);
  }

  async function createTaskForActiveProfile() {
    if (!activeProfileId || !canCreateForActiveProfile) return;
    setCreating(true);
    setLocalError(null);
    try {
      const createdTask = await onCreateTask({
        title: "Nouvelle tâche",
        eventId: null,
        assignedProfileId: activeProfileId,
        sortOrder: getNextTaskSortOrder(tasks, activeProfileId),
      });
      setSelectedTaskId(createdTask.id);
    } catch (createError) {
      setLocalError(getTaskCreateUserMessage(createError));
    } finally {
      setCreating(false);
    }
  }

  function openTaskDetail(taskId: string) {
    if (suppressTaskOpenRef.current) {
      suppressTaskOpenRef.current = false;
      return;
    }
    resetTaskDetailPager();
    setSelectedTaskId(taskId);
  }

  function closeSelectedTaskEditor() {
    resetTaskDetailPager();
    if (selectedTask?.assignedProfileId) {
      setSelectedProfileId(selectedTask.assignedProfileId);
    }
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
    window.setTimeout(() => setSelectedTaskId(null), 0);
  }

  function shouldBlockTaskDetailSwipeStart(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest(TASK_DETAIL_SWIPE_BLOCK_SELECTOR)) return true;

    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      activeElement.closest(TASK_DETAIL_ACTIVE_EDIT_SELECTOR)
    ) {
      return true;
    }

    return false;
  }

  function resetTaskDetailSwipe() {
    taskDetailSwipeStartRef.current = null;
  }

  function resetTaskDetailPager() {
    taskDetailTransitioningRef.current = false;
    taskDetailSwipeStartRef.current = null;
    if (taskDetailTransitionTimeoutRef.current !== null) {
      window.clearTimeout(taskDetailTransitionTimeoutRef.current);
      taskDetailTransitionTimeoutRef.current = null;
    }
    setTaskDetailPagerTransitionEnabled(false);
    setTaskDetailPagerOffset(0);
  }

  function finishTaskDetailSwipe(direction: -1 | 1, viewportWidth: number) {
    const targetTask = direction === 1 ? nextTaskDetailTask : previousTaskDetailTask;
    if (!targetTask || taskDetailTransitioningRef.current) return;
    const pageStep = getTaskDetailSwipePageStep(viewportWidth);

    taskDetailTransitioningRef.current = true;
    taskDetailSwipeStartRef.current = null;
    setTaskDetailPagerTransitionEnabled(true);
    setTaskDetailPagerOffset(direction === 1 ? -pageStep : pageStep);

    if (taskDetailTransitionTimeoutRef.current !== null) {
      window.clearTimeout(taskDetailTransitionTimeoutRef.current);
    }

    taskDetailTransitionTimeoutRef.current = window.setTimeout(() => {
      setSelectedTaskId(targetTask.id);
      setTaskDetailPagerTransitionEnabled(false);
      setTaskDetailPagerOffset(0);
      taskDetailTransitioningRef.current = false;
      taskDetailTransitionTimeoutRef.current = null;
    }, EVENT_DETAIL_CAROUSEL_TRANSITION_MS);
  }

  function snapTaskDetailSwipeBack() {
    setTaskDetailPagerTransitionEnabled(true);
    setTaskDetailPagerOffset(0);
    window.setTimeout(() => {
      if (!taskDetailTransitioningRef.current) {
        setTaskDetailPagerTransitionEnabled(false);
      }
    }, EVENT_DETAIL_CAROUSEL_TRANSITION_MS);
  }

  function handleTaskDetailSwipePointerDown(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (taskDetailTransitioningRef.current || taskDetailSwipeStartRef.current || shouldBlockTaskDetailSwipeStart(pointerEvent.target)) return;
    if (selectedTaskNavigationTasks.length <= 1) return;

    taskDetailSwipeStartRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      startedAt: window.performance.now(),
      axis: null,
    };
    setTaskDetailPagerTransitionEnabled(false);
    setTaskDetailPagerOffset(0);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  function handleTaskDetailSwipePointerMove(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    const swipeStart = taskDetailSwipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== pointerEvent.pointerId) return;

    const deltaX = pointerEvent.clientX - swipeStart.x;
    const deltaY = pointerEvent.clientY - swipeStart.y;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (!swipeStart.axis && (absDeltaX > EVENT_SWIPE_AXIS_ACTIVATION_PX || absDeltaY > EVENT_SWIPE_AXIS_ACTIVATION_PX)) {
      if (absDeltaX > EVENT_SWIPE_AXIS_ACTIVATION_PX && absDeltaX > absDeltaY * TASK_DETAIL_SWIPE_AXIS_DOMINANCE) {
        swipeStart.axis = "horizontal";
      } else if (absDeltaY > EVENT_SWIPE_AXIS_ACTIVATION_PX && absDeltaY >= absDeltaX) {
        swipeStart.axis = "vertical";
      }
    }

    if (swipeStart.axis === "vertical") {
      resetTaskDetailSwipe();
      return;
    }

    if (swipeStart.axis !== "horizontal") return;
    suppressTaskDetailClickRef.current = true;
    pointerEvent.preventDefault();

    const viewportWidth = taskDetailViewportRef.current?.clientWidth ?? pointerEvent.currentTarget.clientWidth;
    const pageStep = getTaskDetailSwipePageStep(viewportWidth);
    const maxOffset = previousTaskDetailTask ? pageStep : viewportWidth * 0.16;
    const minOffset = nextTaskDetailTask ? -pageStep : -viewportWidth * 0.16;
    setTaskDetailPagerOffset(Math.max(minOffset, Math.min(maxOffset, deltaX)));
  }

  function handleTaskDetailSwipePointerUp(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    const swipeStart = taskDetailSwipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== pointerEvent.pointerId) return;

    const deltaX = pointerEvent.clientX - swipeStart.x;
    const deltaY = pointerEvent.clientY - swipeStart.y;
    const viewportWidth = taskDetailViewportRef.current?.clientWidth ?? pointerEvent.currentTarget.clientWidth;
    const direction = deltaX < 0 ? 1 : -1;
    const canNavigate = direction === 1 ? Boolean(nextTaskDetailTask) : Boolean(previousTaskDetailTask);
    const elapsedMs = Math.max(1, window.performance.now() - swipeStart.startedAt);
    const horizontalVelocity = Math.abs(deltaX) / elapsedMs;
    resetTaskDetailSwipe();

    if (swipeStart.axis !== "horizontal") return;

    if (suppressTaskDetailClickRef.current) {
      window.setTimeout(() => {
        suppressTaskDetailClickRef.current = false;
      }, 0);
    }

    if (
      (
        Math.abs(deltaX) >= TASK_DETAIL_SWIPE_THRESHOLD_PX ||
        (Math.abs(deltaX) >= TASK_DETAIL_SWIPE_VELOCITY_MIN_DISTANCE_PX && horizontalVelocity >= TASK_DETAIL_SWIPE_VELOCITY_THRESHOLD_PX_PER_MS)
      ) &&
      Math.abs(deltaX) >= Math.abs(deltaY) * TASK_DETAIL_SWIPE_HORIZONTAL_DOMINANCE &&
      canNavigate
    ) {
      pointerEvent.preventDefault();
      finishTaskDetailSwipe(direction, viewportWidth);
      return;
    }

    snapTaskDetailSwipeBack();
  }

  function handleTaskDetailClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressTaskDetailClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressTaskDetailClickRef.current = false;
  }

  function handleTaskDetailSwipeCancel() {
    resetTaskDetailSwipe();
    snapTaskDetailSwipeBack();
  }

  function canDeleteTask(task: AppTask) {
    return permissions.canManageEvents || Boolean(currentProfile?.id && task.assignedProfileId === currentProfile.id && task.createdBy === currentProfile.id);
  }

  function canDuplicateTask(task: AppTask) {
    return permissions.canManageEvents || Boolean(currentProfile?.id && task.assignedProfileId === currentProfile.id);
  }

  const optionCreatorByTaskId = useMemo(() => {
    const creatorByTaskId = new Map<string, string | null>();
    events.forEach((event) => {
      event.options.forEach((option) => {
        if (option.taskId) {
          creatorByTaskId.set(option.taskId, option.createdByProfileId);
        }
      });
    });
    return creatorByTaskId;
  }, [events]);

  function getTaskSourceCreatorId(task: AppTask) {
    return optionCreatorByTaskId.get(task.id) ?? task.createdBy ?? null;
  }

  function wasCreatedByAdmin(task: AppTask) {
    const sourceCreatorId = getTaskSourceCreatorId(task);
    return Boolean(sourceCreatorId && profileRoleById.get(sourceCreatorId) === "admin");
  }

  async function duplicateTask(task: AppTask) {
    if (!canDuplicateTask(task)) return;
    setLocalError(null);
    setDragError(null);

    try {
      const assignedProfileId = task.assignedProfileId;
      const duplicatedTask = await onCreateTask({
        title: task.title,
        eventId: task.eventId,
        assignedProfileId,
        dueDate: task.dueDate,
        notes: task.notes,
        priority: "normal",
        sortOrder: getNextTaskSortOrder(tasks, assignedProfileId),
      });

      if (task.status !== "todo" || duplicatedTask.status !== "todo" || assignedProfileId !== activeProfileId) return;

      const reorderableTasks = permissions.canManageEvents
        ? orderedTodoTasks
        : orderedTodoTasks.filter((item) => canMoveTask(item));
      const queueWithoutDuplicate = reorderableTasks.filter((item) => item.id !== duplicatedTask.id);
      const originalIndex = queueWithoutDuplicate.findIndex((item) => item.id === task.id);
      if (originalIndex === -1) return;

      const nextQueue = [
        ...queueWithoutDuplicate.slice(0, originalIndex + 1),
        duplicatedTask,
        ...queueWithoutDuplicate.slice(originalIndex + 1),
      ];
      const previousIds = sortableTaskIds;
      const nextIds = nextQueue.map((item) => item.id);
      setOrderIds(nextIds);

      try {
        await onReorderTasks(nextQueue, assignedProfileId);
      } catch (reorderError) {
        setOrderIds(previousIds);
        setDragError(getUserFacingErrorMessage(reorderError, "La tâche a été dupliquée, mais l'ordre n'a pas pu être ajusté."));
      }
    } catch (duplicateError) {
      setLocalError(getUserFacingErrorMessage(duplicateError, "Impossible de dupliquer la tâche."));
    }
  }

  async function requestDeleteTask(task: AppTask) {
    if (!canDeleteTask(task)) return;
    setDeleteTaskError(null);
    setDeleteTaskCandidate(task);
  }

  async function confirmDeleteTask() {
    if (!deleteTaskCandidate || !canDeleteTask(deleteTaskCandidate)) return;
    setLocalError(null);
    setDeleteTaskError(null);
    setDeletingTask(true);
    try {
      await onDeleteTask(deleteTaskCandidate);
      if (selectedTaskId === deleteTaskCandidate.id) setSelectedTaskId(null);
      setDeleteTaskCandidate(null);
    } catch (deleteError) {
      setDeleteTaskError(getUserFacingErrorMessage(deleteError, "Impossible de supprimer la tâche."));
    } finally {
      setDeletingTask(false);
    }
  }

  function renderQueueTask(task: AppTask, completed = false) {
    const createdByAdmin = wasCreatedByAdmin(task);
    if (completed || !canSortAnyVisibleTasks || !canMoveTask(task)) {
      return (
        <TaskQueueRow
          key={task.id}
          task={task}
          selected={selectedTaskId === task.id}
          completed={completed}
          createdByAdmin={createdByAdmin}
          canDelete={canDeleteTask(task)}
          canDuplicate={canDuplicateTask(task)}
          onDelete={() => void requestDeleteTask(task)}
          onDuplicate={() => void duplicateTask(task)}
          onOpen={() => openTaskDetail(task.id)}
        />
      );
    }

    return (
      <SortableTaskRow
        key={task.id}
        task={task}
        selected={selectedTaskId === task.id}
        dragging={draggingId === task.id}
        createdByAdmin={createdByAdmin}
        canDrag={canMoveTask(task)}
        canDelete={canDeleteTask(task)}
        canDuplicate={canDuplicateTask(task)}
        onDelete={() => void requestDeleteTask(task)}
        onDuplicate={() => void duplicateTask(task)}
        onOpen={() => openTaskDetail(task.id)}
      />
    );
  }

  function renderTaskDetailPanel(task: AppTask) {
    return (
      <AdminTaskDetailPanel
        task={task}
        events={events}
        tasks={tasks}
        linkedEvent={task.eventId ? eventsById.get(task.eventId) ?? null : null}
        currentProfile={currentProfile}
        permissions={permissions}
        onUpdateTask={onUpdateTask}
        onDeleteTask={onDeleteTask}
        onOpenEvent={onOpenEvent}
        onNativeFieldFocus={nativeKeyboard.handleFieldFocus}
        onClose={closeSelectedTaskEditor}
      />
    );
  }

  return (
    <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <div
          ref={nativeKeyboard.scrollContainerRef}
          className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain"
          style={nativeKeyboard.scrollContainerStyle}
        >
          {(error) && <p className="mb-3 text-sm font-semibold text-rose-700">{error}</p>}
          {localError && <p className="mb-3 text-sm font-semibold text-rose-700">{localError}</p>}
          {loading && <p className="mb-3 rounded-2xl bg-neutral-50 px-3 py-4 text-center text-sm font-semibold text-neutral-400">Chargement...</p>}

          {!selectedTask && taskPeople.length > 0 && (
            <div className="flex items-end gap-2 border-b border-white/70">
              {permissions.canManageEvents ? (
                <div role="tablist" className="no-scrollbar flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
                  {taskPeople.map((person) => {
                    const firstName = person.firstName?.trim() || getProfileDisplayName(person)?.split(/\s+/)[0] || "Équipe";
                    const active = person.id === activeProfileId;
                    return (
                      <button
                        key={person.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onPointerDown={(event) => event.currentTarget.blur()}
                        onPointerUp={(event) => event.currentTarget.blur()}
                        onPointerCancel={(event) => event.currentTarget.blur()}
                        onClick={(event) => {
                          selectPerson(person.id);
                          event.currentTarget.blur();
                        }}
                        className={cn(
                          "shrink-0 rounded-t-xl border px-3 py-2 text-sm font-semibold transition focus:bg-transparent focus:shadow-none focus:outline-none focus-visible:bg-transparent focus-visible:shadow-none focus-visible:outline-none active:bg-transparent",
                          active
                            ? "border-neutral-200/80 border-b-white bg-white text-neutral-950 shadow-sm shadow-black/5"
                            : "border-neutral-200/35 bg-transparent text-neutral-300 hover:bg-transparent hover:text-neutral-300 active:bg-transparent active:text-neutral-300 focus:text-neutral-300",
                        )}
                      >
                        {firstName}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="min-w-0 flex-1" />
              )}
              <button
                type="button"
                onClick={() => void createTaskForActiveProfile()}
                disabled={!canCreateForActiveProfile || creating}
                className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xl font-semibold leading-none text-neutral-500 transition hover:bg-neutral-50 disabled:text-neutral-300"
                aria-label="Ajouter une tâche"
              >
                +
              </button>
            </div>
          )}

          {selectedTask ? (
            <div
              ref={taskDetailViewportRef}
              className={cn("no-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain", uiMotionClasses.taskSurfaceIn)}
              onPointerDownCapture={handleTaskDetailSwipePointerDown}
              onPointerMoveCapture={handleTaskDetailSwipePointerMove}
              onPointerUpCapture={handleTaskDetailSwipePointerUp}
              onPointerCancelCapture={handleTaskDetailSwipeCancel}
              onClickCapture={handleTaskDetailClickCapture}
              onClick={(event) => {
                if (event.target === event.currentTarget) closeSelectedTaskEditor();
              }}
            >
              <div
                className="flex w-[300%]"
                style={{
                  gap: `${TASK_DETAIL_SWIPE_PANEL_GAP_PX}px`,
                  transform: `translate3d(calc(-33.333333% - ${TASK_DETAIL_SWIPE_PANEL_GAP_PX}px + ${taskDetailPagerOffset}px), 0, 0)`,
                  transition: taskDetailPagerTransitionEnabled ? `transform ${EVENT_DETAIL_CAROUSEL_TRANSITION_MS}ms ${EVENT_DETAIL_CAROUSEL_EASING}` : undefined,
                }}
              >
                {[previousTaskDetailTask, selectedTask, nextTaskDetailTask].map((task, index) => (
                  <div key={task?.id ?? `empty-${index}`} className="w-1/3 shrink-0">
                    {task ? renderTaskDetailPanel(task) : <div className="min-h-20" aria-hidden="true" />}
                  </div>
                ))}
              </div>
            </div>
          ) : taskPeople.length === 0 ? (
            <p className="rounded-2xl bg-neutral-50 px-3 py-4 text-center text-sm font-medium text-neutral-400">Aucun membre disponible.</p>
          ) : (
            <div
              className={cn(
                "min-h-0 flex-1 overflow-hidden bg-white px-3",
                permissions.canManageEvents ? "rounded-b-2xl" : mstvRadiusClassNames.panel,
                uiMotionClasses.fadeIn,
              )}
            >
              <div className="no-scrollbar min-h-0 h-full touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain pb-4">
                {orderedTodoTasks.length === 0 ? (
                  <p className="rounded-2xl bg-white px-3 py-4 text-center text-sm font-medium text-neutral-300">Aucune tâche.</p>
                ) : canSortAnyVisibleTasks ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleTaskDragStart}
                    onDragEnd={handleTaskDragEnd}
                    onDragCancel={handleTaskDragCancel}
                  >
                    <SortableContext items={sortableTaskIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2 overflow-visible">
                        {urgentTodoTasks.length > 0 && (
                          <div className="sticky top-0 z-20 -mx-1 space-y-2 bg-white px-1 pb-2 pt-3">
                            {urgentTodoTasks.map((task) => renderQueueTask(task, false))}
                          </div>
                        )}
                        {normalTodoTasks.length > 0 && (
                          <div className={cn("grid gap-2", urgentTodoTasks.length === 0 && "pt-3")}>
                            {normalTodoTasks.map((task) => renderQueueTask(task, false))}
                          </div>
                        )}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="space-y-2 overflow-visible">
                    {urgentTodoTasks.length > 0 && (
                      <div className="sticky top-0 z-20 -mx-1 space-y-2 bg-white px-1 pb-2 pt-3">
                        {urgentTodoTasks.map((task) => renderQueueTask(task, false))}
                      </div>
                    )}
                    {normalTodoTasks.length > 0 && (
                      <div className={cn("grid gap-2", urgentTodoTasks.length === 0 && "pt-3")}>
                        {normalTodoTasks.map((task) => renderQueueTask(task, false))}
                      </div>
                    )}
                  </div>
                )}
                {dragError && <p className="px-1 pt-2 text-xs font-semibold text-rose-600">{dragError}</p>}

                {doneTasks.length > 0 && (
                  <section className="space-y-1 pt-2">
                    <p className="px-1 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-300">Terminé</p>
                    <div className="grid gap-1.5 overflow-visible">{doneTasks.map((task) => renderQueueTask(task, true))}</div>
                  </section>
                )}
              </div>
            </div>
          )}
          {deleteTaskCandidate && (
            <SharedConfirmationDialog
              title="Supprimer cette tâche ?"
              detailTitle={deleteTaskCandidate.title}
              confirmLabel="Supprimer"
              busyLabel="Suppression..."
              error={deleteTaskError}
              busy={deletingTask}
              elevated
              onCancel={() => {
                if (!deletingTask) setDeleteTaskCandidate(null);
              }}
              onConfirm={() => void confirmDeleteTask()}
            />
          )}
        </div>
    </section>
  );
}

function SortableTaskRow({
  task,
  selected,
  dragging = false,
  createdByAdmin,
  canDrag,
  canDelete,
  canDuplicate,
  onDelete,
  onDuplicate,
  onOpen,
}: {
  task: AppTask;
  selected: boolean;
  dragging?: boolean;
  createdByAdmin: boolean;
  canDrag: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: !canDrag,
  });
  const rowIsDragging = dragging || isDragging;
  const verticalTransform = transform ? { ...transform, x: 0 } : null;
  const style: CSSProperties = {
    transform: CSS.Transform.toString(verticalTransform),
    transition,
    zIndex: rowIsDragging ? 10 : undefined,
    position: rowIsDragging ? "relative" : undefined,
  };
  const setTaskRowRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    setActivatorNodeRef(node);
  };

  return (
    <div className="overflow-visible" style={style}>
      <TaskQueueRow
        ref={setTaskRowRef}
        task={task}
        selected={selected}
        dragging={rowIsDragging}
        createdByAdmin={createdByAdmin}
        draggable={canDrag}
        draggableProps={canDrag ? ({ ...attributes, ...listeners } as HTMLAttributes<HTMLDivElement>) : undefined}
        canDelete={canDelete}
        canDuplicate={canDuplicate}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onOpen={onOpen}
      />
    </div>
  );
}

const TaskQueueRow = forwardRef<HTMLDivElement, {
  task: AppTask;
  selected: boolean;
  completed?: boolean;
  dragging?: boolean;
  createdByAdmin?: boolean;
  draggable?: boolean;
  draggableProps?: HTMLAttributes<HTMLDivElement>;
  canDelete?: boolean;
  canDuplicate?: boolean;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onOpen: () => void;
}>(function TaskQueueRow({
  task,
  selected,
  completed = false,
  dragging = false,
  createdByAdmin = false,
  draggable = false,
  draggableProps,
  canDelete = false,
  canDuplicate = false,
  onDelete,
  onDuplicate,
  onOpen,
}, ref) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const pointerStartRef = useRef<{ pointerId: number; x: number; y: number; axis: "horizontal" | "vertical" | null } | null>(null);
  const stableRowWidthRef = useRef(0);
  const suppressClickRef = useRef(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [openAction, setOpenAction] = useState<"delete" | "duplicate" | null>(null);
  const taskSurface = getTaskSurfaceTone(task);
  const canSwipeDelete = canDelete && Boolean(onDelete);
  const canSwipeDuplicate = canDuplicate && Boolean(onDuplicate);
  const canSwipe = canSwipeDelete || canSwipeDuplicate;
  const baseOffset = canSwipeDelete && openAction === "delete"
    ? -TASK_ROW_SWIPE_ACTION_WIDTH
    : canSwipeDuplicate && openAction === "duplicate"
      ? TASK_ROW_SWIPE_ACTION_WIDTH
      : 0;
  const visibleOffset = swiping ? swipeOffset : baseOffset;
  const deleteActionVisible = canSwipeDelete && visibleOffset < -1;
  const duplicateActionVisible = canSwipeDuplicate && visibleOffset > 1;
  const taskStar = createdByAdmin
    ? {
        color: !completed && isTaskUrgent(task) ? "text-[#bb2720]" : "text-emerald-600",
        label: !completed && isTaskUrgent(task) ? "Urgente, créée par un administrateur" : "Créée par un administrateur",
      }
    : null;

  function setTaskQueueRowRef(node: HTMLDivElement | null) {
    rowRef.current = node;
    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  }

  function resetSwipe() {
    pointerStartRef.current = null;
    stableRowWidthRef.current = 0;
    setSwiping(false);
    setSwipeOffset(0);
  }

  function callDraggableHandler<TEvent extends ReactPointerEvent<HTMLDivElement>>(
    handler: HTMLAttributes<HTMLDivElement>["onPointerDown"] | HTMLAttributes<HTMLDivElement>["onPointerMove"] | HTMLAttributes<HTMLDivElement>["onPointerUp"] | HTMLAttributes<HTMLDivElement>["onPointerCancel"] | undefined,
    event: TEvent,
  ) {
    handler?.(event);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-task-row-swipe-action]")) return;
    if (canSwipe) {
      pointerStartRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        axis: null,
      };
      stableRowWidthRef.current = rowRef.current?.offsetWidth ?? event.currentTarget.offsetWidth ?? TASK_ROW_SWIPE_ACTION_WIDTH;
      setSwiping(true);
      setSwipeOffset(baseOffset);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    callDraggableHandler(draggableProps?.onPointerDown, event);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    callDraggableHandler(draggableProps?.onPointerMove, event);
    if (!canSwipe) return;
    const pointerStart = pointerStartRef.current;
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (!pointerStart.axis && (absDeltaX > EVENT_SWIPE_AXIS_ACTIVATION_PX || absDeltaY > EVENT_SWIPE_AXIS_ACTIVATION_PX)) {
      if (absDeltaX > EVENT_SWIPE_AXIS_ACTIVATION_PX && absDeltaX > absDeltaY * EVENT_SWIPE_AXIS_DOMINANCE) {
        pointerStart.axis = "horizontal";
      } else if (absDeltaY > EVENT_SWIPE_AXIS_ACTIVATION_PX && absDeltaY >= absDeltaX) {
        pointerStart.axis = "vertical";
        suppressClickRef.current = true;
      }
    }

    if (pointerStart.axis === "vertical") return;
    if (pointerStart.axis !== "horizontal") return;

    const rowWidth = stableRowWidthRef.current || rowRef.current?.offsetWidth || TASK_ROW_SWIPE_ACTION_WIDTH;
    const minOffset = canSwipeDelete ? -rowWidth : 0;
    const maxOffset = canSwipeDuplicate ? rowWidth : 0;
    const nextOffset = Math.max(minOffset, Math.min(maxOffset, baseOffset + deltaX));
    suppressClickRef.current = true;
    event.preventDefault();
    setSwipeOffset(nextOffset);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    callDraggableHandler(draggableProps?.onPointerUp, event);
    if (!canSwipe) return;
    const pointerStart = pointerStartRef.current;
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - pointerStart.x;
    const rowWidth = stableRowWidthRef.current || rowRef.current?.offsetWidth || TASK_ROW_SWIPE_ACTION_WIDTH;
    const minOffset = canSwipeDelete ? -rowWidth : 0;
    const maxOffset = canSwipeDuplicate ? rowWidth : 0;
    const finalOffset = Math.max(minOffset, Math.min(maxOffset, baseOffset + deltaX));
    const fullSwipeThreshold = rowWidth * TASK_ROW_FULL_SWIPE_RATIO;
    const shouldRequestDelete = canSwipeDelete && finalOffset <= -fullSwipeThreshold;
    const shouldRequestDuplicate = canSwipeDuplicate && finalOffset >= fullSwipeThreshold;
    const shouldOpenDelete = canSwipeDelete && finalOffset < -TASK_ROW_SWIPE_ACTION_WIDTH / 2;
    const shouldOpenDuplicate = canSwipeDuplicate && finalOffset > TASK_ROW_SWIPE_ACTION_WIDTH / 2;

    const wasHorizontalSwipe = pointerStart.axis === "horizontal";
    resetSwipe();

    if (!wasHorizontalSwipe) return;

    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    if (shouldRequestDelete) {
      setOpenAction(null);
      onDelete?.();
    } else if (shouldRequestDuplicate) {
      setOpenAction(null);
      onDuplicate?.();
    } else if (shouldOpenDelete) {
      setOpenAction("delete");
    } else if (shouldOpenDuplicate) {
      setOpenAction("duplicate");
    } else {
      setOpenAction(null);
    }
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    callDraggableHandler(draggableProps?.onPointerCancel, event);
    resetSwipe();
  }

  function handleRowClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (openAction) {
      setOpenAction(null);
      return;
    }

    onOpen();
  }

  return (
    <div
      ref={setTaskQueueRowRef}
      data-task-swipe-row
      className="relative mx-0.5 overflow-hidden rounded-xl"
      {...draggableProps}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {canSwipeDuplicate && (
        <button
          type="button"
          data-task-row-swipe-action
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpenAction(null);
            onDuplicate?.();
          }}
          className={cn(
            "absolute inset-y-0 left-0 z-0 flex w-full items-center justify-start rounded-l-xl bg-emerald-600 pl-5 text-base font-semibold text-white transition hover:bg-emerald-700",
            duplicateActionVisible ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          Dupliquer
        </button>
      )}
      {canSwipeDelete && (
        <button
          type="button"
          data-task-row-swipe-action
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpenAction(null);
            onDelete?.();
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
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (openAction) {
          setOpenAction(null);
        } else {
          onOpen();
        }
      }}
      style={{ transform: `translateX(${canSwipe ? visibleOffset : 0}px)`, touchAction: "pan-y" }}
      className={cn(
        "group relative z-10 flex min-h-11 select-none items-center gap-2 rounded-xl px-3 py-2 transition",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        taskSurface.row,
        dragging && "bg-white opacity-90 shadow-sm shadow-black/5",
        swiping ? "transition-none" : "transition-transform duration-200 ease-out",
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-left text-base font-semibold leading-snug transition",
          taskSurface.title,
        )}
      >
        {task.title}
      </span>
      {taskStar && (
        <span className="ml-auto inline-flex shrink-0 items-center justify-end">
          <span className={cn("inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-xs font-bold leading-none", taskStar.color)} aria-label={taskStar.label} title={taskStar.label}>
            ★
          </span>
        </span>
      )}
      </div>
    </div>
  );
});

function AdminTaskDetailPanel({
  task,
  events,
  tasks,
  linkedEvent,
  currentProfile,
  permissions,
  onUpdateTask,
  onDeleteTask,
  onOpenEvent,
  onNativeFieldFocus,
  onClose,
}: {
  task: AppTask;
  events: ProductionEvent[];
  tasks: AppTask[];
  linkedEvent: ProductionEvent | null;
  currentProfile: UserProfile | null;
  permissions: AppPermissions;
  onUpdateTask: (task: AppTask, patch: TaskUpdatePatch) => Promise<void>;
  onDeleteTask: (task: AppTask) => Promise<void>;
  onOpenEvent: (eventId: string) => void;
  onNativeFieldFocus?: (target: HTMLElement) => boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [eventQuery, setEventQuery] = useState("");
  const [eventSearchOpen, setEventSearchOpen] = useState(false);
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const eventSearchInputRef = useRef<HTMLInputElement | null>(null);
  const done = task.status === "done";
  const taskTone = getTaskTone(task);
  const assignedToCurrentProfile = Boolean(currentProfile?.id && task.assignedProfileId === currentProfile.id);
  const createdByCurrentProfile = Boolean(currentProfile?.id && task.createdBy === currentProfile.id);
  const canEditContent = permissions.canManageEvents || (assignedToCurrentProfile && createdByCurrentProfile);
  const canToggleStatus = permissions.canManageEvents || assignedToCurrentProfile;
  const canEditUrgent = Boolean(
    permissions.canManageEvents &&
    (isTaskUrgent(task) || (task.assignedProfileId && countActiveUrgentTasksForProfile(tasks, task.assignedProfileId, task.id) < maxUrgentTasksPerPerson)),
  );
  const canEditEventLink = permissions.canManageEvents;
  const canDelete = permissions.canManageEvents || (assignedToCurrentProfile && createdByCurrentProfile);
  const eventCandidates = useMemo(() => {
    const query = normalizeLabel(eventQuery);
    if (query.length < 2) return [];
    return events
      .filter((event) => {
        const display = getProductionEventDisplay(event);
        const haystack = normalizeLabel(`${display.title} ${display.subtitle ?? ""} ${formatFullDate(event.date)}`);
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [eventQuery, events]);

  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setEventQuery("");
    setEventSearchOpen(false);
    setLocalError(null);
    setDueDatePickerOpen(false);
  }, [task.id, task.title, task.notes]);

  async function updateTaskSafely(patch: TaskUpdatePatch) {
    const patchKeys = Object.keys(patch);
    const canApplyPatch = permissions.canManageEvents ||
      (assignedToCurrentProfile && patchKeys.every((key) => key === "status")) ||
      (canEditContent && patchKeys.every((key) => ["title", "dueDate", "notes", "status", "sortOrder"].includes(key)));
    if (!canApplyPatch) return;
    setSaving(true);
    setLocalError(null);
    try {
      await onUpdateTask(task, patch);
    } catch (updateError) {
      setLocalError(getUserFacingErrorMessage(updateError, "Impossible de modifier la tâche."));
      setTitle(task.title);
      setNotes(task.notes ?? "");
    } finally {
      setSaving(false);
    }
  }

  async function requestDeleteTask() {
    if (!canDelete) return;
    setDeleteConfirmationOpen(true);
  }

  async function confirmDeleteTask() {
    if (!canDelete) return;
    try {
      setSaving(true);
      await onDeleteTask(task);
      onClose();
    } catch (deleteError) {
      setLocalError(getUserFacingErrorMessage(deleteError, "Impossible de supprimer la tâche."));
      setSaving(false);
    }
  }

  return (
    <>
    <div className={cn(mstvRadiusClassNames.panel, "p-3", taskTone.panel)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={onClose} className={cn("rounded-xl bg-white px-3 py-1.5 text-sm font-semibold transition hover:bg-neutral-50", taskTone.actionText)}>
          Retour
        </button>
        {canDelete && (
          <button
            type="button"
            data-task-swipe-block
            onClick={() => void requestDeleteTask()}
            disabled={saving}
            className="h-9 rounded-xl bg-[#bb2720]/[0.07] px-3 text-sm font-semibold text-[#bb2720] transition hover:bg-[#bb2720]/[0.11] disabled:text-neutral-300"
          >
            Supprimer
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className={cn("grid items-center gap-2", canEditUrgent ? "grid-cols-[minmax(0,1fr)_auto_auto]" : "grid-cols-[minmax(0,1fr)_auto]")}>
          <input
            {...iosKeyboardGuardProps}
            value={title}
            disabled={saving || !canEditContent}
            onFocus={(event) => onNativeFieldFocus?.(event.currentTarget)}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (title.trim() !== task.title) void updateTaskSafely({ title });
            }}
            className={cn("h-10 min-w-0 rounded-xl bg-white px-3 text-base font-semibold outline-none transition focus:bg-white", done ? "text-neutral-500 line-through" : taskTone.title)}
          />
          {canEditUrgent && (
            <label className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#bb2720]/[0.07] px-2 text-xs font-semibold text-[#bb2720] transition hover:bg-[#bb2720]/[0.11] sm:px-3 sm:text-sm">
              <input
                type="checkbox"
                checked={isTaskUrgent(task)}
                disabled={saving}
                onChange={(event) => void updateTaskSafely({ priority: event.target.checked ? "urgent" : "normal" })}
                className="h-3.5 w-3.5 rounded border-neutral-300 accent-[#bb2720]"
              />
              Urgent
            </label>
          )}
          <label className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white px-2 text-xs font-semibold transition sm:px-3 sm:text-sm", taskTone.actionText)}>
            <input
              type="checkbox"
              checked={done}
              disabled={saving || !canToggleStatus}
              onChange={(event) => void updateTaskSafely({ status: event.target.checked ? "done" : "todo" })}
              className="h-3.5 w-3.5 rounded border-neutral-300 accent-neutral-600"
            />
            Terminé
          </label>
        </div>

        <label className="block">
          <span className={cn("mb-1 block px-1 text-xs font-semibold uppercase tracking-[0.08em]", taskTone.meta)}>Échéance</span>
          <button
            type="button"
            disabled={saving || !canEditContent}
            onClick={() => setDueDatePickerOpen(true)}
            className={cn("h-10 w-full rounded-xl bg-white px-3 text-left text-base font-semibold outline-none transition hover:bg-neutral-50 disabled:text-neutral-300", taskTone.actionText)}
          >
            {task.dueDate ? formatFullDate(task.dueDate) : "Choisir une date"}
          </button>
        </label>

        <label className="block">
          <span className={cn("mb-1 block px-1 text-xs font-semibold uppercase tracking-[0.08em]", taskTone.meta)}>Notes</span>
          <textarea
            {...iosKeyboardGuardProps}
            value={notes}
            disabled={saving || !canEditContent}
            rows={4}
            onFocus={(event) => onNativeFieldFocus?.(event.currentTarget)}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => {
              if (notes.trim() !== (task.notes ?? "")) void updateTaskSafely({ notes });
            }}
            className={cn("min-h-24 w-full resize-none rounded-xl bg-white px-3 py-2 text-base font-medium leading-relaxed outline-none transition placeholder:text-neutral-300 focus:bg-white", taskTone.body)}
            placeholder="Notes"
          />
        </label>
      </div>

      <div className="mt-2 rounded-xl bg-white px-3 py-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className={cn("text-xs font-semibold uppercase tracking-[0.08em]", taskTone.meta)}>Événement lié</span>
          {linkedEvent && canEditEventLink && (
            <button
              type="button"
              onClick={() => void updateTaskSafely({ eventId: null })}
              disabled={saving}
              className="text-xs font-semibold text-neutral-400 transition hover:text-rose-600 disabled:text-neutral-300"
            >
              Retirer
            </button>
          )}
        </div>
        {linkedEvent ? (
          <button
            type="button"
            onClick={() => onOpenEvent(linkedEvent.id)}
            className="block w-full truncate rounded-xl py-1 text-left text-base font-semibold text-neutral-600 transition hover:text-neutral-950"
          >
            {getProductionEventDisplay(linkedEvent).title} · {formatShortDate(linkedEvent.date)}
          </button>
        ) : (
          <p className="py-1 text-sm font-semibold text-neutral-400">Aucun événement lié</p>
        )}
        {canEditEventLink && (
          <div className="mt-2 space-y-1.5">
            <input
              {...iosKeyboardGuardProps}
              ref={eventSearchInputRef}
              value={eventQuery}
              disabled={saving}
              onFocus={(event) => {
                onNativeFieldFocus?.(event.currentTarget);
                setEventSearchOpen(true);
              }}
              onChange={(event) => {
                setEventQuery(event.target.value);
                setEventSearchOpen(true);
              }}
              className="h-9 w-full rounded-xl bg-white px-3 text-base font-semibold text-neutral-700 outline-none transition placeholder:text-neutral-300 focus:bg-white"
              placeholder="Rechercher un événement"
            />
            <MstvPopover
              open={eventSearchOpen && eventCandidates.length > 0}
              anchorRef={eventSearchInputRef}
              onClose={() => setEventSearchOpen(false)}
              maxWidth={420}
            >
              <div className="grid gap-1">
                {eventCandidates.map((event) => {
                  const display = getProductionEventDisplay(event);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setEventQuery("");
                        setEventSearchOpen(false);
                        void updateTaskSafely({ eventId: event.id });
                      }}
                      className="grid min-w-0 gap-0.5 rounded-xl bg-white px-2.5 py-2 text-left transition hover:bg-neutral-50 disabled:text-neutral-300"
                    >
                      <span className="truncate text-sm font-semibold text-neutral-700">{display.title}</span>
                      <span className="truncate text-xs font-semibold text-neutral-400">{formatShortDate(event.date)}</span>
                    </button>
                  );
                })}
              </div>
            </MstvPopover>
          </div>
        )}
      </div>
      {localError && <p className="mt-2 text-xs font-semibold text-rose-700">{localError}</p>}
    </div>
    {dueDatePickerOpen && (
      <MstvDatePicker
        selectedDate={task.dueDate ?? linkedEvent?.date ?? formatDateKey(new Date())}
        allowSelectingCurrentDate={!task.dueDate}
        onClose={() => setDueDatePickerOpen(false)}
        onSelectDate={async (dateKey) => {
          await updateTaskSafely({ dueDate: dateKey });
          setDueDatePickerOpen(false);
        }}
      />
    )}
    {deleteConfirmationOpen && (
      <SharedConfirmationDialog
        title="Supprimer cette tâche ?"
        detailTitle={task.title}
        confirmLabel="Supprimer"
        busyLabel="Suppression..."
        error={localError}
        busy={saving}
        elevated
        onCancel={() => {
          if (!saving) setDeleteConfirmationOpen(false);
        }}
        onConfirm={() => void confirmDeleteTask()}
      />
    )}
    </>
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
  googleAutoSyncStatus,
  notifications,
  notificationsHydrated,
  notificationsOpen,
  setNotificationsOpen,
  searchActive,
  onOpenNotification,
  onDismissNotification,
  onOpenTasks,
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
  googleAutoSyncStatus: GoogleAutoSyncStatus;
  notifications: AppNotification[];
  notificationsHydrated: boolean;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  searchActive: boolean;
  onOpenNotification: (notification: AppNotification) => void;
  onDismissNotification: (notification: AppNotification) => void;
  onOpenTasks: () => void;
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
    const scrollableYearPage = (wheelEvent.target as HTMLElement).closest<HTMLElement>("[data-year-overview-page]");
    if (scrollableYearPage && scrollableYearPage.scrollHeight > scrollableYearPage.clientHeight + 1) {
      const canScrollDown = wheelEvent.deltaY > 0 && scrollableYearPage.scrollTop + scrollableYearPage.clientHeight < scrollableYearPage.scrollHeight - 1;
      const canScrollUp = wheelEvent.deltaY < 0 && scrollableYearPage.scrollTop > 1;
      if (canScrollDown || canScrollUp) return;
    }

    if (wheelLockRef.current || Math.abs(wheelEvent.deltaY) < 36 || Math.abs(wheelEvent.deltaY) < Math.abs(wheelEvent.deltaX)) return;
    animateYearChange(wheelEvent.deltaY > 0 ? 1 : -1);
    wheelLockRef.current = window.setTimeout(() => {
      wheelLockRef.current = null;
    }, 420);
  }

  const yearPageStep = getYearPageStep();

  return (
    <div className="fixed inset-x-0 top-0 z-50 h-[var(--app-height)] overflow-hidden bg-[var(--app-background)] px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top)+var(--app-viewport-offset-top))] sm:px-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pt-[calc(1.5rem+env(safe-area-inset-top)+var(--app-viewport-offset-top))] lg:px-8">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col">
        <AppHeader
          screen="calendar"
          setScreen={() => undefined}
          yearLabel={String(displayYear)}
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
          googleAutoSyncStatus={googleAutoSyncStatus}
          notifications={notifications}
          notificationsHydrated={notificationsHydrated}
          notificationsOpen={notificationsOpen}
          setNotificationsOpen={setNotificationsOpen}
          searchActive={searchActive}
          onOpenNotification={onOpenNotification}
          onDismissNotification={onDismissNotification}
          onOpenTasks={onOpenTasks}
          onImportQuote={onImportQuote}
          onImportNativeMstvCalendar={onImportNativeMstvCalendar}
          onSearch={onSearch}
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
        className="mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-hidden px-0.5 sm:px-1 lg:px-2"
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
    <section data-year-overview-page className="no-scrollbar flex w-full shrink-0 flex-col overflow-y-auto overscroll-contain" style={{ height: pageHeight ? `${pageHeight}px` : "100%" }}>
      <div className="grid grid-cols-3 content-start gap-x-4 gap-y-3 px-1 py-1.5 sm:gap-x-7 sm:gap-y-4 sm:px-2 sm:py-2 lg:gap-x-9 lg:gap-y-5 xl:grid-cols-4 xl:gap-x-12 xl:gap-y-5">
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
      className="flex min-h-[124px] min-w-0 flex-col overflow-visible px-0.5 py-0.5 text-left sm:min-h-[136px] sm:px-1 sm:py-1 lg:min-h-[152px]"
    >
      <span
        className={cn(
          "relative flex w-full min-w-0 flex-1 flex-col overflow-visible rounded-[1.15rem] px-1 pb-1.5 pt-1.5 transition-colors hover:bg-white/[0.28] sm:rounded-[1.2rem] sm:px-2 sm:pb-2 sm:pt-2 lg:px-2.5 lg:pb-2.5 lg:pt-2.5",
        )}
      >
      {isVisibleMonth && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1.5 rounded-[1.35rem] bg-white/[0.58] sm:-inset-2 sm:rounded-[1.45rem] lg:-inset-2.5"
        />
      )}
      <span className={cn("relative z-10 mb-1.5 block truncate text-xs font-semibold leading-none sm:mb-2 sm:text-sm lg:mb-2", isVisibleMonth ? "text-[#bb2720]" : "text-neutral-950")}>
        {monthName}
      </span>
      <span className="relative z-10 grid min-h-0 grid-cols-7 content-start gap-x-1.5 gap-y-1 sm:gap-x-2.5 sm:gap-y-1.5 lg:gap-x-3 lg:gap-y-1.5">
        {weekdays.map((weekday, index) => (
          <span key={`${weekday}-${index}`} className={cn("text-center text-[0.5rem] font-semibold leading-[1.1] sm:text-[0.55rem] lg:text-[0.6rem]", index >= 5 ? "text-neutral-300" : "text-neutral-400")}>
            {weekday}
          </span>
        ))}
        {Array.from({ length: monthData.leadingEmptyDays }).map((_, index) => (
          <span key={`empty-start-${index}`} className="h-4 w-4 justify-self-center sm:h-[1.125rem] sm:w-[1.125rem] lg:h-5 lg:w-5" />
        ))}
        {monthData.calendarDays.map((day, index) => {
          const position = monthData.leadingEmptyDays + index;
          const isWeekend = position % 7 >= 5;
          const isToday = day.dateKey === todayKey;
          return (
            <span key={day.dateKey} className="relative flex h-4 w-4 min-w-0 items-center justify-center justify-self-center sm:h-[1.125rem] sm:w-[1.125rem] lg:h-5 lg:w-5">
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-semibold leading-none sm:h-[1.125rem] sm:w-[1.125rem] sm:text-[0.64rem] lg:h-5 lg:w-5 lg:text-[0.7rem]",
                  isToday ? "bg-[#bb2720] text-white" : isWeekend ? "text-neutral-400" : "text-neutral-700",
                )}
              >
                {day.day}
              </span>
            </span>
          );
        })}
        {Array.from({ length: monthData.trailingEmptyDays }).map((_, index) => (
          <span key={`empty-end-${index}`} className="h-4 w-4 justify-self-center sm:h-[1.125rem] sm:w-[1.125rem] lg:h-5 lg:w-5" />
        ))}
      </span>
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
  unreadChangeSummaries,
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
  unreadChangeSummaries: Map<string, EventUnreadSummary>;
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
          unreadChangeSummaries={unreadChangeSummaries}
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
          unreadChangeSummaries={unreadChangeSummaries}
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
          unreadChangeSummaries={unreadChangeSummaries}
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
  unreadChangeSummaries,
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
  unreadChangeSummaries: Map<string, EventUnreadSummary>;
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
          <h1 className="text-4xl font-semibold leading-none text-neutral-950 sm:text-6xl">{monthData.monthTitle}</h1>
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
          className="mt-4 overflow-hidden rounded-3xl bg-white/70 p-0"
        >
          <div className="grid grid-cols-7">
            {weekdays.map((weekday, index) => (
              <div
                key={`${weekday}-${index}`}
                style={index >= 5 ? weekendColumnTintStyle : undefined}
                className="flex min-w-0 items-center justify-center px-1 py-2.5 text-base font-semibold uppercase tracking-normal text-neutral-500"
              >
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
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5 pr-2 pt-2">
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
          unreadChangeSummaries={unreadChangeSummaries}
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
      {Array.from({ length: monthData.leadingEmptyDays }).map((_, index) => {
        const isWeekendColumn = index % 7 >= 5;
        return (
          <div
            key={`empty-${index}`}
            style={isWeekendColumn ? weekendColumnTintStyle : undefined}
            className="h-[70px] border-b border-neutral-200/45 bg-white/25 sm:h-[88px] lg:h-[clamp(72px,9svh,112px)]"
          />
        );
      })}
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
          ...dayEvents.slice(0, 4).map((event) => {
            const externalLink = getPrimaryExternalEventLink(event);
            if (externalLink?.calendarColor) {
              const tone = getExternalCalendarTone(externalLink.calendarColor);
              return { key: event.id, className: tone.dot, style: tone.dotStyle };
            }
            return { key: event.id, className: "bg-[#bb2720]" };
          }),
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
            style={isWeekend ? weekendColumnTintStyle : undefined}
            className={cn(
              "group flex h-[70px] flex-col items-center justify-start gap-1 bg-white/35 px-1 py-2.5 transition hover:bg-white/80 sm:h-[88px] sm:py-3 lg:h-[clamp(72px,9svh,112px)] lg:px-2 lg:py-4",
              schoolHolidayMarker && "bg-amber-50/60 hover:bg-amber-50/85",
              publicHolidayMarker && "bg-emerald-50/70 hover:bg-emerald-50/90",
              !isLastRow && "border-b border-neutral-200/45",
              !interactive && "pointer-events-none",
            )}
          >
            <span className="flex w-full items-start justify-center gap-1">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold text-neutral-800 lg:h-10 lg:w-10 lg:text-xl",
                  isWeekend && !isSelected && "text-neutral-500",
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
      {Array.from({ length: monthData.trailingEmptyDays }).map((_, index) => {
        const position = monthData.leadingEmptyDays + monthData.calendarDays.length + index;
        const isWeekendColumn = position % 7 >= 5;
        return (
          <div
            key={`trailing-${index}`}
            style={isWeekendColumn ? weekendColumnTintStyle : undefined}
            className="h-[70px] bg-white/25 sm:h-[88px] lg:h-[clamp(72px,9svh,112px)]"
          />
        );
      })}
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
  unreadChangeSummaries,
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
  unreadChangeSummaries: Map<string, EventUnreadSummary>;
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
          unreadCount={unreadChangeSummaries.get(event.id)?.count ?? 0}
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
              <span className="block text-base font-semibold leading-snug text-neutral-950">{marker.label}</span>
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

function UnreadCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-[#bb2720] bg-white px-1.5 text-xs font-bold leading-none text-[#bb2720] shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function UnreadDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("absolute right-2 top-2 h-2 w-2 rounded-full bg-[#bb2720]", className)} />;
}

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
        <span className="block text-base font-semibold leading-snug text-neutral-950">{event.title}</span>
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
  unreadCount,
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
  unreadCount: number;
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
  const timeRange = formatEventTimeRange(event);
  const externalLink = getPrimaryExternalEventLink(event);
  const externalTone = getExternalCalendarTone(externalLink?.calendarColor ?? null);
  const display = getProductionEventDisplay(event);

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
    <div data-calendar-swipe-row className="relative overflow-visible rounded-xl">
      {(canDuplicate || canDelete) && (
        <div className="absolute inset-0 overflow-hidden rounded-xl">
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
        </div>
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
        {unreadCount > 0 && <span className="pointer-events-none absolute -bottom-2 -right-2 z-30"><UnreadCountBadge count={unreadCount} /></span>}
        <span style={externalTone.stripeStyle} className={cn("h-full min-h-14 rounded-full", externalLink?.calendarColor ? externalTone.stripe : "bg-[#bb2720]")} />
        <span className="min-w-0">
          <span className="block text-base font-semibold leading-snug text-neutral-950">{display.title}</span>
          {display.subtitle && <span className="block truncate text-base font-medium text-neutral-500">{display.subtitle}</span>}
        </span>
        <span className="flex items-center justify-end gap-2 pl-2 text-right">
          {timeRange && <span className="text-base font-medium text-neutral-500">{timeRange}</span>}
        </span>
      </div>
    </div>
  );
}

function EventDetailCarousel({
  currentEvent,
  previousEvent,
  nextEvent,
  direction,
  targetId,
  onNavigateDirection,
  onTransitionComplete,
  renderPanel,
}: {
  currentEvent: ProductionEvent;
  previousEvent: ProductionEvent | null;
  nextEvent: ProductionEvent | null;
  direction: -1 | 1 | null;
  targetId: string | null;
  onNavigateDirection: (direction: -1 | 1) => void;
  onTransitionComplete: (targetId: string) => void;
  renderPanel: (event: ProductionEvent) => ReactNode;
}) {
  const swipeStartRef = useRef<{ pointerId: number; x: number; y: number; startedAt: number; axis: "horizontal" | "vertical" | null } | null>(null);
  const suppressClickRef = useRef(false);
  const snapBackTimeoutRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragTransitionEnabled, setDragTransitionEnabled] = useState(false);
  const trackTransform =
    direction === 1
      ? `translate3d(calc(-66.666666% - ${EVENT_DETAIL_CAROUSEL_GAP_PX}px), 0, 0)`
      : direction === -1
        ? "translate3d(0, 0, 0)"
        : `translate3d(calc(-33.333333% - ${EVENT_DETAIL_CAROUSEL_GAP_PX / 2}px + ${dragOffset}px), 0, 0)`;
  const panels: Array<{ key: string; event: ProductionEvent | null; current: boolean }> = [
    { key: `previous-${previousEvent?.id ?? "empty"}`, event: previousEvent, current: false },
    { key: `current-${currentEvent.id}`, event: currentEvent, current: true },
    { key: `next-${nextEvent?.id ?? "empty"}`, event: nextEvent, current: false },
  ];

  useEffect(() => {
    return () => {
      if (snapBackTimeoutRef.current !== null) {
        window.clearTimeout(snapBackTimeoutRef.current);
      }
    };
  }, []);

  function shouldBlockSwipeStart(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest(EVENT_DETAIL_SWIPE_BLOCK_SELECTOR)) return true;

    const activeElement = document.activeElement;
    return activeElement instanceof HTMLElement && Boolean(activeElement.closest(EVENT_DETAIL_ACTIVE_EDIT_SELECTOR));
  }

  function resetSwipe() {
    swipeStartRef.current = null;
  }

  function snapBack() {
    setDragTransitionEnabled(true);
    setDragOffset(0);
    if (snapBackTimeoutRef.current !== null) {
      window.clearTimeout(snapBackTimeoutRef.current);
    }
    snapBackTimeoutRef.current = window.setTimeout(() => {
      setDragTransitionEnabled(false);
      snapBackTimeoutRef.current = null;
    }, EVENT_DETAIL_CAROUSEL_TRANSITION_MS);
  }

  function handlePointerDown(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if (direction || swipeStartRef.current || pointerEvent.pointerType === "mouse" || shouldBlockSwipeStart(pointerEvent.target)) return;
    if (typeof window !== "undefined" && !window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
    if (!previousEvent && !nextEvent) return;

    swipeStartRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      startedAt: window.performance.now(),
      axis: null,
    };
    setDragTransitionEnabled(false);
    setDragOffset(0);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  function handlePointerMove(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    const swipeStart = swipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== pointerEvent.pointerId) return;

    const deltaX = pointerEvent.clientX - swipeStart.x;
    const deltaY = pointerEvent.clientY - swipeStart.y;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (!swipeStart.axis && (absDeltaX > EVENT_SWIPE_AXIS_ACTIVATION_PX || absDeltaY > EVENT_SWIPE_AXIS_ACTIVATION_PX)) {
      if (absDeltaX > EVENT_SWIPE_AXIS_ACTIVATION_PX && absDeltaX > absDeltaY * EVENT_SWIPE_AXIS_DOMINANCE) {
        swipeStart.axis = "horizontal";
      } else if (absDeltaY > EVENT_SWIPE_AXIS_ACTIVATION_PX && absDeltaY >= absDeltaX) {
        swipeStart.axis = "vertical";
      }
    }

    if (swipeStart.axis === "vertical") {
      resetSwipe();
      return;
    }

    if (swipeStart.axis !== "horizontal") return;
    suppressClickRef.current = true;
    pointerEvent.preventDefault();

    const viewportWidth = pointerEvent.currentTarget.clientWidth;
    const pageStep = getEventDetailSwipePageStep(viewportWidth);
    const maxOffset = previousEvent ? pageStep : viewportWidth * 0.16;
    const minOffset = nextEvent ? -pageStep : -viewportWidth * 0.16;
    setDragOffset(Math.max(minOffset, Math.min(maxOffset, deltaX)));
  }

  function handlePointerUp(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    const swipeStart = swipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== pointerEvent.pointerId) return;

    const deltaX = pointerEvent.clientX - swipeStart.x;
    const deltaY = pointerEvent.clientY - swipeStart.y;
    const viewportWidth = pointerEvent.currentTarget.clientWidth;
    const swipeThreshold = getEventSwipeThreshold(viewportWidth);
    const eventDirection = deltaX < 0 ? 1 : -1;
    const canNavigate = eventDirection === 1 ? Boolean(nextEvent) : Boolean(previousEvent);
    const elapsedMs = Math.max(1, window.performance.now() - swipeStart.startedAt);
    const horizontalVelocity = Math.abs(deltaX) / elapsedMs;
    resetSwipe();

    if (swipeStart.axis !== "horizontal") return;

    if (suppressClickRef.current) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    if (
      (
        Math.abs(deltaX) >= swipeThreshold ||
        (Math.abs(deltaX) >= EVENT_SWIPE_VELOCITY_MIN_DISTANCE_PX && horizontalVelocity >= EVENT_SWIPE_VELOCITY_THRESHOLD_PX_PER_MS)
      ) &&
      Math.abs(deltaX) >= Math.abs(deltaY) * EVENT_SWIPE_HORIZONTAL_DOMINANCE &&
      canNavigate
    ) {
      pointerEvent.preventDefault();
      setDragTransitionEnabled(true);
      setDragOffset(0);
      onNavigateDirection(eventDirection);
      return;
    }

    snapBack();
  }

  function handleClickCapture(clickEvent: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
    suppressClickRef.current = false;
  }

  function handleTransitionEnd(transitionEvent: ReactTransitionEvent<HTMLDivElement>) {
    if (transitionEvent.target !== transitionEvent.currentTarget || transitionEvent.propertyName !== "transform") return;
    if (!targetId) return;
    setDragTransitionEnabled(false);
    setDragOffset(0);
    onTransitionComplete(targetId);
  }

  return (
    <div
      className="min-h-0 min-w-0 flex-1 overflow-hidden"
      style={{ touchAction: "pan-y" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        resetSwipe();
        snapBack();
      }}
      onClickCapture={handleClickCapture}
    >
      <div
        className="flex h-full min-h-0 will-change-transform"
        style={{
          gap: `${EVENT_DETAIL_CAROUSEL_GAP_PX}px`,
          width: "300%",
          transform: trackTransform,
          transition: direction || dragTransitionEnabled ? `transform ${EVENT_DETAIL_CAROUSEL_TRANSITION_MS}ms ${EVENT_DETAIL_CAROUSEL_EASING}` : "none",
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {panels.map((panel) => (
          <div
            key={panel.key}
            aria-hidden={!panel.current}
            className={cn("flex min-h-0 w-1/3 min-w-0 shrink-0", !panel.current && "pointer-events-none")}
          >
            {panel.event ? renderPanel(panel.event) : <div className="min-h-0 flex-1" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExternalInvitationDetailsCard({ event }: { event: ProductionEvent }) {
  const details = getExternalContextDetails(event);
  const descriptionView = getExternalEventDescriptionView(details.description);
  const notesText = (descriptionView.notesText ?? descriptionView.usefulLines.join("\n")).trim();
  const secondaryMeetingUrls = details.meetingUrls
    .filter((url) => url !== details.meetingUrl && (!notesText || !notesText.includes(url)))
    .slice(0, 3);
  const hasInvitationDetails = Boolean(details.location || details.meetingUrl || notesText || secondaryMeetingUrls.length > 0 || details.attendees.length > 0);
  const wrapStyle: React.CSSProperties = { overflowWrap: "anywhere", wordBreak: "break-word" };

  if (!hasInvitationDetails) return null;

  return (
    <Card className="premium-surface min-w-0 space-y-3 overflow-hidden !border-0 p-4 sm:p-5">
      {details.location && (
        <div className="min-w-0 rounded-2xl bg-neutral-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase text-neutral-400">Lieu</p>
          <p className="mt-1 whitespace-pre-wrap text-base font-medium text-neutral-700" style={wrapStyle}>{details.location}</p>
        </div>
      )}

      {details.meetingUrl && (
        <a
          href={details.meetingUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 w-full items-center justify-center rounded-2xl bg-neutral-950 px-4 py-3 text-center text-base font-semibold text-white transition hover:bg-neutral-800"
          style={wrapStyle}
        >
          Rejoindre la réunion
        </a>
      )}

      {notesText && (
        <div className="min-w-0 rounded-2xl bg-neutral-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase text-neutral-400">Notes</p>
          <div
            className="mobile-no-scrollbar mt-1 max-h-64 overflow-y-auto overscroll-contain whitespace-pre-wrap text-base font-medium text-neutral-700"
            style={wrapStyle}
          >
            {notesText}
          </div>
        </div>
      )}

      {secondaryMeetingUrls.length > 0 && (
        <div className="mobile-no-scrollbar grid max-h-36 min-w-0 gap-1 overflow-y-auto overscroll-contain px-1">
          {secondaryMeetingUrls.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="min-w-0 text-sm font-semibold text-neutral-950 underline decoration-neutral-300 underline-offset-4" style={wrapStyle}>
              {url}
            </a>
          ))}
        </div>
      )}

      {details.attendees.length > 0 && (
        <div className="min-w-0 rounded-2xl bg-neutral-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase text-neutral-400">Participants</p>
          <div className="mobile-no-scrollbar mt-2 flex max-h-36 min-w-0 flex-wrap gap-1.5 overflow-y-auto overscroll-contain">
            {details.attendees.map((attendee) => (
              <span key={attendee} className="min-w-0 rounded-full bg-neutral-100 px-2.5 py-1 text-sm font-semibold text-neutral-600" style={wrapStyle}>
                {attendee}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function ProductionDetail({
  event,
  hasPrevious,
  hasNext,
  goPrevious,
  goNext,
  showHeaderControls,
  onEditEvent,
  onAssignOptionTask,
  onUpdateOptionTaskDueDate,
  onUpdateOptionTaskNotes,
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
  tasks,
  profiles,
  unreadSummary,
  onMarkItemRead,
  onUpdateTask,
  permissions,
  profile,
}: {
  event: ProductionEvent;
  hasPrevious: boolean;
  hasNext: boolean;
  goPrevious: () => void;
  goNext: () => void;
  showHeaderControls: boolean;
  onEditEvent: () => void;
  onAssignOptionTask: (option: EventOption, assignment: OptionTaskAssignment) => Promise<void>;
  onUpdateOptionTaskDueDate: (option: EventOption, dueDate: string | null) => Promise<void>;
  onUpdateOptionTaskNotes: (option: EventOption, notes: string | null) => Promise<void>;
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
  tasks: AppTask[];
  profiles: UserProfile[];
  unreadSummary: EventUnreadSummary | null;
  onMarkItemRead: (itemKey: string) => void;
  onUpdateTask: (task: AppTask, patch: TaskUpdatePatch) => Promise<void>;
  permissions: AppPermissions;
  profile: UserProfile | null;
}) {
  const [contextSelection, setContextSelection] = useState<ContextSelection>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DeleteSelection | null>(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const submittingAddRef = useRef(false);
  const detailScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const detailBlockRef = useRef<HTMLDivElement | null>(null);
  const nativeKeyboard = useNativeKeyboardVisibility<HTMLDivElement>();
  const previousContextSelectionKeyRef = useRef<string | null>(null);
  const eventDisplay = getProductionEventDisplay(event);
  const unreadItemKeys = unreadSummary?.itemKeys ?? new Set<string>();

  const setDetailScrollContainerNode = useCallback((node: HTMLDivElement | null) => {
    detailScrollContainerRef.current = node;
    nativeKeyboard.scrollContainerRef.current = node;
  }, [nativeKeyboard.scrollContainerRef]);

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

  function selectOption(option: EventOption) {
    onMarkItemRead(`option:${option.id}`);
    setContextSelection((current) =>
      current?.type === "option" && current.optionId === option.id ? null : { type: "option", optionId: option.id },
    );
  }

  function selectLink(link: EventLink) {
    onMarkItemRead(`link:${link.id}`);
    setContextSelection((current) => (current?.type === "link" && current.linkId === link.id ? null : { type: "link", linkId: link.id }));
  }

  function selectDocumentGroup(group: EventDocumentGroup) {
    onMarkItemRead(`document:${group.id}`);
    setContextSelection((current) =>
      current?.type === "document" && current.groupId === group.id ? null : { type: "document", groupId: group.id },
    );
  }

  async function addOption() {
    if (submittingAddRef.current) return;
    submittingAddRef.current = true;
    setSubmittingAdd(true);
    setManageError(null);

    try {
      const option = await onCreateOption(event.id, "Nouvelle option");
      setContextSelection({ type: "option", optionId: option.id });
    } catch (createError) {
      setManageError(getUserFacingErrorMessage(createError, "Impossible d'ajouter l'option."));
    } finally {
      submittingAddRef.current = false;
      setSubmittingAdd(false);
    }
  }

  async function addLink() {
    if (submittingAddRef.current) return;
    submittingAddRef.current = true;
    setSubmittingAdd(true);
    setManageError(null);

    try {
      const link = await onCreateLink(event.id, { label: "Nouveau lien", url: "" });
      setContextSelection({ type: "link", linkId: link.id });
    } catch (createError) {
      setManageError(getUserFacingErrorMessage(createError, "Impossible d'ajouter le lien."));
    } finally {
      submittingAddRef.current = false;
      setSubmittingAdd(false);
    }
  }

  async function addDocumentGroup() {
    if (submittingAddRef.current) return;
    submittingAddRef.current = true;
    setSubmittingAdd(true);
    setManageError(null);

    try {
      const group = await onCreateDocumentGroup(event.id, "Nouveau document");
      setContextSelection({ type: "document", groupId: group.id });
    } catch (createError) {
      setManageError(getUserFacingErrorMessage(createError, "Impossible d'ajouter le document."));
    } finally {
      submittingAddRef.current = false;
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

  function navigateEventByDirection(direction: -1 | 1) {
    const canNavigate = direction === 1 ? hasNext : hasPrevious;
    if (!canNavigate) return;

    if (direction === 1) {
      goNext();
    } else {
      goPrevious();
    }
  }

  return (
    <>
      <section className="flex min-h-0 w-full touch-pan-y flex-1 flex-col gap-5 overflow-hidden">
      <Card
        className="premium-surface shrink-0 !border-0 p-4 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <EventCalendarBadge event={event} />
              {unreadSummary?.hasMetadata && <span title="Changements non lus" className="h-2.5 w-2.5 rounded-full bg-[#bb2720]" />}
            </div>
            <h1 className="break-words pb-1 text-3xl font-semibold leading-[1.16] text-neutral-950 sm:text-5xl sm:leading-[1.12]">{eventDisplay.title}</h1>
            {eventDisplay.subtitle && <p className="mt-2 truncate text-base font-medium text-neutral-500">{eventDisplay.subtitle}</p>}
            {permissions.canManageEvents && !showHeaderControls && (
              <button
                type="button"
                onClick={onEditEvent}
                className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100"
              >
                Modifier
              </button>
            )}
          </div>
          {showHeaderControls && (
            <div className="flex items-center gap-2">
              {permissions.canManageEvents && (
                <button type="button" onClick={onEditEvent} className="rounded-xl bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100">
                  Modifier
                </button>
              )}
              <button onClick={() => navigateEventByDirection(-1)} disabled={!hasPrevious} className={calendarArrowClassName} aria-label="Événement précédent">
                ←
              </button>
              <button onClick={() => navigateEventByDirection(1)} disabled={!hasNext} className={calendarArrowClassName} aria-label="Événement suivant">
                →
              </button>
            </div>
          )}
        </div>
      </Card>

      <div
        key={event.id}
        ref={setDetailScrollContainerNode}
        className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-6"
        style={nativeKeyboard.scrollContainerStyle}
      >
        <Card className="premium-surface overflow-hidden !border-0 p-4 sm:p-5">
          <ProductionTimeCards event={event} />
        </Card>
        <ExternalInvitationDetailsCard event={event} />
        <Card className="premium-surface overflow-hidden !border-0 p-3 sm:p-4">
        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-1.5 sm:gap-4 lg:items-start">
          <div className="min-w-0">
            <SectionHeader
              label="Options"
              tone="option"
              addLabel="Ajouter une option"
              onAdd={permissions.canManageOperational ? () => void addOption() : undefined}
              addDisabled={submittingAdd}
            />
            <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
              {event.options.map((option) => {
                const Icon = getOptionIcon(option.label);
                const linkedOptionTask = getLinkedTaskForOption(option, tasks);
                const optionTaskCompleted = linkedOptionTask?.status === "done";
                const optionTone = getOptionTone("incomplete");
                const optionAssigneeName = getOptionAssigneeLabel(option, tasks, profiles);
                const optionMetaLabel = optionTaskCompleted ? "👍" : optionAssigneeName;
                const showOptionMeta = Boolean(optionMetaLabel);
                const isSelectedOption = contextSelection?.type === "option" && contextSelection.optionId === option.id;
                const isConfirmingDelete = confirmDelete?.type === "option" && confirmDelete.optionId === option.id;
                const hasUnreadOptionChanges = unreadItemKeys.has(`option:${option.id}`);
                const canManageOptionStructure = canManageCreatedEntity(permissions, profile, option);
                const canDeleteOption = canManageOptionStructure && (permissions.canManageEvents || option.items.every((item) => canManageCreatedEntity(permissions, profile, item)));
                return (
                  <div
                    key={option.id}
                    data-grid-delete-confirm={isConfirmingDelete ? true : undefined}
                    className={cn(
                      "group relative flex h-[4.75rem] items-center gap-1.5 overflow-hidden rounded-xl border border-transparent transition sm:h-20 sm:gap-2",
                      optionTone.surface,
                      optionTone.hover,
                      isSelectedOption && "border-emerald-700",
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
                        {hasUnreadOptionChanges && <UnreadDot className="bottom-2 right-2 top-auto" />}
                        <button
                          onClick={() => selectOption(option)}
                          className={cn(
                            "flex h-full min-w-0 flex-1 px-2 py-2.5 text-left sm:px-3",
                        showOptionMeta ? "flex-col items-start justify-center gap-1.5" : "items-center gap-1.5 sm:gap-2",
                      )}
                    >
                      {showOptionMeta ? (
                        <>
                          <span className="flex max-w-full shrink-0 items-center gap-1 overflow-hidden">
                            {optionMetaLabel && (
                              <span className="inline-flex h-5 min-w-0 items-center rounded-full bg-neutral-50 px-2 text-[0.7rem] font-bold leading-none text-neutral-500 sm:text-xs">
                                <span className="truncate">{optionMetaLabel}</span>
                              </span>
                            )}
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
              onAdd={permissions.canManageOperational ? () => void addLink() : undefined}
              addDisabled={submittingAdd}
            />
            <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
              {event.links.map((link) => {
                const Icon = getLinkIcon(link.label);
                const isSelectedLink = contextSelection?.type === "link" && contextSelection.linkId === link.id;
                const linkTone = getLinkTone(getLinkState(link));
                const isConfirmingDelete = confirmDelete?.type === "link" && confirmDelete.linkId === link.id;
                const hasUnreadLinkChanges = unreadItemKeys.has(`link:${link.id}`);
                const canManageLinkStructure = canManageCreatedEntity(permissions, profile, link);
                const canDeleteLink = canManageLinkStructure && (permissions.canManageEvents || link.entries.every((entry) => canManageCreatedEntity(permissions, profile, entry)));
                return (
                  <div
                    key={link.id}
                    data-grid-delete-confirm={isConfirmingDelete ? true : undefined}
                    className={cn(
                      "group relative flex h-[4.75rem] items-center gap-1.5 overflow-hidden rounded-xl border border-transparent transition sm:h-20 sm:gap-2",
                      linkTone.surface,
                      linkTone.hover,
                      isSelectedLink && "border-[#5B7798]",
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
                        {hasUnreadLinkChanges && <UnreadDot className="bottom-2 right-2 top-auto" />}
                        <button onClick={() => selectLink(link)} className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 py-2.5 text-left sm:gap-2 sm:px-3">
                          <Icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", linkTone.icon)} />
                          <span className={cn("min-w-0 flex-1 truncate pr-5 text-base font-semibold", linkTone.text)}>{link.label}</span>
                        </button>
                        <ExternalLink className="mr-8 hidden h-4 w-4 shrink-0 text-[#5B7798] sm:block" />
                        {canDeleteLink && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setConfirmDelete({ type: "link", linkId: link.id });
                            }}
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[#5B7798] opacity-100 transition hover:bg-white/70 hover:text-[#3F5F85] focus:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
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
              onAdd={permissions.canManageOperational ? () => void addDocumentGroup() : undefined}
              addDisabled={submittingAdd}
            />
            <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
              {event.documentGroups.map((group) => {
                const Icon = getDocumentGroupIcon(group);
                const documentTone = getDocumentTone(group.files.length > 0);
                const isSelectedDocument = contextSelection?.type === "document" && contextSelection.groupId === group.id;
                const isConfirmingDelete = confirmDelete?.type === "document" && confirmDelete.groupId === group.id;
                const hasUnreadDocumentChanges = unreadItemKeys.has(`document:${group.id}`);
                const canManageDocumentGroupStructure = canManageCreatedEntity(permissions, profile, group);
                const canDeleteDocumentGroup =
                  canManageDocumentGroupStructure && (permissions.canManageEvents || group.files.every((file) => canManageCreatedEntity(permissions, profile, file)));
                return (
                  <div
                    key={group.id}
                    data-grid-delete-confirm={isConfirmingDelete ? true : undefined}
                    className={cn(
                      "group relative flex h-[4.75rem] items-center gap-1.5 overflow-hidden rounded-xl border border-transparent transition sm:h-20 sm:gap-2",
                      documentTone.surface,
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
                        {hasUnreadDocumentChanges && <UnreadDot className="bottom-2 right-2 top-auto" />}
                        <button
                          onClick={() => selectDocumentGroup(group)}
                          className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 py-2.5 text-left sm:gap-2 sm:px-3"
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
            tasks={tasks}
            profiles={profiles}
            onAssignOptionTask={onAssignOptionTask}
            onUpdateOptionTaskDueDate={onUpdateOptionTaskDueDate}
            onUpdateOptionTaskNotes={onUpdateOptionTaskNotes}
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
            onUpdateTask={onUpdateTask}
            permissions={permissions}
            profile={profile}
            onNativeFieldFocus={nativeKeyboard.handleFieldFocus}
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
    </>
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
  return platformLinkLabels.has(normalizeCompactLabel(link.label));
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

function getDocumentTone(_hasFiles: boolean) {
  return {
    surface: "bg-[#FEF4BD]",
    border: "border-amber-100",
    hover: "hover:bg-[#FEF3B2]",
    icon: "text-amber-600",
    text: "text-neutral-700",
    selected: "border-amber-700",
  };
}

function getOptionTone(state: CompletionStatus) {
  return state === "completed"
    ? {
        surface: "bg-white/85",
        border: "border-neutral-100",
        hover: "hover:bg-neutral-50",
        icon: "text-neutral-400",
        text: "text-neutral-500",
      }
    : {
        surface: "bg-emerald-100/95",
        border: "border-emerald-100",
        hover: "hover:bg-emerald-100",
        icon: "text-emerald-600",
        text: "text-neutral-700",
      };
}

function getTaskSurfaceTone(task: AppTask) {
  if (task.status === "done") {
    return {
      row: "bg-white/80 opacity-65 hover:bg-neutral-50/80",
      title: "text-neutral-400 line-through",
    };
  }

  if (isTaskUrgent(task)) {
    return {
      row: "bg-rose-100/90 hover:bg-rose-100",
      title: "text-neutral-700 group-hover:text-neutral-950",
    };
  }

  return {
    row: "bg-emerald-100/95 hover:bg-emerald-100",
    title: "text-neutral-700 group-hover:text-emerald-950",
  };
}

function getTaskTone(task: AppTask) {
  return {
    panel: "bg-[var(--app-background)]",
    title: task.status === "done" ? "text-neutral-500 line-through" : "text-neutral-950",
    body: "text-neutral-700",
    meta: "text-neutral-400",
    actionText: "text-neutral-600",
  };
}

function getLinkTone(_state: LinkStatus) {
  return {
    surface: "bg-[#E6EEF8]",
    border: "border-[#C7D4E4]",
    hover: "hover:bg-[#DCE7F4]",
    icon: "text-[#5B7798]",
    text: "text-neutral-700",
  };
}

function ProductionTimeCards({ event }: { event: ProductionEvent }) {
  if (event.isAllDay) {
    return (
      <div className="grid gap-2.5 sm:grid-cols-2">
        <ProductionTimeCard label="Date" value={formatFullDate(event.date)} />
        <ProductionTimeCard label="Horaire" value="Jour entier" />
      </div>
    );
  }

  const broadStartTime = event.clientArrivalTime || event.startTime;
  const broadEndTime = event.endOfDayTime || event.endTime;
  const broadTimeRange = formatTimeRange(broadStartTime, broadEndTime) || "--:--";
  const liveTimeRange = formatTimeRange(event.startTime, event.endTime);
  const showLiveCard = Boolean(
    event.startTime &&
      event.endTime &&
      liveTimeRange &&
      (toTimeInputValue(event.startTime) !== toTimeInputValue(broadStartTime) || toTimeInputValue(event.endTime) !== toTimeInputValue(broadEndTime)),
  );

  return (
    <div className={cn("grid gap-2.5", showLiveCard ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      <ProductionTimeCard label="Date" value={formatFullDate(event.date)} />
      <ProductionTimeCard label="Horaire" value={broadTimeRange} />
      {showLiveCard && <ProductionTimeCard label="Live / tournage" value={liveTimeRange || "--:--"} />}
    </div>
  );
}

function ProductionTimeCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-neutral-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase text-neutral-400">{label}</p>
      <p className="mt-1 text-base font-semibold text-neutral-900" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
        {value || "--:--"}
      </p>
    </div>
  );
}

function InlineEditableTitle({
  value,
  onSave,
  className,
  inputClassName,
  editable = true,
  onFocusTarget,
}: {
  value: string;
  onSave: (value: string) => Promise<void>;
  className?: string;
  inputClassName?: string;
  editable?: boolean;
  onFocusTarget?: (target: HTMLElement) => boolean;
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
    if (inputRef.current) {
      onFocusTarget?.(inputRef.current);
    }
  }, [editing, onFocusTarget]);

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
        {...iosKeyboardGuardProps}
        value={draft}
        disabled={saving}
        onFocus={(event) => onFocusTarget?.(event.currentTarget)}
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
          "h-8 min-w-0 rounded-xl border border-transparent bg-neutral-50/80 px-2 text-base font-semibold outline-none transition focus:border-neutral-300 focus:bg-white disabled:opacity-70",
          inputClassName,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (!editable) return;
        setEditing(true);
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
  onFocusTarget,
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
  onFocusTarget?: (target: HTMLElement) => boolean;
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
      <div className={cn("inline-flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-transparent px-3 py-1.5 transition focus-within:border-[#8EA6C2]", rowTone.surface)}>
        <Icon className={cn("h-4 w-4 shrink-0", rowTone.icon)} />
        {editable ? (
          <input
            {...iosKeyboardGuardProps}
            value={localValue}
            disabled={committing}
            onFocus={(event) => {
              setEditing(true);
              onFocusTarget?.(event.currentTarget);
            }}
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
            className={cn("min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-[#8EA6C2]/70 disabled:opacity-70", rowTone.text)}
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
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent transition disabled:cursor-not-allowed disabled:opacity-35",
          rowTone.surface,
          rowTone.icon,
          rowTone.hover,
          copied && "bg-[#DCE7F4] text-[#3F5F85]",
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
  tasks,
  profiles,
  onAssignOptionTask,
  onUpdateOptionTaskDueDate,
  onUpdateOptionTaskNotes,
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
  onUpdateTask,
  permissions,
  profile,
  onNativeFieldFocus,
}: {
  event: ProductionEvent;
  selection: ContextSelection;
  tasks: AppTask[];
  profiles: UserProfile[];
  onAssignOptionTask: (option: EventOption, assignment: OptionTaskAssignment) => Promise<void>;
  onUpdateOptionTaskDueDate: (option: EventOption, dueDate: string | null) => Promise<void>;
  onUpdateOptionTaskNotes: (option: EventOption, notes: string | null) => Promise<void>;
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
  onUpdateTask: (task: AppTask, patch: TaskUpdatePatch) => Promise<void>;
  permissions: AppPermissions;
  profile: UserProfile | null;
  onNativeFieldFocus: (target: HTMLElement) => boolean;
}) {
  const selectedOption = selection?.type === "option" ? event.options.find((option) => option.id === selection.optionId) ?? null : null;
  const selectedLink = selection?.type === "link" ? event.links.find((link) => link.id === selection.linkId) ?? null : null;
  const selectedDocumentGroup = selection?.type === "document" ? event.documentGroups.find((group) => group.id === selection.groupId) ?? null : null;
  const selectedOptionId = selectedOption?.id ?? "";
  const selectedLinkId = selectedLink?.id ?? "";
  const selectedDocumentGroupId = selectedDocumentGroup?.id ?? "";
  const selectedLinkIsPlatform = selectedLink ? isPlatformLink(selectedLink) : false;
  const selectedLinkedOptionTask = selectedOption?.taskId ? tasks.find((task) => task.id === selectedOption.taskId) ?? null : null;
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
  const [optionDueDatePickerOpen, setOptionDueDatePickerOpen] = useState(false);
  const [optionTaskNotesInput, setOptionTaskNotesInput] = useState(selectedLinkedOptionTask?.notes ?? selectedOption?.taskNotes ?? "");
  const [externalAssigneeInput, setExternalAssigneeInput] = useState(selectedOption?.externalAssigneeName ?? "");
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
  }, [selectedLinkId, selectedLinkIsPlatform]);

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
    setOptionDueDatePickerOpen(false);
    setOptionTaskNotesInput(selectedLinkedOptionTask?.notes ?? selectedOption?.taskNotes ?? "");
    setExternalAssigneeInput(selectedOption?.externalAssigneeName ?? "");
    setTitleRenameError(null);
    setDraggingDocumentFiles(false);
    setUploadingDocumentFiles(false);
    setDocumentOpenError(null);
  }, [selectedDocumentGroupId, selectedLinkId, selectedOptionId, selectedLinkedOptionTask?.id, selectedLinkedOptionTask?.notes, selectedOption?.externalAssigneeName, selectedOption?.taskNotes]);

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

  async function changeSelectedOptionAssignee(assignment: OptionTaskAssignment) {
    if (!selectedOption) return;
    setSavingCompletedByOverride(true);
    setCompletedByOverrideError(null);

    try {
      await onAssignOptionTask(selectedOption, assignment);
    } catch (overrideError) {
      setCompletedByOverrideError(getUserFacingErrorMessage(overrideError, "Impossible de modifier l'assignation."));
    } finally {
      setSavingCompletedByOverride(false);
    }
  }

  async function commitExternalOptionAssignee() {
    if (!selectedOption) return;
    const nextName = externalAssigneeInput.trim();
    if (nextName === (selectedOption.externalAssigneeName ?? "")) return;
    await changeSelectedOptionAssignee({ type: "external", name: nextName || null });
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
      <>
      <Card key={selectedLink.id} className={cn("w-full !border-0 bg-white p-4 sm:p-5", uiMotionClasses.detailPanelIn)}>
        <div className="link-detail-block flex w-full min-w-0 flex-col gap-3">
          <div className="top-row flex w-full min-w-0 items-center justify-between gap-3">
            <div className={cn("flex min-w-0 items-center gap-2 text-base font-semibold", linkTone.text)}>
          <InlineEditableTitle
            value={selectedLink.label}
            onSave={renameSelectedLink}
            className="truncate"
            inputClassName="text-[#3F5F85] focus:border-[#8EA6C2]"
            editable={canRenameSelectedLink}
            onFocusTarget={onNativeFieldFocus}
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
                    onFocusTarget={onNativeFieldFocus}
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
                      onFocusTarget={onNativeFieldFocus}
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
      </>
    );
  }

  if (selection.type === "document" && selectedDocumentGroup) {
    const documentTone = getDocumentTone(selectedDocumentGroup.files.length > 0);
    const Icon = getDocumentGroupIcon(selectedDocumentGroup);

    return (
      <>
      <Card key={selectedDocumentGroup.id} className={cn("w-full !border-0 bg-white p-4 sm:p-5", uiMotionClasses.detailPanelIn)}>
        <div className="flex w-full min-w-0 flex-col gap-3">
          <div className="flex w-full min-w-0 items-center justify-between gap-3">
            <div className={cn("flex min-w-0 items-center gap-2 text-base font-semibold", documentTone.text)}>
              <Icon className={cn("h-5 w-5 shrink-0", documentTone.icon)} />
              <InlineEditableTitle
                value={selectedDocumentGroup.label}
                onSave={renameSelectedDocumentGroup}
                className="truncate"
                inputClassName="text-amber-950 focus:border-amber-300"
                editable={canRenameSelectedDocumentGroup}
                onFocusTarget={onNativeFieldFocus}
              />
            </div>
          </div>
          {canEdit && (
            <div
              data-no-event-swipe
              onDragOver={(dragEvent) => {
                dragEvent.preventDefault();
                dragEvent.stopPropagation();
                setDraggingDocumentFiles(true);
              }}
              onDragLeave={() => setDraggingDocumentFiles(false)}
              onDrop={(dropEvent) => {
                dropEvent.preventDefault();
                dropEvent.stopPropagation();
                setDraggingDocumentFiles(false);
                void uploadFilesToSelectedGroup(dropEvent.dataTransfer.files);
              }}
              className={cn(
                "rounded-xl border border-dashed border-amber-200/60 bg-amber-50/30 p-2 transition",
                draggingDocumentFiles && "border-amber-300/80 bg-amber-50/80",
              )}
            >
              <label className="flex min-h-16 cursor-pointer items-center justify-center rounded-xl bg-amber-50/70 px-3 text-center text-base font-semibold text-amber-800 transition hover:bg-amber-100/70">
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
                    <div className={cn("group inline-flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-transparent px-3 py-1.5", documentTone.surface)}>
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
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent transition hover:bg-amber-100",
                        documentTone.surface,
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
      </>
    );
  }

  if (!selectedOption) return null;

  const linkedOptionTask = selectedLinkedOptionTask;
  const effectiveOptionStatus = getOptionEffectiveStatus(selectedOption, tasks);
  const optionTone = getOptionTone(effectiveOptionStatus);
  const optionAssigneeValue = linkedOptionTask?.assignedProfileId
    ? `profile:${linkedOptionTask.assignedProfileId}`
    : selectedOption.externalAssigneeName
      ? "external"
      : "";
  const canAssignOptionTask = permissions.canManageEvents;
  const linkedTaskAssignedToCurrentProfile = Boolean(linkedOptionTask && profile?.id && linkedOptionTask.assignedProfileId === profile.id);
  const linkedTaskCreatedByCurrentProfile = Boolean(linkedOptionTask && profile?.id && linkedOptionTask.createdBy === profile.id);
  const canToggleLinkedOptionTaskStatus = Boolean(linkedOptionTask && (permissions.canManageEvents || linkedTaskAssignedToCurrentProfile));
  const canEditLinkedTaskNotes = Boolean(linkedOptionTask?.assignedProfileId && (permissions.canManageEvents || (linkedTaskAssignedToCurrentProfile && linkedTaskCreatedByCurrentProfile)));
  const canEditOptionTaskNotes = permissions.canManageEvents || canEditLinkedTaskNotes;
  const canEditLinkedOptionTaskUrgent = Boolean(
    permissions.canManageEvents &&
    linkedOptionTask?.assignedProfileId &&
    (isTaskUrgent(linkedOptionTask) || countActiveUrgentTasksForProfile(tasks, linkedOptionTask.assignedProfileId, linkedOptionTask.id) < maxUrgentTasksPerPerson),
  );
  const optionTaskDueDate = linkedOptionTask?.dueDate ?? selectedOption.taskDueDate ?? null;
  const optionTaskNotes = linkedOptionTask?.notes ?? selectedOption.taskNotes ?? "";

  async function updateLinkedOptionTask(patch: TaskUpdatePatch) {
    if (!linkedOptionTask) return;
    setSavingCompletedByOverride(true);
    setCompletedByOverrideError(null);

    try {
      await onUpdateTask(linkedOptionTask, patch);
    } catch (updateError) {
      setCompletedByOverrideError(getUserFacingErrorMessage(updateError, "Impossible de modifier la tâche liée."));
    } finally {
      setSavingCompletedByOverride(false);
    }
  }

  return (
    <>
    <Card key={selectedOption.id} className={cn("!border-0 bg-white p-4 sm:p-5", uiMotionClasses.detailPanelIn)}>
      <div className="flex items-center justify-between gap-3">
        <div className={cn("flex min-w-0 items-center gap-2 text-base font-semibold", optionTone.text)}>
          <InlineEditableTitle
            value={selectedOption.label}
            onSave={renameSelectedOption}
            className="truncate"
            inputClassName="text-emerald-950 focus:border-emerald-300"
            editable={canRenameSelectedOption}
            onFocusTarget={onNativeFieldFocus}
          />
        </div>
        {linkedOptionTask && (
          <div className="flex shrink-0 items-center gap-1.5">
            {canEditLinkedOptionTaskUrgent && (
              <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[#bb2720]/[0.07] px-2 text-xs font-semibold text-[#bb2720] transition hover:bg-[#bb2720]/[0.11]">
                <input
                  type="checkbox"
                  checked={isTaskUrgent(linkedOptionTask)}
                  disabled={savingCompletedByOverride}
                  onChange={(event) => void updateLinkedOptionTask({ priority: event.target.checked ? "urgent" : "normal" })}
                  className="h-3.5 w-3.5 rounded border-neutral-300 accent-[#bb2720]"
                  aria-label={isTaskUrgent(linkedOptionTask) ? "Retirer l'urgence" : "Marquer urgent"}
                />
                Urgent
              </label>
            )}
            <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-neutral-50 px-2 text-xs font-semibold text-neutral-500 transition hover:bg-neutral-100">
              <input
                type="checkbox"
                checked={linkedOptionTask.status === "done"}
                disabled={savingCompletedByOverride || !canToggleLinkedOptionTaskStatus}
                onChange={(event) => void updateLinkedOptionTask({ status: event.target.checked ? "done" : "todo" })}
                className="h-3.5 w-3.5 rounded border-neutral-300 accent-emerald-600"
                aria-label={linkedOptionTask.status === "done" ? "Marquer à faire" : "Marquer terminé"}
              />
              {linkedOptionTask.status === "done" ? "Terminé" : "À faire"}
            </label>
          </div>
        )}
      </div>
      {titleRenameError && <div className="mt-2 text-base font-medium text-rose-700">{titleRenameError}</div>}
      {canAssignOptionTask && (
        <div className="mt-3 grid grid-cols-2 items-end gap-2 rounded-xl bg-emerald-50/70 px-3 py-2">
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700/70">Assigné à</span>
            <select
              {...iosKeyboardGuardProps}
              value={optionAssigneeValue}
              disabled={savingCompletedByOverride}
              onFocus={(event) => onNativeFieldFocus(event.currentTarget)}
              onChange={(event) => {
                const nextValue = event.target.value;
                if (!nextValue) {
                  void changeSelectedOptionAssignee({ type: "none" });
                  return;
                }
                if (nextValue === "external") {
                  const nextExternalName = externalAssigneeInput.trim() || selectedOption.externalAssigneeName || "Externe";
                  setExternalAssigneeInput(nextExternalName);
                  void changeSelectedOptionAssignee({ type: "external", name: nextExternalName });
                  return;
                }
                if (nextValue.startsWith("profile:")) {
                  void changeSelectedOptionAssignee({ type: "profile", profileId: nextValue.slice("profile:".length) });
                }
              }}
              className="h-8 w-full min-w-0 rounded-full border border-transparent bg-white/80 px-2 text-sm font-semibold text-emerald-800 outline-none transition focus:border-emerald-300 focus:bg-white disabled:text-emerald-400 sm:px-3 sm:text-base"
              aria-label="Assigner l'option"
            >
              <option value="">Non assignée</option>
              <option value="external">Externe</option>
              {profiles.map((userProfile) => (
                <option key={userProfile.id} value={`profile:${userProfile.id}`}>
                  {getProfileFirstNameLabel(userProfile)}
                </option>
              ))}
            </select>
            {optionAssigneeValue === "external" && (
              <input
                {...iosKeyboardGuardProps}
                value={externalAssigneeInput}
                disabled={savingCompletedByOverride}
                onFocus={(event) => onNativeFieldFocus(event.currentTarget)}
                onChange={(event) => setExternalAssigneeInput(event.target.value)}
                onBlur={() => void commitExternalOptionAssignee()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                className="h-8 w-full min-w-0 rounded-full border border-transparent bg-white/80 px-2 text-sm font-semibold text-emerald-800 outline-none transition placeholder:text-emerald-700/35 focus:border-emerald-300 focus:bg-white disabled:text-emerald-400 sm:px-3 sm:text-base"
                placeholder="Prénom"
                aria-label="Prénom externe"
              />
            )}
          </label>
          {canAssignOptionTask && (
            <label className="grid min-w-0 gap-1">
              <span className="text-right text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700/70">Échéance</span>
                <button
                  type="button"
                  disabled={savingCompletedByOverride}
                  onClick={() => setOptionDueDatePickerOpen(true)}
                  className="h-8 w-full min-w-0 truncate rounded-full border border-transparent bg-white/80 px-2 text-right text-sm font-semibold text-emerald-800 outline-none transition hover:bg-white focus:border-emerald-300 disabled:text-emerald-400 sm:px-3 sm:text-base"
                  aria-label="Échéance de la tâche liée"
                >
                  {optionTaskDueDate ? formatShortDateWithYear(optionTaskDueDate) : "Choisir une date"}
                </button>
            </label>
          )}
        </div>
      )}
      <label className="mt-3 block rounded-xl bg-emerald-50/70 px-3 py-2">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700/70">Notes</span>
        <textarea
          {...iosKeyboardGuardProps}
          value={optionTaskNotesInput}
          disabled={!canEditOptionTaskNotes || savingCompletedByOverride}
          rows={4}
          onFocus={(event) => onNativeFieldFocus(event.currentTarget)}
          onChange={(event) => setOptionTaskNotesInput(event.target.value)}
          onBlur={() => {
            if (linkedOptionTask?.assignedProfileId) {
              if (optionTaskNotesInput.trim() !== (linkedOptionTask.notes ?? "")) {
                void updateLinkedOptionTask({ notes: optionTaskNotesInput });
              }
              return;
            }
            if (optionTaskNotesInput.trim() !== optionTaskNotes) {
              void onUpdateOptionTaskNotes(selectedOption, optionTaskNotesInput);
            }
          }}
          className="min-h-24 w-full resize-none rounded-xl border border-transparent bg-white/80 px-3 py-2 text-base font-medium leading-relaxed text-neutral-700 outline-none transition placeholder:text-emerald-700/35 focus:border-emerald-300 focus:bg-white disabled:text-emerald-400"
          placeholder="Notes"
        />
      </label>
      {completedByOverrideError && <div className="mt-2 text-base font-medium text-rose-700">{completedByOverrideError}</div>}
      <div className="mt-3">
        <div className="flex flex-col gap-2">
          {canEdit && addingOptionItem ? (
            <form onSubmit={addOptionItem} className="flex min-w-0 flex-col gap-2">
              <textarea
                {...iosKeyboardGuardProps}
                required
                rows={3}
                value={optionItemInput}
                onFocus={(event) => onNativeFieldFocus(event.currentTarget)}
                onChange={(event) => setOptionItemInput(event.target.value)}
                placeholder="Nouvelle note"
                className="min-h-20 w-full resize-none rounded-xl border border-transparent bg-emerald-50/40 px-3 py-2 text-base font-medium text-neutral-950 outline-none transition placeholder:text-neutral-300 focus:border-emerald-300 focus:bg-white"
              />
              <button disabled={savingOptionItem} className="h-9 w-fit shrink-0 rounded-xl bg-emerald-600 px-3 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:bg-neutral-300">
                Ajouter
              </button>
            </form>
          ) : null}
        {selectedOption.items.map((item) => {
          const canManageNote = canManageCreatedEntity(permissions, profile, item);
          const isEditingNote = editingOptionItemId === item.id;
          const isSavingEditedNote = savingEditedOptionItemId === item.id;
          return (
            <div key={item.id} className={cn("group flex min-h-12 w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2.5", optionTone.surface)}>
              {isEditingNote ? (
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <textarea
                    {...iosKeyboardGuardProps}
                    rows={3}
                    value={editingOptionItemInput}
                    onFocus={(event) => onNativeFieldFocus(event.currentTarget)}
                    onChange={(event) => setEditingOptionItemInput(event.target.value)}
                    className="min-h-20 w-full resize-none rounded-xl border border-transparent bg-emerald-50/40 px-3 py-2 text-base font-medium text-neutral-950 outline-none transition placeholder:text-neutral-300 focus:border-emerald-300 focus:bg-white"
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveEditedOptionItem(item)}
                      disabled={isSavingEditedNote}
                      className="h-8 rounded-full bg-emerald-600 px-3 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:bg-neutral-300"
                    >
                      Valider
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditingOptionItem}
                      disabled={isSavingEditedNote}
                      className="h-8 rounded-full bg-emerald-50 px-3 text-base font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:text-neutral-300"
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
    {selectedOption && optionDueDatePickerOpen && (
      <MstvDatePicker
        selectedDate={optionTaskDueDate ?? event.date}
        allowSelectingCurrentDate={!optionTaskDueDate}
        onClose={() => setOptionDueDatePickerOpen(false)}
        onSelectDate={async (dateKey) => {
          await onUpdateOptionTaskDueDate(selectedOption, dateKey);
          setOptionDueDatePickerOpen(false);
        }}
      />
    )}
    </>
  );
}

function splitStoredDetails(details: string | null) {
  return (details ?? "")
    .split(/\n|,/)
    .map((detail) => detail.trim())
    .filter(Boolean);
}

function NativeMstvIcsImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (
    events: NativeMstvIcsReviewEvent[],
    onProgress?: (progress: NativeMstvIcsImportProgress) => void,
  ) => Promise<NativeMstvIcsImportResult>;
}) {
  const [fileName, setFileName] = useState("");
  const [reviewEvents, setReviewEvents] = useState<NativeMstvIcsReviewEvent[]>([]);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<NativeMstvIcsImportProgress | null>(null);
  const [importResult, setImportResult] = useState<NativeMstvIcsImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importableCount = reviewEvents.filter((event) => !event.skipped).length;
  const skippedCount = reviewEvents.length - importableCount;

  async function loadExistingImportIds() {
    if (!supabase) throw new Error("Configuration Supabase manquante.");

    return fetchNativeMstvIcsImportIds();
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
      setImportResult(null);
      setImportProgress(null);
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
    setImportResult(null);
    setImportProgress({ processed: 0, total: importableCount });

    try {
      const result = await onImport(reviewEvents, setImportProgress);
      const refreshedImportIds = await loadExistingImportIds();
      const nextReviewEvents = reviewEvents.map((event) => {
        if (!refreshedImportIds.has(event.externalImportId)) return event;
        return {
          ...event,
          skipped: true,
          skipReason: "Déjà importé",
        };
      });
      const remainingCount = nextReviewEvents.filter((event) => !event.skipped).length;
      setReviewEvents(nextReviewEvents);
      setImportResult({
        ...result,
        remainingCount,
      });
    } catch (importError) {
      console.error("Native MSTV ICS import failed", importError);
      setError(getUserFacingErrorMessage(importError, "Impossible d'importer ce calendrier."));
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }
  useEscapeToClose(onClose);

  return (
    <div className={cn(modalBackdropClassName, modalSheetPositionClassName)} onPointerDown={(pointerEvent) => handleModalBackdropPointerDown(pointerEvent, onClose)}>
      <div className={cn(modalPanelClassName, "flex max-h-[86vh] w-full flex-col p-5 sm:max-w-2xl sm:p-6")} onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-950">Importer calendrier MSTV</h2>
            <p className="mt-1 text-base font-medium text-neutral-500">
              {step === "review"
                ? `${reviewEvents.length} événement${reviewEvents.length > 1 ? "s" : ""} trouvé${reviewEvents.length > 1 ? "s" : ""} dans le fichier`
                : "Migration Apple Calendar en événements MSTV natifs."}
            </p>
            {fileName && <p className="mt-1 truncate text-sm font-semibold text-neutral-400">{fileName}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-neutral-50 px-3 py-1.5 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100">
            Fermer
          </button>
        </div>

        {error && <div className="mb-3 rounded-2xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}
        {importProgress && (
          <div className="mb-3 rounded-2xl bg-blue-50 px-4 py-3 text-base font-semibold text-blue-800">
            Importation {importProgress.processed} / {importProgress.total}...
          </div>
        )}
        {importResult && (
          <div className="mb-3 rounded-2xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-900">
            <p className="font-semibold">
              {importResult.importedCount} événement{importResult.importedCount > 1 ? "s" : ""} importé{importResult.importedCount > 1 ? "s" : ""}
            </p>
            <p className="mt-1">
              {importResult.remainingCount} événement{importResult.remainingCount > 1 ? "s" : ""} restant{importResult.remainingCount > 1 ? "s" : ""}
            </p>
            {importResult.failedCount > 0 && (
              <div className="mt-2 text-rose-700">
                <p>
                  {importResult.failedCount} échec{importResult.failedCount > 1 ? "s" : ""}. Consultez la console pour le détail Supabase.
                </p>
                <ul className="mt-1 space-y-1 text-sm">
                  {importResult.failures.slice(0, 3).map((failure) => (
                    <li key={failure.externalImportId}>
                      {failure.sourceTitle}: {failure.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {step === "upload" ? (
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void handleFile(event.dataTransfer.files.item(0));
            }}
            className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center transition hover:bg-neutral-100/70"
          >
            <FileText className="mb-3 h-7 w-7 text-neutral-500" />
            <span className="text-base font-semibold text-neutral-800">{parsing ? "Lecture du calendrier..." : "Déposez le fichier .ics ici"}</span>
            <span className="mt-1 text-base font-medium text-neutral-500">ou cliquez pour sélectionner le fichier exporté</span>
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
              <div className="rounded-2xl bg-emerald-50 px-3 py-2">
                <p className="text-sm font-semibold text-emerald-700">Nouveaux événements à importer</p>
                <p className="text-lg font-semibold text-emerald-950">{importableCount}</p>
              </div>
              <div className="rounded-2xl bg-neutral-50 px-3 py-2">
                <p className="text-sm font-semibold text-neutral-500">Déjà présents, ignorés</p>
                <p className="text-lg font-semibold text-neutral-800">{skippedCount}</p>
              </div>
            </div>
            {skippedCount > 0 && <p className="-mt-1 mb-3 px-1 text-sm font-medium text-neutral-500">Les événements ignorés semblent déjà avoir été importés.</p>}
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-neutral-200">
              {reviewEvents.map((event) => (
                <div key={event.externalImportId} className="grid gap-2 border-b border-neutral-100 px-3 py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-base font-semibold text-neutral-950">{event.sourceTitle}</p>
                      {event.skipped && <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500">{event.skipReason}</span>}
                    </div>
                    <p className="mt-0.5 text-base font-medium text-neutral-600">
                      {event.clientName} · {event.eventName}
                    </p>
                    {(event.location || event.description) && (
                      <p className="mt-1 line-clamp-2 text-sm font-medium text-neutral-400">
                        {[event.location, event.description].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="text-left text-base font-semibold text-neutral-500 sm:text-right">
                    <p>{formatFullDate(event.date)}</p>
                    <p>{event.allDay ? "Jour entier" : formatTimeRange(event.startTime, event.endTime) || "Journée"}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setStep("upload")} disabled={importing} className="rounded-xl bg-neutral-50 px-4 py-2 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:text-neutral-300">
                Changer de fichier
              </button>
              <button
                type="button"
                onClick={() => void confirmImport()}
                disabled={importing || importableCount === 0}
                className="rounded-full bg-[#bb2720] px-4 py-2 text-base font-semibold text-white disabled:bg-neutral-300"
              >
                {importing && importProgress ? `Importation ${importProgress.processed} / ${importProgress.total}` : importing ? "Import..." : "Importer"}
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
  syncCalendars,
  events,
  onClose,
  onCreateEvent,
  onUpdateEvent,
  onAuthExpired,
}: {
  accessToken: string | null;
  online: boolean;
  initialFile?: File | null;
  selectedDateKey: string;
  syncCalendars: EventEditorExternalCalendar[];
  events: ProductionEvent[];
  onClose: () => void;
  onCreateEvent: (input: CreateEventInput) => Promise<void>;
  onUpdateEvent: (event: ProductionEvent, input: CreateEventInput) => Promise<void>;
  onAuthExpired?: () => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nativeKeyboard = useNativeKeyboardVisibility<HTMLFormElement>();
  const [fileName, setFileName] = useState("");
  const [form, setForm] = useState<CreateEventInput>({
    clientName: "",
    eventName: "",
    date: selectedDateKey,
    isAllDay: false,
    clientArrivalTime: "",
    startTime: "",
    endTime: "",
    endOfDayTime: "",
    location: "",
    notes: "",
    syncExternalCalendarId: syncCalendars[0]?.id ?? null,
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
  const selectedSyncCalendarAvailable = Boolean(form.syncExternalCalendarId && syncCalendars.some((calendar) => calendar.id === form.syncExternalCalendarId));

  useEffect(() => {
    if (form.syncExternalCalendarId && syncCalendars.some((calendar) => calendar.id === form.syncExternalCalendarId)) return;
    setForm((current) => ({
      ...current,
      syncExternalCalendarId: syncCalendars[0]?.id ?? null,
    }));
  }, [form.syncExternalCalendarId, syncCalendars]);

  function updateField<Key extends keyof CreateEventInput>(key: Key, value: CreateEventInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "syncExternalCalendarId") {
      setResolution((current) =>
        current
          ? {
              ...current,
              input: {
                ...current.input,
                syncExternalCalendarId: value as string | null,
              },
            }
          : current,
      );
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    console.info("Quote PDF file selected for extraction", {
      fileName: file.name,
      fileType: file.type || "(empty)",
      fileSize: file.size,
      isPdf: isPdfFile(file),
    });
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
        throw new Error(sessionExpiredMessage);
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
      setForm((current) => ({
        clientName: extracted.clientName,
        eventName: "Événement",
        date: extracted.date,
        isAllDay: false,
        clientArrivalTime: extracted.startTime,
        startTime: "",
        endTime: "",
        endOfDayTime: extracted.endTime,
        location: "",
        notes: "",
        syncExternalCalendarId: current.syncExternalCalendarId && syncCalendars.some((calendar) => calendar.id === current.syncExternalCalendarId)
          ? current.syncExternalCalendarId
          : syncCalendars[0]?.id ?? null,
        optionLabels: extracted.services,
        quoteReference: extracted.quoteReference || null,
        quoteVersion: extracted.quoteVersion || null,
        sourceQuoteText: extracted.sourceQuoteText || null,
      }));
      setServiceText(extracted.services.join("\n"));
      setResolution(null);
      setStep("review");
    } catch (extractError) {
      if (isSessionExpiredError(extractError)) {
        await onAuthExpired?.();
        setError(sessionExpiredMessage);
        return;
      }
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
      if (!form.syncExternalCalendarId || !selectedSyncCalendarAvailable) {
        throw new Error(noCreatableCalendarMessage);
      }
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
      if (!resolution.input.syncExternalCalendarId || !syncCalendars.some((calendar) => calendar.id === resolution.input.syncExternalCalendarId)) {
        throw new Error(noCreatableCalendarMessage);
      }
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
  useEscapeToClose(onClose);

  return (
    <MstvModalSurface onClose={onClose} position="sheet">
      <form
        ref={nativeKeyboard.scrollContainerRef}
        onSubmit={handleSubmit}
        className={cn(mstvModalPanelClassName, uiMotionClasses.modalPanelIn, "max-h-[calc(var(--app-height)-1.5rem)] w-full overflow-y-auto p-5 sm:max-h-[calc(var(--app-height)-3rem)] sm:max-w-2xl sm:p-6")}
        style={nativeKeyboard.scrollContainerStyle}
        onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-950">
              {step === "upload" ? "Importer un devis ou une facture" : step === "resolve" ? "Un événement existant semble correspondre à ce document." : "Voici ce que j'ai compris"}
            </h2>
            {fileName && <p className="mt-1 truncate text-base font-medium text-neutral-500">{fileName}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-neutral-50 px-3 py-1.5 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100">
            Fermer
          </button>
        </div>

        {step !== "upload" && (
          <div className="mb-4">
            <Field label="Calendrier">
              {syncCalendars.length > 0 ? (
                <select
                  {...iosKeyboardGuardProps}
                  value={selectedSyncCalendarAvailable ? form.syncExternalCalendarId ?? "" : ""}
                  onFocus={(event) => nativeKeyboard.handleFieldFocus(event.currentTarget)}
                  onChange={(selectEvent) => updateField("syncExternalCalendarId", selectEvent.target.value || null)}
                  className={formInputClassName}
                >
                  {syncCalendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-xl bg-neutral-50 px-3 py-2 text-base font-semibold text-neutral-500">{noCreatableCalendarMessage}</p>
              )}
            </Field>
          </div>
        )}

        {step === "upload" ? (
          <label
            onDragEnter={(event) => {
              if (!hasFileDragItem(event.dataTransfer)) return;
              event.preventDefault();
              event.stopPropagation();
              setDropActive(hasPotentialPdfDragItem(event.dataTransfer));
            }}
            onDragOver={(event) => {
              if (!hasFileDragItem(event.dataTransfer)) return;
              event.preventDefault();
              event.stopPropagation();
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
              event.stopPropagation();
              setDropActive(false);
              const files = getFilesFromTransfer(event.dataTransfer);
              const pdfFile = files.find(isPdfFile) ?? null;
              console.info("Quote PDF modal drop event", {
                fileCount: files.length,
                firstFileName: files[0]?.name ?? null,
                firstFileType: files[0]?.type || null,
                firstFileSize: files[0]?.size ?? null,
                pdfFileName: pdfFile?.name ?? null,
                importHandlerCalled: Boolean(pdfFile),
              });
              if (!pdfFile) {
                setError("Importez un fichier PDF.");
                return;
              }
              void handleFile(pdfFile);
            }}
            className={cn(
              "flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center transition",
              dropActive ? "border-[#bb2720]/50 bg-[#bb2720]/[0.06]" : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100/70",
            )}
          >
            <FileText className={cn("mb-3 h-7 w-7", dropActive ? "text-[#bb2720]" : "text-neutral-500")} />
            <span className="text-base font-semibold text-neutral-800">{extracting ? "Lecture du PDF..." : "Déposez un PDF ici"}</span>
            <span className="mt-1 text-base font-medium text-neutral-500">ou cliquez pour sélectionner un fichier</span>
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
              <div className="rounded-2xl bg-neutral-50 px-3 py-3">
                <p className="text-base font-semibold text-neutral-500">Événement existant</p>
                <p className="mt-1 text-base font-semibold text-neutral-950">{resolution.existingEvent.clientName}</p>
                <p className="mt-1 text-base font-medium text-neutral-500">{formatFullDate(resolution.existingEvent.date)}</p>
              </div>
              <div className="rounded-2xl border border-[#bb2720]/20 bg-[#bb2720]/[0.04] px-3 py-3">
                <p className="text-base font-semibold text-[#bb2720]">Nouveau PDF</p>
                <p className="mt-1 text-base font-semibold text-neutral-950">{resolution.input.clientName}</p>
                <p className="mt-1 text-base font-medium text-neutral-500">{formatFullDate(resolution.input.date)}</p>
              </div>
            </div>

            <div className="rounded-2xl bg-neutral-50 px-3 py-2">
              <p className="mb-2 text-base font-semibold text-neutral-600">Différences détectées</p>
              {resolution.differences.length > 0 ? (
                <div className="flex flex-col divide-y divide-neutral-100">
                  {resolution.differences.map((difference) => (
                    <div key={`${difference.label}-${difference.previousValue}-${difference.nextValue}`} className="grid gap-1 py-2 sm:grid-cols-[7rem_1fr_1fr] sm:items-center">
                      <span className="text-base font-semibold text-neutral-500">{difference.label}</span>
                      <span className="text-base font-medium text-neutral-500">{difference.previousValue}</span>
                      <span className="text-base font-semibold text-neutral-950">{difference.nextValue}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-base font-medium text-neutral-500">Aucune différence majeure détectée.</p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom du client">
                <input
                  {...iosKeyboardGuardProps}
                  required
                  value={form.clientName}
                  onFocus={(event) => nativeKeyboard.handleFieldFocus(event.currentTarget)}
                  onChange={(event) => updateField("clientName", event.target.value)}
                  className={formInputClassName}
                />
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
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Début">
                <TimeTextInput value={form.clientArrivalTime} onChange={(value) => updateField("clientArrivalTime", value)} onFocusTarget={nativeKeyboard.handleFieldFocus} className={formInputClassName} />
              </Field>
              <Field label="Fin">
                <TimeTextInput value={form.endOfDayTime} onChange={(value) => updateField("endOfDayTime", value)} onFocusTarget={nativeKeyboard.handleFieldFocus} className={formInputClassName} />
              </Field>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Début live/tournage">
                <TimeTextInput value={form.startTime} onChange={(value) => updateField("startTime", value)} onFocusTarget={nativeKeyboard.handleFieldFocus} className={formInputClassName} />
              </Field>
              <Field label="Fin live/tournage">
                <TimeTextInput value={form.endTime} onChange={(value) => updateField("endTime", value)} onFocusTarget={nativeKeyboard.handleFieldFocus} className={formInputClassName} />
              </Field>
            </div>

            <label className="mt-3 block text-base font-semibold text-neutral-500">
              <span className="mb-1.5 block">Services / options détectés</span>
              <textarea
                {...iosKeyboardGuardProps}
                value={serviceText}
                onFocus={(event) => nativeKeyboard.handleFieldFocus(event.currentTarget)}
                onChange={(event) => setServiceText(event.target.value)}
                rows={4}
                className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base font-medium text-neutral-950 outline-none transition focus:border-[#bb2720]/50"
                placeholder="Un service par ligne"
              />
            </label>
          </>
        )}

        {datePickerOpen && (
          <MstvDatePicker
            selectedDate={form.date}
            onClose={() => setDatePickerOpen(false)}
            onSelectDate={(date) => {
              updateField("date", date);
              setDatePickerOpen(false);
            }}
          />
        )}

        {error && <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="mt-6 flex justify-end gap-2">
          {step === "review" && (
            <button type="button" onClick={() => setStep("upload")} disabled={submitting} className="rounded-xl bg-neutral-50 px-4 py-2 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:text-neutral-300">
              Remplacer le PDF
            </button>
          )}
          {step === "resolve" && (
            <button type="button" onClick={() => setStep("review")} disabled={submitting} className="rounded-xl bg-neutral-50 px-4 py-2 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:text-neutral-300">
              Retour
            </button>
          )}
          <button type="button" onClick={onClose} disabled={submitting || extracting} className="rounded-xl bg-neutral-50 px-4 py-2 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:text-neutral-300">
            Annuler
          </button>
          {step === "review" && (
            <button disabled={submitting} className="rounded-full bg-[#bb2720] px-4 py-2 text-base font-semibold text-white disabled:bg-neutral-300">
              {submitting ? "Création..." : "Créer l'événement"}
            </button>
          )}
          {step === "resolve" && (
            <>
              <button type="button" onClick={() => void createNewEventFromResolution()} disabled={submitting} className="rounded-xl bg-neutral-50 px-4 py-2 text-base font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:text-neutral-300">
                Créer un nouvel événement
              </button>
              <button type="button" onClick={() => void updateExistingEventFromResolution()} disabled={submitting} className="rounded-full bg-[#bb2720] px-4 py-2 text-base font-semibold text-white disabled:bg-neutral-300">
                {submitting ? "Mise à jour..." : "Mettre à jour l'événement existant"}
              </button>
            </>
          )}
        </div>
      </form>
    </MstvModalSurface>
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
  const display = getProductionEventDisplay(event);

  useEscapeToClose(onClose);

  return (
    <div className={cn(modalBackdropClassName, modalSheetPositionClassName)} onPointerDown={(pointerEvent) => handleModalBackdropPointerDown(pointerEvent, onClose)}>
      <div className={cn(modalPanelClassName, "flex max-h-[82vh] w-full flex-col p-4 sm:max-w-lg sm:p-5")} onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-950">Historique</h2>
            <p className="mt-1 truncate text-base font-medium text-neutral-500">
              {[display.title, display.subtitle].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-neutral-50 px-3 py-1.5 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100">
            Fermer
          </button>
        </div>

        {error && <div className="mb-3 rounded-2xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading && <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-base font-medium text-neutral-500">Chargement...</div>}
          {!loading && entries.length === 0 && !error && (
            <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-base font-medium text-neutral-500">Aucun historique pour le moment.</div>
          )}
          <div className="space-y-2">
            {entries.map((entry) => {
              const previousLabel = getActivityValueLabel(entry.previousValue);
              const nextLabel = getActivityValueLabel(entry.newValue);
              const isRestorable = canRestore && canRestoreActivity(entry);
              const isRestoring = restoringActivityId === entry.id;

              return (
                <div key={entry.id} className="rounded-2xl bg-neutral-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-neutral-900">{entry.description}</p>
                      <p className="mt-1 text-sm font-medium text-neutral-500">{formatHistoryTimestamp(entry.createdAt)}</p>
                    </div>
                    {isRestorable && (
                      <button
                        type="button"
                        onClick={() => void onRestore(entry)}
                        disabled={isRestoring}
                        className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:text-neutral-300"
                      >
                        {isRestoring ? "..." : "Restaurer"}
                      </button>
                    )}
                  </div>
                  {(previousLabel || nextLabel) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-neutral-500">
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
  useEscapeToClose(onClose);

  return (
    <div className={cn(modalBackdropClassName, modalSheetPositionClassName)} onPointerDown={(pointerEvent) => handleModalBackdropPointerDown(pointerEvent, onClose)}>
      <div className={cn(modalPanelClassName, "flex max-h-[82vh] w-full flex-col p-4 sm:max-w-2xl sm:p-5")} onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-950">Corbeille</h2>
            <p className="mt-1 text-base font-medium text-neutral-500">Événements supprimés restaurables.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-neutral-50 px-3 py-1.5 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100">
            Fermer
          </button>
        </div>

        {error && <div className="mb-3 rounded-2xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading && <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-base font-medium text-neutral-500">Chargement...</div>}
          {!loading && events.length === 0 && !error && (
            <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-base font-medium text-neutral-500">La corbeille est vide.</div>
          )}
          <div className="space-y-2">
            {events.map((event) => {
              const isRestoring = restoringEventId === event.id;
              const display = getProductionEventDisplay(event);
              return (
                <div key={event.id} className="rounded-2xl bg-neutral-50/70 px-4 py-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-neutral-950">{display.title}</p>
                      {display.subtitle && <p className="truncate text-base font-medium text-neutral-500">{display.subtitle}</p>}
                      <p className="mt-2 text-sm font-semibold text-neutral-500">
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
                        className="rounded-xl bg-white px-3 py-1.5 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:text-neutral-300"
                      >
                        {isRestoring ? "Restauration..." : "Restaurer"}
                      </button>
                    )}
                    {canPermanentDelete && (
                      <button
                        type="button"
                        onClick={() => onPermanentDeleteRequest(event)}
                        disabled={isRestoring}
                        className="rounded-full border border-[#bb2720]/20 bg-white px-3 py-1.5 text-base font-semibold text-[#bb2720] transition hover:bg-[#bb2720]/[0.05] disabled:text-neutral-300"
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
  useEscapeToClose(onClose);

  return (
    <div className={cn(modalBackdropClassName, modalSheetPositionClassName)} onPointerDown={(pointerEvent) => handleModalBackdropPointerDown(pointerEvent, onClose)}>
      <div className={cn(modalPanelClassName, "flex max-h-[82vh] w-full flex-col p-4 sm:max-w-2xl sm:p-5")} onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-950">Gestion utilisateurs</h2>
            <p className="mt-1 text-base font-medium text-neutral-500">Rôles de l'équipe MSTV.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-neutral-50 px-3 py-1.5 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100">
            Fermer
          </button>
        </div>

        {error && <div className="mb-3 rounded-2xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading && <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-base font-medium text-neutral-500">Chargement...</div>}
          {!loading && profiles.length === 0 && !error && (
            <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-base font-medium text-neutral-500">Aucun utilisateur pour le moment.</div>
          )}
          <div className="space-y-2">
            {profiles.map((userProfile) => {
              const displayName = getProfileDisplayName(userProfile) ?? "Utilisateur";
              const isUpdating = updatingProfileId === userProfile.id;
              const isCurrentProfile = currentProfileId === userProfile.id;

              return (
                <div key={userProfile.id} className="rounded-2xl bg-neutral-50/70 px-4 py-3">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-neutral-950">
                        {displayName}
                        {isCurrentProfile && <span className="ml-2 text-sm font-semibold text-[#bb2720]">Vous</span>}
                      </p>
                      <p className="mt-1 truncate text-base font-medium text-neutral-500">{userProfile.email ?? "Email non renseigné"}</p>
                      <p className="mt-1 text-sm font-semibold text-neutral-400">Créé le {formatHistoryTimestamp(userProfile.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                      <select
                        value={userProfile.role}
                        disabled={isUpdating || isCurrentProfile}
                        onChange={(event) => void onUpdateRole(userProfile, event.target.value as UserRole)}
                        className="h-10 rounded-full border border-neutral-200 bg-white px-3 text-base font-semibold text-neutral-700 outline-none transition focus:border-[#bb2720]/40 disabled:bg-neutral-100 disabled:text-neutral-400"
                        aria-label={`Rôle de ${displayName}`}
                      >
                        {userRoleOptions.map((role) => (
                          <option key={role} value={role}>
                            {getRoleLabel(role)}
                          </option>
                        ))}
                      </select>
                      {isCurrentProfile && <p className="text-xs font-semibold text-neutral-400">Vous ne pouvez pas modifier votre propre rôle.</p>}
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
  const customColor = normalizeHexColor(value) ?? "#737373";
  const customSelected = Boolean(normalizeHexColor(value));

  return (
    <div className="flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3" aria-label="Couleur du calendrier">
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
              isSelected ? `ring-2 ring-offset-2 ring-offset-white ${colorOption.selectedClassName}` : "ring-0 hover:ring-2 hover:ring-neutral-200 hover:ring-offset-2 hover:ring-offset-white",
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
          customSelected ? "ring-2 ring-neutral-300 ring-offset-2 ring-offset-white" : "ring-0 hover:ring-2 hover:ring-neutral-200 hover:ring-offset-2 hover:ring-offset-white",
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
  googleAccounts,
  googleCalendarsByAccountId,
  googleLoading,
  connectingGoogle,
  appleAccounts,
  appleCalendarsByAccountId,
  appleLoading,
  connectingApple,
  loading,
  error,
  syncingCalendarId,
  syncProgress,
  onClose,
  onCreate,
  onUpdate,
  onReorder,
  onConnectGoogle,
  onDisconnectGoogle,
  onConnectApple,
  onDisconnectApple,
  onDelete,
  onSync,
}: {
  calendars: ExternalCalendar[];
  events: ExternalCalendarEvent[];
  permissions: AppPermissions;
  profile: UserProfile | null;
  googleAccounts: GoogleCalendarAccount[];
  googleCalendarsByAccountId: Record<string, GoogleProviderCalendar[]>;
  googleLoading: boolean;
  connectingGoogle: boolean;
  appleAccounts: AppleCalendarAccount[];
  appleCalendarsByAccountId: Record<string, AppleProviderCalendar[]>;
  appleLoading: boolean;
  connectingApple: boolean;
  loading: boolean;
  error: string | null;
  syncingCalendarId: string | null;
  syncProgress: ExternalCalendarSyncProgress | null;
  onClose: () => void;
  onCreate: (input: { name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility }) => Promise<void>;
  onUpdate: (calendar: ExternalCalendar, input: { name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility; syncEnabled?: boolean }) => Promise<void>;
  onReorder: (orderedCalendars: ExternalCalendar[]) => Promise<void>;
  onConnectGoogle: () => Promise<void>;
  onDisconnectGoogle: (account: GoogleCalendarAccount) => Promise<void>;
  onConnectApple: (input: { appleId: string; appPassword: string }) => Promise<void>;
  onDisconnectApple: (account: AppleCalendarAccount) => Promise<void>;
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
  const nativeKeyboard = useNativeKeyboardVisibility<HTMLDivElement>();
  const selectedCalendar = selectedCalendarId ? calendars.find((calendar) => calendar.id === selectedCalendarId) ?? null : null;
  const selectedCalendarEvents = selectedCalendar ? events.filter((event) => event.externalCalendarId === selectedCalendar.id) : [];
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
  useEscapeToClose(onClose);

  return (
    <MstvModalSurface
      onClose={onClose}
      position="custom"
      className={cn(isMobileFormView ? "items-stretch p-0 sm:items-center sm:justify-center sm:p-6" : "items-end p-3 sm:items-center sm:justify-center sm:p-6")}
    >
      <MstvModalPanel
        className={cn(
          "flex w-full flex-col",
          isMobileFormView
            ? "h-[var(--app-height)] max-h-[var(--app-height)] rounded-none px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+var(--app-viewport-offset-top)+1rem)] shadow-none sm:h-auto sm:max-h-[86vh] sm:max-w-2xl sm:rounded-2xl sm:p-5 sm:shadow-sm sm:shadow-black/5"
            : "max-h-[86vh] p-4 sm:max-w-2xl sm:p-5",
        )}
      >
        {isMobileFormView && (
          <div className="mb-5 flex items-center justify-between sm:hidden">
            <button type="button" onClick={cancelForm} className="rounded-full px-1 py-1 text-base font-semibold text-neutral-500">
              {view === "detail" ? "Retour" : "Annuler"}
            </button>
            <h2 className="text-base font-semibold text-neutral-950">{view === "detail" ? "Modifier le calendrier" : "Ajouter un calendrier"}</h2>
            <button type="button" onClick={onClose} className="rounded-full px-1 py-1 text-base font-semibold text-neutral-500">
              Fermer
            </button>
          </div>
        )}

        <div className={cn("mb-4 flex items-start justify-between gap-3", isMobileFormView && "hidden sm:flex")}>
          <div className="flex min-w-0 items-start gap-2">
            {view !== "list" && (
              <button
                type="button"
                onClick={returnToList}
                className="-ml-1 mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100"
                aria-label="Retour"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-neutral-950">
                {view === "add" ? "Ajouter un calendrier" : view === "detail" ? selectedCalendar?.name ?? "Calendrier" : "Calendriers"}
              </h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-neutral-50 px-3 py-1.5 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100">
            Fermer
          </button>
        </div>

        {(error || localError) && <div className="mb-3 rounded-2xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{localError || error}</div>}

        <div
          ref={nativeKeyboard.scrollContainerRef}
          className={cn("no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain", isMobileFormView && "pb-8 sm:pb-0")}
          style={nativeKeyboard.scrollContainerStyle}
        >
          {view === "list" && (
            <ExternalCalendarsListView
              calendars={calendars}
              profile={profile}
              googleAccounts={googleAccounts}
              googleCalendarsByAccountId={googleCalendarsByAccountId}
              googleLoading={googleLoading}
              connectingGoogle={connectingGoogle}
              appleAccounts={appleAccounts}
              appleCalendarsByAccountId={appleCalendarsByAccountId}
              appleLoading={appleLoading}
              connectingApple={connectingApple}
              loading={loading}
              error={error}
              permissions={permissions}
              onConnectGoogle={onConnectGoogle}
              onDisconnectGoogle={onDisconnectGoogle}
              onConnectApple={onConnectApple}
              onDisconnectApple={onDisconnectApple}
              onReorderCalendars={onReorder}
              onNativeFieldFocus={nativeKeyboard.handleFieldFocus}
              onOpenCalendarDetail={(calendar) => {
                setSelectedCalendarId(calendar.id);
                setView("detail");
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
              onNativeFieldFocus={nativeKeyboard.handleFieldFocus}
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
              onNativeFieldFocus={nativeKeyboard.handleFieldFocus}
            />
          )}
        </div>
      </MstvModalPanel>
    </MstvModalSurface>
  );
}

function ExternalCalendarColorDot({ color, className }: { color: string | null; className?: string }) {
  const tone = getExternalCalendarTone(color);
  return <span style={tone.dotStyle} className={cn("h-3.5 w-3.5 shrink-0 rounded-full", tone.dot, className)} />;
}

function EventCalendarBadge({ event }: { event: ProductionEvent }) {
  const badge = getEventCalendarBadge(event);
  const tone = getExternalCalendarTone(badge.color);

  return (
    <span
      className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", tone.bg, tone.meta)}
      style={tone.bgStyle}
    >
      <ExternalCalendarColorDot color={badge.color} className="h-2.5 w-2.5" />
      <span className="truncate">{badge.name}</span>
    </span>
  );
}

function sortTasksForDisplay(tasks: AppTask[]) {
  return [...tasks].sort((left, right) => {
    if (left.status !== right.status) return left.status === "todo" ? -1 : 1;
    if (left.status === "todo" && isTaskUrgent(left) !== isTaskUrgent(right)) return isTaskUrgent(left) ? -1 : 1;
    const leftOrder = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    const leftDue = left.dueDate ?? "9999-12-31";
    const rightDue = right.dueDate ?? "9999-12-31";
    if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);
    return right.createdAt.localeCompare(left.createdAt);
  });
}

function getNextTaskSortOrder(tasks: AppTask[], assignedProfileId: string | null) {
  const siblingOrders = tasks
    .filter((task) => task.status === "todo" && task.assignedProfileId === assignedProfileId)
    .map((task) => task.sortOrder)
    .filter((sortOrder): sortOrder is number => typeof sortOrder === "number");
  if (siblingOrders.length === 0) return 1;
  return Math.max(...siblingOrders) + 1;
}

function isTaskUrgent(task: AppTask) {
  return task.priority === "urgent";
}

function countActiveUrgentTasksForProfile(tasks: AppTask[], assignedProfileId: string, excludedTaskId?: string | null) {
  return tasks.filter((task) => (
    task.id !== excludedTaskId &&
    task.status === "todo" &&
    task.assignedProfileId === assignedProfileId &&
    isTaskUrgent(task)
  )).length;
}

function sortTaskQueue(tasks: AppTask[]) {
  return [...tasks].sort((left, right) => {
    if (isTaskUrgent(left) !== isTaskUrgent(right)) return isTaskUrgent(left) ? -1 : 1;
    const leftOrder = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function formatShortDate(dateKey: string | null) {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
}

function formatShortDateWithYear(dateKey: string | null) {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function getTaskAssigneeLabel(task: AppTask, profiles: UserProfile[]) {
  const assignee = profiles.find((userProfile) => userProfile.id === task.assignedProfileId) ?? null;
  return assignee ? getProfileFirstNameLabel(assignee) : "Non assignée";
}

function getOptionExternalAssigneeFirstName(option: EventOption) {
  const name = option.externalAssigneeName?.trim();
  if (!name) return null;
  return name.split(/\s+/)[0] ?? name;
}

function getLinkedTaskForOption(option: EventOption, tasks: AppTask[]) {
  if (!option.taskId) return null;
  return tasks.find((task) => task.id === option.taskId) ?? null;
}

function getOptionEffectiveStatus(option: EventOption, tasks: AppTask[]): CompletionStatus {
  const linkedTask = getLinkedTaskForOption(option, tasks);
  if (linkedTask) return linkedTask.status === "done" ? "completed" : "incomplete";
  return option.status;
}

function getOptionAssigneeLabel(option: EventOption, tasks: AppTask[], profiles: UserProfile[]) {
  const linkedTask = getLinkedTaskForOption(option, tasks);
  if (linkedTask?.assignedProfileId) return getTaskAssigneeLabel(linkedTask, profiles);
  const externalAssigneeName = getOptionExternalAssigneeFirstName(option);
  if (externalAssigneeName) return externalAssigneeName;
  return null;
}

const CalendarSettingsListRow = forwardRef<HTMLDivElement, {
  name: string;
  color: string | null;
  enabled: boolean;
  disabled?: boolean;
  compact?: boolean;
  dragging?: boolean;
  draggable?: boolean;
  draggableProps?: HTMLAttributes<HTMLDivElement>;
  onOpen: () => void;
}>(function CalendarSettingsListRow({
  name,
  color,
  enabled,
  disabled = false,
  compact = false,
  dragging = false,
  draggable = false,
  draggableProps,
  onOpen,
}, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex min-w-0 select-none items-center gap-3 rounded-2xl transition",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        compact ? "px-3 py-1.5" : "px-3 py-2",
        enabled ? "bg-white hover:bg-neutral-50" : "bg-neutral-50/70 text-neutral-400",
        dragging && "relative z-10 opacity-80 shadow-sm shadow-black/5",
      )}
      {...draggableProps}
    >
      <ExternalCalendarColorDot color={color} className={cn(!enabled && "opacity-30")} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-semibold", compact ? "text-sm" : "text-base", enabled ? "text-neutral-900" : "text-neutral-400")}>{name}</p>
      </div>
      <span className={cn("shrink-0 text-xs font-semibold", enabled ? "text-emerald-600" : "text-neutral-400")}>{enabled ? "Actif" : "Inactif"}</span>
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onOpen}
        disabled={disabled}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
        aria-label={`Réglages de ${name}`}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
});

function CalendarSettingsListGroup({ label, rows }: { label: string; rows: ReactNode[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="px-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-neutral-400">{label}</p>
      <div className="space-y-1">{rows}</div>
    </div>
  );
}

type CalendarSettingsDraggableRow = {
  id: string;
  name: string;
  color: string | null;
  storedCalendar: ExternalCalendar;
  canDrag: boolean;
};

function CalendarSettingsDraggableListGroup({
  label,
  rows,
  onOpen,
  onReorder,
}: {
  label: string;
  rows: CalendarSettingsDraggableRow[];
  onOpen: (calendar: ExternalCalendar) => void;
  onReorder: (orderedCalendars: ExternalCalendar[]) => Promise<void>;
}) {
  const [orderIds, setOrderIds] = useState(() => rows.map((row) => row.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 8,
      },
    }),
  );
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const orderedRows = useMemo(() => {
    const knownRows = orderIds.map((id) => rowsById.get(id)).filter((row): row is CalendarSettingsDraggableRow => Boolean(row));
    const knownIds = new Set(knownRows.map((row) => row.id));
    return [...knownRows, ...rows.filter((row) => !knownIds.has(row.id))];
  }, [orderIds, rows, rowsById]);

  useEffect(() => {
    if (draggingId) return;
    setOrderIds(rows.map((row) => row.id));
  }, [draggingId, rows]);

  if (rows.length === 0) return null;

  async function persistDragOrder(nextIds: string[], previousIds: string[]) {
    if (nextIds.join("|") === previousIds.join("|")) return;

    const nextRows = nextIds
      .map((id) => rowsById.get(id))
      .filter((row): row is CalendarSettingsDraggableRow => Boolean(row));

    try {
      await onReorder(nextRows.map((row) => row.storedCalendar));
    } catch {
      setOrderIds(previousIds);
      setDragError("Impossible d'enregistrer l'ordre des calendriers.");
    }
  }

  function handleCalendarDragStart(event: DragStartEvent) {
    setDragError(null);
    setDraggingId(String(event.active.id));
  }

  function handleCalendarDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;

    const previousIds = orderedRows.map((row) => row.id);
    const oldIndex = previousIds.indexOf(activeId);
    const newIndex = previousIds.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const nextIds = arrayMove(previousIds, oldIndex, newIndex);
    setOrderIds(nextIds);
    void persistDragOrder(nextIds, previousIds);
  }

  return (
    <div className="space-y-1.5">
      <p className="px-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-neutral-400">{label}</p>
      <div className="space-y-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleCalendarDragStart}
          onDragEnd={handleCalendarDragEnd}
          onDragCancel={() => setDraggingId(null)}
        >
          <SortableContext items={orderedRows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {orderedRows.map((row) => (
                <SortableCalendarSettingsRow
                  key={row.id}
                  row={row}
                  dragging={draggingId === row.id}
                  canDrag={row.canDrag && rows.length > 1}
                  onOpen={() => onOpen(row.storedCalendar)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      {dragError && <p className="px-1 text-xs font-semibold text-rose-600">{dragError}</p>}
    </div>
  );
}

function SortableCalendarSettingsRow({
  row,
  dragging,
  canDrag,
  onOpen,
}: {
  row: CalendarSettingsDraggableRow;
  dragging: boolean;
  canDrag: boolean;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: row.id,
    disabled: !canDrag,
  });
  const rowIsDragging = dragging || isDragging;
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: rowIsDragging ? 10 : undefined,
    position: rowIsDragging ? "relative" : undefined,
  };
  const setCalendarRowRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    setActivatorNodeRef(node);
  };

  return (
    <div style={style}>
      <CalendarSettingsListRow
        ref={setCalendarRowRef}
        name={row.name}
        color={row.color}
        enabled
        dragging={rowIsDragging}
        draggable={canDrag}
        draggableProps={canDrag ? ({ ...attributes, ...listeners } as HTMLAttributes<HTMLDivElement>) : undefined}
        onOpen={onOpen}
      />
    </div>
  );
}

function ExternalCalendarsListView({
  calendars,
  profile,
  googleAccounts,
  googleCalendarsByAccountId,
  googleLoading,
  connectingGoogle,
  appleAccounts,
  appleCalendarsByAccountId,
  appleLoading,
  connectingApple,
  loading,
  error,
  permissions,
  onConnectGoogle,
  onDisconnectGoogle,
  onConnectApple,
  onDisconnectApple,
  onReorderCalendars,
  onNativeFieldFocus,
  onOpenCalendarDetail,
}: {
  calendars: ExternalCalendar[];
  profile: UserProfile | null;
  googleAccounts: GoogleCalendarAccount[];
  googleCalendarsByAccountId: Record<string, GoogleProviderCalendar[]>;
  googleLoading: boolean;
  connectingGoogle: boolean;
  appleAccounts: AppleCalendarAccount[];
  appleCalendarsByAccountId: Record<string, AppleProviderCalendar[]>;
  appleLoading: boolean;
  connectingApple: boolean;
  loading: boolean;
  error: string | null;
  permissions: AppPermissions;
  onConnectGoogle: () => Promise<void>;
  onDisconnectGoogle: (account: GoogleCalendarAccount) => Promise<void>;
  onConnectApple: (input: { appleId: string; appPassword: string }) => Promise<void>;
  onDisconnectApple: (account: AppleCalendarAccount) => Promise<void>;
  onReorderCalendars: (orderedCalendars: ExternalCalendar[]) => Promise<void>;
  onNativeFieldFocus: (target: HTMLElement) => boolean;
  onOpenCalendarDetail: (calendar: ExternalCalendar) => void;
}) {
  const [appleConnectOpen, setAppleConnectOpen] = useState(false);
  const [appleDraft, setAppleDraft] = useState({ appleId: "", appPassword: "" });
  const [appleConnectError, setAppleConnectError] = useState<string | null>(null);
  const [disconnectRequest, setDisconnectRequest] = useState<"google" | "apple" | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<"google" | "apple" | null>(null);
  const connectedGoogleAccounts = googleAccounts.filter((account) => account.connectionStatus === "connected");
  const connectedAppleAccounts = appleAccounts.filter((account) => account.connectionStatus === "connected");
  const googleConnected = connectedGoogleAccounts.length > 0;
  const appleConnected = connectedAppleAccounts.length > 0;

  async function handleAppleConnect() {
    setAppleConnectError(null);
    if (!appleDraft.appleId.trim() || !appleDraft.appPassword.trim()) {
      setAppleConnectError("Adresse Apple et mot de passe d’app obligatoires.");
      return;
    }

    try {
      await onConnectApple(appleDraft);
      setAppleDraft({ appleId: "", appPassword: "" });
      setAppleConnectOpen(false);
    } catch (connectError) {
      setAppleConnectError(getAppleConnectUserMessage(connectError, "Impossible de connecter Apple Calendar."));
    }
  }

  function handleProviderButtonClick(provider: "google" | "apple") {
    if (provider === "google") {
      if (googleConnected) {
        setDisconnectRequest("google");
        return;
      }
      void onConnectGoogle();
      return;
    }

    if (appleConnected) {
      setDisconnectRequest("apple");
      return;
    }
    setAppleConnectOpen((current) => !current);
  }

  async function confirmProviderDisconnect() {
    if (!disconnectRequest) return;
    setDisconnectingProvider(disconnectRequest);
    try {
      if (disconnectRequest === "google") {
        for (const account of connectedGoogleAccounts) {
          await onDisconnectGoogle(account);
        }
      } else {
        for (const account of connectedAppleAccounts) {
          await onDisconnectApple(account);
        }
        setAppleConnectOpen(false);
      }
      setDisconnectRequest(null);
    } finally {
      setDisconnectingProvider(null);
    }
  }

  function getGoogleStoredCalendar(providerCalendar: GoogleProviderCalendar) {
    const providerCalendarKey = normalizeProviderCalendarKey(providerCalendar.providerCalendarId);
    return calendars.find((item) => item.id === providerCalendar.externalCalendarId)
      ?? calendars.find((item) => item.providerType === "google" && normalizeProviderCalendarKey(item.providerCalendarId) === providerCalendarKey)
      ?? null;
  }

  function getAppleStoredCalendar(providerCalendar: AppleProviderCalendar) {
    const providerCalendarKey = normalizeProviderCalendarKey(providerCalendar.providerCalendarId);
    return calendars.find((item) => item.id === providerCalendar.externalCalendarId)
      ?? calendars.find((item) => item.providerType === "apple_caldav" && normalizeProviderCalendarKey(item.providerCalendarId) === providerCalendarKey)
      ?? null;
  }

  function getVisibleGoogleProviderCalendars(accountId: string) {
    return googleCalendarsByAccountId[accountId] ?? [];
  }

  function getVisibleAppleProviderCalendars(accountId: string) {
    return appleCalendarsByAccountId[accountId] ?? [];
  }

  function isStoredCalendarVisible(calendar: ExternalCalendar | null) {
    if (!calendar) return true;
    return canViewCalendar(calendar, getCalendarVisibilityViewer(profile));
  }

  if (loading) {
    return <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-base font-medium text-neutral-500">Chargement...</div>;
  }

  return (
    <div className="space-y-2">
      <div className="space-y-3">
        <div className="mt-3 space-y-2">
          {!appleConnected && !googleConnected && !error && (
            <p className="px-1 text-sm font-medium text-neutral-500">Synchronisez vos calendriers Apple ou Google.</p>
          )}

          {appleConnectOpen && (
            <div className="rounded-2xl bg-neutral-50 px-3 py-3">
              <div className="grid gap-2">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase text-neutral-400">Adresse Apple / iCloud</span>
                  <input
                    {...iosKeyboardGuardProps}
                    value={appleDraft.appleId}
                    onFocus={(event) => onNativeFieldFocus(event.currentTarget)}
                    onChange={(event) => {
                      setAppleDraft((current) => ({ ...current, appleId: event.target.value }));
                    }}
                    className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-base font-semibold text-neutral-800 outline-none"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase text-neutral-400">Mot de passe d’app Apple</span>
                  <input
                    {...iosKeyboardGuardProps}
                    value={appleDraft.appPassword}
                    onFocus={(event) => onNativeFieldFocus(event.currentTarget)}
                    onChange={(event) => {
                      setAppleDraft((current) => ({ ...current, appPassword: event.target.value }));
                    }}
                    className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-base font-semibold text-neutral-800 outline-none"
                    type="password"
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>
                <p className="text-xs font-semibold text-neutral-500">Apple nécessite un mot de passe d’app généré depuis votre compte Apple. N’utilisez pas votre mot de passe principal.</p>
                {appleConnectError && <p className="text-xs font-semibold text-rose-600">{appleConnectError}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAppleConnectError(null);
                      setAppleConnectOpen(false);
                    }}
                    className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-neutral-500 transition hover:bg-neutral-100"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAppleConnect()}
                    disabled={connectingApple}
                    className="rounded-full bg-neutral-950 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300"
                  >
                    {connectingApple ? "Connexion..." : "Connecter"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-5">
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-base font-semibold text-neutral-950">Apple</h4>
                <button
                  type="button"
                  onClick={() => handleProviderButtonClick("apple")}
                  disabled={connectingApple || disconnectingProvider === "apple"}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-default",
                    appleConnected
                      ? "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                      : "border-neutral-950 bg-neutral-950 text-white hover:bg-neutral-800 disabled:border-neutral-200 disabled:bg-neutral-200",
                  )}
                >
                  {appleConnected ? "Déconnecter" : connectingApple ? "Connexion..." : "Connecter"}
                </button>
              </div>
              {appleLoading && <div className="rounded-2xl bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-400">Chargement...</div>}
              <div className="space-y-2">
                {connectedAppleAccounts.map((account) => (
                  <div key={account.id} className="space-y-2">
                    <div className="truncate px-1 text-sm font-semibold text-neutral-500">{account.email || account.displayName || "Compte Apple"}</div>
                    {account.lastError && <div className="px-1 text-xs font-semibold text-rose-600">{account.lastError}</div>}
                    <div className="space-y-3 rounded-2xl bg-white px-2.5 py-2.5">
                      {(() => {
                        const rows = getVisibleAppleProviderCalendars(account.id)
                          .map((calendar) => {
                            const storedCalendar = getAppleStoredCalendar(calendar);
                            if (!isStoredCalendarVisible(storedCalendar)) return null;
                            return {
                              calendar,
                              storedCalendar,
                              enabled: storedCalendar?.syncEnabled ?? calendar.enabled,
                            };
                          })
                          .filter((row): row is NonNullable<typeof row> => Boolean(row));
                        const activeRows = sortExternalCalendarsForDisplay(rows.filter((row) => row.enabled));
                        const availableRows = [...rows.filter((row) => !row.enabled)].sort((left, right) =>
                          left.calendar.name.localeCompare(right.calendar.name, "fr", { sensitivity: "base" }),
                        );
                        const draggableActiveRows = activeRows.flatMap((row) =>
                          row.storedCalendar
                            ? [{
                                id: row.storedCalendar.id,
                                name: row.calendar.name,
                                color: row.storedCalendar.color ?? row.calendar.color,
                                storedCalendar: row.storedCalendar,
                                canDrag: canManageExternalCalendar(permissions, profile, row.storedCalendar),
                              }]
                            : [],
                        );

                        if (rows.length === 0) {
                          return <div className="px-1 py-1 text-sm font-semibold text-neutral-400">Aucun calendrier Apple chargé.</div>;
                        }

                        return (
                          <>
                            <CalendarSettingsDraggableListGroup
                              label="Actifs"
                              rows={draggableActiveRows}
                              onOpen={onOpenCalendarDetail}
                              onReorder={onReorderCalendars}
                            />
                            <CalendarSettingsListGroup
                              label="Disponibles"
                              rows={availableRows.map(({ calendar, storedCalendar, enabled }) => (
                                <CalendarSettingsListRow
                                  key={storedCalendar?.id ?? calendar.providerCalendarId}
                                  name={calendar.name}
                                  color={storedCalendar?.color ?? calendar.color}
                                  enabled={enabled}
                                  disabled={!storedCalendar}
                                  compact
                                  onOpen={() => {
                                    if (storedCalendar) onOpenCalendarDetail(storedCalendar);
                                  }}
                                />
                              ))}
                            />
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-base font-semibold text-neutral-950">Google</h4>
                <button
                  type="button"
                  onClick={() => handleProviderButtonClick("google")}
                  disabled={connectingGoogle || disconnectingProvider === "google"}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-default",
                    googleConnected
                      ? "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                      : "border-neutral-950 bg-neutral-950 text-white hover:bg-neutral-800 disabled:border-neutral-200 disabled:bg-neutral-200",
                  )}
                >
                  {googleConnected ? "Déconnecter" : connectingGoogle ? "Connexion..." : "Connecter"}
                </button>
              </div>
              {googleLoading && <div className="rounded-2xl bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-400">Chargement...</div>}
              <div className="space-y-2">
                {connectedGoogleAccounts.map((account) => (
                  <div key={account.id} className="space-y-2">
                    <div className="truncate px-1 text-sm font-semibold text-neutral-500">{account.email || account.displayName || "Compte Google"}</div>
                    {account.lastError && <div className="px-1 text-xs font-semibold text-rose-600">{account.lastError}</div>}
                    <div className="space-y-3 rounded-2xl bg-white px-2.5 py-2.5">
                      {(() => {
                        const rows = getVisibleGoogleProviderCalendars(account.id)
                          .map((calendar) => {
                            const storedCalendar = getGoogleStoredCalendar(calendar);
                            if (!isStoredCalendarVisible(storedCalendar)) return null;
                            return {
                              calendar,
                              storedCalendar,
                              enabled: storedCalendar?.syncEnabled ?? calendar.enabled,
                            };
                          })
                          .filter((row): row is NonNullable<typeof row> => Boolean(row));
                        const activeRows = sortExternalCalendarsForDisplay(rows.filter((row) => row.enabled));
                        const availableRows = [...rows.filter((row) => !row.enabled)].sort((left, right) =>
                          left.calendar.summary.localeCompare(right.calendar.summary, "fr", { sensitivity: "base" }),
                        );
                        const draggableActiveRows = activeRows.flatMap((row) =>
                          row.storedCalendar
                            ? [{
                                id: row.storedCalendar.id,
                                name: row.calendar.summary,
                                color: row.storedCalendar.color ?? row.calendar.color,
                                storedCalendar: row.storedCalendar,
                                canDrag: canManageExternalCalendar(permissions, profile, row.storedCalendar),
                              }]
                            : [],
                        );

                        if (rows.length === 0) {
                          return <div className="px-1 py-1 text-sm font-semibold text-neutral-400">Aucun calendrier Google chargé.</div>;
                        }

                        return (
                          <>
                            <CalendarSettingsDraggableListGroup
                              label="Actifs"
                              rows={draggableActiveRows}
                              onOpen={onOpenCalendarDetail}
                              onReorder={onReorderCalendars}
                            />
                            <CalendarSettingsListGroup
                              label="Disponibles"
                              rows={availableRows.map(({ calendar, storedCalendar, enabled }) => (
                                <CalendarSettingsListRow
                                  key={storedCalendar?.id ?? calendar.providerCalendarId}
                                  name={calendar.summary}
                                  color={storedCalendar?.color ?? calendar.color}
                                  enabled={enabled}
                                  disabled={!storedCalendar}
                                  compact
                                  onOpen={() => {
                                    if (storedCalendar) onOpenCalendarDetail(storedCalendar);
                                  }}
                                />
                              ))}
                            />
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

        </div>
      </div>
      {disconnectRequest && (
        <ProviderDisconnectDialog
          provider={disconnectRequest}
          busy={disconnectingProvider === disconnectRequest}
          onClose={() => setDisconnectRequest(null)}
          onConfirm={() => void confirmProviderDisconnect()}
        />
      )}
    </div>
  );
}

function SharedConfirmationDialog({
  title,
  description,
  detailTitle,
  detailSubtitle,
  error,
  busy,
  confirmLabel,
  busyLabel,
  cancelLabel = "Annuler",
  elevated = false,
  maxWidthClassName = "sm:max-w-md",
  onCancel,
  onConfirm,
}: {
  title: string;
  description?: string;
  detailTitle?: string | null;
  detailSubtitle?: string | null;
  error?: string | null;
  busy?: boolean;
  confirmLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  elevated?: boolean;
  maxWidthClassName?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEscapeToClose(onCancel);

  return (
    <MstvModalSurface onClose={onCancel} layer={elevated ? "elevatedModal" : "modal"} position="center">
      <MstvModalPanel className={cn("w-full p-5 sm:p-6", maxWidthClassName)}>
        <div className="mb-5">
          <h2 className={cn("text-base font-semibold", uiTextPrimaryClassName)}>{title}</h2>
          {description && <p className={cn("mt-2 text-base font-medium leading-relaxed", uiTextMutedClassName)}>{description}</p>}
          {detailTitle && (
            <div className="mt-4">
              <p className={cn("truncate text-base font-semibold", uiTextPrimaryClassName)}>{detailTitle}</p>
              {detailSubtitle && <p className={cn("mt-1 truncate text-base", uiTextMutedClassName)}>{detailSubtitle}</p>}
            </div>
          )}
        </div>

        {error && <div className={cn("mb-4", uiErrorMessageClassName)}>{error}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className={uiNeutralButtonClassName}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={uiDestructiveButtonClassName}>
            {busy ? busyLabel ?? confirmLabel : confirmLabel}
          </button>
        </div>
      </MstvModalPanel>
    </MstvModalSurface>
  );
}

function ProviderDisconnectDialog({
  provider,
  busy,
  onClose,
  onConfirm,
}: {
  provider: "google" | "apple";
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const providerName = provider === "google" ? "Google Calendar" : "Apple Calendar";

  return (
    <SharedConfirmationDialog
      title={`Déconnecter ${providerName} ?`}
      description="Les calendriers de ce compte disparaîtront de MSTV. Les événements MSTV locaux ne seront pas supprimés."
      confirmLabel="Déconnecter"
      busyLabel="Déconnexion..."
      busy={busy}
      elevated
      onCancel={onClose}
      onConfirm={onConfirm}
    />
  );
}

function ExternalCalendarAddView({
  draft,
  permissions,
  saving,
  onChange,
  onCreate,
  onNativeFieldFocus,
}: {
  draft: { name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility };
  permissions: AppPermissions;
  saving: boolean;
  onChange: Dispatch<SetStateAction<{ name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility }>>;
  onCreate: () => Promise<void>;
  onNativeFieldFocus: (target: HTMLElement) => boolean;
}) {
  return (
    <div className="rounded-2xl bg-neutral-50/70 px-4 py-3">
      <div className="grid gap-2">
        <input
          {...iosKeyboardGuardProps}
          value={draft.name}
          onFocus={(event) => onNativeFieldFocus(event.currentTarget)}
          onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))}
          placeholder="Nom"
          className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-base font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-300 focus:border-[#bb2720]/40"
        />
        <input
          {...iosKeyboardGuardProps}
          value={draft.icsUrl}
          onFocus={(event) => onNativeFieldFocus(event.currentTarget)}
          onChange={(event) => onChange((current) => ({ ...current, icsUrl: event.target.value }))}
          onBlur={() => onChange((current) => ({ ...current, icsUrl: normalizeExternalCalendarIcsUrl(current.icsUrl) }))}
          placeholder="URL ICS"
          inputMode="url"
          className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-base font-medium text-neutral-950 outline-none transition placeholder:text-neutral-300 focus:border-[#bb2720]/40"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
          <ExternalCalendarColorPalette
            value={draft.color}
            onChange={(nextColor) => onChange((current) => ({ ...current, color: nextColor }))}
          />
          <select
            {...iosKeyboardGuardProps}
            value={draft.visibility}
            onFocus={(event) => onNativeFieldFocus(event.currentTarget)}
            onChange={(event) => onChange((current) => ({ ...current, visibility: event.target.value as ExternalCalendarVisibility }))}
            className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-base font-semibold text-neutral-700 outline-none"
          >
            {permissions.canManageEvents && <option value="admin_only">Admins uniquement</option>}
            {permissions.canManageEvents && <option value="team">Toute l’équipe</option>}
            <option value="private">Moi uniquement</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => void onCreate()}
          disabled={saving || !draft.name.trim() || !draft.icsUrl.trim() || !draft.color.trim()}
          className="justify-self-end rounded-xl bg-white px-3 py-1.5 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:text-neutral-300"
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
  onNativeFieldFocus,
}: {
  calendar: ExternalCalendar;
  events: ExternalCalendarEvent[];
  permissions: AppPermissions;
  profile: UserProfile | null;
  syncing: boolean;
  syncProgress: ExternalCalendarSyncProgress | null;
  onUpdate: (calendar: ExternalCalendar, input: { name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility; syncEnabled?: boolean }) => Promise<void>;
  onDelete: (calendar: ExternalCalendar) => Promise<void>;
  onSync: (calendar: ExternalCalendar) => Promise<ExternalCalendarSyncResult>;
  onNativeFieldFocus: (target: HTMLElement) => boolean;
}) {
  const [draft, setDraft] = useState<{ name: string; icsUrl: string; color: string; visibility: ExternalCalendarVisibility; syncEnabled: boolean }>({
    name: calendar.name,
    icsUrl: calendar.icsUrl,
    color: calendar.color ?? "indigo",
    visibility: calendar.visibility,
    syncEnabled: calendar.syncEnabled,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const canManage = canManageExternalCalendar(permissions, profile, calendar);
  const hasChanges =
    draft.name.trim() !== calendar.name ||
    draft.icsUrl.trim() !== calendar.icsUrl ||
    draft.color !== (calendar.color ?? "indigo") ||
    draft.visibility !== calendar.visibility ||
    draft.syncEnabled !== calendar.syncEnabled;
  const canManualSync = calendar.providerType === "google" || calendar.providerType === "ics_read_only";

  useEffect(() => {
    setDraft({
      name: calendar.name,
      icsUrl: calendar.icsUrl,
      color: calendar.color ?? "indigo",
      visibility: calendar.visibility,
      syncEnabled: calendar.syncEnabled,
    });
  }, [calendar.color, calendar.icsUrl, calendar.name, calendar.syncEnabled, calendar.visibility]);

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
      setDeleteConfirmationOpen(false);
    } catch (deleteError) {
      setRowError(getUserFacingErrorMessage(deleteError, "Impossible de supprimer ce calendrier."));
      setDeleting(false);
    }
  }

  async function handleToggleSyncEnabled() {
    const nextSyncEnabled = !draft.syncEnabled;
    setRowError(null);
    setSyncSummary(null);
    setSaving(true);
    try {
      await onUpdate(calendar, { ...draft, syncEnabled: nextSyncEnabled });
      setDraft((current) => ({ ...current, syncEnabled: nextSyncEnabled }));
    } catch (updateError) {
      setRowError(getUserFacingErrorMessage(updateError, "Impossible de modifier ce calendrier."));
    } finally {
      setSaving(false);
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
      if (calendar.providerType === "google" && calendar.syncCapability === "bidirectional") {
        setSyncSummary(
          `Synchronisation Google terminée : ${result.created ?? 0} créé(s), ${result.updated ?? 0} mis à jour, ${result.conflicts ?? 0} conflit(s).`,
        );
      } else {
        setSyncSummary(`${result.synced.toLocaleString("fr-FR")} événement${result.synced > 1 ? "s" : ""} synchronisé${result.synced > 1 ? "s" : ""}.`);
      }
    } catch (syncError) {
      setRowError(getUserFacingErrorMessage(syncError, "Impossible de synchroniser ce calendrier."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white px-4 py-4">
        <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <input
            {...iosKeyboardGuardProps}
            value={draft.name}
            onFocus={(event) => onNativeFieldFocus(event.currentTarget)}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            readOnly={!canManage}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-neutral-950 outline-none"
            aria-label="Nom du calendrier"
          />
          <ExternalCalendarColorDot color={draft.color} />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-950">État</p>
            <p className="text-xs font-semibold text-neutral-400">{draft.syncEnabled ? "Calendrier affiché dans MSTV" : "Calendrier masqué dans MSTV"}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleSyncEnabled()}
            disabled={!canManage || saving}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-default disabled:opacity-50",
              draft.syncEnabled
                ? "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100"
                : "border-neutral-950 bg-neutral-950 text-white hover:bg-neutral-800",
            )}
          >
            {draft.syncEnabled ? "Désactiver" : "Activer"}
          </button>
        </div>

        {calendar.providerType === "ics_read_only" && (
          <input
            {...iosKeyboardGuardProps}
            value={draft.icsUrl}
            onFocus={(event) => onNativeFieldFocus(event.currentTarget)}
            onChange={(event) => setDraft((current) => ({ ...current, icsUrl: event.target.value }))}
            onBlur={() => setDraft((current) => ({ ...current, icsUrl: normalizeExternalCalendarIcsUrl(current.icsUrl) }))}
            placeholder="URL ICS"
            inputMode="url"
            readOnly={!canManage}
            className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-base font-medium text-neutral-950 outline-none transition placeholder:text-neutral-300 focus:border-[#bb2720]/40"
          />
        )}

        <div className="grid grid-cols-1 gap-2">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase text-neutral-400">Couleur</p>
          <ExternalCalendarColorPalette
            value={draft.color}
            onChange={(nextColor) => setDraft((current) => ({ ...current, color: nextColor }))}
            disabled={!canManage}
          />
          </div>
          <label>
            <span className="mb-1.5 block text-xs font-semibold uppercase text-neutral-400">Visible par</span>
          <select
            {...iosKeyboardGuardProps}
            value={draft.visibility}
            onFocus={(event) => onNativeFieldFocus(event.currentTarget)}
            onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as ExternalCalendarVisibility }))}
            disabled={!canManage || !permissions.canManageEvents}
            className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-base font-semibold text-neutral-700 outline-none"
          >
            {permissions.canManageEvents && <option value="admin_only">Admins uniquement</option>}
            {permissions.canManageEvents && <option value="team">Toute l’équipe</option>}
            <option value="private">Moi uniquement</option>
          </select>
          </label>
        </div>
        {rowError && <p className="text-sm font-semibold text-rose-600">{rowError}</p>}
        {syncProgress && (
          <p className="text-sm font-semibold text-indigo-600">
            Synchronisation... {syncProgress.synced.toLocaleString("fr-FR")} / {syncProgress.total.toLocaleString("fr-FR")}
          </p>
        )}
        {syncSummary && !syncing && <p className="text-sm font-semibold text-emerald-600">{syncSummary}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {canManage && hasChanges && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-xl bg-neutral-50 px-3 py-1.5 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:text-neutral-300"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          )}
          {canManualSync && (
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={!canManage || syncing || saving || (calendar.syncCapability === "read_only" && !draft.icsUrl.trim())}
              className="rounded-full bg-indigo-50 px-3 py-1.5 text-base font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:bg-white disabled:text-neutral-300"
            >
              {syncProgress
                ? `${syncProgress.synced.toLocaleString("fr-FR")} / ${syncProgress.total.toLocaleString("fr-FR")}`
                : syncing
                  ? "Synchronisation..."
                  : calendar.providerType === "google" && calendar.syncCapability === "bidirectional"
                    ? "Synchroniser depuis Google"
                    : "Synchroniser"}
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={() => setDeleteConfirmationOpen(true)}
              disabled={deleting || syncing || saving}
              className="rounded-full border border-[#bb2720]/20 bg-white px-3 py-1.5 text-base font-semibold text-[#bb2720] transition hover:bg-[#bb2720]/[0.05] disabled:text-neutral-300"
            >
              {deleting ? "Suppression..." : "Supprimer"}
            </button>
          )}
        </div>
        </div>
      </div>
      {deleteConfirmationOpen && (
        <SharedConfirmationDialog
          title="Supprimer ce calendrier ?"
          description="Les événements déjà importés dans MSTV ne seront pas supprimés."
          detailTitle={calendar.name}
          error={rowError}
          confirmLabel="Supprimer"
          busyLabel="Suppression..."
          busy={deleting}
          elevated
          onCancel={() => {
            if (!deleting) setDeleteConfirmationOpen(false);
          }}
          onConfirm={() => void handleDelete()}
        />
      )}
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
    /^([-_=]{5,}|Microsoft Teams$|Need help\?|Learn More|Meeting options|Legal|Privacy and security|For organizers:|Join with a video conferencing device|Video ID:|Rappel:?$|Reminder:?$|VALARM|Alarme:?$)/i;
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
  useEscapeToClose(onClose);

  return (
    <div
      className={cn(modalBackdropClassName, modalSheetPositionClassName)}
      onPointerDown={(pointerEvent) => handleModalBackdropPointerDown(pointerEvent, onClose)}
    >
      <div
        className={cn(modalPanelClassName, "flex max-h-[calc(var(--app-height)-1.5rem)] w-full flex-col overflow-hidden p-4 sm:max-h-[min(760px,calc(var(--app-height)-3rem))] sm:max-w-lg sm:p-5")}
        onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", tone.bg, tone.meta)}
                style={tone.bgStyle}
              >
                <ExternalCalendarColorDot color={event.calendarColor} className="h-2.5 w-2.5" />
                <span className="truncate">{event.calendarName}</span>
              </span>
            </div>
            <h2 className="text-base font-semibold text-neutral-950" style={{ overflowWrap: "anywhere" }}>
              {event.title}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-neutral-50 px-3 py-1.5 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100">
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
              <p className="text-base font-medium text-neutral-600" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                {event.location}
              </p>
            )}
            {descriptionView.usefulLines.length > 0 && (
              <div className="grid gap-2">
                {descriptionView.usefulLines.map((line, index) => (
                  <p key={`${line}-${index}`} className="whitespace-pre-wrap text-base font-medium leading-relaxed text-neutral-600" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
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
                <p className="mb-1 text-xs font-semibold uppercase tracking-normal text-neutral-400">Notes</p>
                <div
                  className="mobile-no-scrollbar max-h-56 overflow-y-auto overscroll-contain whitespace-pre-wrap text-sm font-medium leading-relaxed text-neutral-600"
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
  const display = getProductionEventDisplay(request.event);

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
  useEscapeToClose(onClose);

  return (
    <MstvModalSurface onClose={onClose} position="sheet">
      <MstvModalPanel className="w-full p-5 sm:max-w-md sm:p-6">
        <div className="mb-5">
          <p className="truncate text-base font-semibold text-neutral-950">{display.title}</p>
          {display.subtitle && <p className="mt-1 truncate text-base text-neutral-500">{display.subtitle}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-neutral-50 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-normal text-neutral-400">Date source</p>
              <p className="mt-1 text-base font-semibold text-neutral-800">{formatFullDate(request.event.date)}</p>
            </div>
            <div className="rounded-2xl bg-[#bb2720]/[0.06] px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-normal text-[#bb2720]/70">Nouvelle date</p>
              <p className="mt-1 text-base font-semibold text-[#bb2720]">{formatFullDate(request.date)}</p>
            </div>
          </div>
        </div>

        {error && <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={duplicating}
            className="rounded-xl bg-neutral-50 px-4 py-2 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:text-neutral-300"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={duplicating}
            className="rounded-xl bg-[#bb2720] px-4 py-2 text-base font-semibold text-white disabled:bg-neutral-300"
          >
            {duplicating ? "Duplication..." : "Dupliquer"}
          </button>
        </div>
      </MstvModalPanel>
    </MstvModalSurface>
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
  const display = getProductionEventDisplay(event);

  async function handleConfirm() {
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
    <SharedConfirmationDialog
      title="Placer cet événement dans la corbeille ?"
      description="Vous pourrez le restaurer depuis la Corbeille."
      detailTitle={display.title}
      detailSubtitle={display.subtitle}
      error={error}
      confirmLabel="Supprimer"
      busyLabel="Déplacement..."
      busy={deleting}
      onCancel={onClose}
      onConfirm={() => void handleConfirm()}
    />
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
  const display = getProductionEventDisplay(event);

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
    <SharedConfirmationDialog
      title="Supprimer définitivement cet événement ?"
      description="Cette action est irréversible."
      detailTitle={display.title}
      detailSubtitle={display.subtitle}
      error={error}
      confirmLabel="Supprimer"
      busyLabel="Suppression..."
      busy={deleting}
      elevated
      onCancel={onClose}
      onConfirm={() => void handleConfirm()}
    />
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
  useEscapeToClose(onClose);

  return (
    <div className={cn(modalBackdropClassName, "p-3 sm:p-6")} onPointerDown={(pointerEvent) => handleModalBackdropPointerDown(pointerEvent, onClose)}>
      <div className={cn(modalPanelClassName, "flex min-h-0 w-full flex-col overflow-hidden")} onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}>
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <FileIcon className="h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-neutral-950">{preview.file.fileName}</p>
              <p className="text-base font-medium text-neutral-500">{formatFileSize(preview.file.fileSize)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void downloadPreviewFile()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-800 transition hover:bg-amber-100"
              aria-label="Télécharger ce document"
              title="Télécharger"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-600 transition hover:bg-neutral-50"
              aria-label="Fermer l'aperçu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {downloadError && <div className="shrink-0 bg-rose-50 px-4 py-2 text-base font-medium text-rose-700">{downloadError}</div>}

        <div className="min-h-0 flex-1 bg-neutral-100">
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
  "h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-base font-medium text-neutral-950 outline-none transition focus:border-[#bb2720]/50";

function TimeTextInput({
  value,
  onChange,
  className,
  onFocusTarget,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  onFocusTarget?: (target: HTMLElement) => boolean;
}) {
  function commitValue() {
    onChange(normalizeCompactTimeInput(value));
  }

  return (
    <input
      {...iosKeyboardGuardProps}
      type="text"
      inputMode="numeric"
      placeholder="--:--"
      value={value}
      onChange={(event) => onChange(sanitizeTimeDraft(event.target.value))}
      onBlur={commitValue}
      onFocus={(event) => {
        const target = event.currentTarget;
        target.select();
        onFocusTarget?.(target);
      }}
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
    <label className="block text-base font-semibold text-neutral-500">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status, large = false }: { status: EventStatus; large?: boolean }) {
  return (
    <span className={cn("inline-flex items-center rounded-full text-base font-bold", large ? "px-3 py-1.5" : "px-2.5 py-1 leading-tight", statusStyles[status])}>
      {large && status === "Prêt" ? "PRÊT" : status}
    </span>
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
  hydrated,
  unreadCount,
  open,
  setOpen,
  onOpenNotification,
  onDismissNotification,
}: {
  notifications: AppNotification[];
  hydrated: boolean;
  unreadCount: number;
  open: boolean;
  setOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  onOpenNotification: (notification: AppNotification) => void;
  onDismissNotification: (notification: AppNotification) => void;
}) {
  const visibleNotifications = notifications.filter((notification) => !notification.readAt && importantNotificationTypes.has(notification.type));
  const showUnreadBadge = hydrated && unreadCount > 0;
  useEscapeToClose(() => setOpen(false), open);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full bg-white transition hover:bg-white active:bg-white focus:bg-white focus-visible:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bb2720]/35",
          open ? "text-[#bb2720]" : "text-neutral-600",
        )}
        title="Notifications"
        aria-label="Notifications"
        aria-pressed={open}
      >
        <Bell className="h-4 w-4" />
        {showUnreadBadge && (
          <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-white bg-[#bb2720]" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div
          className={cn(notificationLayerClassName, modalSheetPositionClassName)}
          onPointerDown={(pointerEvent) => {
            if (pointerEvent.target === pointerEvent.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div
            className={cn(modalPanelClassName, "flex max-h-[86vh] w-full flex-col overflow-hidden p-4 text-left sm:max-w-2xl sm:p-5")}
            onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-neutral-950">Notifications</p>
                <p className="mt-1 text-base font-medium text-neutral-500">
                  {unreadCount > 0 ? `${unreadCount} notification${unreadCount > 1 ? "s" : ""}` : "Tout est à jour"}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-neutral-50 px-3 py-1.5 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100">
                Fermer
              </button>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {visibleNotifications.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm font-medium text-neutral-400">Aucune notification</div>
              ) : (
                <div className="grid gap-1">
                  {visibleNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5 rounded-2xl px-2.5 py-2.5 transition hover:bg-neutral-50 sm:gap-3 sm:px-3"
                    >
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#bb2720]" aria-hidden="true" />
                      <button
                        type="button"
                        onClick={() => onOpenNotification(notification)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                          <span className="min-w-0 truncate text-sm font-semibold text-neutral-900">{notification.title}</span>
                          <span className="max-w-[4.75rem] text-right text-xs font-medium leading-tight text-neutral-400 sm:max-w-none">
                            {formatNotificationRelativeTime(notification.createdAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug text-neutral-500">{notification.body}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDismissNotification(notification);
                          if (visibleNotifications.length <= 1) {
                            setOpen(false);
                          }
                        }}
                        className="min-w-9 shrink-0 rounded-xl bg-neutral-50 px-2.5 py-1 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-100"
                      >
                        OK
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderIcon({ label, icon: Icon, active = false, onClick }: { label: string; icon: LucideIcon; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full bg-white transition hover:bg-white active:bg-white focus:bg-white focus-visible:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bb2720]/35",
        active ? "text-[#bb2720]" : "text-neutral-600",
      )}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function formatGoogleSyncElapsedLabel(lastSyncedAt: string) {
  const elapsedMs = Date.now() - new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 60_000) return "Synchronisé à l’instant";
  const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60_000));
  if (elapsedMinutes < 60) return `Synchronisé il y a ${elapsedMinutes} min`;
  const elapsedHours = Math.max(1, Math.round(elapsedMinutes / 60));
  return `Synchronisé il y a ${elapsedHours} h`;
}

function GoogleAutoSyncStatusIndicator({ status }: { status: GoogleAutoSyncStatus }) {
  const visible = status.state === "syncing" || status.state === "error" || Boolean(status.lastSyncedAt);
  if (!visible) return null;

  const label =
    status.state === "syncing"
      ? "Synchronisation..."
      : status.state === "error"
        ? "Erreur de synchronisation"
        : status.lastSyncedAt
          ? formatGoogleSyncElapsedLabel(status.lastSyncedAt)
          : "";

  return (
    <div
      className={cn(
        "flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-semibold sm:px-3",
        status.state === "error"
          ? "bg-rose-50 text-rose-700"
          : status.state === "syncing"
            ? "bg-blue-50 text-blue-700"
            : "bg-emerald-50 text-emerald-700",
      )}
      title={status.error ?? label}
      aria-live="polite"
    >
      <span className="sm:hidden">{status.state === "error" ? "G!" : status.state === "syncing" ? "G..." : "G"}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
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
  const visible = pendingCount > 0 || Boolean(error);
  if (!visible) return null;

  const label = error ? "Erreur synchro" : `${pendingCount} en attente`;

  return (
    <div
      className={cn(
        "flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-semibold sm:px-3",
        error
          ? "bg-rose-50 text-rose-700"
          : !online
            ? "bg-amber-50 text-amber-800"
            : "bg-sky-50 text-sky-700",
      )}
      title={error ?? label}
      aria-live="polite"
    >
      <span className="sm:hidden">{error ? "!" : pendingCount}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

function OfflineBanner({ online }: { online: boolean }) {
  if (online) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(0.85rem+env(safe-area-inset-bottom))] z-30 flex justify-center sm:bottom-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-md items-center justify-center gap-2 rounded-full bg-orange-50/95 px-4 py-3 text-sm font-semibold text-orange-900 shadow-sm shadow-orange-950/10 sm:w-auto sm:px-5">
        <WifiOff className="h-4 w-4 shrink-0 text-[#bb2720]" aria-hidden="true" />
        <span>Pas de connexion Internet</span>
      </div>
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
  const accountButtonRef = useRef<HTMLButtonElement | null>(null);
  const displayName = getProfileDisplayName(profile) ?? email ?? "Utilisateur";
  const initials = getProfileInitials(profile, email);

  return (
    <div className="relative">
      <button
        ref={accountButtonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-semibold transition hover:bg-white active:bg-white focus:bg-white focus-visible:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bb2720]/35",
          open ? "text-[#bb2720]" : "text-neutral-700",
        )}
        aria-label="Compte"
        aria-pressed={open}
        title={displayName}
      >
        {initials}
      </button>
      <MstvPopover
        open={open}
        anchorRef={accountButtonRef}
        onClose={() => setOpen(false)}
        placement="bottom-end"
        matchAnchorWidth={false}
        minWidth={208}
        maxWidth={208}
      >
        <div className="grid gap-0.5 text-right">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-neutral-950">{displayName}</p>
            <p className="mt-0.5 truncate text-xs font-medium text-neutral-500">{profile ? getRoleLabel(profile.role) : email}</p>
          </div>
          {canManageExternalCalendars && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenExternalCalendars();
              }}
              className="block w-full rounded-xl px-3 py-2 text-right text-sm font-medium text-neutral-700 transition hover:bg-[#bb2720]/[0.05] hover:text-neutral-950"
            >
              Calendriers
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void onLogout();
            }}
            className="block w-full rounded-xl px-3 py-2 text-right text-sm font-medium text-neutral-700 transition hover:bg-[#bb2720]/[0.05] hover:text-neutral-950"
          >
            Déconnexion
          </button>
        </div>
      </MstvPopover>
    </div>
  );
}

function SectionHeader({
  label,
  align = "left",
  tone,
  addLabel,
  onAdd,
  addDisabled = false,
}: {
  label: string;
  align?: "left" | "right";
  tone: ItemKind;
  addLabel: string;
  onAdd?: () => void;
  addDisabled?: boolean;
}) {
  const activeTone = tone === "option" ? getOptionTone("incomplete") : tone === "link" ? getLinkTone("missing") : getDocumentTone(false);
  const addTone = cn(activeTone.surface, activeTone.hover, activeTone.icon);

  return (
    <div className={cn("mb-2 flex min-w-0 items-center gap-1.5 sm:mb-3 sm:gap-2", align === "right" ? "justify-end" : "justify-start")}>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          disabled={addDisabled}
          className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-base font-semibold leading-none transition active:scale-95 disabled:cursor-wait disabled:opacity-60", addTone)}
          aria-label={addLabel}
          title={addLabel}
        >
          +
        </button>
      )}
      <h2
        className={cn(
          "min-w-0 flex-1 truncate text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-neutral-500 sm:text-base sm:tracking-[0.16em]",
          align === "right" && "text-right",
        )}
      >
        {label}
      </h2>
    </div>
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
      ? "bg-emerald-100/95"
      : tone === "link"
        ? "bg-[#E6EEF8]"
        : "bg-[#FEF4BD]";

  return (
    <div className={cn("flex h-[4.75rem] min-w-0 flex-1 items-center justify-center rounded-xl px-2 py-2.5 transition sm:h-20 sm:px-3", toneClassName)}>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onCancel();
          }}
          disabled={deleting}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-neutral-500 transition hover:bg-white hover:text-neutral-800 disabled:text-neutral-300"
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
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[#bb2720]/90 text-white transition hover:bg-[#a9231d] disabled:bg-neutral-300"
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
    <SharedConfirmationDialog
      title="Supprimer cet élément ?"
      confirmLabel="Supprimer"
      busyLabel="Suppression..."
      busy={deleting}
      elevated
      maxWidthClassName="max-w-xs"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 sm:p-6">
      <h2 className="mb-5 text-base font-semibold uppercase tracking-[0.16em] text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

function StatusMessage({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "error" }) {
  return (
    <div
      className={cn(
        "mb-4 rounded-2xl px-4 py-3 text-base font-medium",
        tone === "error" ? "bg-rose-50 text-rose-700" : "bg-white/55 text-neutral-500",
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
    <main className="flex h-[var(--app-height)] min-h-[var(--app-height)] items-center justify-center bg-[var(--app-background)] p-4 text-neutral-950">
      <div
        className={cn(
          "rounded-2xl px-5 py-4 text-base font-semibold",
          tone === "error" ? "bg-rose-50 text-rose-700" : "bg-white/55 text-neutral-600",
        )}
      >
        {children}
      </div>
    </main>
  );
}

function AuthRecoveryScreen({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <main className="flex h-[var(--app-height)] min-h-[var(--app-height)] items-center justify-center bg-[var(--app-background)] p-4 text-neutral-950">
      <div className="w-full max-w-sm rounded-2xl bg-white px-5 py-5 text-center shadow-sm shadow-black/5">
        <AlertCircle className="mx-auto h-5 w-5 text-rose-600" />
        <p className="mt-3 text-base font-semibold text-rose-700">{message}</p>
        <p className="mt-2 text-sm font-medium leading-snug text-neutral-500">Réinitialisez la session locale, puis reconnectez-vous.</p>
        <button
          type="button"
          onClick={onReset}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-[#bb2720] px-4 text-sm font-semibold text-white transition hover:bg-[#a8221c]"
        >
          Se reconnecter
        </button>
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
    <main className="flex h-[var(--app-height)] min-h-[var(--app-height)] items-center justify-center bg-[var(--app-background)] p-4 text-neutral-950">
      <form onSubmit={submitPassword} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-sm shadow-black/5 sm:p-6">
        <div className="mb-6 flex items-center gap-3">
          <img src="/brand/mon-studio-tv-icon.png" alt="Mon Studio TV" className="h-11 w-auto" />
          <div>
            <h1 className="text-base font-semibold text-neutral-950">Nouveau mot de passe</h1>
            <p className="mt-1 truncate text-base font-medium text-neutral-500">{email ?? "MSTV Production OS"}</p>
          </div>
        </div>

        {completed ? (
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-base font-semibold text-emerald-700">
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
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={completed ? onComplete : onCancel}
            disabled={submitting}
            className="h-11 flex-1 rounded-xl bg-neutral-50 text-base font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:text-neutral-300"
          >
            {completed ? "Continuer" : "Annuler"}
          </button>
          {!completed && (
            <button type="submit" disabled={submitting} className="h-11 flex-1 rounded-xl bg-[#bb2720] text-base font-semibold text-white transition hover:bg-[#a7211b] disabled:bg-neutral-300">
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
    <main className="flex h-[var(--app-height)] min-h-[var(--app-height)] items-center justify-center bg-[var(--app-background)] p-4 text-neutral-950">
      <form onSubmit={submitLogin} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-sm shadow-black/5 sm:p-6">
        <div className="mb-6 flex items-center gap-3">
          <img src="/brand/mon-studio-tv-icon.png" alt="Mon Studio TV" className="h-11 w-auto" />
          <div>
            <h1 className="text-base font-semibold text-neutral-950">MSTV Production OS</h1>
            <p className="mt-1 text-base font-medium text-neutral-500">Connexion</p>
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
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">
            {loginError ?? error}
          </div>
        )}
        {resetMessage && (
          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-700">
            {resetMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 h-11 w-full rounded-xl bg-[#bb2720] text-base font-semibold text-white transition hover:bg-[#a7211b] disabled:bg-neutral-300"
        >
          {submitting ? "Connexion..." : "Se connecter"}
        </button>
        <button
          type="button"
          onClick={() => void sendPasswordReset()}
          disabled={resetSending}
          className="mt-3 w-full text-center text-sm font-semibold text-neutral-500 transition hover:text-[#bb2720] disabled:text-neutral-300"
        >
          {resetSending ? "Envoi..." : "Mot de passe oublié ?"}
        </button>
      </form>
    </main>
  );
}
