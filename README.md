# heavy-ux-test

Automated UX smoke and flow testing for web projects. Point it at any project with a `.ux-test.json` config and it will launch a browser, visit every route, catch errors, and run interaction flows.

Built on [Playwright](https://playwright.dev/).

## Install

```bash
npm install -g heavy-ux-test
npx playwright install chromium
```

Or clone and link:

```bash
git clone https://github.com/keithbarney/heavy-ux-test.git
cd heavy-ux-test
npm install
npx playwright install chromium
npm link
```

## Usage

```bash
# Run in current directory (reads .ux-test.json)
ux-test

# Target a specific project
ux-test ~/Projects/apps/my-app

# Smoke tests only (visit routes, check for errors)
ux-test --smoke

# Flow tests only (run interaction sequences)
ux-test --flows

# Single named flow
ux-test --flow "Login flow"

# Test all projects that have .ux-test.json
ux-test --all

# Scan specific directories for projects
ux-test --all --scan-dir ~/Projects/apps --scan-dir ~/Projects/tools

# Show browser window (for debugging)
ux-test --headed
```

## Project Config

Each project needs a `.ux-test.json` at its root. Only `port` is required — routes are auto-discovered if omitted.

```json
{
  "port": 3000,
  "startCommand": "npm run dev",
  "type": "vite",
  "routes": ["/", "/about", "/settings"],
  "skipRoutes": ["/admin/*"],
  "flows": [],
  "supabase": {}
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `port` | Yes | Dev server port |
| `startCommand` | No | Command to start the dev server (if not already running) |
| `type` | No | Project type for route discovery: `vite`, `nextjs`, `browser-sync`, `static` (auto-detected if omitted) |
| `routes` | No | Explicit routes to test (auto-discovered if omitted) |
| `skipRoutes` | No | Routes to skip — supports exact match, prefix (`/admin/*`), and glob patterns |
| `flows` | No | Array of flow test definitions (see below) |
| `supabase` | No | Supabase config for auth testing (see below) |

### Route Auto-Discovery

If `routes` is omitted, routes are discovered automatically based on project type:

- **Vite (React Router):** Parses `<Route path="..." />` from `src/App.tsx`/`.jsx`
- **Next.js (App Router):** Walks `src/app/` for `page.tsx`/`.jsx` files
- **Static / browser-sync:** Scans for `.html` files in root and `dist/`
- **Fallback:** Just `["/"]`

## Global Config

Create `~/.ux-test.json` to set default scan directories for `--all`:

```json
{
  "scanDirs": [
    "~/Projects/apps",
    "~/Projects/tools"
  ]
}
```

When you run `ux-test --all`:
1. If `--scan-dir` flags are provided, those are used
2. Otherwise, `scanDirs` from `~/.ux-test.json` are used
3. Otherwise, the current working directory is scanned

## Flow Tests

Flows are sequences of browser interactions defined in `.ux-test.json`:

```json
{
  "flows": [
    {
      "name": "Login flow",
      "steps": [
        { "action": "goto", "url": "/login" },
        { "action": "type", "selector": "#email", "value": "test@example.com" },
        { "action": "type", "selector": "#password", "value": "password123" },
        { "action": "click", "selector": "button[type=submit]" },
        { "action": "assertUrl", "url": "/dashboard" },
        { "action": "assertVisible", "selector": ".welcome-message" },
        { "action": "screenshot", "name": "logged-in" }
      ]
    }
  ]
}
```

### Flow Step Actions

| Action | Fields | Description |
|--------|--------|-------------|
| `goto` | `url` | Navigate to a route |
| `click` | `selector` | Click an element |
| `type` | `selector`, `value` | Type text into an input |
| `press` | `key`, `selector?` | Press a keyboard key (defaults to `body`) |
| `hover` | `selector` | Hover over an element |
| `waitFor` | `selector` | Wait for an element to appear in DOM |
| `wait` | `ms` | Pause for a duration (default 1000ms) |
| `assertVisible` | `selector` | Assert an element is visible |
| `assertText` | `selector`, `value` | Assert element contains text |
| `assertUrl` | `url` | Assert current URL contains string |
| `assertNoErrors` | — | Assert no console errors occurred during the flow |
| `screenshot` | `name?` | Save a screenshot |
| `supabaseAuth` | `email`, `password`, `metadata?` | Create test user and inject session (requires `supabase` config) |
| `supabaseSignOut` | — | Clear auth session (requires `supabase` config) |

Flows stop on the first failed step.

## Smoke Tests

Smoke tests run automatically for every route (unless `--flows` is used). For each route they check:

- Page loads without timeout (15s limit)
- No blank pages (empty body)
- No console errors
- No uncaught exceptions
- No failed network requests (4xx/5xx)
- Screenshots saved for each route

## Supabase Auth

For projects using Supabase auth, add a `supabase` section to `.ux-test.json`:

```json
{
  "supabase": {
    "url": "https://your-project.supabase.co",
    "anonKey": "your-anon-key",
    "serviceRoleKey": "your-service-role-key",
    "storageKey": "sb-your-project-auth-token",
    "storageType": "cookie"
  }
}
```

| Field | Description |
|-------|-------------|
| `url` | Supabase project URL |
| `anonKey` | Public anon key |
| `serviceRoleKey` | Service role key (creates/deletes test users) |
| `storageKey` | Auth storage key name |
| `storageType` | `"cookie"` or `"localStorage"` |

The `supabaseAuth` step creates a fresh test user (deleting any existing user with the same email first), signs in, and injects the session into the browser. Cookie mode handles chunking for large session tokens.

## Server Management

If a dev server isn't already running, `heavy-ux-test` starts it using `startCommand` from your config. It detects readiness by watching for framework-specific signals:

- **Vite:** `Local:`, `VITE`, `ready in`
- **Next.js:** `Ready in`, `✓ Ready`, `started server`
- **browser-sync:** `Serving files from`, `Local:`

Servers are automatically stopped after tests complete.

## Screenshots

Screenshots are saved to `<project>/screenshots/<timestamp>/` with separate directories for smoke and flow tests. The `screenshots/` directory is gitignored by convention.

## License

MIT
