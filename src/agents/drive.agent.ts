import {
  scanDriveFolder,
  validateDriveFolder,
} from "../google-drive/drive.service.js";
import type { DriveAsset, DriveScanResult } from "../google-drive/drive.types.js";
import { ensureConvertedImage } from "../utils/image.processor.js";
import { slugify } from "../utils/slugify.js";
import { downloadPdfBuffer, analyzePdfBuffer, assignAssetPlacements } from "../utils/pdf.analyzer.js";
import axios from "axios";
import sharp from "sharp";

const MOBILE_KEYWORDS = [
  "mobile",
  "phone",
  "smartphone",
  "responsive",
  "small-screen",
];

const DESKTOP_KEYWORDS = [
  "desktop",
  "hero",
  "banner",
  "wide",
  "landing",
  "header",
];

const PDF_KEYWORDS = [
  "pdf",
  "reference",
  "final",
  "resource",
  "document",
  "whitepaper",
  "case-study",
];

const DOC_KEYWORDS = [
  "doc",
  "docx",
  "notes",
  "brief",
  "summary",
  "metadata",
  "research",
  "guide",
  "content",
];

const IMAGE_KEYWORDS = [
  "image",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "illustration",
  "diagram",
  "asset",
  "visual",
];

function normalizeName(name: string): string {
  return name.toLowerCase();
}

function getImageVariantConfig(assetType: DriveAsset["type"], fileName: string, insightTitle?: string | null, authorName?: string | null) {
  const lower = normalizeName(fileName);

  // derive a topic slug: prefer insightTitle, fall back to file base name
  let baseCandidateRaw = (insightTitle && typeof insightTitle === "string" && insightTitle.trim())
    ? insightTitle
    : fileName.replace(/\.[^.]+$/, "");

  // strip common wrappers and separators
  baseCandidateRaw = baseCandidateRaw
    .replace(/^\s*(meta\s+tags\s+for[:\-\s]*)/i, "")
    .replace(/[:|\-]{1,2}\s*the\b.*/i, "")
    .replace(/\bby\s+[A-Za-z\s\.-]{2,80}$/i, "")
    .replace(/\b\d{4}\b/g, "")
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b\s*\d{1,2}/i, "")
    .trim();

  // take first 8 words to avoid very long marketing tails
  const shortWords = baseCandidateRaw.split(/[^\p{L}0-9]+/u).filter(Boolean).slice(0, 8).join(" ");
  const topic = slugify(shortWords || baseCandidateRaw || fileName.replace(/\.[^.]+$/, "")) || "asset";

  // Open Graph detection
  if (/opengraph|og-image|open-graph|\bog\b/.test(lower)) {
    return {
      convertedFormat: "webp" as const,
      convertedDimensions: "1200x630",
      outputLabel: "Open Graph image",
      targetFileName: `${topic}-og.webp`,
    };
  }

  // Featured / thumbnail
  if (/featured|feature|thumbnail|cover/.test(lower)) {
    return {
      convertedFormat: "webp" as const,
      convertedDimensions: "760x480",
      outputLabel: "Featured image",
      targetFileName: `${topic}-fb.webp`,
    };
  }

  if (assetType === "desktopBanner") {
    return {
      convertedFormat: "webp" as const,
      convertedDimensions: "1440x500",
      outputLabel: "Desktop banner",
      targetFileName: `${topic}-db.webp`,
    };
  }

  if (assetType === "mobileBanner") {
    return {
      convertedFormat: "webp" as const,
      convertedDimensions: "750x1050",
      outputLabel: "Mobile banner",
      targetFileName: `${topic}-mb.webp`,
    };
  }

  if (/author|profile|bio|about|person/.test(lower)) {
    const authorSlug = slugify(authorName || fileName.replace(/\.[^.]+$/, "")) || "author";
    return {
      convertedFormat: "webp" as const,
      convertedDimensions: "500x500",
      outputLabel: "Author image",
      targetFileName: `${authorSlug}-author.webp`,
    };
  }

  // Default content/infographic image
  return {
    convertedFormat: "webp" as const,
    convertedDimensions: "500xauto",
    outputLabel: "Inner image",
    targetFileName: `${topic}-ib-1.webp`,
  };
}

