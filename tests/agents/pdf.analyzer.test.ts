import test from "node:test";
import assert from "node:assert/strict";

import {
  assignAssetPlacements,
  analyzePdfBuffer,
  type PdfIntelligence,
} from "../../src/utils/pdf.analyzer.js";
import type { DriveAsset } from "../../src/google-drive/drive.types.js";

test("assignAssetPlacements correctly maps assets based on visual aspect ratios and PDF sections", () => {
  const mockAssets: DriveAsset[] = [
    {
      id: "img-1",
      name: "raw-unnamed-banner.png",
      size: "1.2 MB",
      type: "contentImage",
      folder: "/drive",
      confidence: 80,
      match: "raw image",
      aspectRatio: 2.88, // wide banner
      downloadUrl: "http://example.com/banner.png",
    },
    {
      id: "img-2",
      name: "vertical-display.png",
      size: "800 KB",
      type: "contentImage",
      folder: "/drive",
      confidence: 80,
      match: "raw image",
      aspectRatio: 0.71, // tall mobile
      downloadUrl: "http://example.com/mobile.png",
    },
    {
      id: "img-3",
      name: "john-doe-profile.jpg",
      size: "350 KB",
      type: "other",
      folder: "/drive",
      confidence: 80,
      match: "raw image",
      aspectRatio: 1.0, // square author
      downloadUrl: "http://example.com/author.jpg",
    },
    {
      id: "img-4",
      name: "workflow-diagram.png",
      size: "950 KB",
      type: "contentImage",
      folder: "/drive",
      confidence: 80,
      match: "diagram",
      aspectRatio: 1.4, // standard content image
      downloadUrl: "http://example.com/workflow.png",
    },
    {
      id: "img-5",
      name: "results-chart.png",
      size: "600 KB",
      type: "contentImage",
      folder: "/drive",
      confidence: 80,
      match: "chart",
      aspectRatio: 1.33,
      downloadUrl: "http://example.com/chart.png",
    },
  ];

  const mockPdfInfo: PdfIntelligence = {
    success: true,
    pageCount: 4,
    title: "The Agentic AI Enterprise in 2026",
    authorName: "John Doe",
    authorBio: "Principal AI Architect",
    sections: [
      "1. Architectural Overview",
      "2. Enterprise Deployment",
      "3. Benchmark Metrics",
    ],
    figures: [
      { label: "Figure 1", caption: "Workflow diagram", pageNumber: 2 },
      { label: "Figure 2", caption: "Results chart", pageNumber: 3 },
    ],
    metadata: {
      title: "The Agentic AI Enterprise in 2026",
      author: "John Doe",
    },
  };

  const results = assignAssetPlacements(mockAssets, mockPdfInfo);

  // 1. Check Hero Banner
  const hero = results.find((a) => a.id === "img-1");
  assert.equal(hero?.placement, "heroBanner");
  assert.equal(hero?.placementSlot, "hero");
  assert.equal(hero?.type, "desktopBanner");
  assert.equal(hero?.convertedDimensions, "1440x500");
  assert.match(hero?.placementReason || "", /aspect ratio/i);

  // 2. Check Mobile Banner
  const mobile = results.find((a) => a.id === "img-2");
  assert.equal(mobile?.placement, "mobileBanner");
  assert.equal(mobile?.placementSlot, "mobile");
  assert.equal(mobile?.type, "mobileBanner");
  assert.equal(mobile?.convertedDimensions, "750x1050");
  assert.match(mobile?.placementReason || "", /vertical aspect ratio/i);

  // 3. Check Author Portrait
  const author = results.find((a) => a.id === "img-3");
  assert.equal(author?.placement, "author");
  assert.equal(author?.placementSlot, "author");
  assert.equal(author?.convertedDimensions, "500x500");
  assert.equal(author?.authorName, "John Doe");

  // 4. Check Section Content Images
  const sec1 = results.find((a) => a.id === "img-4");
  assert.equal(sec1?.placement, "sectionContent");
  assert.equal(sec1?.placementSlot, "section-1");
  assert.match(sec1?.placementReason || "", /Architectural Overview/);

  const sec2 = results.find((a) => a.id === "img-5");
  assert.equal(sec2?.placement, "sectionContent");
  assert.equal(sec2?.placementSlot, "section-2");
  assert.match(sec2?.placementReason || "", /Enterprise Deployment/);
});

test("analyzePdfBuffer gracefully handles invalid buffers without throwing", async () => {
  const invalidBuffer = Buffer.from("not a real pdf content");
  const result = await analyzePdfBuffer(invalidBuffer);

  assert.equal(result.success, false);
  assert.equal(result.pageCount, 0);
  assert.equal(result.title, null);
  assert.deepEqual(result.sections, []);
});

test("analyzePdfBuffer successfully parses real PDF buffer text and metadata", async () => {
  // Construct a valid minimal PDF binary
  const minimalPdfString = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "5 0 obj << /Length 124 >> stream",
    "BT",
    "/F1 24 Tf",
    "50 720 Td",
    "(Autonomous Enterprise Systems) Tj",
    "/F1 12 Tf",
    "0 -36 Td",
    "(By Dr. Alan Vance) Tj",
    "0 -36 Td",
    "(1. Executive Summary) Tj",
    "ET",
    "endstream endobj",
    "xref",
    "0 6",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000115 00000 n ",
    "0000000222 00000 n ",
    "0000000299 00000 n ",
    "trailer << /Size 6 /Root 1 0 R >>",
    "startxref",
    "485",
    "%%EOF",
  ].join("\n");

  const pdfBuffer = Buffer.from(minimalPdfString, "utf-8");
  const result = await analyzePdfBuffer(pdfBuffer);
  console.log("Extracted result in test:", {
    title: result.title,
    author: result.authorName,
    sections: result.sections,
  });

  assert.equal(result.success, true);
  assert.equal(result.pageCount, 1);
  assert.equal(result.title, "Autonomous Enterprise Systems");
  assert.match(result.authorName || "", /Alan Vance/);
  assert.ok(result.sections.some((s) => s.includes("Executive Summary")));
});
