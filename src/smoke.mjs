import { mkdir, copyFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { compareScreenshot } from './visual.mjs';

export async function runSmokeTests(page, routes, baseUrl, screenshotDir, config, opts) {
  const breakpoints = opts.breakpoints || config.breakpoints;
  const visual = !opts.noVisual && config.visual;
  const updateBaselines = opts.updateBaselines;
  const threshold = config.visualThreshold;

  const baselinesDir = join(config._dir, 'screenshots', 'baselines');
  const currentDir = join(screenshotDir, 'current');
  const diffsDir = join(screenshotDir, 'diffs');

  await mkdir(currentDir, { recursive: true });

  const results = [];

  for (const route of routes) {
    const result = await testRoute(page, route, baseUrl, currentDir, diffsDir, baselinesDir, {
      breakpoints,
      visual,
      updateBaselines,
      threshold,
    });
    results.push(result);
  }

  return results;
}

async function testRoute(page, route, baseUrl, currentDir, diffsDir, baselinesDir, visualOpts) {
  const { breakpoints, visual, updateBaselines, threshold } = visualOpts;
  const url = `${baseUrl}${route}`;
  const errors = [];
  const networkFailures = [];
  const start = Date.now();
  const routeName = route === '/' ? 'index' : route.replace(/^\//, '').replace(/\//g, '-');

  // Collect console errors
  const onConsoleMsg = (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  };
  page.on('console', onConsoleMsg);

  // Collect uncaught exceptions
  const onPageError = (err) => {
    errors.push(`Uncaught: ${err.message}`);
  };
  page.on('pageerror', onPageError);

  // Collect failed network requests
  const onResponse = (response) => {
    const status = response.status();
    if (status >= 400) {
      networkFailures.push(`${status} ${response.url()}`);
    }
  };
  page.on('response', onResponse);

  let timedOut = false;
  let isBlank = false;
  const screenshots = [];

  try {
    // Navigate once
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Wait for network idle (images, API calls) — timeout fallback avoids hanging on persistent connections
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);

    // Check if page is blank
    isBlank = await page.evaluate(() => {
      const body = document.body;
      if (!body) return true;
      const text = body.innerText.trim();
      const children = body.children.length;
      return text.length === 0 && children <= 1;
    });

    // Loop through breakpoints — page is already loaded, just resize and screenshot
    for (const width of breakpoints) {
      await page.setViewportSize({ width, height: 720 });
      await page.waitForTimeout(200);

      const filename = `${routeName}--${width}.png`;
      const currentPath = join(currentDir, filename);
      const baselinePath = join(baselinesDir, filename);
      const diffPath = join(diffsDir, filename);

      await page.screenshot({ path: currentPath, fullPage: true });

      const screenshotResult = { width, filename, currentPath };

      if (updateBaselines) {
        // Copy current → baselines
        await mkdir(baselinesDir, { recursive: true });
        await copyFile(currentPath, baselinePath);
        screenshotResult.baselineUpdated = true;
      } else if (visual) {
        const baselineExists = await access(baselinePath).then(() => true).catch(() => false);

        if (baselineExists) {
          const comparison = await compareScreenshot(currentPath, baselinePath, diffPath, threshold);
          screenshotResult.visual = comparison;
        } else {
          // First run — auto-create baseline
          await mkdir(baselinesDir, { recursive: true });
          await copyFile(currentPath, baselinePath);
          screenshotResult.baselineCreated = true;
        }
      }

      screenshots.push(screenshotResult);
    }
  } catch (err) {
    if (err.message.includes('Timeout')) {
      timedOut = true;
    } else {
      errors.push(err.message);
    }
  } finally {
    page.off('console', onConsoleMsg);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }

  const duration = Date.now() - start;

  // Visual failures count toward pass/fail
  const hasVisualFailures = screenshots.some((s) => s.visual && !s.visual.match);
  const passed = !timedOut && !isBlank && errors.length === 0 && networkFailures.length === 0 && !hasVisualFailures;

  return {
    route,
    passed,
    duration,
    timedOut,
    isBlank,
    errors,
    networkFailures,
    screenshots,
  };
}
