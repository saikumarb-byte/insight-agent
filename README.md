# Insight Agent

Insight Agent is an automated asset intelligence, processing, and integration backend built with TypeScript and Node.js. It ingests Google Drive folders containing article and insight assets (hero banners, mobile banners, content images, docx drafts, PDFs, and author portraits), intelligently classifies them, optimizes and converts them to responsive WebP formats using Sharp, and provides both static local storage and on-demand proxy delivery.

In addition, Insight Agent includes a lightweight WordPress REST API integration connector designed to interact with a WordPress site's REST endpoints, providing health checks, listing posts, post types, and API root inspection.

---

## Quick Overview

- **Tech Stack**: Node.js (ES2022 / NodeNext), TypeScript, Express, Sharp, Axios, Cors, Dotenv
- **Key Capabilities**:
  - **Drive Asset Ingestion**: Scans Google Drive folders via Google Drive API v3 to discover media and document assets.
  - **Automated Classification**: Heuristic classification of assets into desktop banners, mobile banners, content images, doc drafts, PDFs, and author photos.
  - **Image Processing Pipeline**: Converts images to WebP with dimensions tailored for web display, generating SEO-friendly slugified file names.
  - **Dual Delivery Modes**: Supports persistent local asset storage (`public/assets`) and on-demand proxy streaming with in-memory LRU caching.
  - **WordPress Integration**: Proxy and helper endpoints for WordPress REST API access.

**Status**: Development-ready. Use `npm run dev` for local development (no build step required). For production, compile using `npm run build` and run `npm start`.

---

## Prerequisites

- **Node.js**: Version 18 or later (Node 20+ recommended)
- **npm**: Version 9 or later
- **Google Drive API Key**: Required for scanning Google Drive folders and listing files via Google Drive API v3.
- **WordPress Site (Optional / For WordPress integration)**: A WordPress site with an application password for the account used by this service.

---

## Environment Configuration

The service reads configuration from environment variables (via `dotenv`). Create a `.env` file in the project root with the following configuration:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001
SERVER_BASE_URL=http://localhost:3000

# Asset Pipeline Settings
# Set to "true" to save converted WebP files to public/assets/, or "false" to stream on-demand
STORE_ASSETS=true

# Google Drive Integration
GOOGLE_DRIVE_API_KEY=your_google_drive_api_key

# WordPress Integration
WP_BASE_URL=http://your-wordpress-site.com
WP_USERNAME=your_wp_user
WP_APP_PASSWORD=your_application_password
```

### Configuration Details

| Variable | Description | Default / Example | Required |
| :--- | :--- | :--- | :--- |
| `PORT` | Port on which the Express backend runs | `3000` | Optional |
| `FRONTEND_URL` | Frontend origin for CORS policy | `http://localhost:3001` | Optional |
| `SERVER_BASE_URL` | Base URL used to construct asset URLs | `http://localhost:3000` | Optional |
| `STORE_ASSETS` | When `true`, saves converted images to `public/assets/`. When `false`, uses the on-demand proxy endpoint. | `true` | Optional |
| `GOOGLE_DRIVE_API_KEY` | Google Drive v3 API key for folder scanning and asset retrieval | `AIzaSy...` | Yes (for Drive scans) |
| `WP_BASE_URL` | Base URL of your WordPress instance | `http://your-wordpress-site.com` | Yes (for WordPress) |
| `WP_USERNAME` | WordPress username for REST authentication | `your_wp_user` | Yes (for WordPress) |
| `WP_APP_PASSWORD` | WordPress Application Password | `your_application_password` | Yes (for WordPress) |

> **Google Drive Note**: For the Drive asset pipeline, `GOOGLE_DRIVE_API_KEY` is required to fetch real files from Google Drive. Without it, the backend returns a clear status message instead of sending demo/fake content to the frontend.
>
> **WordPress Note**: The WordPress client expects these three values (`WP_BASE_URL`, `WP_USERNAME`, `WP_APP_PASSWORD`); the server will fail to start if they are missing when the WordPress client is initialized.

---

## Installation & Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure your environment:**
   Create a `.env` file in the project root based on the configuration above.

3. **Run in development mode:**
   Runs TypeScript directly using `tsx watch` and automatically reloads on file changes:
   ```bash
   npm run dev
   ```
   By default in dev mode tools may inject a different `PORT` (e.g. 3000). The server falls back to `3000` when `PORT` is not provided.

