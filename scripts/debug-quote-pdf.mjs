import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..");
const pdfPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(workspaceRoot, "Samples", "DE260129-894.pdf");

function normalizeCompactTimeInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 2) return `${digits.padStart(2, "0")}:00`;
  return `${digits.slice(0, -2).padStart(2, "0")}:${digits.slice(-2)}`;
}

function normalizeLabel(label) {
  return String(label ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .trim();
}

function formatTitleCase(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/(^|[^\p{L}\p{N}])([\p{L}])/gu, (_match, separator, letter) => {
      return `${separator}${letter.toLocaleUpperCase("fr-FR")}`;
    })
    .replace(/\b(Sas|Sarl|Sa|Tv)\b/g, (acronym) => acronym.toLocaleUpperCase("fr-FR"));
}

function formatServiceLabel(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/^([\p{L}])/u, (letter) => letter.toLocaleUpperCase("fr-FR"))
    .replace(/\b(Sas|Sarl|Sa|Tv)\b/g, (acronym) => acronym.toLocaleUpperCase("fr-FR"));
}

function parseFrenchDateToKey(value) {
  const numericMatch = value.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (numericMatch) {
    const [, day, month, year] = numericMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const monthByName = {
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

function parseFrenchDateToKeyWithDefaultYear(value, defaultYear) {
  const explicitDate = parseFrenchDateToKey(value);
  if (explicitDate) return explicitDate;
  if (!defaultYear) return "";

  const monthByName = {
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

function parseFrenchTimeMatch(hours, minutes) {
  return normalizeCompactTimeInput(`${hours}${minutes ?? ""}`);
}

function parseFrenchTimeRange(value) {
  const match = value.match(/\b(\d{1,2})\s*(?:h|H|:)\s*(\d{2})?\s*(?:-|–|—|à|a|jusqu(?:'|’)?a)\s*(\d{1,2})\s*(?:h|H|:)\s*(\d{2})?\b/i);
  if (!match) return { startTime: "", endTime: "" };

  return {
    startTime: parseFrenchTimeMatch(match[1], match[2]),
    endTime: parseFrenchTimeMatch(match[3], match[4]),
  };
}

function findLineValue(lines, patterns) {
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
  }
  return "";
}

function findCommercialQuoteTextBoundary(text) {
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

function getCommercialQuoteText(text) {
  const boundary = findCommercialQuoteTextBoundary(text);
  return boundary >= 0 ? text.slice(0, boundary) : text;
}

function extractMstvClientName(lines) {
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

function findMstvProductionLine(lines) {
  const withDateAndRange = lines.find((line) => /\ble\s+\d{1,2}\s+[A-Za-zéûîôàèùç]+(?:\s+\d{4})?\b/i.test(line) && parseFrenchTimeRange(line).startTime);
  if (withDateAndRange) return withDateAndRange;

  const compactText = lines.join(" ");
  const match = compactText.match(/([^.:\n]*(?:le\s+)?\d{1,2}\s+[A-Za-zéûîôàèùç]+(?:\s+\d{4})?\s+(?:de\s+)?\d{1,2}\s*(?:h|H|:)\s*\d{0,2}\s*(?:-|–|—|à|a)\s*\d{1,2}\s*(?:h|H|:)\s*\d{0,2}[^.:\n]*)/i);
  return match?.[1]?.trim() ?? "";
}

function extractQuoteDocumentYear(lines) {
  const dateLine = findLineValue(lines, [
    /\bdate(?:\s+(?:facturation|de\s+facture|du\s+devis|devis))?\s*[:#-]\s*(.+)$/i,
    /\b(?:devis|facture)\s+du\s+(.+)$/i,
  ]);
  const date = parseFrenchDateToKey(dateLine);
  return date ? date.slice(0, 4) : "";
}

function uniqueLabels(labels) {
  const seen = new Set();
  return labels
    .map((label) => formatServiceLabel(label))
    .filter((label) => {
      const key = normalizeLabel(label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function extractQuoteLineItemLabels(text) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const labels = [];
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

function extractQuoteServices(text) {
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

function extractQuoteReference(text, fileName) {
  const candidates = `${fileName}\n${text}`;
  const referenceMatch =
    candidates.match(/\b((?:DE|FA)\d{6}-\d{3,})\b/i) ||
    candidates.match(/\b(DE\d{6}-\d{3,})\b/i) ||
    candidates.match(/\b(?:devis|quote)\s*(?:n[°o.]?|#|:)?\s*([A-Z]{1,4}\d{4,8}-\d{2,6})\b/i);
  return referenceMatch?.[1]?.toLocaleUpperCase("fr-FR") ?? "";
}

function extractQuoteFields(text, fallbackDate, fileName) {
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

  return {
    clientName,
    eventName: "Événement",
    date,
    clientArrivalTime: "",
    startTime: productionTimeRange.startTime,
    endTime: productionTimeRange.endTime,
    endOfDayTime: "",
    services: extractQuoteServices(commercialText),
    quoteReference: extractQuoteReference(commercialText, fileName),
    productionLine,
    commercialTextLength: commercialText.length,
    lineCount: lines.length,
    commercialLineCount: commercialLines.length,
  };
}

function formatBytesForDebug(bytes, byteCount = 16) {
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

async function debugWithPdfjs(importPath, label, bytes) {
  console.log(`\n=== ${label} ===`);
  let pdfjs;
  try {
    pdfjs = await import(importPath);
  } catch (error) {
    console.log("import failure:", error?.name, error?.message);
    return null;
  }
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(workspaceRoot, "public", "pdf.worker.mjs");

  let pdf;
  try {
    pdf = await pdfjs.getDocument({
      data: bytes.slice(),
      useWorkerFetch: false,
      useWasm: false,
      standardFontDataUrl: path.join(workspaceRoot, "public", "pdfjs", "standard_fonts") + path.sep,
      cMapUrl: path.join(workspaceRoot, "public", "pdfjs", "cmaps") + path.sep,
      cMapPacked: true,
    }).promise;
    console.log("pdfjs page count:", pdf.numPages);
  } catch (error) {
    console.log("load failure:", error?.name, error?.message);
    return null;
  }

  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    try {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => {
          if (typeof item.str !== "string") return "";
          return item.hasEOL ? `${item.str}\n` : `${item.str} `;
        })
        .join("");

      console.log(`page ${pageNumber}:`, {
        items: content.items.length,
        textLength: pageText.trim().length,
        startsCgvSection: findCommercialQuoteTextBoundary(pageText) >= 0,
      });

      if (pageNumber === 1) {
        console.log("page 1 first 500 chars:");
        console.log(pageText.replace(/\s+/g, " ").trim().slice(0, 500));
      }

      pages.push(pageText);
    } catch (error) {
      console.log(`page ${pageNumber} extraction failure:`, {
        name: error?.name,
        message: error?.message,
        stack: error?.stack?.split("\n").slice(0, 4).join("\n"),
      });
      return { failedAtPage: pageNumber, pages };
    }
  }

  return { pages };
}

const bytes = new Uint8Array(await fs.readFile(pdfPath));
console.log("PDF path:", pdfPath);
console.log("file size:", bytes.byteLength);
console.log("header:", formatBytesForDebug(bytes));

const mainResult = await debugWithPdfjs("pdfjs-dist", "pdfjs-dist app import", bytes);
const legacyResult = await debugWithPdfjs("pdfjs-dist/legacy/build/pdf.mjs", "pdfjs legacy import", bytes);
const result = mainResult?.pages?.length ? mainResult : legacyResult;

if (!result?.pages?.length) {
  console.log("\nNo extractable pages returned.");
  process.exitCode = 1;
} else {
  const extractedText = getCommercialQuoteText(result.pages.join("\n"));
  const detected = extractQuoteFields(extractedText, "2026-01-01", path.basename(pdfPath));
  console.log("\n=== parser result ===");
  console.log({
    exactFailurePoint: result.failedAtPage ? `text extraction failed at page ${result.failedAtPage}` : "none",
    extractedTextLength: extractedText.trim().length,
    commercialTextLength: detected.commercialTextLength,
    lineCount: detected.lineCount,
    commercialLineCount: detected.commercialLineCount,
    detectedQuoteReference: detected.quoteReference || null,
    detectedClient: detected.clientName || null,
    detectedEventName: detected.eventName || null,
    detectedDate: detected.date || null,
    detectedStartTime: detected.startTime || null,
    detectedEndTime: detected.endTime || null,
    detectedOptions: detected.services,
    productionLine: detected.productionLine || null,
  });
}
