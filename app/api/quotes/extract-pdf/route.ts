import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
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

function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

function getSupabaseClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Configuration Supabase manquante.");
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function getBearerToken(request: Request) {
  const authorizationHeader = request.headers.get("authorization") ?? "";
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

function normalizeCompactTimeInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 2) return `${digits.padStart(2, "0")}:00`;
  return `${digits.slice(0, -2).padStart(2, "0")}:${digits.slice(-2)}`;
}

function normalizeLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .trim();
}

function formatTitleCase(label: string) {
  return label
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/(^|[^\p{L}\p{N}])([\p{L}])/gu, (_, separator: string, letter: string) => `${separator}${letter.toLocaleUpperCase("fr-FR")}`)
    .replace(/\b(Sas|Sarl|Sa|Tv)\b/g, (acronym) => acronym.toLocaleUpperCase("fr-FR"));
}

function formatServiceLabel(label: string) {
  return label
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/^([\p{L}])/u, (letter) => letter.toLocaleUpperCase("fr-FR"))
    .replace(/\b(Sas|Sarl|Sa|Tv)\b/g, (acronym) => acronym.toLocaleUpperCase("fr-FR"));
}

function uniqueLabels(labels: string[]) {
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
  const textMatch = normalized.match(/\b(\d{1,2})(?:\s*(?:er|e|eme))?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})\b/);
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
  const textMatch = normalized.match(/\b(\d{1,2})(?:\s*(?:er|e|eme))?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/);
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
    { label: "Caméra supplémentaire", keywords: ["camera supplementaire", "caméra supplémentaire"] },
    { label: "Maquillage", keywords: ["maquillage", "makeup"] },
    { label: "Montage", keywords: ["montage", "post-production", "edition"] },
    { label: "Quiz", keywords: ["quiz", "questionnaire", "q&a"] },
    { label: "Wifi", keywords: ["wifi", "wi fi", "internet"] },
  ];
  const normalizedText = normalizeLabel(text);
  const keywordServices = serviceRules.filter((rule) => rule.keywords.some((keyword) => normalizedText.includes(normalizeLabel(keyword)))).map((rule) => rule.label);
  const lineItemServices = extractQuoteLineItemLabels(text);
  return lineItemServices.length > 0 ? uniqueLabels(lineItemServices) : uniqueLabels(keywordServices);
}

function normalizeQuoteText(text: string) {
  return text.replace(/\s+/g, " ").trim();
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
        /\b(?:le)\s+(\d{1,2}(?:\s*(?:er|e|ème|eme))?\s+[A-Za-zéûîôàèùç]+(?:\s+\d{4})?)\b/i,
      ]) || "",
      documentYear,
    ) ||
    fallbackDate;
  const services = extractQuoteServices(commercialText);
  const quoteReference = extractQuoteReference(commercialText, fileName);
  const quoteVersion = extractQuoteVersion(commercialText);

  console.info("Quote PDF parser diagnostics", {
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

function isQuoteExtractionComplete(text: string, fileName: string) {
  const extracted = extractQuoteFields(text, "", fileName);
  return Boolean(extracted.quoteReference && extracted.clientName && extracted.date && extracted.startTime && extracted.endTime && extracted.services.length > 0);
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

class FallbackDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: number[]) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
    }
  }

  multiplySelf() {
    return this;
  }

  preMultiplySelf() {
    return this;
  }

  translate() {
    return this;
  }

  scale() {
    return this;
  }

  invertSelf() {
    return this;
  }
}

async function ensurePdfJsNodePolyfills() {
  const pdfGlobal = globalThis as Record<string, unknown>;

  try {
    const canvas = await import("@napi-rs/canvas");
    pdfGlobal.DOMMatrix ??= canvas.DOMMatrix as unknown;
    pdfGlobal.ImageData ??= canvas.ImageData as unknown;
    pdfGlobal.Path2D ??= canvas.Path2D as unknown;
  } catch (polyfillError) {
    console.warn("Quote PDF server could not load @napi-rs/canvas polyfills; using minimal DOMMatrix fallback.", getDebugError(polyfillError));
  }

  pdfGlobal.DOMMatrix ??= FallbackDOMMatrix;
}

