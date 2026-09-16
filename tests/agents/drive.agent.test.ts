import test from "node:test";
import assert from "node:assert/strict";

import { driveAgent } from "../../src/agents/drive.agent.js";
import { insightAgent } from "../../src/agents/insight.agent.js";

test("driveAgent does not fake Drive assets when the API key is missing", async () => {
  const result = await driveAgent.scanDriveFolder(
    "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz"
  );

  assert.equal(result.valid, true);
  assert.equal(result.assets.length, 0);
  assert.match(result.message, /GOOGLE_DRIVE_API_KEY|Google Drive API key/i);
  assert.deepEqual(result.categories.desktopBanner, []);
  assert.deepEqual(result.categories.mobileBanner, []);
  assert.deepEqual(result.categories.contentImage, []);
});

test("insightAgent returns a clean empty result instead of demo data when Drive credentials are unavailable", async () => {
  const result = await insightAgent.analyzeDriveUrl(
    "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz"
  );

  assert.equal(result.valid, true);
  assert.equal(result.assets.length, 0);
  assert.match(result.message, /GOOGLE_DRIVE_API_KEY|Google Drive API key/i);
});
