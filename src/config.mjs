import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CONFIG_FILE = '.ux-test.json';
const GLOBAL_CONFIG_FILE = join(process.env.HOME, '.ux-test.json');

const DEFAULTS = {
  routes: null,
  skipRoutes: [],
  flows: [],
  startCommand: null,
  type: null,
  breakpoints: [375, 768, 1024, 1440],
  visualThreshold: 0.1,
  visual: true,
};

export async function loadConfig(projectDir) {
  const configPath = join(projectDir, CONFIG_FILE);
  let raw;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch {
    return null;
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${configPath}: ${err.message}`);
  }

  if (!config.port || typeof config.port !== 'number') {
    throw new Error(`${configPath}: "port" is required and must be a number`);
  }

  if (config.breakpoints !== undefined) {
    if (!Array.isArray(config.breakpoints) || config.breakpoints.some((b) => !Number.isInteger(b) || b <= 0)) {
      throw new Error(`${configPath}: "breakpoints" must be an array of positive integers`);
    }
  }

  if (config.visualThreshold !== undefined) {
    if (typeof config.visualThreshold !== 'number' || config.visualThreshold < 0 || config.visualThreshold > 100) {
      throw new Error(`${configPath}: "visualThreshold" must be a number between 0 and 100 (percentage of allowed pixel diff)`);
    }
  }

  return { ...DEFAULTS, ...config, _dir: projectDir };
}

export async function loadGlobalConfig() {
  let raw;
  try {
    raw = await readFile(GLOBAL_CONFIG_FILE, 'utf-8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function configExists(projectDir) {
  return readFile(join(projectDir, CONFIG_FILE), 'utf-8')
    .then(() => true)
    .catch(() => false);
}

export function shouldSkipRoute(route, skipPatterns) {
  return skipPatterns.some((pattern) => {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1);
      return route.startsWith(prefix);
    }
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(route);
    }
    return route === pattern;
  });
}
