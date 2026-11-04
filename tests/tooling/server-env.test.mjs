import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '0.0.0.0');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startWithEnv(t, shellPort) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jigeqiu-env-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePort = await availablePort();
  await writeFile(path.join(directory, '.env'), `PORT=${filePort}\n`);
  const env = { ...process.env, NODE_ENV: 'production' };
  delete env.PORT;
  for (const key of Object.keys(env)) {
    if (key.startsWith('DOTENV_CONFIG_')) delete env[key];
  }
  if (shellPort) env.PORT = String(shellPort);
  const child = spawn(
    process.execPath,
    [
      '--import',
      path.join(root, 'node_modules/tsx/dist/loader.mjs'),
      path.join(root, 'server.ts'),
    ],
    { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  });
  let output = '';
  child.stderr.on('data', (data) => {
    output += data;
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Server startup timed out: ${output}`)),
      10000,
    );
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}): ${output}`));
    });
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(
        /Server listening on http:\/\/0\.0\.0\.0:(\d+)/,
      );
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
  });
  return { port, filePort };
}

test('server reads PORT from the working-directory .env file', async (t) => {
  const { port, filePort } = await startWithEnv(t);
  assert.equal(port, filePort);
  const response = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(response.headers.get('x-powered-by'), 'Express');
});

test('shell PORT takes precedence over .env', async (t) => {
  const shellPort = await availablePort();
  const { port } = await startWithEnv(t, shellPort);
  assert.equal(port, shellPort);
});
