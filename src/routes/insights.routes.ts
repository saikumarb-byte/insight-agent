import { Router, type Request, type Response } from "express";
import { insightAgent } from "../agents/insight.agent.js";
import { driveAgent } from "../agents/drive.agent.js";
import axios from "axios";
import sharp from "sharp";

// Simple in-memory LRU-like cache for small converted images
const imageCache = new Map<string, Buffer>();
const MAX_CACHE_ENTRIES = 200;

function cacheGet(key: string): Buffer | undefined {
  const v = imageCache.get(key);
  if (!v) return undefined;
  // refresh order
  imageCache.delete(key);
  imageCache.set(key, v);
  return v;
}

function cacheSet(key: string, buf: Buffer) {
  if (imageCache.size >= MAX_CACHE_ENTRIES) {
    // evict oldest
    const firstKey = imageCache.keys().next().value;
    if (firstKey) imageCache.delete(firstKey);
  }
  imageCache.set(key, buf);
}

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Insight agent backend is running.",
  });
});

router.post("/validate-drive", async (req: Request, res: Response) => {
  try {
    const { driveUrl, folderUrl } = req.body ?? {};
    const rawUrl = typeof driveUrl === "string" ? driveUrl : folderUrl;

    if (!rawUrl) {
      res.status(400).json({
        success: false,
        message: "Drive folder URL is required.",
      });
      return;
    }

    const validation = await driveAgent.validateDriveUrl(rawUrl);

    res.json({
      success: validation.isValid,
      data: validation,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Drive validation failed.",
    });
  }
});

router.post("/scan-drive", async (req: Request, res: Response) => {
  try {
    const { driveUrl, folderUrl } = req.body ?? {};
    const rawUrl = typeof driveUrl === "string" ? driveUrl : folderUrl;

    if (!rawUrl) {
      res.status(400).json({
        success: false,
        message: "Drive folder URL is required.",
      });
      return;
    }

    const result = await insightAgent.analyzeDriveUrl(rawUrl);

    if (!result.valid) {
      res.status(400).json({
        success: false,
        message: result.message,
        data: result,
      });
      return;
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Drive scanning failed.",
    });
  }
});

// On-demand conversion proxy: streams converted WebP without storing to disk
router.get("/asset", async (req: Request, res: Response) => {
  try {
    const url = typeof req.query.url === "string" ? req.query.url : undefined;
    const dims = typeof req.query.dims === "string" ? req.query.dims : undefined;
    if (!url) {
      res.status(400).send("Missing url parameter");
      return;
    }

    // basic allowlist: only allow drive/googleusercontent/googleapis domains
    if (!/^https:\/\/(drive\.google\.com|lh3\.googleusercontent\.com|www\.googleapis\.com|docs\.googleusercontent\.com|dl\.googleusercontent\.com)/i.test(url)) {
      res.status(403).send("URL host not allowed");
      return;
    }

    const key = `${url}|${dims ?? ""}`;
    const cached = cacheGet(key);
    if (cached) {
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(cached);
      return;
    }

    const response = await axios.get(url, { responseType: "arraybuffer" });
    const input = Buffer.from(response.data);

    let transformer = sharp(input).rotate();
    if (dims) {
      const parts = dims.split("x");
      const w = parts[0] === "" || parts[0] === "auto" ? null : Number(parts[0]);
      const h = parts[1] === "" || parts[1] === "auto" ? null : Number(parts[1]);
      transformer = transformer.resize(w || undefined, h || undefined, { fit: w && h ? "cover" : "inside", withoutEnlargement: true });
    }

    const out = await transformer.webp({ quality: 80 }).toBuffer();
    cacheSet(key, out);

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(out);
  } catch (err: any) {
    res.status(500).send("Asset conversion failed");
  }
});

export default router;
