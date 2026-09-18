import axios from "axios";
import type { AssetCategoryMap, AssetType, DriveAsset, DriveScanResult, DriveValidationResult } from "./drive.types.js";

const emptyCategories: AssetCategoryMap = {
  desktopBanner: [],
  mobileBanner: [],
  contentImage: [],
  doc: [],
  pdf: [],
  other: [],
  featuredAndOpenGraph: [],
};

function normalizeDriveId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  const directMatch = trimmed.match(/(?:\/d\/|id=)([A-Za-z0-9_-]{10,})/i);
  const folderMatch = trimmed.match(/(?:\/folders\/|id=)([A-Za-z0-9_-]{10,})/i);

  return directMatch?.[1] ?? folderMatch?.[1] ?? null;
}

function buildDrivePreviewUrl(fileId: string, fileName: string, mimeType?: string): string {
  const lower = fileName.toLowerCase();

  if (/\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(fileName) || mimeType?.startsWith("image/")) {
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  if (/\.(pdf)$/i.test(fileName) || mimeType === "application/pdf") {
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }

  if (/\.(doc|docx|ppt|pptx|xls|xlsx|odt|rtf)$/i.test(fileName) || mimeType?.includes("document") || mimeType?.includes("officedocument")) {
    return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${fileId}`)}`;
  }

  return `https://drive.google.com/file/d/${fileId}/view`;
}

function classifyAssetKind(fileName: string): AssetType {
  const lower = fileName.toLowerCase();

  if (/desktop|hero|banner|wide|header|landing/.test(lower)) return "desktopBanner";
  if (/mobile|phone|smartphone|responsive/.test(lower)) return "mobileBanner";
  if (/pdf|reference|final|resource/.test(lower)) return "pdf";
  if (/docx?|notes|brief|summary|metadata|guide/.test(lower)) return "doc";
  if (/png|jpg|jpeg|webp|gif|image|diagram|illustration|visual/.test(lower)) return "contentImage";

  return "other";
}

function mapDriveAsset(file: Partial<DriveAsset> & { id?: string; name?: string; mimeType?: string; fileId?: string; webViewLink?: string; webContentLink?: string; size?: string; folder?: string }): DriveAsset {
  const fileName = file.name ?? "untitled";
  const fileId = file.fileId ?? file.id ?? "";
  const assetType = classifyAssetKind(fileName);

  const previewUrl = file.previewUrl ?? (fileId ? buildDrivePreviewUrl(fileId, fileName, file.mimeType) : "");
  const downloadUrl = file.downloadUrl ?? (fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : "");

  return {
    id: file.id ?? file.fileId ?? `asset-${Math.random().toString(16).slice(2)}`,
    name: fileName,
    size: file.size ?? "Unknown size",
    type: assetType,
    folder: file.folder ?? "/drive",
    confidence: 90,
    match: "Drive asset detected",
    sourceUrl: file.sourceUrl ?? "",
    fileId,
    mimeType: file.mimeType ?? "",
    previewUrl,
    downloadUrl,
  };
}

const sampleAssets: DriveAsset[] = [
  {
    id: "desktop-banner-hero",
    name: "desktop-banner-hero.webp",
    size: "1.4 MB",
    type: "desktopBanner",
    folder: "/insights/2026/q4",
    confidence: 96,
    match: "Primary hero banner",
    fileId: "desktop-banner-hero",
    mimeType: "image/webp",
    previewUrl: "https://drive.google.com/uc?export=view&id=desktop-banner-hero",
    downloadUrl: "https://drive.google.com/uc?export=download&id=desktop-banner-hero",
    convertedFormat: "webp",
    convertedDimensions: "1440x500",
    outputLabel: "Desktop banner",
    targetFileName: "desktop-banner-hero-db.webp",
  },
  {
    id: "mobile-banner-hero",
    name: "mobile-banner-hero.png",
    size: "820 KB",
    type: "mobileBanner",
    folder: "/insights/2026/q4",
    confidence: 94,
    match: "Mobile hero image",
    fileId: "mobile-banner-hero",
    mimeType: "image/png",
    previewUrl: "https://drive.google.com/uc?export=view&id=mobile-banner-hero",
    downloadUrl: "https://drive.google.com/uc?export=download&id=mobile-banner-hero",
    convertedFormat: "webp",
    convertedDimensions: "750x1050",
    outputLabel: "Mobile banner",
    targetFileName: "mobile-banner-hero-mb.webp",
  },
  {
    id: "featured-article-thumbnail",
    name: "featured-article-thumbnail.jpg",
    size: "520 KB",
    type: "contentImage",
    folder: "/insights/2026/q4/featured",
    confidence: 92,
    match: "Featured thumbnail image",
    fileId: "featured-article-thumbnail",
    mimeType: "image/jpeg",
    previewUrl: "https://drive.google.com/uc?export=view&id=featured-article-thumbnail",
    downloadUrl: "https://drive.google.com/uc?export=download&id=featured-article-thumbnail",
    convertedFormat: "webp",
    convertedDimensions: "760x480",
    outputLabel: "Thumbnail image",
    targetFileName: "featured-article-thumbnail-fb.webp",
  },
  {
    id: "automation-workflow",
    name: "automation-workflow.png",
    size: "950 KB",
    type: "contentImage",
    folder: "/insights/2026/q4/section-1",
    confidence: 91,
    match: "Section 1 visual",
    fileId: "automation-workflow",
    mimeType: "image/png",
    previewUrl: "https://drive.google.com/uc?export=view&id=automation-workflow",
    downloadUrl: "https://drive.google.com/uc?export=download&id=automation-workflow",
    convertedFormat: "webp",
    convertedDimensions: "500xauto",
    outputLabel: "Inner image",
    targetFileName: "automation-workflow-ib-1.webp",
  },
  {
    id: "architecture-diagram",
    name: "architecture-diagram.png",
    size: "1.1 MB",
    type: "contentImage",
    folder: "/insights/2026/q4/section-2",
    confidence: 88,
    match: "Diagram reference image",
    fileId: "architecture-diagram",
    mimeType: "image/png",
    previewUrl: "https://drive.google.com/uc?export=view&id=architecture-diagram",
    downloadUrl: "https://drive.google.com/uc?export=download&id=architecture-diagram",
    convertedFormat: "webp",
    convertedDimensions: "500xauto",
    outputLabel: "Inner image",
    targetFileName: "architecture-diagram-ib-1.webp",
  },
  {
    id: "resource-source",
    name: "resource-source.docx",
    size: "2.8 MB",
    type: "doc",
    folder: "/insights/2026/q4/documents",
    confidence: 90,
    match: "Source document",
    fileId: "resource-source",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    previewUrl: "https://docs.google.com/gview?embedded=true&url=https%3A%2F%2Fdrive.google.com%2Fuc%3Fexport%3Ddownload%26id%3Dresource-source",
    downloadUrl: "https://drive.google.com/uc?export=download&id=resource-source",
  },
  {
    id: "insight-final",
    name: "insight-final.pdf",
    size: "4.6 MB",
    type: "pdf",
    folder: "/insights/2026/q4/pdf",
    confidence: 98,
    match: "Selected Insight PDF",
    fileId: "insight-final",
    mimeType: "application/pdf",
    previewUrl: "https://drive.google.com/file/d/insight-final/preview",
    downloadUrl: "https://drive.google.com/uc?export=download&id=insight-final",
  },
  {
    id: "author-portrait",
    name: "author-portrait.jpg",
    size: "420 KB",
    type: "other",
    folder: "/insights/2026/q4/author",
    confidence: 87,
    match: "Author image",
    convertedFormat: "webp",
    convertedDimensions: "500x500",
    outputLabel: "Author image",
    targetFileName: "author-portrait-author.webp",
    fileId: "author-portrait",
    mimeType: "image/jpeg",
    previewUrl: "https://drive.google.com/uc?export=view&id=author-portrait",
    downloadUrl: "https://drive.google.com/uc?export=download&id=author-portrait",
    authorName: "Author",
    displayLabel: "Author profile image",
  },
];

export function validateDriveFolder(rawUrl: string): DriveValidationResult {
  if (!rawUrl || !rawUrl.trim()) {
    return {
      isValid: false,
      folderId: null,
      normalizedUrl: "",
      message: "Drive folder URL is required.",
    };
  }

  const trimmed = rawUrl.trim();
  const normalized = trimmed.replace(/\/view\?usp=sharing$/, "").replace(/\/preview$/, "");
  const folderMatch = normalized.match(/(?:\/folders\/|id=)([A-Za-z0-9_-]{10,})/i);
  const fileMatch = normalized.match(/\/d\/([A-Za-z0-9_-]{10,})/i);

  if (!folderMatch && !fileMatch) {
    return {
      isValid: false,
      folderId: null,
      normalizedUrl: trimmed,
      message: "The provided value is not a valid Google Drive folder or file URL.",
    };
  }

  const id = folderMatch?.[1] ?? fileMatch?.[1] ?? null;

  return {
    isValid: true,
    folderId: id,
    normalizedUrl: folderMatch ? `https://drive.google.com/drive/folders/${id}` : `https://drive.google.com/file/d/${id}/view`,
    message: "Drive folder validated successfully.",
  };
}

export async function fetchGoogleDriveFolderAssets(rawUrl: string): Promise<DriveAsset[]> {
  const driveId = normalizeDriveId(rawUrl);
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!driveId) {
    return [];
  }

  if (!apiKey) {
    return [];
  }

  try {
    const response = await axios.get("https://www.googleapis.com/drive/v3/files", {
      params: {
        q: `'${driveId}' in parents`,
        fields: "files(id,name,mimeType,size,webViewLink,webContentLink)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        key: apiKey,
      },
    });

    const files = Array.isArray(response.data?.files) ? response.data.files : [];
    return files.map((file: any) => mapDriveAsset({
      id: file.id,
      name: file.name,
      size: file.size ?? "Unknown size",
      mimeType: file.mimeType,
      fileId: file.id,
      sourceUrl: rawUrl,
      folder: rawUrl,
      previewUrl: buildDrivePreviewUrl(file.id, file.name, file.mimeType),
      downloadUrl: file.webContentLink ?? `https://drive.google.com/uc?export=download&id=${file.id}`,
    }));
  } catch {
    return [];
  }
}

