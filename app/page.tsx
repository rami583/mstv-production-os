"use client";

import {
  AlertCircle,
  Brush,
  Camera,
  Captions,
  Check,
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
  Link,
  MonitorPlay,
  Palette,
  Presentation,
  Radio,
  Scissors,
  Search,
  ShieldCheck,
  Timer,
  Wifi,
  Webcam,
  X,
  type LucideIcon,
} from "lucide-react";
import { Keyboard } from "@capacitor/keyboard";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Card } from "@/components/ui/card";
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
type TeamMemberRow = Database["public"]["Tables"]["team_members"]["Row"];

type EventQueryRow = EventRow & {
  event_options: EventOptionRow[] | null;
  event_links: EventLinkRow[] | null;
  event_documents?: EventDocumentRow[] | null;
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
  assignedTeamMemberId: string | null;
  createdAt: string;
  items: EventOptionItem[];
  assignees: TeamMember[];
};

type EventOptionItem = {
  id: string;
  optionId: string;
  label: string;
  createdAt: string;
};

type EventLink = {
  id: string;
  eventId: string;
  label: string;
  url: string | null;
  streamKey: string | null;
  status: LinkStatus;
  createdAt: string;
  entries: EventLinkEntry[];
};

type EventLinkEntry = {
  id: string;
  linkId: string;
  url: string | null;
  streamKey: string | null;
  position: number;
  createdAt: string;
};

type LinkEntryDraft = {
  id: string | null;
  url: string;
  streamKey: string;
};

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
};

type EventDocumentGroup = {
  id: string;
  eventId: string;
  label: string;
  createdAt: string;
  files: EventDocument[];
};

