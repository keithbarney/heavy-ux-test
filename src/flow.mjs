import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { supabaseAuth, supabaseSignOut } from './supabase-auth.mjs';

export async function runFlowTests(page, flows, baseUrl, screenshotDir, config) {
  await mkdir(screenshotDir, { recursive: true });
  const results = [];

  for (const flow of flows) {
    const result = await executeFlow(page, flow, baseUrl, screenshotDir, config);
    results.push(result);
  }

  return results;
}

async function executeFlow(page, flow, baseUrl, screenshotDir, config) {
  const stepResults = [];
  const errors = [];

  // Track console errors throughout the flow
  const onConsoleMsg = (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  };
  page.on('console', onConsoleMsg);

  const onPageError = (err) => {
    errors.push(`Uncaught: ${err.message}`);
  };
  page.on('pageerror', onPageError);

  for (const step of flow.steps) {
    const result = await executeStep(page, step, baseUrl, screenshotDir, flow.name, errors, config);
    stepResults.push(result);

    if (!result.passed) break;
  }

  page.off('console', onConsoleMsg);
  page.off('pageerror', onPageError);

  const passed = stepResults.every((r) => r.passed);

  return {
    name: flow.name,
    passed,
    steps: stepResults,
  };
}

async function executeStep(page, step, baseUrl, screenshotDir, flowName, errors, config) {
  const start = Date.now();
  const label = describeStep(step);

  try {
    switch (step.action) {
      case 'goto':
        await page.goto(`${baseUrl}${step.url}`, { waitUntil: 'load', timeout: 15000 });
        await page.waitForTimeout(500);
        break;

      case 'click':
        await page.click(step.selector, { timeout: 10000 });
        break;

      case 'type':
        await page.fill(step.selector, step.value, { timeout: 10000 });
        break;

      case 'press':
        await page.press(step.selector || 'body', step.key);
        break;

      case 'hover':
        await page.hover(step.selector, { timeout: 10000 });
        break;

      case 'waitFor':
        await page.waitForSelector(step.selector, { timeout: 10000 });
        break;

      case 'wait':
        await new Promise((r) => setTimeout(r, step.ms || 1000));
        break;

      case 'assertVisible':
        await page.waitForSelector(step.selector, { state: 'visible', timeout: 10000 });
        break;

      case 'assertText': {
        const el = await page.waitForSelector(step.selector, { timeout: 10000 });
        const text = await el.textContent();
        if (!text.includes(step.value)) {
          throw new Error(`Expected text "${step.value}" in ${step.selector}, got "${text.slice(0, 100)}"`);
        }
        break;
      }

      case 'assertUrl': {
        const currentUrl = page.url();
        const expected = step.url.startsWith('/') ? `${baseUrl}${step.url}` : step.url;
        if (!currentUrl.includes(expected)) {
          throw new Error(`Expected URL containing "${expected}", got "${currentUrl}"`);
        }
        break;
      }

      case 'assertNoErrors':
        if (errors.length > 0) {
          const msgs = errors.splice(0).join(', ');
          throw new Error(`Console errors detected: ${msgs}`);
        }
        break;

      case 'screenshot': {
        const name = step.name || `${flowName}-step`.replace(/\s+/g, '-').toLowerCase();
        await page.screenshot({
          path: join(screenshotDir, `flow-${name}.png`),
          fullPage: true,
        });
        break;
      }

      case 'supabaseAuth':
        if (!config?.supabase) throw new Error('supabaseAuth requires a "supabase" config section in .ux-test.json');
        await supabaseAuth(page, step, config);
        break;

      case 'supabaseSignOut':
        if (!config?.supabase) throw new Error('supabaseSignOut requires a "supabase" config section in .ux-test.json');
        await supabaseSignOut(page, config);
        break;

      default:
        throw new Error(`Unknown action: ${step.action}`);
    }

    return { action: step.action, label, passed: true, duration: Date.now() - start };
  } catch (err) {
    return { action: step.action, label, passed: false, duration: Date.now() - start, error: err.message };
  }
}

function describeStep(step) {
  switch (step.action) {
    case 'goto': return `goto ${step.url}`;
    case 'click': return `click ${step.selector}`;
    case 'type': return `type "${step.value}" into ${step.selector}`;
    case 'press': return `press ${step.key}`;
    case 'hover': return `hover ${step.selector}`;
    case 'waitFor': return `waitFor ${step.selector}`;
    case 'wait': return `wait ${step.ms || 1000}ms`;
    case 'assertVisible': return `assertVisible ${step.selector}`;
    case 'assertText': return `assertText "${step.value}"`;
    case 'assertUrl': return `assertUrl ${step.url}`;
    case 'assertNoErrors': return 'assertNoErrors';
    case 'screenshot': return `screenshot ${step.name || ''}`;
    case 'supabaseAuth': return `supabaseAuth ${step.email}`;
    case 'supabaseSignOut': return 'supabaseSignOut';
    default: return step.action;
  }
}
