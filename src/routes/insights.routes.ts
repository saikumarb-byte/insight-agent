import { Router, type Request, type Response } from "express";
import { insightAgent } from "../agents/insight.agent.js";
import { driveAgent } from "../agents/drive.agent.js";

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

export default router;
