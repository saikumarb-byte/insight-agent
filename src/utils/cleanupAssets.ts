import fs from "fs";
import path from "path";

async function cleanup() {
  const assetsDir = path.join(process.cwd(), "public", "assets");
  try {
    const files = await fs.promises.readdir(assetsDir);
    for (const file of files) {
      const filePath = path.join(assetsDir, file);
      const stat = await fs.promises.stat(filePath);
      if (stat.isFile()) {
        // only remove common image extensions we may have created
        if (/\.(webp|png|jpg|jpeg)$/i.test(file)) {
          await fs.promises.unlink(filePath).catch(() => null);
        }
      }
    }
    console.log("Cleanup complete: removed assets in public/assets");
  } catch (err: any) {
    const msg = err && typeof err === "object" && "message" in err ? (err as any).message : String(err);
    console.error("Cleanup failed:", msg);
    process.exitCode = 1;
  }
}

cleanup();
