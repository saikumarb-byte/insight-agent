import axios from "axios";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const assetsDir = path.join(process.cwd(), "public", "assets");
const serverBase = process.env.SERVER_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

async function ensureDir(dir: string) {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch (err) {
    // ignore
  }
}

function parseDimensions(dim?: string): { width?: number; height?: number } {
  if (!dim) return {};
  const parts = dim.split("x");
  if (parts.length !== 2) return {};
  const wRaw = parts[0] === "auto" ? undefined : Number(parts[0]);
  const hRaw = parts[1] === "auto" ? undefined : Number(parts[1]);
  const parsed: { width?: number; height?: number } = {};
  if (typeof wRaw === "number" && !Number.isNaN(wRaw) && wRaw > 0) parsed.width = wRaw;
  if (typeof hRaw === "number" && !Number.isNaN(hRaw) && hRaw > 0) parsed.height = hRaw;
  return parsed;
}

export async function ensureConvertedImage(sourceUrl: string, targetFileName: string, dimensions?: string, forceUpscale = true): Promise<string> {
  await ensureDir(assetsDir);

  const outPath = path.join(assetsDir, targetFileName);
  const publicPath = `${serverBase}/assets/${encodeURIComponent(targetFileName)}`;

  try {
    // Skip if file already exists
    const stat = await fs.promises.stat(outPath).catch(() => null);
    if (stat && stat.isFile()) {
      return publicPath;
    }

    const resp = await axios.get(sourceUrl, { responseType: "arraybuffer" });
    const buffer = Buffer.from(resp.data);

    const dims = parseDimensions(dimensions);
    let img = sharp(buffer).rotate();

    // Determine metadata to decide whether upscaling is needed
    const meta = await img.metadata().catch(() => ({} as any));
    const origW = typeof meta.width === "number" ? meta.width : undefined;
    const origH = typeof meta.height === "number" ? meta.height : undefined;

    const shouldResize = Boolean(dims.width || dims.height);
    if (shouldResize) {
      const wantW: number | null = typeof dims.width === "number" ? dims.width : null;
      const wantH: number | null = typeof dims.height === "number" ? dims.height : null;
      const needUpscale =
        forceUpscale &&
        ((typeof wantW === "number" && typeof origW === "number" && wantW > origW) ||
          (typeof wantH === "number" && typeof origH === "number" && wantH > origH));

      img = img.resize(wantW, wantH, {
        fit: typeof wantW === "number" && typeof wantH === "number" ? "cover" : "inside",
        withoutEnlargement: !needUpscale,
      });
    }

    await img.webp({ quality: 80 }).toFile(outPath);

    return publicPath;
  } catch (err) {
    // On failure, return original source URL
    return sourceUrl;
  }
}