type DocumentPreview = {
  file: EventDocument;
  url: string;
  kind: "pdf" | "image";
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

const defaultLinks = ["Drive client", "Habillage Guillaume", "Événement LiveMaker", "Conducteur", "Slides", "Replay"];

const platformLinkLabels = new Set(["plateforme", "plateforme de diffusion", "evenement plateforme", "event plateforme"]);
const eventDocumentsBucket = "event-documents";
const optionCollaboratorProfiles = [
  { firstName: "Antoine", displayName: "Antoine Santi", initials: "AS" },
  { firstName: "Rami", displayName: "Rami Mustakim", initials: "RM" },
  { firstName: "Arthur", displayName: "Arthur Legrand", initials: "AL" },
  { firstName: "Gauthier", displayName: "Gauthier Renard", initials: "GR" },
  { firstName: "Tony", displayName: "Tony Bouilly", initials: "TB" },
  { firstName: "Guillaume", displayName: "Guillaume Gallot", initials: "GG" },
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

function isDateKeyInMarker(dateKey: string, marker: CalendarMarker) {
  if (marker.date) return marker.date === dateKey;
  if (!marker.start || !marker.end) return false;
  return dateKey >= marker.start && dateKey <= marker.end;
}

function getCalendarMarkers(dateKey: string) {
  return [...publicHolidays, ...schoolHolidaysZoneC].filter((marker) => isDateKeyInMarker(dateKey, marker));
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
  const withDateAndRange = lines.find((line) => parseFrenchDateToKey(line) && parseFrenchTimeRange(line).startTime);
  if (withDateAndRange) return withDateAndRange;

  const compactText = lines.join(" ");
  const match = compactText.match(/([^.:\n]*(?:le\s+)?\d{1,2}\s+[A-Za-zéûîôàèùç]+\s+\d{4}\s+(?:de\s+)?\d{1,2}\s*(?:h|H|:)\s*\d{0,2}\s*(?:-|–|—|à|a)\s*\d{1,2}\s*(?:h|H|:)\s*\d{0,2}[^.:\n]*)/i);
  return match?.[1]?.trim() ?? "";
}

function extractMstvEventName(productionLine: string) {
  if (!productionLine) return "";
  const title = productionLine
    .replace(/\s+(?:le\s+)?\d{1,2}\s+[A-Za-zéûîôàèùç]+\s+\d{4}.*$/i, "")
    .replace(/\s+tout\s+[ée]quip[ée](?:\s|$).*$/i, "")
    .replace(/\s+de\s+\d{1,2}\s*(?:h|H|:).*$/i, "")
    .trim();
  if (!title) return "";

  const sentenceTitle = title.toLocaleLowerCase("fr-FR");
  return `${sentenceTitle.charAt(0).toLocaleUpperCase("fr-FR")}${sentenceTitle.slice(1)}`;
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
  return uniqueLabels(serviceRules.filter((rule) => rule.keywords.some((keyword) => normalizedText.includes(normalizeLabel(keyword)))).map((rule) => rule.label));
}

function extractQuoteFields(text: string, fallbackDate: string, fileName: string): QuoteExtractionResult {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const compactText = lines.join(" ");
  const productionLine = findMstvProductionLine(lines);
  const productionTimeRange = parseFrenchTimeRange(productionLine);
  const clientName =
    extractMstvClientName(lines) ||
    formatTitleCase(
      findLineValue(lines, [
        /\bclient\s*[:#-]\s*(.+)$/i,
        /\bsoci[eé]t[eé]\s*[:#-]\s*(.+)$/i,
        /\bentreprise\s*[:#-]\s*(.+)$/i,
      ]),
    );
  const eventName =
    extractMstvEventName(productionLine) ||
    formatTitleCase(
      findLineValue(lines, [
        /\b(?:événement|evenement|event|projet|prestation)\s*[:#-]\s*(.+)$/i,
        /\bobjet\s*[:#-]\s*(.+)$/i,
      ]),
    ) || formatTitleCase(fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  const date =
    parseFrenchDateToKey(productionLine) ||
    parseFrenchDateToKey(
      findLineValue(lines, [
        /\b(?:date\s+(?:de\s+)?(?:l['’])?(?:événement|evenement)|jour\s+(?:de\s+)?(?:l['’])?(?:événement|evenement))\s*[:#-]\s*(.+)$/i,
        /\b(?:le)\s+(\d{1,2}\s+[A-Za-zéûîôàèùç]+\s+\d{4})\b/i,
      ]) || "",
    ) ||
    fallbackDate;
  const arrivalMatch = compactText.match(/\barriv[eé]e(?:\s+client)?\D{0,24}(\d{1,2})(?:\s*[:hH]\s*(\d{2}))?\b/i);

  return {
    clientName,
    eventName,
    date,
    clientArrivalTime: arrivalMatch ? normalizeCompactTimeInput(`${arrivalMatch[1]}${arrivalMatch[2] ?? ""}`) : "",
    startTime: productionTimeRange.startTime,
    endTime: productionTimeRange.endTime,
    endOfDayTime: "",
    services: extractQuoteServices(text),
  };
}

async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => {
        if (!("str" in item)) return "";
        const text = item.str;
        return "hasEOL" in item && item.hasEOL ? `${text}\n` : `${text} `;
      })
      .join("");
    pages.push(pageText);
  }

  return pages.join("\n");
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
        }]
      : [];

  return normalizeLinkEntryDrafts(
    sourceEntries.map((entry) => ({
      id: entry.id,
      url: entry.url ?? "",
      streamKey: entry.streamKey ?? "",
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

function mapTeamMember(row: TeamMemberRow): TeamMember {
  return {
    id: row.id,
    firstName: row.first_name,
    role: row.role,
  };
}

function getOptionCollaboratorProfile(member: TeamMember) {
  return optionCollaboratorProfiles.find((profile) => profile.firstName === member.firstName) ?? null;
}

function getOptionAssignee(option: EventOption) {
  return option.assignees[0] ?? null;
}

function mapEventOptionItem(row: EventOptionItemRow): EventOptionItem {
  return {
    id: row.id,
    optionId: row.option_id,
    label: row.label,
    createdAt: row.created_at,
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
  };
}

function mapEventDocumentGroup(row: EventDocumentGroupRow): EventDocumentGroup {
  return {
    id: row.id,
    eventId: row.event_id,
    label: row.label,
    createdAt: row.created_at,
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
      assignedTeamMemberId: option.assigned_team_member_id ?? null,
      createdAt: option.created_at,
      items: [],
      assignees: [],
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

function withOptionAssignees(events: ProductionEvent[], teamMembers: TeamMember[]) {
  return events.map((event) => ({
    ...event,
    options: event.options.map((option) => ({
      ...option,
      assignees: option.assignedTeamMemberId
        ? teamMembers.filter((member) => member.id === option.assignedTeamMemberId && getOptionCollaboratorProfile(member)).slice(0, 1)
        : [],
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
        event_links (*)
      `,
    )
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

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
  const [quoteImportOpen, setQuoteImportOpen] = useState(false);
  const [quoteImportFile, setQuoteImportFile] = useState<File | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [yearOverviewOpen, setYearOverviewOpen] = useState(false);
  const [globalQuoteDragActive, setGlobalQuoteDragActive] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ProductionEvent | null>(null);
  const [editingReturnScreen, setEditingReturnScreen] = useState<Screen>("calendar");
  const [deleteDialogEvent, setDeleteDialogEvent] = useState<ProductionEvent | null>(null);
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTimelineTimeEditing, setIsTimelineTimeEditing] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const timelineTimeSaveRef = useRef<(() => Promise<void>) | null>(null);
  const todayKey = formatDateKey(today);

  const chronologicalEvents = useMemo(() => [...events].sort((a, b) => eventSortValue(a) - eventSortValue(b)), [events]);
  const selectedEvent = useMemo(() => chronologicalEvents.find((item) => item.id === selectedId) ?? chronologicalEvents[0] ?? null, [chronologicalEvents, selectedId]);
  const selectedEventIndex = selectedEvent ? chronologicalEvents.findIndex((item) => item.id === selectedEvent.id) : -1;
  const hasPreviousEvent = selectedEventIndex > 0;
  const hasNextEvent = selectedEventIndex >= 0 && selectedEventIndex < chronologicalEvents.length - 1;
  const isSelectedDateToday = selectedDateKey === todayKey;
  const yearLabel = String(visibleMonth.getFullYear());

  useEffect(() => {
    void reloadData();
  }, []);

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

  async function reloadData(nextSelectedId?: string | null) {
    setLoading(true);
    setError(null);

    try {
      const [nextEvents, nextTeamMembers] = await Promise.all([fetchEvents(), fetchTeamMembers()]);
      setEvents(withOptionAssignees(nextEvents, nextTeamMembers));
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
    const nextMonth = new Date(year, monthIndex, 1);
    setVisibleMonth(nextMonth);
    setSelectedDateKey(getPreferredDateKeyForMonth(nextMonth, events));
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

  function isPdfFile(file: File | null | undefined) {
    return Boolean(file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")));
  }

  function getPdfFileFromTransfer(dataTransfer: DataTransfer) {
    return Array.from(dataTransfer.files).find(isPdfFile) ?? null;
  }

  function hasPdfDragItem(dataTransfer: DataTransfer) {
    return Array.from(dataTransfer.items).some((item) => {
      if (item.kind !== "file") return false;
      return item.type === "application/pdf";
    });
  }

  function openQuoteImport(file: File | null = null) {
    setQuoteImportFile(file);
    setQuoteImportOpen(true);
    setCreateMenuOpen(false);
  }

  async function createEvent(input: CreateEventInput) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const normalizedInput = normalizeEventTimeInput(input);

    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        client_name: normalizedInput.clientName,
        event_name: normalizedInput.eventName,
        date: normalizedInput.date,
        client_arrival_time: normalizedInput.clientArrivalTime || null,
        start_time: normalizedInput.startTime || null,
        end_time: normalizedInput.endTime || null,
        end_of_day_time: normalizedInput.endOfDayTime || null,
      })
      .select()
      .single();

    if (eventError) throw eventError;

    const optionDefinitions = uniqueLabels([...defaultOptions.map((option) => option.label), ...(normalizedInput.optionLabels ?? [])]).map((label) => {
      const defaultOption = defaultOptions.find((option) => normalizeLabel(option.label) === normalizeLabel(label));
      return {
        label,
        details: defaultOption?.details ?? "",
      };
    });

    const [{ data: insertedOptions, error: optionError }, { error: linkError }] = await Promise.all([
      supabase
        .from("event_options")
        .insert(
          optionDefinitions.map((option) => ({
            event_id: event.id,
            label: option.label,
            status: "incomplete" as CompletionStatus,
            details: option.details,
          })),
        )
        .select(),
      supabase.from("event_links").insert(
        defaultLinks.map((label) => ({
          event_id: event.id,
          label,
          url: null,
          status: "missing" as LinkStatus,
        })),
      ),
    ]);

    if (optionError) throw optionError;
    if (linkError) throw linkError;

    const defaultOptionItems = (insertedOptions ?? []).flatMap((option) => {
      const defaultOption = optionDefinitions.find((item) => item.label === option.label);
      return splitStoredDetails(defaultOption?.details ?? "").map((label) => ({
        option_id: option.id,
        label,
      }));
    });

    if (defaultOptionItems.length > 0) {
      const { error: optionItemError } = await supabase.from("event_option_items").insert(defaultOptionItems);
      if (optionItemError) throw optionItemError;
    }

    await reloadData(event.id);
    setSelectedDateKey(event.date);
    setVisibleMonth(new Date(`${event.date}T12:00:00`));
    setScreen("detail");
  }

  async function updateEvent(event: ProductionEvent, input: CreateEventInput, nextScreen: Screen = "calendar") {
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
      updatedAt: data.updated_at,
    };

    setEvents((current) => current.map((item) => (item.id === event.id ? updatedEvent : item)));
    setSelectedId(updatedEvent.id);
    setSelectedDateKey(updatedEvent.date);
    setVisibleMonth(new Date(`${updatedEvent.date}T12:00:00`));
    setScreen(nextScreen);
  }

  async function updateEventTime(event: ProductionEvent, field: EventTimeField, value: string) {
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
    const column = columnByField[field];
    const updatePayload: Database["public"]["Tables"]["events"]["Update"] = {
      [column]: nextValue,
    };

    const { data, error: updateError } = await supabase
      .from("events")
      .update(updatePayload)
      .eq("id", event.id)
      .select()
      .single();

    if (updateError) throw updateError;

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
  }

  async function updateEventDate(event: ProductionEvent, nextDate: string) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const normalizedDate = nextDate.trim();
    if (!normalizedDate) {
      throw new Error("La date est obligatoire.");
    }

    const { data, error: updateError } = await supabase
      .from("events")
      .update({ date: normalizedDate })
      .eq("id", event.id)
      .select()
      .single();

    if (updateError) throw updateError;

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

  async function syncEventLinkEntries(link: EventLink, drafts: LinkEntryDraft[]) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const isPlatform = isPlatformLink(link);
    const nextDrafts = getPersistableLinkEntryDrafts(drafts, isPlatform);
    const existingEntryIds = new Set(link.entries.map((entry) => entry.id));
    const nextExistingEntryIds = new Set(nextDrafts.map((draft) => draft.id).filter((id): id is string => Boolean(id)));
    const deletedEntryIds = link.entries.map((entry) => entry.id).filter((entryId) => !nextExistingEntryIds.has(entryId));
    const nextEntries: EventLinkEntry[] = [];

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
        const { data, error: updateEntryError } = await supabase
          .from("event_link_entries")
          .update(entryPayload)
          .eq("id", draft.id)
          .select()
          .single();

        if (updateEntryError) throw updateEntryError;
        nextEntries.push(mapEventLinkEntry(data));
      } else {
        const { data, error: insertEntryError } = await supabase
          .from("event_link_entries")
          .insert({
            link_id: link.id,
            ...entryPayload,
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
      assignedTeamMemberId: data.assigned_team_member_id ?? null,
      createdAt: data.created_at,
      items: [],
      assignees: [],
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

  async function renameEventOption(option: EventOption, label: string) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextLabel = formatTitleCase(label);
    if (!nextLabel || nextLabel === option.label) return option;

    const { error: updateError } = await supabase
      .from("event_options")
      .update({ label: nextLabel })
      .eq("id", option.id);

    if (updateError) throw updateError;

    const updatedOption = { ...option, label: nextLabel };
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

    return updatedOption;
  }

  async function createEventOptionItem(option: EventOption, label: string) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextLabel = label.trim();
    if (!nextLabel) {
      throw new Error("La note est requise.");
    }

    const { data, error: insertError } = await supabase
      .from("event_option_items")
      .insert({
        option_id: option.id,
        label: nextLabel,
      })
      .select()
      .single();

    if (insertError) {
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

    return optionItem;
  }

  async function deleteEventOptionItem(option: EventOption, optionItem: EventOptionItem) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const { error: deleteError } = await supabase.from("event_option_items").delete().eq("id", optionItem.id);

    if (deleteError) {
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

  async function toggleOptionAssignee(option: EventOption, member: TeamMember) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const currentAssignee = getOptionAssignee(option);
    const isAssigned = currentAssignee?.id === member.id;
    const nextAssignedTeamMemberId = isAssigned ? null : member.id;
    const updatePayload = {
      assigned_team_member_id: nextAssignedTeamMemberId,
    };

    const { error: updateError } = await supabase
      .from("event_options")
      .update(updatePayload)
      .eq("id", option.id);

    if (updateError) {
      console.error("Failed to update option collaborator assignment", {
        table: "event_options",
        column: "assigned_team_member_id",
        optionId: option.id,
        teamMemberId: member.id,
        payload: updatePayload,
        errorMessage: updateError.message,
        errorCode: updateError.code,
        errorDetails: updateError.details,
        errorHint: updateError.hint,
      });
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
                      assignedTeamMemberId: nextAssignedTeamMemberId,
                      assignees: isAssigned ? [] : [member],
                    }
                  : item,
              ),
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
      streamKey: data.stream_key ?? null,
      status: data.status,
      createdAt: data.created_at,
      entries: [],
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

  async function renameEventLink(link: EventLink, label: string) {
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    const nextLabel = formatTitleCase(label);
    if (!nextLabel || nextLabel === link.label) return link;

    const { error: updateError } = await supabase
      .from("event_links")
      .update({ label: nextLabel })
      .eq("id", link.id);

    if (updateError) throw updateError;

    const updatedLink = { ...link, label: nextLabel };
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

  async function createEventDocumentGroup(eventId: string, label: string) {
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

    return group;
  }

  async function renameEventDocumentGroup(group: EventDocumentGroup, label: string) {
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

    return updatedGroup;
  }

  async function uploadEventDocument(group: EventDocumentGroup, file: globalThis.File) {
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

    return document;
  }

  async function deleteEventDocumentGroup(group: EventDocumentGroup) {
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
  }

  async function deleteEventDocument(document: EventDocument) {
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
    if (!supabase) {
      throw new Error("Configuration Supabase manquante.");
    }

    if (!eventToDelete) {
      throw new Error("Aucun événement sélectionné.");
    }

    const eventId = eventToDelete.id;
    console.log("Deleting current event", {
      eventId,
      selectedEventId: selectedEvent?.id ?? null,
      clientName: eventToDelete.clientName,
      eventName: eventToDelete.eventName,
    });

    const documentObjectPaths = eventToDelete.documentGroups
      .flatMap((group) => group.files)
      .map((file) => file.filePath.replace(`${eventDocumentsBucket}/`, ""));

    if (documentObjectPaths.length > 0) {
      const { data: storageData, error: storageError } = await supabase.storage.from(eventDocumentsBucket).remove(documentObjectPaths);
      console.log("Event document storage delete response", {
        eventId,
        objectPaths: documentObjectPaths,
        data: storageData,
        errorMessage: storageError?.message,
      });

      if (storageError) {
        console.warn("Event document storage cleanup failed; continuing event deletion", {
          eventId,
          errorMessage: storageError.message,
        });
      }
    }

    const { data: deleteData, error: deleteError, status, statusText } = await supabase.from("events").delete().eq("id", eventId).select("id");

    console.log("Supabase event delete response", {
      eventId,
      data: deleteData,
      status,
      statusText,
      errorMessage: deleteError?.message,
      errorCode: deleteError?.code,
      errorDetails: deleteError?.details,
      errorHint: deleteError?.hint,
    });

    if (deleteError) throw deleteError;
    if (!deleteData || deleteData.length === 0) {
      throw new Error(`Aucun événement supprimé pour l'id ${eventId}.`);
    }

    setEvents((current) => current.filter((event) => event.id !== eventId));
    setSelectedId(null);
    setScreen("calendar");
    setCreateMenuOpen(false);
    setDeleteDialogEvent(null);
    await reloadData(null);
  }

  return (
    <main className="relative h-screen h-[100svh] overflow-hidden bg-[#f7f9fb] text-stone-950">
      <div
        onDragEnter={(event) => {
          if (!hasPdfDragItem(event.dataTransfer)) return;
          event.preventDefault();
          setGlobalQuoteDragActive(true);
        }}
        onDragOver={(event) => {
          if (!hasPdfDragItem(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setGlobalQuoteDragActive(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setGlobalQuoteDragActive(false);
        }}
        onDrop={(event) => {
          const pdfFile = getPdfFileFromTransfer(event.dataTransfer);
          if (!pdfFile) {
            setGlobalQuoteDragActive(false);
            return;
          }
          event.preventDefault();
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
          onEditDetailDate={screen === "detail" && selectedEvent ? () => setDateEditorOpen(true) : undefined}
          goToday={goToday}
          isSelectedDateToday={isSelectedDateToday}
          createMenuOpen={createMenuOpen && !yearOverviewOpen}
          setCreateMenuOpen={setCreateMenuOpen}
          onImportQuote={() => {
            openQuoteImport();
          }}
          onSearch={() => setSearchOpen(true)}
          onOpenYearOverview={() => setYearOverviewOpen(true)}
          onCreateEvent={() => {
            setEditingEvent(null);
            setEditingReturnScreen("calendar");
            setCreateModalOpen(true);
            setCreateMenuOpen(false);
          }}
          canDeleteEvent={screen === "detail" && Boolean(selectedEvent)}
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
              onOpen={openEvent}
              visibleMonth={visibleMonth}
              selectedDateKey={selectedDateKey}
              onDeleteRequest={setDeleteDialogEvent}
              setSelectedDateKey={setSelectedDateKey}
              changeMonth={changeMonth}
            />
          )}

          {!loading && screen === "detail" && selectedEvent && (
            <ProductionDetail
              event={selectedEvent}
              teamMembers={teamMembers}
              previousEvent={chronologicalEvents[selectedEventIndex - 1] ?? null}
              nextEvent={chronologicalEvents[selectedEventIndex + 1] ?? null}
              hasPrevious={hasPreviousEvent}
              hasNext={hasNextEvent}
              goPrevious={() => navigateEvent(-1)}
              goNext={() => navigateEvent(1)}
              onUpdateEventTime={updateEventTime}
              onToggleOption={toggleOption}
              onCreateOption={createEventOption}
              onDeleteOption={deleteEventOption}
              onRenameOption={renameEventOption}
              onCreateOptionItem={createEventOptionItem}
              onDeleteOptionItem={deleteEventOptionItem}
              onToggleOptionAssignee={toggleOptionAssignee}
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
          onGoToday={() => {
            goToday();
            setYearOverviewOpen(false);
          }}
          onImportQuote={() => {
            openQuoteImport();
          }}
          onSearch={() => setSearchOpen(true)}
          onCreateEvent={() => {
            setEditingEvent(null);
            setEditingReturnScreen("calendar");
            setCreateModalOpen(true);
            setCreateMenuOpen(false);
          }}
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
          initialFile={quoteImportFile}
          selectedDateKey={selectedDateKey}
          onClose={() => {
            setQuoteImportOpen(false);
            setQuoteImportFile(null);
          }}
          onConfirm={async (input) => {
            await createEvent(input);
            setQuoteImportOpen(false);
            setQuoteImportFile(null);
          }}
        />
      )}

      {dateEditorOpen && selectedEvent && (
        <EventDatePicker
          event={selectedEvent}
          onClose={() => setDateEditorOpen(false)}
          onSubmit={async (nextDate) => {
            await updateEventDate(selectedEvent, nextDate);
            setDateEditorOpen(false);
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

      {documentPreview && (
        <DocumentPreviewModal
          preview={documentPreview}
          onClose={() => setDocumentPreview(null)}
          onDownload={downloadEventDocument}
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
  onImportQuote,
  onSearch,
  onLogoClick,
  onOpenYearOverview,
  onCreateEvent,
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
  onImportQuote: () => void;
  onSearch: () => void;
  onLogoClick?: () => void;
  onOpenYearOverview: () => void;
  onCreateEvent: () => void;
  canDeleteEvent: boolean;
  onDeleteEvent: () => void;
}) {
  const menuWrapperRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <header className="relative mb-5 flex items-center justify-between gap-2 px-1 py-1">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button className="flex items-center gap-3 text-left" onClick={onLogoClick ?? (() => setScreen("calendar"))} aria-label="Accueil calendrier">
          <img src="/brand/mon-studio-tv-icon.png" alt="Mon Studio TV" className="h-11 w-auto sm:hidden" />
          <img src="/brand/mon-studio-tv-horizontal.png" alt="Mon Studio TV" className="hidden h-10 w-auto sm:block lg:h-11" />
        </button>
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
            className="rounded-full border border-stone-200 bg-white px-2.5 py-1.5 text-base font-semibold text-stone-700 transition hover:bg-stone-50 sm:px-3"
          >
            {detailDateLabel}
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
        <HeaderIcon label="Rechercher" icon={Search} onClick={onSearch} />
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
              onCreateEvent={onCreateEvent}
              canDeleteEvent={canDeleteEvent}
              onDeleteEvent={onDeleteEvent}
            />
          )}
        </div>
      </div>
    </header>
  );
}

function CreateMenu({
  onImportQuote,
  onCreateEvent,
  canDeleteEvent,
  onDeleteEvent,
}: {
  onImportQuote: () => void;
  onCreateEvent: () => void;
  canDeleteEvent: boolean;
  onDeleteEvent: () => void;
}) {
  return (
    <div className="absolute right-1 top-14 z-40 w-56 rounded-2xl border border-stone-200 bg-white/95 p-1.5 backdrop-blur-xl">
      <button
        onClick={onImportQuote}
        className="block w-full rounded-xl px-4 py-3 text-left text-base font-medium text-stone-700 transition hover:bg-[#bb2720]/[0.05] hover:text-stone-950"
      >
        Importer un devis
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
  onGoToday,
  onImportQuote,
  onSearch,
  onCreateEvent,
  onSelectMonth,
}: {
  initialYear: number;
  events: ProductionEvent[];
  visibleMonth: Date;
  todayKey: string;
  isSelectedDateToday: boolean;
  createMenuOpen: boolean;
  setCreateMenuOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  onGoToday: () => void;
  onImportQuote: () => void;
  onSearch: () => void;
  onCreateEvent: () => void;
  onSelectMonth: (year: number, monthIndex: number) => void;
}) {
  const [displayYear, setDisplayYear] = useState(initialYear);
  const swipeStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const touchSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const yearPagerRef = useRef<HTMLDivElement | null>(null);
  const wheelLockRef = useRef<number | null>(null);
  const yearTransitionTimeoutRef = useRef<number | null>(null);
  const yearTransitioningRef = useRef(false);
  const suppressYearClickRef = useRef(false);
  const [yearPagerOffset, setYearPagerOffset] = useState(0);
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

  function getYearPageStep() {
    return (yearPagerRef.current?.clientHeight ?? window.innerHeight) + PAGE_GAP;
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

    swipeStartRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
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

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#f7f9fb]/95 px-4 pb-[calc(1.15rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] backdrop-blur-xl sm:px-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pt-[calc(1.5rem+env(safe-area-inset-top))] lg:px-8">
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
          onImportQuote={onImportQuote}
          onSearch={onSearch}
          onLogoClick={onGoToday}
          onOpenYearOverview={() => undefined}
          onCreateEvent={onCreateEvent}
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
          className="flex h-full flex-col"
          style={{
            gap: PAGE_GAP,
            transform: `translate3d(0, calc(-100% - ${PAGE_GAP}px + ${yearPagerOffset}px), 0)`,
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
  onSelectMonth,
}: {
  year: number;
  events: ProductionEvent[];
  todayKey: string;
  visibleMonth: Date;
  weekdays: string[];
  onSelectMonth: (year: number, monthIndex: number) => void;
}) {
  return (
    <section className="flex h-full w-full shrink-0 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-x-2 gap-y-2 pt-2 sm:gap-x-8 sm:gap-y-8 sm:pt-4">
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
      onClick={onSelect}
      className={cn(
        "min-w-0 rounded-[1.1rem] p-1.5 text-left transition hover:bg-white/70 sm:rounded-[1.25rem] sm:p-3",
        isVisibleMonth && "bg-white/90 ring-1 ring-[#bb2720]/20",
      )}
    >
      <span className={cn("mb-1 block truncate text-xs font-semibold leading-none sm:mb-2 sm:text-base", isVisibleMonth ? "text-[#bb2720]" : "text-stone-950")}>
        {monthName}
      </span>
      <span className="grid grid-cols-7 gap-y-0.5 sm:gap-y-1">
        {weekdays.map((weekday, index) => (
          <span key={`${weekday}-${index}`} className="text-center text-[0.48rem] font-semibold leading-none text-stone-300 sm:text-[0.625rem]">
            {weekday}
          </span>
        ))}
        {Array.from({ length: monthData.leadingEmptyDays }).map((_, index) => (
          <span key={`empty-start-${index}`} className="aspect-square" />
        ))}
        {monthData.calendarDays.map((day) => {
          const isToday = day.dateKey === todayKey;
          const hasEvents = day.events.length > 0;
          return (
            <span key={day.dateKey} className="relative flex aspect-square min-w-0 items-center justify-center">
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[0.56rem] font-semibold leading-none sm:h-6 sm:w-6 sm:text-xs",
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
          <span key={`empty-end-${index}`} className="aspect-square" />
        ))}
      </span>
    </button>
  );
}

function CalendarDashboard({
  events,
  onOpen,
  onDeleteRequest,
  visibleMonth,
  selectedDateKey,
  setSelectedDateKey,
  changeMonth,
}: {
  events: ProductionEvent[];
  onOpen: (id: string) => void;
  onDeleteRequest: (event: ProductionEvent) => void;
  visibleMonth: Date;
  selectedDateKey: string;
  setSelectedDateKey: (dateKey: string) => void;
  changeMonth: (delta: number) => void;
}) {
  const weekdays = ["L", "M", "M", "J", "V", "S", "D"];
  const todayKey = formatDateKey(new Date());
  const currentMonthData = useMemo(() => getCalendarMonthData(visibleMonth, events), [events, visibleMonth]);
  const previousMonthData = useMemo(() => getCalendarMonthData(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1), events), [events, visibleMonth]);
  const nextMonthData = useMemo(() => getCalendarMonthData(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1), events), [events, visibleMonth]);
  const currentSelectedDateKey = isDateKeyInMonth(selectedDateKey, currentMonthData)
    ? selectedDateKey
    : getPreferredDateKeyForMonth(visibleMonth, events);
  const previousSelectedDateKey = getPreferredDateKeyForMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1), events);
  const nextSelectedDateKey = getPreferredDateKeyForMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1), events);
  const [pagerOffset, setPagerOffset] = useState(0);
  const [pagerTransitionEnabled, setPagerTransitionEnabled] = useState(false);
  const [pagerAnimatingDirection, setPagerAnimatingDirection] = useState<-1 | 1 | null>(null);
  const pagerViewportRef = useRef<HTMLDivElement | null>(null);
  const monthSwipeStartRef = useRef<{ pointerId: number; x: number; y: number; axis: "horizontal" | "vertical" | null } | null>(null);
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

    monthSwipeStartRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      axis: null,
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

    monthSwipeStartRef.current = null;
    window.setTimeout(() => {
      suppressMonthClickRef.current = false;
    }, 0);

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
          onDeleteRequest={onDeleteRequest}
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
          onDeleteRequest={onDeleteRequest}
          onPreviousMonth={() => animateMonthChange(-1)}
          onNextMonth={() => animateMonthChange(1)}
          onCalendarPointerDown={handleMonthSwipePointerDown}
          onCalendarPointerMove={handleMonthSwipePointerMove}
          onCalendarPointerUp={handleMonthSwipePointerUp}
          onCalendarPointerCancel={resetMonthSwipe}
          onCalendarClickCapture={(clickEvent) => {
            if (!suppressMonthClickRef.current) return;
            suppressMonthClickRef.current = false;
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
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
          onDeleteRequest={onDeleteRequest}
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
  onDeleteRequest,
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
  onDeleteRequest: (event: ProductionEvent) => void;
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
        <SelectedDayEvents markers={selectedMarkers} events={selectedEvents} onOpen={onOpen} onDeleteRequest={onDeleteRequest} />
      </div>
    </div>
  );
}

function getCalendarMonthData(monthDate: Date, events: ProductionEvent[]) {
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
      {monthData.calendarDays.map(({ day, events: dayEvents, markers, dateKey }, index) => {
        const position = monthData.leadingEmptyDays + index;
        const isLastRow = position >= monthData.totalCells - 7;
        const isWeekend = position % 7 >= 5;
        const isCurrentDay = dateKey === todayKey;
        const isSelected = dateKey === selectedDateKey;
        const publicHolidayMarker = markers.find((marker) => marker.type === "publicHoliday");
        const schoolHolidayMarker = markers.find((marker) => marker.type === "schoolHoliday");
        const markerLabel = markers.map((marker) => marker.label).join(" • ");
        const dayDots = [
          publicHolidayMarker ? { key: "public-holiday", className: "bg-sky-400/80" } : null,
          schoolHolidayMarker ? { key: "school-holiday", className: "bg-amber-400/80" } : null,
          ...dayEvents.slice(0, 4).map((event) => ({ key: event.id, className: "bg-[#bb2720]" })),
        ].filter(Boolean).slice(0, 4) as { key: string; className: string }[];

        return (
          <button
            key={dateKey}
            onClick={() => {
              if (interactive) onSelectDate(dateKey);
            }}
            title={markerLabel || undefined}
            tabIndex={interactive ? 0 : -1}
            className={cn(
              "group flex h-[70px] flex-col items-center justify-start gap-1 bg-white/35 px-1 py-2.5 transition hover:bg-white/80 sm:h-[88px] sm:py-3 lg:h-[clamp(72px,9svh,112px)] lg:px-2 lg:py-4",
              schoolHolidayMarker && "bg-amber-50/60 hover:bg-amber-50/85",
              publicHolidayMarker && "bg-sky-50/70 hover:bg-sky-50/90",
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
              {markers.length > 0 && (
                <span className="mt-1 hidden min-w-0 flex-wrap justify-end gap-1 lg:flex">
                  {publicHolidayMarker && <span className="h-1.5 w-1.5 rounded-full bg-sky-400/80" />}
                  {schoolHolidayMarker && <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80" />}
                </span>
              )}
            </span>
            {dayDots.length > 0 && (
              <span className="flex min-h-3 w-full items-center justify-center gap-0.5 px-0.5 lg:hidden">
                {dayDots.map((dot) => (
                  <span key={dot.key} className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot.className)} />
                ))}
              </span>
            )}
            {markers.length > 0 && (
              <span className="hidden max-w-full truncate text-base font-semibold leading-tight text-stone-500 opacity-0 transition group-hover:opacity-100 lg:block">
                {markers[0].label}
              </span>
            )}
            {dayEvents.length > 0 && (
              <span className="hidden max-w-full gap-0.5 lg:mt-2 lg:flex lg:gap-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <span key={event.id} className="h-2 w-2 shrink-0 rounded-full bg-[#bb2720] lg:h-2.5 lg:w-2.5" />
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
  onOpen,
  onDeleteRequest,
}: {
  markers: CalendarMarker[];
  events: ProductionEvent[];
  onOpen: (id: string) => void;
  onDeleteRequest: (event: ProductionEvent) => void;
}) {
  const [openDeleteEventId, setOpenDeleteEventId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!openDeleteEventId) return;

    function handlePointerDown(event: PointerEvent) {
      if (!sectionRef.current?.contains(event.target as Node)) {
        setOpenDeleteEventId(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openDeleteEventId]);

  if (markers.length === 0 && events.length === 0) return null;
  const orderedMarkers = [...markers].sort((a, b) => {
    if (a.type === b.type) return 0;
    return a.type === "publicHoliday" ? -1 : 1;
  });

  return (
    <section
      ref={sectionRef}
      onPointerDown={(pointerEvent) => {
        if (openDeleteEventId && !(pointerEvent.target as HTMLElement).closest("[data-calendar-swipe-row]")) {
          setOpenDeleteEventId(null);
        }
      }}
      className="space-y-1.5 lg:space-y-2"
    >
      {events.map((event) => (
        <SwipeableCalendarEventRow
          key={event.id}
          event={event}
          isDeleteOpen={openDeleteEventId === event.id}
          hasOpenDelete={Boolean(openDeleteEventId)}
          onOpenDelete={() => setOpenDeleteEventId(event.id)}
          onCloseDelete={() => setOpenDeleteEventId(null)}
          onOpenEvent={onOpen}
          onDeleteRequest={(eventToDelete) => {
            setOpenDeleteEventId(null);
            onDeleteRequest(eventToDelete);
          }}
        />
      ))}
      {orderedMarkers.map((marker) => {
        const isPublicHoliday = marker.type === "publicHoliday";
        return (
          <div
            key={`${marker.type}-${marker.label}-${marker.date ?? marker.start}`}
            className={cn(
              "relative grid min-h-20 w-full grid-cols-[3px_1fr] items-center gap-4 rounded-xl bg-white/70 px-4 py-4 text-left lg:gap-5 lg:px-5",
              isPublicHoliday ? "bg-sky-50/80" : "bg-amber-50/80",
            )}
          >
            <span className={cn("h-full min-h-14 rounded-full", isPublicHoliday ? "bg-sky-400" : "bg-amber-400")} />
            <span className="min-w-0">
              <span className={cn("block text-base font-semibold leading-snug", isPublicHoliday ? "text-sky-950" : "text-amber-950")}>{marker.label}</span>
              <span className={cn("block truncate text-base font-medium", isPublicHoliday ? "text-sky-600" : "text-amber-700")}>
                {isPublicHoliday ? "Jour férié" : "Vacances scolaires Zone C"}
              </span>
            </span>
          </div>
        );
      })}
    </section>
  );
}

const calendarEventDeleteActionWidth = 104;
const calendarEventFullSwipeRatio = 0.65;

function SwipeableCalendarEventRow({
  event,
  isDeleteOpen,
  hasOpenDelete,
  onOpenDelete,
  onCloseDelete,
  onOpenEvent,
  onDeleteRequest,
}: {
  event: ProductionEvent;
  isDeleteOpen: boolean;
  hasOpenDelete: boolean;
  onOpenDelete: () => void;
  onCloseDelete: () => void;
  onOpenEvent: (id: string) => void;
  onDeleteRequest: (event: ProductionEvent) => void;
}) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const pointerStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const baseOffset = isDeleteOpen ? -calendarEventDeleteActionWidth : 0;
  const visibleOffset = isDragging ? dragOffset : baseOffset;
  const deleteActionVisible = visibleOffset < -1;
  const timeRange = formatTimeRange(event.startTime, event.endTime);

  function handlePointerDown(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    if ((pointerEvent.target as HTMLElement).closest("[data-swipe-action]")) return;

    pointerStartRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
    };
    setIsDragging(true);
    setDragOffset(baseOffset);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  function handlePointerMove(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    const pointerStart = pointerStartRef.current;
    if (!pointerStart) return;

    const deltaX = pointerEvent.clientX - pointerStart.x;
    const deltaY = pointerEvent.clientY - pointerStart.y;

    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
      suppressClickRef.current = true;
      return;
    }

    const rowWidth = rowRef.current?.offsetWidth ?? calendarEventDeleteActionWidth;
    const nextOffset = Math.max(-rowWidth, Math.min(0, baseOffset + deltaX));
    if (Math.abs(deltaX) > 6) {
      suppressClickRef.current = true;
      pointerEvent.preventDefault();
    }
    setDragOffset(nextOffset);
  }

  function handlePointerUp(pointerEvent: ReactPointerEvent<HTMLDivElement>) {
    const pointerStart = pointerStartRef.current;
    if (!pointerStart) return;

    const deltaX = pointerEvent.clientX - pointerStart.x;
    const rowWidth = rowRef.current?.offsetWidth ?? calendarEventDeleteActionWidth;
    const finalOffset = Math.max(-rowWidth, Math.min(0, baseOffset + deltaX));
    const fullSwipeThreshold = rowWidth * calendarEventFullSwipeRatio;
    const shouldRequestDelete = Math.abs(finalOffset) >= fullSwipeThreshold;
    const shouldOpen = finalOffset < -calendarEventDeleteActionWidth / 2;
    const shouldClose = isDeleteOpen && deltaX > calendarEventDeleteActionWidth / 3;

    pointerStartRef.current = null;
    setIsDragging(false);
    setDragOffset(0);

    if (shouldRequestDelete) {
      onCloseDelete();
      onDeleteRequest(event);
    } else if (shouldClose || !shouldOpen) {
      onCloseDelete();
    } else {
      onOpenDelete();
    }
  }

  function handleRowClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (hasOpenDelete) {
      onCloseDelete();
      return;
    }

    onOpenEvent(event.id);
  }

  return (
    <div data-calendar-swipe-row className="relative overflow-hidden rounded-xl">
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
      <div
        ref={rowRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerStartRef.current = null;
          setIsDragging(false);
          setDragOffset(0);
        }}
        onClick={handleRowClick}
        onKeyDown={(keyEvent) => {
          if (keyEvent.key === "Enter" || keyEvent.key === " ") {
            keyEvent.preventDefault();
            if (hasOpenDelete) {
              onCloseDelete();
            } else {
              onOpenEvent(event.id);
            }
          }
        }}
        role="button"
        tabIndex={0}
        style={{ transform: `translateX(${visibleOffset}px)`, touchAction: "pan-y" }}
        className={cn(
          "relative z-10 grid min-h-20 w-full cursor-pointer grid-cols-[3px_1fr_auto] items-center gap-4 rounded-xl bg-white/70 px-4 py-4 text-left hover:bg-white lg:gap-5 lg:px-5",
          deleteActionVisible && "bg-white",
          !isDragging && "transition-transform duration-200 ease-out",
        )}
      >
        <span className="h-full min-h-14 rounded-full bg-[#bb2720]" />
        <span className="min-w-0">
          <span className="block text-base font-semibold leading-snug text-stone-950">{event.clientName}</span>
          <span className="block truncate text-base text-stone-500">{event.eventName}</span>
        </span>
        {timeRange && <span className="pl-2 text-right text-base font-medium text-stone-500">{timeRange}</span>}
      </div>
    </div>
  );
}

function ProductionDetail({
  event,
  teamMembers,
  previousEvent,
  nextEvent,
  hasPrevious,
  hasNext,
  goPrevious,
  goNext,
  onUpdateEventTime,
  onToggleOption,
  onCreateOption,
  onDeleteOption,
  onRenameOption,
  onCreateOptionItem,
  onDeleteOptionItem,
  onToggleOptionAssignee,
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
}: {
  event: ProductionEvent;
  teamMembers: TeamMember[];
  previousEvent: ProductionEvent | null;
  nextEvent: ProductionEvent | null;
  hasPrevious: boolean;
  hasNext: boolean;
  goPrevious: () => void;
  goNext: () => void;
  onUpdateEventTime: (event: ProductionEvent, field: EventTimeField, value: string) => Promise<void>;
  onToggleOption: (option: EventOption) => Promise<void>;
  onCreateOption: (eventId: string, label: string) => Promise<EventOption>;
  onDeleteOption: (option: EventOption) => Promise<void>;
  onRenameOption: (option: EventOption, label: string) => Promise<EventOption>;
  onCreateOptionItem: (option: EventOption, label: string) => Promise<EventOptionItem>;
  onDeleteOptionItem: (option: EventOption, item: EventOptionItem) => Promise<void>;
  onToggleOptionAssignee: (option: EventOption, member: TeamMember) => Promise<void>;
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
}) {
  const [contextSelection, setContextSelection] = useState<ContextSelection>(null);
  const [addForm, setAddForm] = useState<ItemKind | null>(null);
  const [optionName, setOptionName] = useState("");
  const [linkName, setLinkName] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [manageError, setManageError] = useState<string | null>(null);
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DeleteSelection | null>(null);
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
    const previousSelectionKey = previousContextSelectionKeyRef.current;
    previousContextSelectionKeyRef.current = contextSelectionKey;

    if (!contextSelectionKey || contextSelectionKey === previousSelectionKey) return;

    window.requestAnimationFrame(() => {
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

      scrollContainer.scrollTo({
        top: Math.max(0, detailTop - scrollMargin),
        behavior: "smooth",
      });
    });
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
      setContextSelection({ type: "link", linkId: link.id });
    } catch (createError) {
      setManageError(createError instanceof Error ? createError.message : "Impossible d'ajouter le lien.");
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
      setManageError(createError instanceof Error ? createError.message : "Impossible d'ajouter le document.");
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
    } catch (deleteError) {
      setManageError(deleteError instanceof Error ? deleteError.message : "Impossible de supprimer cet élément.");
    } finally {
      setDeletingItem(false);
    }
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
        />
      </Card>

      <div ref={detailScrollContainerRef} className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pb-6">
        <Card className="premium-surface overflow-hidden p-3 sm:p-5">
        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-1.5 sm:gap-4 lg:items-start">
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
            <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
              {event.options.map((option) => {
                const Icon = getOptionIcon(option.label);
                const optionTone = getOptionTone(option.status);
                const optionAssignee = getOptionAssignee(option);
                const optionAssigneeInitials = optionAssignee ? getOptionCollaboratorProfile(optionAssignee)?.initials : null;
                const showOptionAssigneeInitials = option.status === "incomplete" && Boolean(optionAssigneeInitials);
                const isSelectedOption = contextSelection?.type === "option" && contextSelection.optionId === option.id;
                const isConfirmingDelete = confirmDelete?.type === "option" && confirmDelete.optionId === option.id;
                return (
                  <div
                    key={option.id}
                    className={cn(
                      "group relative flex min-h-[4.75rem] items-center gap-1.5 rounded-xl border-2 transition sm:min-h-20 sm:gap-2",
                      optionTone.surface,
                      optionTone.border,
                      optionTone.hover,
                      isSelectedOption && "border-emerald-700 ring-2 ring-emerald-700/20",
                    )}
                  >
                    <button
                      onClick={() => selectOption(option)}
                      className={cn(
                        "flex min-h-[4.75rem] min-w-0 flex-1 px-2 py-3 text-left sm:min-h-20 sm:px-3",
                        showOptionAssigneeInitials ? "flex-col items-start justify-between gap-2" : "items-center gap-1.5 sm:gap-2",
                      )}
                    >
                      {showOptionAssigneeInitials ? (
                        <>
                          <span className="inline-flex shrink-0 rounded-full border border-emerald-300 bg-white/75 px-2 py-0.5 text-base font-bold leading-tight text-emerald-800">
                            {optionAssigneeInitials}
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
                    {isConfirmingDelete && (
                      <div className="absolute right-1 top-9 z-30">
                        <DeleteConfirmBubble
                          label="Supprimer cette option ?"
                          deleting={deletingItem}
                          onCancel={() => setConfirmDelete(null)}
                          onConfirm={() => void deleteSelectedGridItem()}
                        />
                      </div>
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
              onAdd={() => setAddForm((current) => (current === "link" ? null : "link"))}
            />
            {addForm === "link" && (
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
                return (
                  <div
                    key={link.id}
                    className={cn(
                      "group relative flex min-h-[4.75rem] items-center gap-1.5 rounded-xl border-2 transition sm:min-h-20 sm:gap-2",
                      linkTone.surface,
                      linkTone.border,
                      linkTone.hover,
                      isSelectedLink && "border-sky-700 ring-2 ring-sky-700/20",
                    )}
                  >
                    <button onClick={() => selectLink(link)} className="flex min-h-[4.75rem] min-w-0 flex-1 items-center gap-1.5 px-2 py-3 text-left sm:min-h-20 sm:gap-2 sm:px-3">
                      <Icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", linkTone.icon)} />
                      <span className={cn("min-w-0 flex-1 truncate pr-5 text-base font-semibold", linkTone.text)}>{link.label}</span>
                    </button>
                    <ExternalLink className="mr-8 hidden h-4 w-4 shrink-0 text-sky-400 sm:block" />
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
                    {isConfirmingDelete && (
                      <div className="absolute right-1 top-9 z-30">
                        <DeleteConfirmBubble
                          label="Supprimer ce lien ?"
                          deleting={deletingItem}
                          onCancel={() => setConfirmDelete(null)}
                          onConfirm={() => void deleteSelectedGridItem()}
                        />
                      </div>
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
              onAdd={() => setAddForm((current) => (current === "document" ? null : "document"))}
            />
            {addForm === "document" && (
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
                return (
                  <div
                    key={group.id}
                    className={cn(
                      "group relative flex min-h-[4.75rem] items-center gap-1.5 rounded-xl border-2 transition sm:min-h-20 sm:gap-2",
                      documentTone.surface,
                      documentTone.border,
                      documentTone.hover,
                      isSelectedDocument && documentTone.selected,
                    )}
                  >
                    <button
                      onClick={() => selectDocumentGroup(group)}
                      className="flex min-h-[4.75rem] min-w-0 flex-1 items-center gap-1.5 px-2 py-3 text-left sm:min-h-20 sm:gap-2 sm:px-3"
                    >
                      <Icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", documentTone.icon)} />
                      <span className={cn("min-w-0 flex-1 truncate pr-5 text-base font-semibold", documentTone.text)}>{group.label}</span>
                    </button>
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
                    {isConfirmingDelete && (
                      <div className="absolute right-1 top-9 z-30">
                        <DeleteConfirmBubble
                          label="Supprimer ce document ?"
                          deleting={deletingItem}
                          onCancel={() => setConfirmDelete(null)}
                          onConfirm={() => void deleteSelectedGridItem()}
                        />
                      </div>
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
            onRenameOption={onRenameOption}
            onCreateOptionItem={onCreateOptionItem}
            onDeleteOptionItem={onDeleteOptionItem}
            onToggleOptionAssignee={onToggleOptionAssignee}
            teamMembers={teamMembers}
            onRenameLink={onRenameLink}
            onSaveLinkEntries={onSaveLinkEntries}
            onRenameDocumentGroup={onRenameDocumentGroup}
            onUploadDocument={onUploadDocument}
            onDeleteDocumentFile={onDeleteDocumentFile}
            onOpenDocument={onOpenDocument}
            onDownloadDocument={onDownloadDocument}
          />
        </div>
      </div>
    </section>
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
                const optionAssignee = getOptionAssignee(option);
                const optionAssigneeInitials = optionAssignee ? getOptionCollaboratorProfile(optionAssignee)?.initials : null;
                const showOptionAssigneeInitials = option.status === "incomplete" && Boolean(optionAssigneeInitials);
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
                        showOptionAssigneeInitials ? "flex-col items-start justify-between gap-2" : "items-center gap-1.5 sm:gap-2",
                      )}
                    >
                      {showOptionAssigneeInitials ? (
                        <>
                          <span className="inline-flex shrink-0 rounded-full border border-emerald-300 bg-white/75 px-2 py-0.5 text-base font-bold leading-tight text-emerald-800">
                            {optionAssigneeInitials}
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
}: {
  event: ProductionEvent;
  onUpdateTime: (event: ProductionEvent, field: EventTimeField, value: string) => Promise<void>;
  onTimelineTimeEditStart: (saveTime: () => Promise<void>) => void;
  onTimelineTimeEditEnd: () => void;
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
}: {
  value: string | null;
  onSave: (value: string) => Promise<void>;
  onEditingStart: (saveTime: () => Promise<void>) => void;
  onEditingEnd: () => void;
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
      onClick={() => setEditing(true)}
      className={cn(
        "inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-base font-semibold leading-none ring-1 ring-slate-200/70 transition hover:bg-slate-200/70",
        displayedTime ? "text-slate-600" : "text-slate-400",
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
}: {
  value: string;
  onSave: (value: string) => Promise<void>;
  className?: string;
  inputClassName?: string;
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
      onClick={() => setEditing(true)}
      className={cn("min-w-0 truncate text-left", className)}
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
  onCopy,
  openable = false,
}: {
  value: string;
  placeholder: string;
  icon: LucideIcon;
  copied: boolean;
  copyLabel: string;
  completed: boolean;
  onChange: (value: string) => void;
  onCopy: () => void;
  openable?: boolean;
}) {
  const trimmedValue = value.trim();
  const canOpen = openable && Boolean(getValidUrl(trimmedValue));
  const rowTone = getLinkTone(completed ? "available" : "missing");
  const [editing, setEditing] = useState(false);
  const openTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
  }, []);

  function openUrlFromRow() {
    if (!canOpen) return;
    if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
    openTimerRef.current = window.setTimeout(() => {
      openUrl(trimmedValue);
      openTimerRef.current = null;
    }, 180);
  }

  function editUrlFromRow() {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    setEditing(true);
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <div className={cn("inline-flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-full border px-3 py-1.5 transition focus-within:border-sky-400", rowTone.surface, rowTone.border)}>
        <Icon className={cn("h-4 w-4 shrink-0", rowTone.icon)} />
        {canOpen && !editing ? (
          <button
            type="button"
            onClick={openUrlFromRow}
            onDoubleClick={editUrlFromRow}
            className={cn("min-w-0 flex-1 truncate bg-transparent text-left text-base font-semibold underline-offset-2 outline-none transition hover:underline", rowTone.text)}
          >
            {value}
          </button>
        ) : (
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => setEditing(false)}
            autoFocus={editing}
            placeholder={placeholder}
            className={cn("min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-sky-300", rowTone.text)}
          />
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
  onRenameOption,
  onCreateOptionItem,
  onDeleteOptionItem,
  onToggleOptionAssignee,
  teamMembers,
  onRenameLink,
  onSaveLinkEntries,
  onRenameDocumentGroup,
  onUploadDocument,
  onDeleteDocumentFile,
  onOpenDocument,
  onDownloadDocument,
}: {
  event: ProductionEvent;
  selection: ContextSelection;
  onToggleOption: (option: EventOption) => Promise<void>;
  onRenameOption: (option: EventOption, label: string) => Promise<EventOption>;
  onCreateOptionItem: (option: EventOption, label: string) => Promise<EventOptionItem>;
  onDeleteOptionItem: (option: EventOption, item: EventOptionItem) => Promise<void>;
  onToggleOptionAssignee: (option: EventOption, member: TeamMember) => Promise<void>;
  teamMembers: TeamMember[];
  onRenameLink: (link: EventLink, label: string) => Promise<EventLink>;
  onSaveLinkEntries: (link: EventLink, drafts: LinkEntryDraft[]) => Promise<EventLink>;
  onRenameDocumentGroup: (group: EventDocumentGroup, label: string) => Promise<EventDocumentGroup>;
  onUploadDocument: (group: EventDocumentGroup, file: globalThis.File) => Promise<EventDocument>;
  onDeleteDocumentFile: (document: EventDocument) => Promise<void>;
  onOpenDocument: (document: EventDocument) => Promise<void>;
  onDownloadDocument: (document: EventDocument) => Promise<void>;
}) {
  const selectedOption = selection?.type === "option" ? event.options.find((option) => option.id === selection.optionId) ?? null : null;
  const selectedLink = selection?.type === "link" ? event.links.find((link) => link.id === selection.linkId) ?? null : null;
  const selectedDocumentGroup = selection?.type === "document" ? event.documentGroups.find((group) => group.id === selection.groupId) ?? null : null;
  const selectedOptionId = selectedOption?.id ?? "";
  const selectedLinkId = selectedLink?.id ?? "";
  const selectedDocumentGroupId = selectedDocumentGroup?.id ?? "";
  const selectedLinkIsPlatform = selectedLink ? isPlatformLink(selectedLink) : false;
  const [linkEntryDrafts, setLinkEntryDrafts] = useState<LinkEntryDraft[]>(() => selectedLink ? createLinkEntryDrafts(selectedLink, selectedLinkIsPlatform) : []);
  const [lastSavedLinkEntrySignature, setLastSavedLinkEntrySignature] = useState(() => selectedLink ? serializeLinkEntries(selectedLink.entries, selectedLinkIsPlatform) : "[]");
  const [savingLink, setSavingLink] = useState(false);
  const [linkSaveError, setLinkSaveError] = useState<string | null>(null);
  const [copiedLinkField, setCopiedLinkField] = useState<string | null>(null);
  const [addingOptionItem, setAddingOptionItem] = useState(false);
  const [optionItemInput, setOptionItemInput] = useState("");
  const [savingOptionItem, setSavingOptionItem] = useState(false);
  const [optionItemError, setOptionItemError] = useState<string | null>(null);
  const [optionAssigneeError, setOptionAssigneeError] = useState<string | null>(null);
  const [titleRenameError, setTitleRenameError] = useState<string | null>(null);
  const [draggingDocumentFiles, setDraggingDocumentFiles] = useState(false);
  const [uploadingDocumentFiles, setUploadingDocumentFiles] = useState(false);
  const [documentOpenError, setDocumentOpenError] = useState<string | null>(null);
  const linkEntryDraftSignature = serializeLinkEntryDrafts(linkEntryDrafts, selectedLinkIsPlatform);
  const hasUnsavedLinkChanges = selectedLink ? linkEntryDraftSignature !== lastSavedLinkEntrySignature : false;

  useEffect(() => {
    setLinkEntryDrafts(selectedLink ? createLinkEntryDrafts(selectedLink, selectedLinkIsPlatform) : []);
    setLastSavedLinkEntrySignature(selectedLink ? serializeLinkEntries(selectedLink.entries, selectedLinkIsPlatform) : "[]");
    setSavingLink(false);
    setLinkSaveError(null);
    setCopiedLinkField(null);
  }, [selectedLinkId]);

  useEffect(() => {
    if (!selectedLink || !hasUnsavedLinkChanges) return;

    const saveTimer = window.setTimeout(() => {
      setSavingLink(true);
      setLinkSaveError(null);
      void onSaveLinkEntries(selectedLink, linkEntryDrafts)
        .then((updatedLink) => {
          const updatedDrafts = createLinkEntryDrafts(updatedLink, selectedLinkIsPlatform);
          setLinkEntryDrafts(updatedDrafts);
          setLastSavedLinkEntrySignature(serializeLinkEntries(updatedLink.entries, selectedLinkIsPlatform));
        })
        .catch((saveError) => {
          setLinkSaveError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer le lien.");
        })
        .finally(() => {
          setSavingLink(false);
        });
    }, 500);

    return () => window.clearTimeout(saveTimer);
  }, [hasUnsavedLinkChanges, linkEntryDrafts, onSaveLinkEntries, selectedLink, selectedLinkIsPlatform]);

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
    setOptionAssigneeError(null);
    setTitleRenameError(null);
    setDraggingDocumentFiles(false);
    setUploadingDocumentFiles(false);
    setDocumentOpenError(null);
  }, [selectedDocumentGroupId, selectedLinkId, selectedOptionId]);

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
      const nextDrafts = current.map((draft, draftIndex) => (
        draftIndex === index ? { ...draft, [field]: value } : draft
      ));
      return normalizeLinkEntryDrafts(nextDrafts, selectedLinkIsPlatform);
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
      setDocumentOpenError(uploadError instanceof Error ? uploadError.message : "Impossible d'ajouter le fichier.");
    } finally {
      setUploadingDocumentFiles(false);
    }
  }

  async function removeDocumentFile(file: EventDocument) {
    setDocumentOpenError(null);

    try {
      await onDeleteDocumentFile(file);
    } catch (deleteError) {
      setDocumentOpenError(deleteError instanceof Error ? deleteError.message : "Impossible de supprimer ce fichier.");
    }
  }

  async function openDocumentFile(file: EventDocument) {
    setDocumentOpenError(null);

    try {
      await onOpenDocument(file);
    } catch (openError) {
      setDocumentOpenError(openError instanceof Error ? openError.message : "Impossible d'ouvrir le document.");
    }
  }

  async function downloadDocumentFile(file: EventDocument) {
    setDocumentOpenError(null);

    try {
      await onDownloadDocument(file);
    } catch (downloadError) {
      setDocumentOpenError(downloadError instanceof Error ? downloadError.message : "Impossible de télécharger le document.");
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
      setOptionItemError(saveError instanceof Error ? saveError.message : "Impossible d'ajouter cette note.");
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
      setOptionItemError(deleteError instanceof Error ? deleteError.message : "Impossible de supprimer cette note.");
    }
  }

  async function toggleSelectedOptionAssignee(member: TeamMember) {
    if (!selectedOption) return;

    setOptionAssigneeError(null);

    try {
      await onToggleOptionAssignee(selectedOption, member);
    } catch (assignError) {
      setOptionAssigneeError(assignError instanceof Error ? assignError.message : "Impossible de modifier les collaborateurs.");
    }
  }

  async function renameSelectedOption(label: string) {
    if (!selectedOption) return;
    setTitleRenameError(null);

    try {
      await onRenameOption(selectedOption, label);
    } catch (renameError) {
      setTitleRenameError(renameError instanceof Error ? renameError.message : "Impossible de renommer l'option.");
      throw renameError;
    }
  }

  async function renameSelectedLink(label: string) {
    if (!selectedLink) return;
    setTitleRenameError(null);

    try {
      await onRenameLink(selectedLink, label);
    } catch (renameError) {
      setTitleRenameError(renameError instanceof Error ? renameError.message : "Impossible de renommer le lien.");
      throw renameError;
    }
  }

  async function renameSelectedDocumentGroup(label: string) {
    if (!selectedDocumentGroup) return;
    setTitleRenameError(null);

    try {
      await onRenameDocumentGroup(selectedDocumentGroup, label);
    } catch (renameError) {
      setTitleRenameError(renameError instanceof Error ? renameError.message : "Impossible de renommer le document.");
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
              />
            </div>
          </div>
          <div className="url-editor-row flex w-full min-w-0 flex-col gap-2">
            {linkEntryDrafts.map((draft, index) => {
              const entryCompleted = isLinkEntryDraftComplete(draft, selectedLinkIsPlatform);

              return (
                <div key={draft.id ?? `draft-${index}`} className={cn("flex w-full min-w-0 flex-col gap-2", selectedLinkIsPlatform && index > 0 && "pt-1")}>
                  <LinkValueRow
                    value={draft.url}
                    placeholder={selectedLinkIsPlatform ? "URL" : "https://..."}
                    icon={Link}
                    copied={copiedLinkField === getCopiedLinkField(index, "url")}
                    copyLabel="Copier l'URL"
                    completed={entryCompleted}
                    onChange={(value) => updateLinkEntryDraft(index, "url", value)}
                    onCopy={() => void copyLinkValue(draft.url, getCopiedLinkField(index, "url"))}
                    openable
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
                      onCopy={() => void copyLinkValue(draft.streamKey, getCopiedLinkField(index, "streamKey"))}
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
              />
            </div>
          </div>
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
              {uploadingDocumentFiles ? "Upload..." : "Déposer ou choisir"}
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
          {selectedDocumentGroup.files.length > 0 && (
            <div className="flex flex-col gap-2">
              {selectedDocumentGroup.files.map((file) => {
                const FileIcon = getDocumentFileIcon(file);
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
                      <button
                        onClick={() => void removeDocumentFile(file)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-amber-500 opacity-100 transition hover:bg-white/70 hover:text-amber-800 focus:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                        aria-label="Supprimer ce fichier"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
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
  const optionCollaborators = optionCollaboratorProfiles
    .map((profile) => {
      const member = teamMembers.find((item) => item.firstName === profile.firstName);
      return member ? { ...profile, member } : null;
    })
    .filter((entry): entry is (typeof optionCollaboratorProfiles)[number] & { member: TeamMember } => Boolean(entry));
  const selectedOptionAssignee = getOptionAssignee(selectedOption);

  return (
    <Card className="border-emerald-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className={cn("flex min-w-0 items-center gap-2 text-base font-semibold", optionTone.text)}>
          <InlineEditableTitle
            value={selectedOption.label}
            onSave={renameSelectedOption}
            className="truncate"
            inputClassName="border-emerald-200 text-emerald-950 focus:border-emerald-400"
          />
        </div>
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
      </div>
      {titleRenameError && <div className="mt-2 text-base font-medium text-rose-700">{titleRenameError}</div>}
      <div className="mt-3">
        <div className="flex flex-col gap-2">
          {!addingOptionItem ? (
            <button
              onClick={() => setAddingOptionItem(true)}
              className="flex h-8 w-fit shrink-0 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-base font-semibold leading-none text-emerald-700 transition hover:bg-emerald-100"
              aria-label="Ajouter une note"
              title="Ajouter une note"
            >
              <span className="text-base leading-none">+</span>
              <span>Ajouter une note</span>
            </button>
          ) : (
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
          )}
        {selectedOption.items.map((item) => (
          <div key={item.id} className={cn("group flex min-h-12 w-full items-start gap-3 rounded-xl border px-3 py-2.5", optionTone.surface, optionTone.border)}>
            <p className={cn("min-w-0 flex-1 whitespace-pre-wrap text-base font-medium leading-relaxed", optionTone.text)}>{item.label}</p>
            <button
              onClick={() => void removeOptionItem(item)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-emerald-500 opacity-100 transition hover:bg-white/70 hover:text-emerald-800 focus:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
              aria-label="Supprimer cette note"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        </div>
        {optionItemError && <div className="text-base font-medium text-rose-700">{optionItemError}</div>}
      </div>
      <div className="mt-4">
        <div className="mb-2 text-base font-semibold uppercase tracking-[0.16em] text-stone-500">Collaborateurs</div>
        <div className="flex flex-wrap gap-2">
          {optionCollaborators.map(({ member }) => {
            const isAssigned = selectedOptionAssignee?.id === member.id;
            return (
              <button
                key={member.id}
                onClick={() => void toggleSelectedOptionAssignee(member)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-base font-semibold transition",
                  isAssigned
                    ? "border-emerald-400/70 bg-emerald-200/90 text-emerald-950 hover:bg-emerald-200"
                    : "border-emerald-100 bg-emerald-50/80 text-stone-700 hover:bg-emerald-100/55",
                )}
              >
                {member.firstName}
              </button>
            );
          })}
        </div>
        {optionAssigneeError && <div className="mt-2 text-base font-medium text-rose-700">{optionAssigneeError}</div>}
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const normalizedForm = normalizeEventTimeInput(form);
      setForm(normalizedForm);
      await onSubmit(normalizedForm);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : isEditing ? "Impossible de modifier l'événement." : "Impossible de créer l'événement.");
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
            <input required type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} className={formInputClassName} />
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
      </form>
    </div>
  );
}

function QuoteImportModal({
  initialFile,
  selectedDateKey,
  onClose,
  onConfirm,
}: {
  initialFile?: File | null;
  selectedDateKey: string;
  onClose: () => void;
  onConfirm: (input: CreateEventInput) => Promise<void>;
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
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialFileProcessedRef = useRef<File | null>(null);

  function updateField<Key extends keyof CreateEventInput>(key: Key, value: CreateEventInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Importez un fichier PDF.");
      return;
    }

    setExtracting(true);
    setError(null);
    setFileName(file.name);

    try {
      const text = await extractPdfText(file);
      const extracted = extractQuoteFields(text, selectedDateKey, file.name);
      setForm({
        clientName: extracted.clientName,
        eventName: extracted.eventName,
        date: extracted.date,
        clientArrivalTime: extracted.clientArrivalTime,
        startTime: extracted.startTime,
        endTime: extracted.endTime,
        endOfDayTime: extracted.endOfDayTime,
        optionLabels: extracted.services,
      });
      setServiceText(extracted.services.join("\n"));
      setStep("review");
    } catch (extractError) {
      console.error("Failed to extract quote PDF text", extractError);
      setError("Impossible de lire ce PDF. Vérifiez qu'il contient bien du texte sélectionnable.");
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
      await onConfirm(normalizedForm);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Impossible de créer l'événement depuis ce devis.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-stone-950/10 p-3 sm:items-center sm:justify-center sm:p-6">
      <form onSubmit={handleSubmit} className="w-full rounded-3xl border border-stone-200 bg-white p-5 sm:max-w-2xl sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-950">{step === "upload" ? "Importer un devis" : "Voici ce que j'ai compris du devis"}</h2>
            {fileName && <p className="mt-1 truncate text-base font-medium text-stone-500">{fileName}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-stone-200 px-3 py-1.5 text-base font-semibold text-stone-600">
            Fermer
          </button>
        </div>

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
            <span className="text-base font-semibold text-stone-800">{extracting ? "Lecture du devis..." : "Déposez un PDF ici"}</span>
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
        ) : (
          <>
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

        {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700">{error}</div>}

        <div className="mt-6 flex justify-end gap-2">
          {step === "review" && (
            <button type="button" onClick={() => setStep("upload")} disabled={submitting} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-base font-semibold text-stone-600 disabled:text-stone-300">
              Remplacer le PDF
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

function EventDatePicker({
  event,
  onClose,
  onSubmit,
}: {
  event: ProductionEvent;
  onClose: () => void;
  onSubmit: (date: string) => Promise<void>;
}) {
  const [pickerMonth, setPickerMonth] = useState(() => new Date(`${event.date}T12:00:00`));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weekdays = ["L", "M", "M", "J", "V", "S", "D"];
  const monthData = useMemo(() => getCalendarMonthData(pickerMonth, []), [pickerMonth]);

  async function selectDate(dateKey: string) {
    setSaving(true);
    setError(null);

    try {
      await onSubmit(dateKey);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible de modifier la date.");
      setSaving(false);
    }
  }

  function changePickerMonth(delta: -1 | 1) {
    if (saving) return;
    setPickerMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/10 p-3 sm:items-center sm:p-6">
      <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={() => changePickerMonth(-1)}
            disabled={saving}
            className={calendarArrowClassName}
            aria-label="Mois précédent"
          >
            ←
          </button>
          <p className="text-base font-semibold text-stone-950">
            {monthNames[monthData.month]} {monthData.year}
          </p>
          <button
            type="button"
            onClick={() => changePickerMonth(1)}
            disabled={saving}
            className={calendarArrowClassName}
            aria-label="Mois suivant"
          >
            →
          </button>
        </div>

        <div className="grid grid-cols-7 px-1">
          {weekdays.map((weekday, index) => (
            <span key={`${weekday}-${index}`} className="py-2 text-center text-xs font-semibold text-stone-400">
              {weekday}
            </span>
          ))}
          {Array.from({ length: monthData.leadingEmptyDays }).map((_, index) => (
            <span key={`empty-start-${index}`} className="aspect-square" />
          ))}
          {monthData.calendarDays.map((day) => {
            const isSelected = day.dateKey === event.date;
            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => void selectDate(day.dateKey)}
                disabled={saving}
                className="flex aspect-square items-center justify-center rounded-full text-base font-semibold text-stone-800 transition hover:bg-stone-100 disabled:text-stone-300"
              >
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", isSelected && "bg-[#bb2720] text-white")}>{day.day}</span>
              </button>
            );
          })}
          {Array.from({ length: monthData.trailingEmptyDays }).map((_, index) => (
            <span key={`empty-end-${index}`} className="aspect-square" />
          ))}
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
      setDownloadError(error instanceof Error ? error.message : "Impossible de télécharger le document.");
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
      : tone === "link"
        ? "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100"
        : "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100";

  return (
    <div className={cn("mb-2 flex min-w-0 items-center gap-1 sm:mb-3 sm:gap-2", align === "right" ? "justify-end" : "justify-start")}>
      <h2
        className={cn(
          "min-w-0 flex-1 truncate text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-stone-500 sm:text-base sm:tracking-[0.16em]",
          align === "right" && "text-right",
        )}
      >
        {label}
      </h2>
      <button
        onClick={onAdd}
        className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-base font-semibold leading-none transition sm:h-6 sm:w-6", addTone)}
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
