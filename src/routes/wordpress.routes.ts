import { Router, type Request, type Response } from "express";
import wordpressClient from "../wordpress/wordpress.client.js";

const router = Router();

router.get("/health", async (req: Request, res: Response) => {
  try {
    const result = await wordpressClient.healthCheck();

    res.json(result);
  } catch (error: any) {
    console.error(
      "WordPress connection failed:",
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      message: "WordPress connection failed",
      error: error.response?.data || error.message,
    });
  }
});

router.get("/posts", async (req: Request, res: Response) => {
  try {
    const posts = await wordpressClient.getPosts();

    res.json({
      success: true,
      posts,
    });
  } catch (error: any) {
    console.error(
      "Failed to fetch WordPress posts:",
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch WordPress posts",
      error: error.response?.data || error.message,
    });
  }
});


router.get("/post-types", async (req: Request, res: Response) => {
  try {
    const postTypes = await wordpressClient.getPostTypes();

    res.json({
      success: true,
      postTypes,
    });
  } catch (error: any) {
    console.error(
      "Failed to fetch WordPress post types:",
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch WordPress post types",
      error: error.response?.data || error.message,
    });
  }
});

router.get("/api-root", async (req: Request, res: Response) => {
  try {
    const apiRoot = await wordpressClient.getApiRoot();

    res.json({
      success: true,
      apiRoot,
    });
  } catch (error: any) {
    console.error(
      "Failed to fetch WordPress API root:",
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch WordPress API root",
      error: error.response?.data || error.message,
    });
  }
});
export default router;
