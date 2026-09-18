import axios from "axios";
import { extractText, extractTextItems, getMeta, getDocumentProxy } from "unpdf";
import type { DriveAsset } from "../google-drive/drive.types.js";

export interface PdfMetadata {
  title?: string | undefined;
  author?: string | undefined;
  subject?: string | undefined;
  creator?: string | undefined;
}

export interface PdfFigureReference {
  label: string;
  caption: string;
  pageNumber: number;
}

export interface PdfIntelligence {
  success: boolean;
  pageCount: number;
  title: string | null;
  authorName: string | null;
  authorBio: string | null;
  sections: string[];
  figures: PdfFigureReference[];
  metadata: PdfMetadata;
}

const NOISE_WORDS = new Set([
  "insight",
  "insights",
  "article",
  "whitepaper",
  "white paper",
  "report",
  "overview",
  "summary",
  "confidential",
  "draft",
  "final",
]);

/**
 * Downloads a PDF buffer from a Google Drive URL or Drive API v3 alt=media endpoint.
 */
export async function downloadPdfBuffer(
  downloadUrl: string,
  fileId?: string
): Promise<Uint8Array | null> {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY ?? process.env.GOOGLE_API_KEY;

  // Try Google Drive API v3 direct media download first if fileId and API key are available
  if (fileId && apiKey) {
    try {
      const apiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
      const resp = await axios.get(apiUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
      });
      if (resp.status === 200 && resp.data) {
        return new Uint8Array(resp.data);
      }
    } catch {
      // Fallback to downloadUrl below
    }
  }

  // Direct download URL fallback
  if (downloadUrl) {
    try {
      const resp = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      });
      if (resp.status === 200 && resp.data) {
        return new Uint8Array(resp.data);
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Extracts intelligence (Title, Author, Headings, Captions) from a PDF buffer.
 */
export async function analyzePdfBuffer(
  buffer: Uint8Array | ArrayBuffer | Buffer
): Promise<PdfIntelligence> {
  let data: Uint8Array;
  if (Buffer.isBuffer(buffer)) {
    // PDF.js explicitly rejects instances where constructor is Buffer
    data = new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  } else if (buffer instanceof Uint8Array) {
    data = new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  } else {
    data = new Uint8Array(buffer);
  }

  // Some PDF parsing internals (unpdf / pdfjs) emit noisy warnings like
  // "TT: undefined function: 21" and "Indexing all PDF objects". These are
  // non-fatal but clutter logs; temporarily suppress them while calling
  // into the library.
  const noisyPatterns = [/TT:\s*undefined function:/i, /Indexing all PDF objects/i];

  async function withSuppressedConsole<T>(fn: () => Promise<T>): Promise<T> {
    const oldWarn = console.warn;
    const oldError = console.error;
    console.warn = (...args: any[]) => {
      try {
        const msg = args.map(String).join(" ");
        if (noisyPatterns.some((p) => p.test(msg))) return;
      } catch {
        // fallthrough
      }
      oldWarn.apply(console, args);
    };
    console.error = (...args: any[]) => {
      try {
        const msg = args.map(String).join(" ");
        if (noisyPatterns.some((p) => p.test(msg))) return;
      } catch {
        // fallthrough
      }
      oldError.apply(console, args);
    };

    try {
      return await fn();
    } finally {
      console.warn = oldWarn;
      console.error = oldError;
    }
  }

  try {
    const docProxy = await withSuppressedConsole(() => getDocumentProxy(data));
    const metaRaw = await withSuppressedConsole(() => getMeta(docProxy).catch(() => null));
    const textItemsData = await withSuppressedConsole(() => extractTextItems(docProxy).catch(() => null));
    const textData = await withSuppressedConsole(() => extractText(docProxy, { mergePages: false }).catch(() => null));

    const pageCount = textData?.totalPages ?? 1;
    const pagesText: string[] = Array.isArray(textData?.text)
      ? textData.text
      : typeof textData?.text === "string"
      ? [textData.text]
      : [];

    const metadata: PdfMetadata = {
      title: typeof metaRaw?.info?.Title === "string" ? metaRaw.info.Title.trim() : undefined,
      author: typeof metaRaw?.info?.Author === "string" ? metaRaw.info.Author.trim() : undefined,
      subject: typeof metaRaw?.info?.Subject === "string" ? metaRaw.info.Subject.trim() : undefined,
      creator: typeof metaRaw?.info?.Creator === "string" ? metaRaw.info.Creator.trim() : undefined,
    };

    // 1. Extract Insight Title using font-size heuristics on page 1
    let extractedTitle: string | null = null;

    if (textItemsData?.items && textItemsData.items.length > 0 && textItemsData.items[0]) {
      const page1Items = textItemsData.items[0];

      // Filter out empty items or small noise
      const validItems = page1Items.filter((it) => it.str.trim().length > 0);

      // Find max font size on page 1
      let maxFontSize = 0;
      for (const item of validItems) {
        if (item.fontSize > maxFontSize && item.str.trim().length > 1) {
          maxFontSize = item.fontSize;
        }
      }

      // Group items near max font size (within 20% of max)
      if (maxFontSize > 10) {
        const threshold = maxFontSize * 0.82;
        const titleParts: string[] = [];

        for (const item of validItems) {
          const s = item.str.trim();
          if (item.fontSize >= threshold && s.length > 0) {
            // Avoid standalone noise words like "INSIGHT" or dates
            if (!NOISE_WORDS.has(s.toLowerCase()) && !/^\d{4}$|^\d{1,2}[\/\-]\d{1,2}/.test(s)) {
              titleParts.push(s);
            }
          }
        }

        if (titleParts.length > 0) {
          extractedTitle = titleParts.join(" ").replace(/\s+/g, " ").trim();
        }
      }
    }

    // Fallback: Check page 1 text lines if font-size grouping didn't yield a valid title
    if (!extractedTitle && pagesText[0]) {
      const lines = pagesText[0]
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 4);

      for (const line of lines) {
        const lower = line.toLowerCase();
        if (
          !NOISE_WORDS.has(lower) &&
          !/^(page|\d+|http|www|copyright|all rights)/i.test(lower) &&
          !/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(line)
        ) {
          extractedTitle = line;
          break;
        }
      }
    }

    // Fallback to metadata title if valid and clean
    if (!extractedTitle && metadata.title && !metadata.title.toLowerCase().endsWith(".indd") && !metadata.title.toLowerCase().startsWith("microsoft word")) {
      extractedTitle = metadata.title;
    }

    // Clean extracted title
    if (extractedTitle) {
      extractedTitle = extractedTitle
        .replace(/^[\-:\s]+|[\-:\s]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    // 2. Extract Author Name & Bio
    let extractedAuthor: string | null = metadata.author || null;
    let extractedBio: string | null = null;
    const fullText = pagesText.join("\n");

    const authorRegex = /(?:by|written by|author)\s*[:\-]?\s*([A-Z][a-zA-Z\.\s]{2,40})/i;
    const authorMatch = fullText.match(authorRegex);
    if (authorMatch && authorMatch[1]) {
      const candidate = authorMatch[1].trim();
      if (!NOISE_WORDS.has(candidate.toLowerCase()) && candidate.length < 40) {
        extractedAuthor = candidate;
      }
    }

    const bioRegex = /(?:about the author|author bio|biography)\s*[:\-]?\s*([^\n\r]+(?:\n[^\n\r]+){0,3})/i;
    const bioMatch = fullText.match(bioRegex);
    if (bioMatch && bioMatch[1]) {
      extractedBio = bioMatch[1].trim();
    }

    // 3. Extract Section Headings
    const sections: string[] = [];
    const sectionPatterns = [
      /(?:^|\n|\b)\s*(\d+[\.\)]\s+[A-Z][A-Za-z0-9\s,\-:\(\)]{3,60})/g,
      /(?:^|\n)\s*([A-Z][A-Za-z0-9\s,\-:]{4,50})(?=\n\n|\n|$)/g,
    ];

    for (const pat of sectionPatterns) {
      const matches = fullText.matchAll(pat);
      for (const m of matches) {
        if (m[1]) {
          const sec = m[1].trim();
          if (
            sec.length > 4 &&
            sec.length < 60 &&
            sec !== extractedTitle &&
            !sections.includes(sec) &&
            !NOISE_WORDS.has(sec.toLowerCase()) &&
            !/^(page\b|\d+\s*$|figure\b|table\b|chart\b)/i.test(sec)
          ) {
            sections.push(sec);
          }
        }
      }
      if (sections.length >= 3) break;
    }

    // 4. Extract Figures and Captions
    const figures: PdfFigureReference[] = [];
    pagesText.forEach((pText, pIdx) => {
      const figRegex = /(?:Figure|Fig\.|Chart|Diagram|Graphic)\s*(\d+|[A-Z])[:\-]?\s*([^\n\.]+)/gi;
      let match;
      while ((match = figRegex.exec(pText)) !== null) {
        if (match[0]) {
          figures.push({
            label: `Figure ${match[1]}`,
            caption: match[2]?.trim() ?? "",
            pageNumber: pIdx + 1,
          });
        }
      }
    });

    return {
      success: true,
      pageCount,
      title: extractedTitle,
      authorName: extractedAuthor,
      authorBio: extractedBio,
      sections: sections.slice(0, 10),
      figures,
      metadata,
    };
  } catch (err: any) {
    return {
      success: false,
      pageCount: 0,
      title: null,
      authorName: null,
      authorBio: null,
      sections: [],
      figures: [],
      metadata: {},
    };
  }
}

/**
 * Uses PDF intelligence + image aspect ratio to determine where each asset belongs.
 */
export function assignAssetPlacements(
  assets: DriveAsset[],
  pdfInfo?: PdfIntelligence | null
): DriveAsset[] {
  let sectionCounter = 1;
  let hasHero = false;
  let hasMobile = false;
  let hasAuthor = false;

  return assets.map((asset) => {
    const enriched = { ...asset };
    const lowerName = (asset.name || "").toLowerCase();
    const isImage = asset.mimeType?.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(asset.name);

    if (!isImage) {
      if (asset.type === "pdf") {
        enriched.placement = "other";
        enriched.placementSlot = "reference-pdf";
        enriched.placementReason = "Reference insight document";
      } else if (asset.type === "doc") {
        enriched.placement = "other";
        enriched.placementSlot = "draft-doc";
        enriched.placementReason = "Supporting editorial draft";
      }
      return enriched;
    }

    const ar = asset.aspectRatio;

    // 1. Author Portrait Placement
    const isAuthorKeyword = /author|profile|bio|about|portrait|person/.test(lowerName);
    const isAuthorName = pdfInfo?.authorName && lowerName.includes(pdfInfo.authorName.toLowerCase());
    const isSquare = typeof ar === "number" && ar >= 0.85 && ar <= 1.25;

    if (!hasAuthor && (isAuthorKeyword || isAuthorName || (isSquare && isAuthorKeyword))) {
      hasAuthor = true;
      enriched.placement = "author";
      enriched.placementSlot = "author";
      enriched.type = "other";
      enriched.convertedDimensions = "500x500";
      enriched.outputLabel = "Author image";
      enriched.authorName = pdfInfo?.authorName || "Author";
      enriched.displayLabel = "Author profile image";
      enriched.placementReason = `Matched author profile ${isAuthorName ? `(author: ${pdfInfo?.authorName})` : isSquare ? "(square aspect ratio)" : "(keyword match)"}`;
      enriched.confidence = 96;
      return enriched;
    }

    // 2. Mobile Banner Placement
    const isMobileKeyword = /mobile|phone|smartphone|portrait-banner|story/.test(lowerName);
    const isVertical = typeof ar === "number" && ar <= 0.85;

    if (!hasMobile && (isMobileKeyword || (isVertical && !hasMobile))) {
      hasMobile = true;
      enriched.placement = "mobileBanner";
      enriched.placementSlot = "mobile";
      enriched.type = "mobileBanner";
      enriched.convertedDimensions = "750x1050";
      enriched.outputLabel = "Mobile banner";
      enriched.placementReason = isVertical
        ? `Matched vertical aspect ratio (${ar?.toFixed(2)}) for mobile banner`
        : "Mobile hero banner detected via naming";
      enriched.confidence = 95;
      return enriched;
    }

    // 3. Desktop Hero Banner Placement
    const isHeroKeyword = /desktop|hero|banner|wide|header|landing|featured|cover/.test(lowerName);
    const isWide = typeof ar === "number" && ar >= 1.6;

    if (!hasHero && (isHeroKeyword || isWide)) {
      hasHero = true;
      enriched.placement = "heroBanner";
      enriched.placementSlot = "hero";
      enriched.type = "desktopBanner";
      enriched.convertedDimensions = "1440x500";
      enriched.outputLabel = "Desktop banner";
      enriched.placementReason = isWide
        ? `Matched wide panoramic aspect ratio (${ar?.toFixed(2)}) for hero banner`
        : "Primary hero banner detected via naming";
      enriched.confidence = 96;
      return enriched;
    }

    // 4. Section Content Images (Cross-reference with PDF sections / figures)
    const matchingSection = pdfInfo?.sections?.[sectionCounter - 1];
    const slot = `section-${sectionCounter}`;
    sectionCounter++;

    enriched.placement = "sectionContent";
    enriched.placementSlot = slot;
    enriched.type = "contentImage";
    enriched.convertedDimensions = "500xauto";
    enriched.outputLabel = "Inner image";
    enriched.placementReason = matchingSection
      ? `Placed under document Section ${sectionCounter - 1}: "${matchingSection}"`
      : `Placed as inline article figure (${slot})`;
    enriched.confidence = 90;

    return enriched;
  });
}
