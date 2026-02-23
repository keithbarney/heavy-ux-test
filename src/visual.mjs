import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export async function compareScreenshot(currentPath, baselinePath, diffPath, threshold) {
  const [currentBuf, baselineBuf] = await Promise.all([
    readFile(currentPath),
    readFile(baselinePath),
  ]);

  const current = PNG.sync.read(currentBuf);
  const baseline = PNG.sync.read(baselineBuf);

  // Dimension mismatch = automatic failure
  if (current.width !== baseline.width || current.height !== baseline.height) {
    return {
      match: false,
      diffPixels: -1,
      totalPixels: current.width * current.height,
      diffPercent: 100,
      diffPath: null,
      dimensionMismatch: true,
      current: { width: current.width, height: current.height },
      baseline: { width: baseline.width, height: baseline.height },
    };
  }

  const { width, height } = current;
  const totalPixels = width * height;
  const diff = new PNG({ width, height });

  const diffPixels = pixelmatch(
    current.data,
    baseline.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 },
  );

  const diffPercent = (diffPixels / totalPixels) * 100;
  const match = diffPercent <= threshold;

  // Only write diff image if there are differences
  if (!match) {
    await mkdir(dirname(diffPath), { recursive: true });
    await writeFile(diffPath, PNG.sync.write(diff));
  }

  return {
    match,
    diffPixels,
    totalPixels,
    diffPercent,
    diffPath: match ? null : diffPath,
    dimensionMismatch: false,
  };
}
