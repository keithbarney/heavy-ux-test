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

export function printSummary(smokeResults, flowResults, screenshotDir) {
  const smokeTotal = smokeResults.length;
  const smokePassed = smokeResults.filter((r) => r.passed).length;

  let flowTotal = 0;
  let flowPassed = 0;
  for (const f of flowResults) {
    flowTotal++;
    if (f.passed) flowPassed++;
  }

  const total = smokeTotal + flowTotal;
  const passed = smokePassed + flowPassed;
  const allPassed = passed === total;

  console.log('');
  if (allPassed) {
    console.log(`RESULTS: 🎉 ${passed}/${total} passed`);
  } else {
    console.log(`RESULTS: 💥 ${passed}/${total} passed, ${total - passed} failed`);
  }

  if (screenshotDir) {
    console.log(`Screenshots: ${screenshotDir}`);
  }
  console.log('');

  return allPassed;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
