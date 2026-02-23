import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export async function runA11yTests(browser, routes, baseUrl, config) {
  const results = [];

  for (const route of routes) {
    const start = Date.now();
    const url = `${baseUrl}${route}`;
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.setViewportSize({ width: 1024, height: 720 });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // Wait for network to settle, then a brief pause for JS rendering
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);

      // Build axe scan
      let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);

      if (config.a11yRules) {
        if (config.a11yRules.disable?.length) {
          builder = builder.disableRules(config.a11yRules.disable);
        }
        if (config.a11yRules.include?.length) {
          for (const selector of config.a11yRules.include) {
            builder = builder.include(selector);
          }
        }
        if (config.a11yRules.exclude?.length) {
          for (const selector of config.a11yRules.exclude) {
            builder = builder.exclude(selector);
          }
        }
      }

      const axeResults = await builder.analyze();
      const duration = Date.now() - start;

      const violations = axeResults.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.length,
        target: v.nodes[0]?.target?.[0] || null,
      }));

      const nodeCount = violations.reduce((sum, v) => sum + v.nodes, 0);

      results.push({
        route,
        passed: violations.length === 0,
        duration,
        violations,
        violationCount: violations.length,
        nodeCount,
      });
    } catch (err) {
      results.push({
        route,
        passed: false,
        duration: Date.now() - start,
        violations: [],
        violationCount: 0,
        nodeCount: 0,
        error: err.message,
      });
    } finally {
      await context.close();
    }
  }

  return results;
}
