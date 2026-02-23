import { join, resolve } from 'node:path';
import { readdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadConfig, loadGlobalConfig, configExists, shouldSkipRoute } from './config.mjs';
import { ensureServer, stopServer } from './server.mjs';
import { runSmokeTests } from './smoke.mjs';
import { runFlowTests } from './flow.mjs';
import { runA11yTests } from './a11y.mjs';
import { discoverRoutes } from './discover.mjs';
import { printHeader, printSmokeResults, printFlowResults, printA11yResults, printSummary } from './reporter.mjs';

export async function run(opts) {
  if (opts.all) {
    return runAll(opts);
  }

  const projectDir = resolve(opts.target || '.');
  return runProject(projectDir, opts);
}

async function runAll(opts) {
  let scanDirs = opts.scanDirs;

  if (!scanDirs || scanDirs.length === 0) {
    const globalConfig = await loadGlobalConfig();
    scanDirs = globalConfig?.scanDirs;
  }

  if (!scanDirs || scanDirs.length === 0) {
    scanDirs = [process.cwd()];
  }

  // Expand ~ to home dir
  scanDirs = scanDirs.map((d) => d.replace(/^~/, process.env.HOME));

  const projects = [];

  for (const parentDir of scanDirs) {
    let entries;
    try {
      entries = await readdir(parentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(parentDir, entry.name);
      if (await configExists(dir)) {
        projects.push(dir);
      }
    }
  }

  if (projects.length === 0) {
    console.log('⚠️  No projects with .ux-test.json found');
    return true;
  }

  console.log(`\n🔍 Found ${projects.length} projects with UX test configs\n`);

  let allPassed = true;
  for (const dir of projects) {
    const passed = await runProject(dir, opts);
    if (!passed) allPassed = false;
  }

  return allPassed;
}

async function runProject(projectDir, opts) {
  const config = await loadConfig(projectDir);
  if (!config) {
    console.log(`⚠️  No .ux-test.json found in ${projectDir}`);
    return false;
  }

  const baseUrl = `http://localhost:${config.port}`;

  // Determine routes
  let routes = config.routes;
  if (!routes) {
    routes = await discoverRoutes(config);
  }

  // Filter skipped routes
  if (config.skipRoutes.length > 0) {
    routes = routes.filter((r) => !shouldSkipRoute(r, config.skipRoutes));
  }

  // Screenshot dir: runs/<timestamp>/
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const screenshotDir = join(projectDir, 'screenshots', 'runs', timestamp);

  printHeader(projectDir, config.port);

  // Start server if needed
  let serverInfo;
  try {
    serverInfo = await ensureServer(config);
    if (serverInfo.started) {
      console.log(`🚀 Started dev server (${config.startCommand})`);
    }
  } catch (err) {
    console.log(`❌ Server: ${err.message}`);
    return false;
  }

  // Launch browser
  const browser = await chromium.launch({ headless: !opts.headed });
  const page = await browser.newPage();

  let smokeResults = [];
  let flowResults = [];
  let a11yResults = [];
  let allPassed;

  try {
    // Smoke tests
    if (opts.mode !== 'flows' && opts.mode !== 'a11y') {
      smokeResults = await runSmokeTests(page, routes, baseUrl, screenshotDir, config, opts);
      printSmokeResults(smokeResults);
    }

    // Accessibility tests
    if (opts.mode !== 'flows' && opts.mode !== 'smoke' && !opts.noA11y && config.a11y) {
      a11yResults = await runA11yTests(browser, routes, baseUrl, config);
      printA11yResults(a11yResults);
    }

    // Flow tests
    if (opts.mode !== 'smoke' && opts.mode !== 'a11y' && config.flows.length > 0) {
      let flows = config.flows;
      if (opts.flowName) {
        flows = flows.filter((f) => f.name === opts.flowName);
        if (flows.length === 0) {
          console.log(`⚠️  No flow named "${opts.flowName}" found`);
        }
      }
      if (flows.length > 0) {
        flowResults = await runFlowTests(page, flows, baseUrl, screenshotDir, config);
        printFlowResults(flowResults);
      }
    }

    allPassed = printSummary(smokeResults, flowResults, screenshotDir, a11yResults);
  } finally {
    await browser.close();
    stopServer(serverInfo);
  }

  return allPassed;
}