4. **Build and run in production:**
   Compile TypeScript to JavaScript using `tsc` and start the production server:
   ```bash
   npm run build
   npm start
   ```

5. **Clean up generated assets:**
   Remove generated WebP and image files from `public/assets/`:
   ```bash
   npm run cleanup-assets
   ```

6. **Run tests:**
   Execute unit and integration tests using Node's test runner via `tsx`:
   ```bash
   npm test
   ```

---

## Available Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run dev` | `tsx watch src/server.ts` | Runs the server in development mode with live watch/reload. |
| `npm run build` | `tsc` | Compiles TypeScript source files into JavaScript. |
| `npm start` | `node dist/server.js` | Runs the compiled production server. |
| `npm run cleanup-assets`| `tsx src/utils/cleanupAssets.ts` | Deletes generated image files in `public/assets/`. |
| `npm test` | `tsx --test` | Runs test suites under `tests/`. |

---

## API Endpoints

### 1. Insight & Asset Pipeline (`/api/insights`)

The server mounts the primary insight and asset pipeline routes under `/api/insights`.

#### `GET /api/insights/health`
Performs a health check on the Insight Agent backend.

- **Response:**
  ```json
  {
    "success": true,
    "message": "Insight agent backend is running."
  }
  ```

#### `POST /api/insights/validate-drive`
Validates a Google Drive folder or file URL, verifying syntax and extracting the folder/file ID.

- **Request Body:**
  ```json
  {
    "driveUrl": "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz"
  }
  ```
  *(Accepts either `driveUrl` or `folderUrl`)*

- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "isValid": true,
      "folderId": "1AbCdEfGhIjKlMnOpQrStUvWxYz",
      "normalizedUrl": "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz",
      "message": "Drive folder validated successfully."
    }
  }
  ```

#### `POST /api/insights/scan-drive`
Scans a Google Drive folder, retrieves all files via the Google Drive API, classifies each asset, processes images into WebP formats, and extracts article metadata (title, author details).

- **Request Body:**
  ```json
  {
    "driveUrl": "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz"
  }
  ```

- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "valid": true,
      "folderId": "1AbCdEfGhIjKlMnOpQrStUvWxYz",
      "normalizedUrl": "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz",
      "message": "Drive folder scanned successfully.",
      "insightTitle": "Extracted Insight Title",
      "authorImage": { ... },
      "authorDescription": { ... },
      "assets": [ ... ],
      "categories": {
        "desktopBanner": [ ... ],
        "mobileBanner": [ ... ],
        "contentImage": [ ... ],
        "doc": [ ... ],
        "pdf": [ ... ],
        "other": [ ... ]
      }
    }
  }
  ```

#### `GET /api/insights/asset`
On-demand image conversion proxy. Downloads an allowed image from Google Drive/UserContent, resizes it with Sharp, converts it to WebP on the fly, and streams it back with LRU caching.

- **Query Parameters:**
  - `url` (required): Full URL to source image (must match allowed Google Drive / usercontent hosts).
  - `dims` (optional): Dimensions formatted as `{width}x{height}` (e.g. `1440x500`, `750x1050`, `500xauto`).
- **Response:**
  - Image stream (`image/webp`) with `Cache-Control: public, max-age=86400`.

#### `GET /assets/:fileName`
Serves locally saved, converted WebP images directly from `public/assets/` when `STORE_ASSETS=true`.

---

### 2. WordPress API Endpoints (`/api/wordpress`)

The server mounts the WordPress routes at `/api/wordpress`.

- **Health**: `GET /api/wordpress/health`
  - Returns a basic connection check and current user info from WordPress.
- **Posts**: `GET /api/wordpress/posts`
  - Returns the latest posts (the client currently requests 5 posts per page).
- **Post Types**: `GET /api/wordpress/post-types`
  - Returns available post types from the WordPress REST API.
- **API Root**: `GET /api/wordpress/api-root`
  - Returns the WordPress REST API index root object.

#### Examples (when server runs on `localhost:3000`):

```bash
curl http://localhost:3000/api/wordpress/health
curl http://localhost:3000/api/wordpress/posts
curl http://localhost:3000/api/wordpress/post-types
curl http://localhost:3000/api/wordpress/api-root
```

---

## Asset Classification & Optimization Specifications

When scanning Google Drive folders, files are heuristically classified and optimized into WebP variants:

