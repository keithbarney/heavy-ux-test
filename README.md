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

# Visual regression: accept current screenshots as new baselines
ux-test --update-baselines

# Take breakpoint screenshots but skip visual comparison
ux-test --no-visual

# Accessibility tests only (WCAG 2.1 AA)
ux-test --a11y

# Skip accessibility tests
ux-test --no-a11y

# Override breakpoints for this run
ux-test --breakpoints 375,768
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
  "supabase": {},
  "breakpoints": [375, 768, 1024, 1440],
  "visualThreshold": 0.1,
  "visual": true,
  "a11y": true,
  "a11yRules": null
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
| `breakpoints` | No | Viewport widths for responsive screenshots. Default: `[375, 768, 1024, 1440]` |
| `visualThreshold` | No | Pixelmatch tolerance 0–1. Default: `0.1` |
| `visual` | No | Enable/disable visual regression comparison. Default: `true` |
| `a11y` | No | Enable/disable accessibility testing. Default: `true` |
| `a11yRules` | No | Axe rule overrides: `{ disable, include, exclude }` (see below) |

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

## Visual Regression Testing

Screenshots are taken at every configured breakpoint for each route. On the first run, baselines are auto-created. On subsequent runs, current screenshots are compared against baselines using pixelmatch.

### How It Works

1. Each route is navigated once
2. The viewport is resized to each breakpoint width (height stays 720)
3. A screenshot is taken at each width
4. If baselines exist, a pixel-level comparison is performed
5. Differences above the threshold are flagged as failures

### Screenshot Directory Structure

```
<project>/screenshots/
  baselines/                    # Persistent ground truth
    index--375.png
    index--768.png
    about--1024.png
  runs/<timestamp>/             # Ephemeral test runs
    current/                    # This run's screenshots
      index--375.png
    diffs/                      # Only for failures
      about--768.png
```

Screenshot naming: `<route-name>--<width>.png` (double-dash separates route from width).

### CLI Flags

| Flag | Description |
|------|-------------|
| `--update-baselines` | Accept current screenshots as new baselines |
| `--no-visual` | Take breakpoint screenshots but skip comparison |
| `--a11y` | Run only accessibility tests |
| `--no-a11y` | Skip accessibility tests |
| `--breakpoints 375,768` | Override breakpoints for this run (comma-separated) |

### First Run

On the first run (no baselines directory), baselines are auto-created from the current screenshots. No failures are reported.

### Updating Baselines

After intentional design changes, run with `--update-baselines` to accept the current state as the new ground truth:

```bash
ux-test --update-baselines ~/Projects/my-app
```

### Reporter Output

```
/about                   ✅ 987ms
    375 ✅  768 ❌ 2.3%  1024 ✅  1440 ✅
```

The summary shows total screenshots, matches, and diff file paths for failures.

## Accessibility Testing

Every route is scanned for WCAG 2.1 AA violations using [axe-core](https://github.com/dequelabs/axe-core). Runs at 1024px viewport width. ON by default.

### What It Checks

- Color contrast (WCAG AA ratios)
- Missing alt text on images
- Broken ARIA attributes and roles
- Heading hierarchy issues
- Form label associations
- Keyboard accessibility
- Link and button discernible names

### Config

Disable per-project with `"a11y": false` in `.ux-test.json`, or skip for a single run with `--no-a11y`.

Fine-tune with `a11yRules`:

```json
{
  "a11yRules": {
    "disable": ["color-contrast"],
    "include": [".main-content"],
    "exclude": [".third-party-widget"]
  }
}
```

| Key | Description |
|-----|-------------|
| `disable` | Array of axe rule IDs to skip (e.g., `["color-contrast"]`) |
| `include` | CSS selectors to scope the scan to (only these elements are tested) |
| `exclude` | CSS selectors to exclude from scanning |

### Reporter Output

```
♿ ACCESSIBILITY (WCAG 2.1 AA)

  /                        ✅ 234ms
  /about                   ❌ 456ms  3 violations, 7 elements
    🔴 color-contrast (serious) × 3
       Elements must have sufficient color contrast
       → #header > .nav-link
    🟡 link-name (moderate) × 1
       Links must have discernible text
       → a.icon-link
```

Impact icons: 🔴 serious/critical, 🟡 moderate, 🟢 minor.

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
| `setViewport` | `width`, `height?` | Set viewport size (height defaults to 720) |
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
- Screenshots at every breakpoint width
- Visual regression against baselines (if baselines exist)

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

Screenshots are saved to `<project>/screenshots/` with `baselines/` for ground truth and `runs/<timestamp>/` for each test run. The `screenshots/` directory is gitignored by convention.

## License

MIT
