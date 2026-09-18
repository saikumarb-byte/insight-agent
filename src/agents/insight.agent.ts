import { driveAgent } from "./drive.agent.js";
import type { DriveScanResult } from "../google-drive/drive.types.js";

class InsightAgent {
  async analyzeDriveUrl(rawUrl: string): Promise<DriveScanResult> {
    const result = await driveAgent.scanDriveFolder(rawUrl);

    return {
      ...result,
      assets: result.assets.map((asset) => ({
        ...asset,
        name: asset.name,
      })),
      categories: {
        desktopBanner: result.categories.desktopBanner.map((asset) => ({ ...asset, name: asset.name })),
        mobileBanner: result.categories.mobileBanner.map((asset) => ({ ...asset, name: asset.name })),
        contentImage: result.categories.contentImage.map((asset) => ({ ...asset, name: asset.name })),
        doc: result.categories.doc.map((asset) => ({ ...asset, name: asset.name })),
        pdf: result.categories.pdf.map((asset) => ({ ...asset, name: asset.name })),
        other: result.categories.other.map((asset) => ({ ...asset, name: asset.name })),
        featuredAndOpenGraph: result.categories.featuredAndOpenGraph?.map((asset) => ({ ...asset, name: asset.name })) ?? [],
      },
    };
  }
}

export const insightAgent = new InsightAgent();
