import test from "node:test";
import assert from "node:assert/strict";

import {
  validateDriveFolder,
  scanDriveFolder,
} from "../../src/google-drive/drive.service.js";

test("validateDriveFolder accepts a valid Google Drive folder URL", () => {
  const result = validateDriveFolder(
    "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz"
  );

  assert.equal(result.isValid, true);
  assert.equal(result.folderId, "1AbCdEfGhIjKlMnOpQrStUvWxYz");
});

test("scanDriveFolder returns a clean configured state when Google Drive credentials are missing", async () => {
  const result = await scanDriveFolder(
    "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz"
  );

  assert.equal(result.valid, true);
  assert.ok(Array.isArray(result.assets));
  assert.equal(result.assets.length, 0);
  assert.ok(result.categories.desktopBanner.length === 0);
  assert.ok(result.categories.mobileBanner.length === 0);
  assert.ok(result.categories.contentImage.length === 0);
  assert.ok(result.categories.pdf.length === 0);
  assert.ok(result.categories.doc.length === 0);
  assert.match(result.message, /GOOGLE_DRIVE_API_KEY|Google Drive API key/i);
});
