export type AssetType =
  | "desktopBanner"
  | "mobileBanner"
  | "contentImage"
  | "doc"
  | "pdf"
  | "other";

export interface DriveAsset {
  id: string;
  name: string;
  size: string;
  type: AssetType;
  folder: string;
  confidence: number;
  match: string;
  sourceUrl?: string;
  fileId?: string;
  mimeType?: string;
  previewUrl?: string;
  downloadUrl?: string;
  convertedFormat?: "webp";
  convertedDimensions?: string;
  outputLabel?: string;
  targetFileName?: string;
  authorName?: string;
  displayLabel?: string;
}

export type AssetCategoryMap = Record<AssetType, DriveAsset[]>;

export interface DriveValidationResult {
  isValid: boolean;
  folderId: string | null;
  normalizedUrl: string;
  message: string;
}

export interface DriveScanResult {
  valid: boolean;
  folderId: string | null;
  normalizedUrl: string;
  message: string;
  assets: DriveAsset[];
  categories: AssetCategoryMap;
  insightTitle?: string;
  authorName?: string;
  authorImage?: DriveAsset | null;
  authorDescription?: DriveAsset | null;
}
