import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export async function discoverRoutes(config) {
  const type = config.type || (await detectType(config._dir));

  switch (type) {
    case 'vite':
      return discoverViteRoutes(config._dir);
    case 'nextjs':
      return discoverNextRoutes(config._dir);
    case 'browser-sync':
    case 'static':
      return discoverStaticRoutes(config._dir, type);
    default:
      return ['/'];
  }
}

async function detectType(dir) {
  try {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['next']) return 'nextjs';
    if (deps['vite']) return 'vite';
    if (deps['browser-sync']) return 'browser-sync';
  } catch {}

  // Check for static HTML
  const hasHtml = await fileExists(join(dir, 'index.html'));
  if (hasHtml) return 'static';

  const hasDistHtml = await fileExists(join(dir, 'dist', 'index.html'));
  if (hasDistHtml) return 'browser-sync';

  return null;
}

async function discoverViteRoutes(dir) {
  // Look for React Router routes in App.tsx / App.jsx
  const candidates = ['src/App.tsx', 'src/App.jsx', 'src/app.tsx', 'src/app.jsx'];
  let appContent = null;

  for (const candidate of candidates) {
    try {
      appContent = await readFile(join(dir, candidate), 'utf-8');
      break;
    } catch {}
  }

  if (!appContent) return ['/'];

  const routes = [];
  // Match <Route path="..." /> patterns
  const routeRegex = /<Route\s+[^>]*path=["']([^"']+)["']/g;
  let match;
  while ((match = routeRegex.exec(appContent)) !== null) {
    const path = match[1];
    // Skip catch-all and dynamic routes
    if (path === '*') continue;
    if (path.includes(':')) continue;
    routes.push(path.startsWith('/') ? path : `/${path}`);
  }

  return routes.length > 0 ? routes : ['/'];
}

async function discoverNextRoutes(dir) {
  const appDir = join(dir, 'src', 'app');
  const routes = [];

  async function walk(currentDir, prefix) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    // Check if this directory has a page.tsx/page.jsx
    const hasPage = entries.some(
      (e) => e.isFile() && (e.name === 'page.tsx' || e.name === 'page.jsx')
    );

    if (hasPage) {
      routes.push(prefix || '/');
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip api routes, dynamic segments, and internal Next dirs
      if (entry.name === 'api') continue;
      if (entry.name.startsWith('[')) continue;
      if (entry.name.startsWith('_')) continue;

      await walk(join(currentDir, entry.name), `${prefix}/${entry.name}`);
    }
  }

  await walk(appDir, '');
  return routes.length > 0 ? routes : ['/'];
}

async function discoverStaticRoutes(dir, type) {
  // Look in dist/ for browser-sync, root for static
  const scanDirs = type === 'browser-sync' ? [join(dir, 'dist')] : [dir, join(dir, 'dist')];
  const routes = [];

  for (const scanDir of scanDirs) {
    let entries;
    try {
      entries = await readdir(scanDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.html')) continue;
      if (entry === 'index.html') {
        if (!routes.includes('/')) routes.push('/');
      } else {
        routes.push(`/${entry}`);
      }
    }

    if (routes.length > 0) break;
  }

  return routes.length > 0 ? routes : ['/'];
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
