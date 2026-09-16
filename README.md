# Insight Agent

Insight Agent is a small TypeScript + Node.js service that exposes a lightweight REST API to interact with a WordPress site's REST endpoints. It provides health checks, lists posts, post types and the WordPress API root. The project is intended as a simple connector for integrating WordPress content into other services.

**Quick overview**
- **Tech stack**: Node.js, TypeScript, Express, Axios
- **Purpose**: Proxy and helper endpoints for WordPress REST API access

**Status**: Development-ready. Use `npm run dev` for local development (no build step required). For production the repo expects a compiled `dist/` output when using `npm start`.

**Prerequisites**
- Node.js (recommended >= 18)
- npm
- A WordPress site with an application password for the account used by this service

**Environment**
The service reads configuration from environment variables (via `dotenv`). Create a `.env` file in the project root with at least the following variables:

```
PORT=3000
GOOGLE_DRIVE_API_KEY=your_google_drive_api_key
WP_BASE_URL=http://your-wordpress-site.com
WP_USERNAME=your_wp_user
WP_APP_PASSWORD=your_application_password
```

For the Drive asset pipeline, `GOOGLE_DRIVE_API_KEY` is required to fetch real files from Google Drive. Without it, the backend now returns a clear status message instead of sending demo/fake content to the frontend.

The WordPress client expects these three values; the server will fail to start if they are missing.

**Install & run (development)**
1. Install dependencies:

```bash
npm install
```

2. Run in development (runs TypeScript directly and watches for changes):

```bash
npm run dev
```

By default in dev mode tools may inject a different `PORT` (e.g. 3000). The server falls back to `5000` when `PORT` is not provided.

**Run (production)**
This repository includes `npm start` that runs `node dist/server.js`. There is no automated `build` script in `package.json`, and `tsconfig.json` currently does not set `outDir`. Two options:

- Build then start (recommended for production):

```bash
# compile TypeScript into ./dist
npx tsc --outDir dist
npm start
```

- Or run without compiling using `tsx` (same as dev):

```bash
npm run dev
```

If you'd like, I can add a `build` script and enable `outDir` in `tsconfig.json` so `npm start` works out-of-the-box.

**API Endpoints**
The server mounts the WordPress routes at `/api/wordpress`.

- **Health**: `GET /api/wordpress/health`
	- Returns a basic connection check and current user info from WordPress.
- **Posts**: `GET /api/wordpress/posts`
	- Returns the latest posts (the client currently requests 5 posts per page).
- **Post Types**: `GET /api/wordpress/post-types`
	- Returns available post types from the WordPress REST API.
- **API Root**: `GET /api/wordpress/api-root`
	- Returns the WordPress REST API index root object.

Examples (when server runs on `localhost:3000`):

```bash
curl http://localhost:3000/api/wordpress/health
curl http://localhost:3000/api/wordpress/posts
curl http://localhost:3000/api/wordpress/post-types
curl http://localhost:3000/api/wordpress/api-root
```

**Project structure**
- `package.json`: npm scripts and deps
- `tsconfig.json`: TypeScript configuration
- [src/server.ts](src/server.ts): Express app entrypoint
- [src/routes/wordpress.routes.ts](src/routes/wordpress.routes.ts): Router exposing the WordPress endpoints
- [src/wordpress/wordpress.client.ts](src/wordpress/wordpress.client.ts): Axios-based WordPress client (reads `WP_BASE_URL`, `WP_USERNAME`, `WP_APP_PASSWORD`)
- `src/` other folders: agents, services, etc. — extend the service as needed.

**Notes & troubleshooting**
- The WordPress client logs the presence of environment variables on startup; check the console for `WP_BASE_URL:` and `WP_APP_PASSWORD:` messages.
- If you see `WordPress environment variables are missing` the `.env` file is not loaded or variables are missing.
- If you need `npm start` to work without manual compilation I can add a `build` script and set `outDir` in `tsconfig.json`.

**Contributing**
- Fork, make a branch, and open a pull request. Add tests for any new behavior.

**Contact / Support**
- Open an issue on the repository for bugs or feature requests.

---
Generated README to explain how to run and understand the project.