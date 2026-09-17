import {
  scanDriveFolder,
  validateDriveFolder,
} from "../google-drive/drive.service.js";
import type { DriveAsset, DriveScanResult } from "../google-drive/drive.types.js";
import { ensureConvertedImage } from "../utils/image.processor.js";
import { slugify } from "../utils/slugify.js";

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

function getImageVariantConfig(assetType: DriveAsset["type"], fileName: string) {
  const lower = normalizeName(fileName);

  if (/featured|feature|opengraph|og-image/.test(lower)) {
    return {
      convertedFormat: "webp" as const,
      convertedDimensions: "760x480",
      outputLabel: "Featured image",
      targetFileName: fileName.replace(/\.[^.]+$/, ".webp"),
    };
  }

  if (assetType === "desktopBanner") {
    return {
      convertedFormat: "webp" as const,
      convertedDimensions: "1440x500",
      outputLabel: "Desktop banner",
      targetFileName: fileName.replace(/\.[^.]+$/, ".webp"),
    };
  }

  if (assetType === "mobileBanner") {
    return {
      convertedFormat: "webp" as const,
      convertedDimensions: "750x1050",
      outputLabel: "Mobile banner",
      targetFileName: fileName.replace(/\.[^.]+$/, ".webp"),
    };
  }

  if (/author|profile|bio|about|person/.test(lower)) {
    return {
      convertedFormat: "webp" as const,
      convertedDimensions: "500x500",
      outputLabel: "Author image",
      targetFileName: fileName.replace(/\.[^.]+$/, ".webp"),
    };
  }

  if (/thumbnail|featured|cover/.test(lower)) {
    return {
      convertedFormat: "webp" as const,
      convertedDimensions: "760x480",
      outputLabel: "Thumbnail image",
      targetFileName: fileName.replace(/\.[^.]+$/, ".webp"),
    };
  }

  return {
    convertedFormat: "webp" as const,
    convertedDimensions: "500xauto",
    outputLabel: "Inner image",
    targetFileName: fileName.replace(/\.[^.]+$/, ".webp"),
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
        },
      };
    }

    const baseResult = await scanDriveFolder(rawUrl);
    const assets: DriveAsset[] = baseResult.assets.map((asset: DriveAsset) => {
      const classification = classifyAsset(asset.name);
      const imageVariant = ["contentImage", "desktopBanner", "mobileBanner", "other"].includes(classification.type)
        ? getImageVariantConfig(classification.type, asset.name)
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
        enriched.authorName = "Author";
        enriched.displayLabel = "Author profile image";
      }

      return enriched;
    });

    // Assign SEO-friendly, deterministic filenames using fileId and dimensions
    for (const asset of assets) {
      if (asset.convertedFormat && asset.mimeType && asset.mimeType.startsWith("image/")) {
        const baseName = (asset.name ?? asset.id ?? "asset").replace(/\.[^.]+$/, "");
        let slug = slugify(baseName) || "asset";
        if (slug.length > 60) slug = slug.slice(0, 60);
        const idPartRaw = (asset.fileId ?? asset.id ?? "unknown").toString();
        const shortId = idPartRaw.slice(-6).replace(/[^a-zA-Z0-9]/g, "");
        const dims = (asset.convertedDimensions ?? "orig").toString().toLowerCase().replace(/[^a-z0-9x]/g, "");
        // SEO-friendly: slug + optional short id + dims
        asset.targetFileName = `${slug}${shortId ? `-${shortId}` : ""}-${dims}.webp`;
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

    const authorImage = assets.find((asset) => /author|profile|bio|about|person/.test(normalizeName(asset.name))) ?? null;
    const authorDescription = assets.find((asset) => /author|profile|bio|about|description/.test(normalizeName(asset.name)) && (asset.type === "doc" || asset.type === "pdf")) ?? null;
    const insightTitle =
      assets
        .filter((asset) => asset.type === "doc" || asset.type === "pdf")
        .map((asset) => deriveInsightTitle(asset.name))
        .find((value): value is string => Boolean(value)) ?? null;

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
      },
    };
  }
}

export const driveAgent = new DriveAgent();