export function buildAssetCategories(assets: DriveAsset[]): AssetCategoryMap {
  const categories = structuredClone(emptyCategories);

  for (const asset of assets) {
    categories[asset.type].push(asset);
  }

  return categories;
}

export async function scanDriveFolder(rawUrl: string): Promise<DriveScanResult> {
  const validation = validateDriveFolder(rawUrl);

  if (!validation.isValid) {
    return {
      valid: false,
      folderId: null,
      normalizedUrl: validation.normalizedUrl,
      message: validation.message,
      assets: [],
      categories: emptyCategories,
    };
  }

  const assets = await fetchGoogleDriveFolderAssets(rawUrl);
  const hasDriveApiKey = Boolean(process.env.GOOGLE_DRIVE_API_KEY ?? process.env.GOOGLE_API_KEY);

  const result: DriveScanResult = {
    valid: true,
    folderId: validation.folderId,
    normalizedUrl: validation.normalizedUrl,
    message: hasDriveApiKey
      ? (assets.length > 0
        ? "Drive folder scanned successfully."
        : "This Google Drive folder URL is valid syntactically, but the folder is not publicly accessible or it does not contain files that the Drive API can list.")
      : "Google Drive API key is missing. Set GOOGLE_DRIVE_API_KEY in the backend .env file to load real Drive assets.",
    assets,
    categories: buildAssetCategories(assets),
  };

  return result;
}

export type { AssetType };