| Category | File Keywords / Patterns | Output Format | Target Dimensions | Output Label |
| :--- | :--- | :--- | :--- | :--- |
| **Desktop Banner** | `desktop`, `hero`, `banner`, `wide`, `header`, `landing`, `featured` | `webp` | `1440x500` | Desktop banner |
| **Mobile Banner** | `mobile`, `phone`, `smartphone`, `responsive` | `webp` | `750x1050` | Mobile banner |
| **Featured / Thumbnail** | `featured`, `thumbnail`, `cover`, `opengraph`, `og-image` | `webp` | `760x480` | Featured / Thumbnail |
| **Author Image** | `author`, `profile`, `bio`, `about`, `person` | `webp` | `500x500` | Author image |
| **Content Image** | General `.png`, `.jpg`, `.jpeg`, `.webp`, illustrations, diagrams | `webp` | `500xauto` | Inner image |
| **Document** | `.docx`, `.doc`, `notes`, `brief`, `summary`, `metadata`, `guide` | Original format | N/A | Support document |
| **PDF** | `.pdf`, `reference`, `final`, `whitepaper`, `case-study` | Original format | N/A | Reference PDF |

---

## Project Structure

- `package.json`: npm scripts and dependencies
- `tsconfig.json`: TypeScript configuration (`ES2022` / `NodeNext`)
- [src/server.ts](src/server.ts): Express app entry point, CORS configuration, static asset serving, and router mounts
- [src/routes/insights.routes.ts](src/routes/insights.routes.ts): Active router exposing health check, Drive validation, Drive scanning, and the on-demand WebP conversion proxy
- [src/routes/wordpress.routes.ts](src/routes/wordpress.routes.ts): Router exposing the WordPress endpoints
- [src/agents/insight.agent.ts](src/agents/insight.agent.ts): Agent orchestrating Drive scan analysis and category mapping
- [src/agents/drive.agent.ts](src/agents/drive.agent.ts): Drive agent handling URL validation, asset heuristic classification, SEO filename generation, and image conversion
- [src/google-drive/drive.service.ts](src/google-drive/drive.service.ts): Google Drive API v3 queries, file listing, URL parsing, and asset mapping
- [src/google-drive/drive.types.ts](src/google-drive/drive.types.ts): TypeScript types for assets, categories, and scan results
- [src/utils/image.processor.ts](src/utils/image.processor.ts): Sharp-based image processor for downloading, resizing, and converting images to WebP
- [src/utils/slugify.ts](src/utils/slugify.ts): Generates SEO-friendly slugs for processed assets
- [src/utils/cleanupAssets.ts](src/utils/cleanupAssets.ts): Script to clear generated images from `public/assets/`
- [src/wordpress/wordpress.client.ts](src/wordpress/wordpress.client.ts): Axios-based WordPress client (reads `WP_BASE_URL`, `WP_USERNAME`, `WP_APP_PASSWORD`)
- `public/assets/`: Directory for locally stored, converted WebP images
- `tests/`: Automated unit and integration tests

---

## Notes & Troubleshooting

### Google Drive & Asset Pipeline
- **Missing Drive API Key**: If `GOOGLE_DRIVE_API_KEY` is not provided in `.env`, `/api/insights/scan-drive` returns a clear message stating that the API key is missing rather than failing or returning mock assets.
- **Folder Permissions**: Make sure the Google Drive folder link has "Anyone with the link can view" permissions so the Google Drive API v3 can list child files.
- **Asset Storage Modes**: If you do not want to persist converted images to local disk, set `STORE_ASSETS=false`. The system will automatically switch to streaming on-demand WebP conversions through `/api/insights/asset`.
- **CORS Issues**: Ensure `FRONTEND_URL` in `.env` matches the URL of your frontend application (e.g., `http://localhost:3001`).

### WordPress Integration
- The WordPress client logs the presence of environment variables on startup; check the console for `WP_BASE_URL:` and `WP_APP_PASSWORD:` messages.
- If you see `WordPress environment variables are missing` the `.env` file is not loaded or variables are missing.
- The server mounts the WordPress router under `/api/wordpress`. In `src/server.ts`, ensure `app.use("/api/wordpress", wordpressRoutes);` is active when interacting with WordPress.

---

## Contributing

- Fork, make a branch, and open a pull request. Add tests for any new behavior.

---

## Contact / Support

- Open an issue on the repository for bugs or feature requests: [GitHub Issues](https://github.com/saikumarb-byte/insight-agent/issues)