async function extractPdfTextServer(file: File) {
  const debugId = `quote-pdf-server-${Date.now()}`;
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const header = formatBytesForDebug(bytes);
  const hasPdfHeader = header.ascii.startsWith("%PDF");

  console.info("Quote PDF server file received", {
    debugId,
    name: file.name,
    type: file.type || "(empty)",
    size: file.size,
    byteLength: bytes.byteLength,
    hasPdfHeader,
    header,
  });

  if (bytes.byteLength === 0) {
    throw new Error("Le fichier PDF reçu est vide.");
  }

  if (!hasPdfHeader) {
    throw new Error("Le fichier reçu ne ressemble pas à un PDF valide.");
  }

  await ensurePdfJsNodePolyfills();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(process.cwd(), "public", "pdf.worker.mjs");

  const pdf = await pdfjs.getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
    useWasm: false,
    standardFontDataUrl: path.join(process.cwd(), "public", "pdfjs", "standard_fonts") + path.sep,
    cMapUrl: path.join(process.cwd(), "public", "pdfjs", "cmaps") + path.sep,
    cMapPacked: true,
  }).promise;

  console.info("Quote PDF server loaded document", {
    debugId,
    pages: pdf.numPages,
  });

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

      console.info("Quote PDF server extracted page", {
        debugId,
        pageNumber,
        itemCount: content.items.length,
        textLength: pageText.trim().length,
        startsCgvSection: findCommercialQuoteTextBoundary(pageText) >= 0,
      });

      const cgvBoundary = findCommercialQuoteTextBoundary(pageText);
      if (cgvBoundary >= 0) {
        const commercialPageText = pageText.slice(0, cgvBoundary).trim();
        if (commercialPageText) {
          pages.push(commercialPageText);
        }
        stoppedAtCgvPage = pageNumber;
        break;
      }

      pages.push(pageText);

      const accumulatedText = getCommercialQuoteText(pages.join("\n"));
      if (isQuoteExtractionComplete(accumulatedText, file.name)) {
        console.info("Quote PDF server stopped after complete commercial page", {
          debugId,
          pageNumber,
          textLength: accumulatedText.trim().length,
        });
        break;
      }
    } catch (pageError) {
      console.error("Quote PDF server page extraction failed", {
        debugId,
        pageNumber,
        error: getDebugError(pageError),
      });

      const keptText = pages.join("\n").trim();
      if (keptText.length > 120) {
        console.warn("Quote PDF server keeping previously extracted pages after later page failure", {
          debugId,
          pageNumber,
          keptPages: pages.length,
          keptTextLength: keptText.length,
        });
        break;
      }

      throw new Error("Le PDF s’ouvre, mais l’extraction du texte a échoué.");
    }
  }

  const text = getCommercialQuoteText(pages.join("\n"));
  console.info("Quote PDF server extracted document text", {
    debugId,
    totalTextLength: text.trim().length,
    extractedPages: pages.length,
    stoppedAtCgvPage,
  });

  if (!text.trim()) {
    throw new Error("Le PDF a été lu, mais aucun texte exploitable n’a été trouvé.");
  }

  return text;
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request: Request) {
  try {
    const accessToken = getBearerToken(request);
    if (!accessToken) {
      return jsonResponse({ error: "Votre session a expiré. Veuillez vous reconnecter." }, { status: 401 });
    }

    const supabase = getSupabaseClient(accessToken);
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return jsonResponse({ error: "Votre session a expiré. Veuillez vous reconnecter." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const fallbackDate = typeof formData.get("fallbackDate") === "string" ? String(formData.get("fallbackDate")) : "";

    if (!(file instanceof File)) {
      return jsonResponse({ error: "PDF manquant." }, { status: 400 });
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return jsonResponse({ error: "Importez un fichier PDF." }, { status: 400 });
    }

    const text = await extractPdfTextServer(file);
    const extracted = extractQuoteFields(text, fallbackDate, file.name);

    if (!extracted.quoteReference && !extracted.clientName && extracted.services.length === 0) {
      return jsonResponse({ error: "Le PDF a été lu, mais aucune donnée de devis exploitable n’a été détectée." }, { status: 422 });
    }

    return jsonResponse({ extracted });
  } catch (error) {
    console.error("Quote PDF extraction API error", getDebugError(error));
    const message = error instanceof Error ? error.message : "";
    const publicMessage =
      message && /^Le fichier|^Le PDF|^PDF manquant|^Importez un fichier PDF|^Votre session/i.test(message)
        ? message
        : "Le fichier PDF n’a pas pu être lu.";
    return jsonResponse(
      {
        error: publicMessage,
      },
      { status: 500 },
    );
  }
}
