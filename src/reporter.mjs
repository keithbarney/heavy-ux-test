import { basename } from 'node:path';

export function printHeader(projectDir, port) {
  const name = basename(projectDir);
  console.log('');
  console.log(`🔍 ${name} (localhost:${port})`);
  console.log('='.repeat(name.length + 20));
}

export function printSmokeResults(results) {
  console.log('');
  console.log('📄 SMOKE TESTS');

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    const timing = `${r.duration}ms`;
    const padded = r.route.padEnd(24);

    if (r.passed) {
      console.log(`  ${padded} ${icon} ${timing}`);
    } else {
      console.log(`  ${padded} ${icon} ${timing}`);
      if (r.timedOut) console.log(`    ⏱️  Timed out`);
      if (r.isBlank) console.log(`    📭 Page is blank`);
      for (const err of r.errors) {
        console.log(`    ⚠️  ${truncate(err, 80)}`);
      }
      for (const nf of r.networkFailures) {
        console.log(`    🌐 ${truncate(nf, 80)}`);
      }
    }

    // Breakpoint visual results
    if (r.screenshots && r.screenshots.length > 0) {
      const parts = r.screenshots.map((s) => {
        if (s.baselineCreated) return `${s.width} 🆕`;
        if (s.baselineUpdated) return `${s.width} 📸`;
        if (s.visual) {
          if (s.visual.match) return `${s.width} ✅`;
          if (s.visual.dimensionMismatch) return `${s.width} ❌ resize`;
          return `${s.width} ❌ ${formatDiffPercent(s.visual.diffPercent)}`;
        }
        return `${s.width} 📸`;
      });
      console.log(`    ${parts.join('  ')}`);
    }
  }
}

export function printFlowResults(results) {
  if (results.length === 0) return;

  console.log('');
  console.log('🔗 FLOW TESTS');

  for (const flow of results) {
    const icon = flow.passed ? '✅' : '❌';
    console.log(`  ${icon} ${flow.name}`);

    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      const stepIcon = step.passed ? '✅' : '❌';
      const timing = step.duration ? ` ${step.duration}ms` : '';
      console.log(`    ${i + 1}. ${step.label.padEnd(24)} ${stepIcon}${timing}`);

      if (!step.passed && step.error) {
        console.log(`       ⚠️  ${truncate(step.error, 70)}`);
      }
    }
  }
}

export function printA11yResults(results) {
  if (results.length === 0) return;

  console.log('');
  console.log('♿ ACCESSIBILITY (WCAG 2.1 AA)');

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    const timing = `${r.duration}ms`;
    const padded = r.route.padEnd(24);

    if (r.error) {
      console.log(`  ${padded} ❌ ${timing}`);
      console.log(`    ⚠️  ${truncate(r.error, 80)}`);
      continue;
    }

    if (r.passed) {
      console.log(`  ${padded} ${icon} ${timing}`);
    } else {
      console.log(`  ${padded} ${icon} ${timing}  ${r.violationCount} violations, ${r.nodeCount} elements`);
      for (const v of r.violations) {
        const impactIcon = v.impact === 'critical' || v.impact === 'serious' ? '🔴' : v.impact === 'moderate' ? '🟡' : '🟢';
        console.log(`    ${impactIcon} ${v.id} (${v.impact}) × ${v.nodes}`);
        console.log(`       ${v.description}`);
        if (v.target) console.log(`       → ${v.target}`);
      }
    }
  }
}

export function printSummary(smokeResults, flowResults, screenshotDir, a11yResults = []) {
  const smokeTotal = smokeResults.length;
  const smokePassed = smokeResults.filter((r) => r.passed).length;

  let flowTotal = 0;
  let flowPassed = 0;
  for (const f of flowResults) {
    flowTotal++;
    if (f.passed) flowPassed++;
  }

  const a11yTotal = a11yResults.length;
  const a11yPassed = a11yResults.filter((r) => r.passed).length;

  const total = smokeTotal + flowTotal + a11yTotal;
  const passed = smokePassed + flowPassed + a11yPassed;
  const allPassed = passed === total;

  console.log('');
  if (allPassed) {
    console.log(`RESULTS: 🎉 ${passed}/${total} passed`);
  } else {
    console.log(`RESULTS: 💥 ${passed}/${total} passed, ${total - passed} failed`);
  }

  // Visual regression summary
  const allScreenshots = smokeResults.flatMap((r) => r.screenshots || []);
  if (allScreenshots.length > 0) {
    const baselinesCreated = allScreenshots.filter((s) => s.baselineCreated).length;
    const baselinesUpdated = allScreenshots.filter((s) => s.baselineUpdated).length;
    const compared = allScreenshots.filter((s) => s.visual).length;
    const matched = allScreenshots.filter((s) => s.visual?.match).length;
    const failed = allScreenshots.filter((s) => s.visual && !s.visual.match);

    console.log(`Screenshots: ${allScreenshots.length} total`);

    if (baselinesCreated > 0) {
      console.log(`  🆕 No baselines found — created ${baselinesCreated} baselines`);
    }
    if (baselinesUpdated > 0) {
      console.log(`  📸 Updated ${baselinesUpdated} baselines`);
    }
    if (compared > 0) {
      console.log(`  🔍 Compared ${compared}: ${matched} matched, ${failed.length} failed`);
    }
    for (const s of failed) {
      if (s.visual.dimensionMismatch) {
        console.log(`    ❌ ${s.filename}: dimension mismatch (${s.visual.current.width}x${s.visual.current.height} vs ${s.visual.baseline.width}x${s.visual.baseline.height})`);
      } else {
        console.log(`    ❌ ${s.filename}: ${formatDiffPercent(s.visual.diffPercent)} diff → ${s.visual.diffPath}`);
      }
    }
  }

  // Accessibility summary
  if (a11yTotal > 0) {
    const totalViolations = a11yResults.reduce((sum, r) => sum + r.violationCount, 0);
    const totalNodes = a11yResults.reduce((sum, r) => sum + r.nodeCount, 0);
    if (totalViolations === 0) {
      console.log(`Accessibility: ${a11yPassed}/${a11yTotal} routes clean`);
    } else {
      console.log(`Accessibility: ${a11yPassed}/${a11yTotal} routes clean, ${totalViolations} violations across ${totalNodes} elements`);
    }
  }

  if (screenshotDir) {
    console.log(`Output: ${screenshotDir}`);
  }
  console.log('');

  return allPassed;
}

function formatDiffPercent(pct) {
  if (pct < 0.01) return `<0.01%`;
  if (pct < 0.1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(1)}%`;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
