import { spawn } from 'node:child_process';
import http from 'node:http';

const READY_SIGNALS = {
  vite: ['Local:', 'VITE', 'ready in'],
  nextjs: ['Ready in', '✓ Ready', 'started server'],
  'browser-sync': ['Serving files from', 'Local:'],
  static: [],
};

export async function checkServer(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function ensureServer(config) {
  const isRunning = await checkServer(config.port);
  if (isRunning) {
    return { started: false, process: null };
  }

  if (!config.startCommand) {
    throw new Error(
      `No server running on port ${config.port} and no startCommand configured.\n` +
        `Either start the dev server manually or add "startCommand" to .ux-test.json`
    );
  }

  const [cmd, ...args] = config.startCommand.split(' ');
  const child = spawn(cmd, args, {
    cwd: config._dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  const signals = READY_SIGNALS[config.type] || READY_SIGNALS.vite;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server startup timed out after 30s (port ${config.port})`));
    }, 30000);

    const onData = (chunk) => {
      const text = chunk.toString();
      if (signals.some((sig) => text.includes(sig))) {
        clearTimeout(timeout);
        resolve();
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start server: ${err.message}`));
    });

    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    // Also poll in case we miss the signal
    const poll = setInterval(async () => {
      if (await checkServer(config.port)) {
        clearTimeout(timeout);
        clearInterval(poll);
        resolve();
      }
    }, 500);
  });

  return { started: true, process: child };
}

export function stopServer(serverInfo) {
  if (serverInfo?.started && serverInfo.process) {
    serverInfo.process.kill('SIGTERM');
  }
}