function deriveInsightTitle(assetName: string): string | null {
  const normalized = assetName.replace(/\.[^.]+$/, "").replace(/[\-_]+/g, " ").trim();

  const patterns = [
    /(?:insight|article|story|feature|blog|post)\s*[:\-]?\s*(.+)$/i,
    /(?:title|heading)\s*[:\-]?\s*(.+)$/i,
    /(?:about|profile|author)\s*[:\-]?\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
  }

  if (/insight/i.test(normalized) || /article/i.test(normalized) || /story/i.test(normalized)) {
    return normalized;
  }

  return null;
}

function classifyAsset(fileName: string): {
  type: DriveAsset["type"];
  match: string;
  confidence: number;
} {
  const lower = normalizeName(fileName);

  if (/featured|feature|opengraph|og-image/i.test(lower)) {
    return { type: "desktopBanner", match: "Featured banner detected", confidence: 95 };
  }

  if (/author|profile|bio|about|person/.test(lower)) {
    return { type: "other", match: "Author asset detected", confidence: 92 };
  }

  if (/\.pdf($|\?)/i.test(fileName) || /pdf/.test(lower)) {
    return { type: "pdf", match: "Reference PDF detected", confidence: 98 };
  }

  if (/\.docx?($|\?)/i.test(fileName) || /docx?|notes|brief|summary|metadata|guide/.test(lower)) {
    return { type: "doc", match: "Support document detected", confidence: 90 };
  }

  if (/mobile|phone|smartphone|responsive/.test(lower)) {
    return { type: "mobileBanner", match: "Mobile banner detected", confidence: 94 };
  }

  if (/desktop|hero|banner|wide|header|landing/.test(lower)) {
    return { type: "desktopBanner", match: "Desktop banner detected", confidence: 96 };
  }

  if (/png|jpg|jpeg|webp|image|diagram|illustration|visual/.test(lower)) {
    return { type: "contentImage", match: "Content image detected", confidence: 89 };
  }

  return { type: "other", match: "Unclassified asset", confidence: 60 };
}

class DriveAgent {
  async validateDriveUrl(rawUrl: string) {
    return validateDriveFolder(rawUrl);
  }

