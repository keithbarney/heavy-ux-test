import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function runSmokeTests(page, routes, baseUrl, screenshotDir) {
  await mkdir(screenshotDir, { recursive: true });
  const results = [];

  for (const route of routes) {
    const result = await testRoute(page, route, baseUrl, screenshotDir);
    results.push(result);
  }

  return results;
}

async function testRoute(page, route, baseUrl, screenshotDir) {
  const url = `${baseUrl}${route}`;
  const errors = [];
  const networkFailures = [];
  const start = Date.now();

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

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 15000 });
    // Wait for content to render (React/SPA apps need a tick after load)
    await page.waitForTimeout(500);

    // Check if page is blank
    isBlank = await page.evaluate(() => {
      const body = document.body;
      if (!body) return true;
      const text = body.innerText.trim();
      const children = body.children.length;
      return text.length === 0 && children <= 1;
    });

    // Screenshot
    const screenshotName = route === '/' ? 'index' : route.replace(/^\//, '').replace(/\//g, '-');
    await page.screenshot({
      path: join(screenshotDir, `${screenshotName}.png`),
      fullPage: true,
    });
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
  const passed = !timedOut && !isBlank && errors.length === 0 && networkFailures.length === 0;

  return {
    route,
    passed,
    duration,
    timedOut,
    isBlank,
    errors,
    networkFailures,
  };
}