  async scanDriveFolder(rawUrl: string): Promise<DriveScanResult> {
    const validation = validateDriveFolder(rawUrl);

    if (!validation.isValid || !validation.folderId) {
      return {
        valid: false,
        folderId: null,
        normalizedUrl: validation.normalizedUrl,
        message: validation.message,
        assets: [],
        categories: {
          desktopBanner: [],
          mobileBanner: [],
          contentImage: [],
          doc: [],
          pdf: [],
          other: [],
          featuredAndOpenGraph: [],
        },
      };
    }

    const baseResult = await scanDriveFolder(rawUrl);

    // Analyze all PDFs in the folder and pick the best candidate as the reference PDF
    let pdfInfo: Awaited<ReturnType<typeof analyzePdfBuffer>> | null = null;
    try {
      const pdfAssets = baseResult.assets.filter((a) => a.type === "pdf");
      let bestScore = 0;
      for (const p of pdfAssets) {
        if (!p.downloadUrl) continue;
        try {
          const buf = await downloadPdfBuffer(p.downloadUrl, p.fileId);
          if (!buf) continue;
          const info = await analyzePdfBuffer(buf).catch(() => null);
          if (!info || !info.success) continue;
          const score = (info.pageCount || 0) + (info.sections?.length || 0) * 3 + (info.figures?.length || 0) * 2 + (info.title ? 5 : 0);
          if (score > bestScore) {
            bestScore = score;
            pdfInfo = info;
          }
        } catch {
          continue;
        }
      }
    } catch {
      pdfInfo = null;
    }

    // derive a single topic slug to use for SEO filenames across variants
    const inferredTitleFromAssets = baseResult.assets
      .map((a) => deriveInsightTitle(a.name))
      .find((v): v is string => Boolean(v));
    const folderTopicSlug = slugify((pdfInfo?.title ?? inferredTitleFromAssets ?? baseResult.folderId ?? baseResult.normalizedUrl ?? "asset").replace(/\.[^.]+$/, "")).slice(0, 60) || "asset";

    const assets: DriveAsset[] = baseResult.assets.map((asset: DriveAsset) => {
      const classification = classifyAsset(asset.name);
      const imageVariant = ["contentImage", "desktopBanner", "mobileBanner", "other"].includes(classification.type)
        ? getImageVariantConfig(classification.type, asset.name, folderTopicSlug, pdfInfo?.authorName ?? null)
        : undefined;

      const enriched: DriveAsset = {
        ...asset,
        type: classification.type,
        confidence: classification.confidence,
        match: classification.match,
        name: asset.name,
      };

      if (imageVariant) {
        enriched.convertedFormat = imageVariant.convertedFormat;
        enriched.convertedDimensions = imageVariant.convertedDimensions;
        enriched.outputLabel = imageVariant.outputLabel;
        enriched.targetFileName = imageVariant.targetFileName;
      }

      if (/author|profile|bio|about|person/.test(normalizeName(asset.name))) {
        enriched.authorName = pdfInfo?.authorName ?? "Author";
        enriched.displayLabel = "Author profile image";
      }

      return enriched;
    });

    // If PDF analysis provided figure captions, try to name inline images using those captions
    if (pdfInfo && Array.isArray(pdfInfo.figures) && pdfInfo.figures.length > 0) {
      const contentImages = assets.filter((a) => a.type === "contentImage");
      for (let i = 0; i < contentImages.length; i++) {
        const a = contentImages[i];
        if (!a) continue;
        const fig = pdfInfo.figures[i];
        if (fig && a.convertedFormat) {
          const figSlug = slugify(fig.caption || `image-${i + 1}`);
          a.targetFileName = `${folderTopicSlug}-ib-${i + 1}.webp`;
          a.outputLabel = a.outputLabel ?? "Inner image";
        }
      }
    }

    // Ensure any remaining image assets have a clean SEO-friendly fallback name
    const ibCounters = new Map<string, number>();
    for (const asset of assets) {
      if (asset.convertedFormat && asset.mimeType && asset.mimeType.startsWith("image/")) {
        if (!asset.targetFileName) {
          // Use the folder-wide topic slug for consistent naming across variants
          const topic = folderTopicSlug;
          switch (asset.type) {
            case "desktopBanner":
              asset.targetFileName = `${topic}-db.webp`;
              break;
            case "mobileBanner":
              asset.targetFileName = `${topic}-mb.webp`;
              break;
            case "contentImage":
              // increment per-topic counter for infographics
              const current = ibCounters.get(topic) ?? 0;
              const next = current + 1;
              ibCounters.set(topic, next);
              asset.targetFileName = `${topic}-ib-${next}.webp`;
              break;
            default:
              asset.targetFileName = `${topic}.webp`;
          }
        }
      }
    }

    // Convert image assets or provide on-demand proxy URLs depending on STORE_ASSETS
    const storeAssets = process.env.STORE_ASSETS !== "false";

    if (storeAssets) {
      await Promise.all(assets.map(async (asset) => {
        if (asset.convertedFormat && asset.targetFileName && asset.downloadUrl && asset.mimeType && asset.mimeType.startsWith("image/")) {
          try {
            const localUrl = await ensureConvertedImage(asset.downloadUrl, asset.targetFileName, asset.convertedDimensions);
            asset.previewUrl = localUrl;
            asset.downloadUrl = localUrl;
          } catch {
            // leave original URLs on failure
          }
        }
      }));
    } else {
      const serverBase = process.env.SERVER_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
      for (const asset of assets) {
        if (asset.convertedFormat && asset.targetFileName && asset.downloadUrl && asset.mimeType && asset.mimeType.startsWith("image/")) {
          const proxyUrl = `${serverBase}/api/insights/asset?url=${encodeURIComponent(asset.downloadUrl)}&dims=${encodeURIComponent(asset.convertedDimensions ?? "")}`;
          asset.previewUrl = proxyUrl;
          asset.downloadUrl = proxyUrl;
        }
      }
    }

    // Update asset metadata so frontend shows converted files directly
    for (const asset of assets) {
      if (asset.targetFileName && asset.convertedFormat === "webp" && asset.mimeType && asset.mimeType.startsWith("image/")) {
        asset.name = asset.targetFileName;
        asset.mimeType = "image/webp";
      }
    }

      // Determine aspect ratios for image assets (used by placement heuristics)
      const imageAssets = assets.filter((a) => a.mimeType?.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(a.name));
      await Promise.all(imageAssets.map(async (asset) => {
        try {
          const url = asset.downloadUrl ?? asset.previewUrl ?? asset.sourceUrl ?? "";
          if (!url) return;
          const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 5000 }).catch(() => null);
          if (!resp?.data) return;
          const buf = Buffer.from(resp.data);
          const meta = await sharp(buf).metadata().catch(() => null);
          if (meta && typeof meta.width === "number" && typeof meta.height === "number" && meta.height > 0) {
            asset.aspectRatio = +(meta.width / meta.height);
          }
        } catch {
          // ignore errors — aspectRatio is optional
        }
      }));

      // Run placement heuristics to classify images relative to the chosen reference PDF
      try {
        const placed = assignAssetPlacements(assets, pdfInfo ?? null);
        if (Array.isArray(placed) && placed.length > 0) {
          // replace assets with enriched placements
          assets.splice(0, assets.length, ...placed);
        }
      } catch {
        // ignore placement failures
      }

    const authorImage = assets.find((asset) => /author|profile|bio|about|person/.test(normalizeName(asset.name))) ?? null;
    const authorDescription = assets.find((asset) => /author|profile|bio|about|description/.test(normalizeName(asset.name)) && (asset.type === "doc" || asset.type === "pdf")) ?? null;
    const insightTitle = pdfInfo?.title ??
      assets
        .filter((asset) => asset.type === "doc" || asset.type === "pdf")
        .map((asset) => deriveInsightTitle(asset.name))
        .find((value): value is string => Boolean(value)) ?? null;
    // Build featured & open-graph combined container
    const featured = assets.filter((a) => /featured|feature|thumbnail|cover/i.test(a.name) || a.outputLabel === "Featured image");
    const og = assets.filter((a) => /opengraph|og-image|open-graph|\bog\b/i.test(a.name) || a.outputLabel === "Open Graph image");
    let featuredAndOpenGraph = Array.from(new Set([...featured, ...og]));
    if (featuredAndOpenGraph.length === 0) {
      // fallback: prefer desktopBanner then contentImage
      const pick = assets.find((a) => a.type === "desktopBanner") ?? assets.find((a) => a.type === "contentImage");
      if (pick) featuredAndOpenGraph = [pick];
    }

    return {
      ...baseResult,
      assets,
      authorImage,
      authorDescription,
      ...(insightTitle ? { insightTitle } : {}),
      categories: {
        desktopBanner: assets.filter((asset) => asset.type === "desktopBanner"),
        mobileBanner: assets.filter((asset) => asset.type === "mobileBanner"),
        contentImage: assets.filter((asset) => asset.type === "contentImage"),
        doc: assets.filter((asset) => asset.type === "doc"),
        pdf: assets.filter((asset) => asset.type === "pdf"),
        other: assets.filter((asset) => asset.type === "other"),
        featuredAndOpenGraph,
      },
    };
  }
}

export const driveAgent = new DriveAgent();
