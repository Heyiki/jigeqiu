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

async function startWithEnv(t, shellPort, fileHost, shellHost) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jigeqiu-env-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePort = await availablePort();
  await writeFile(
    path.join(directory, '.env'),
    `PORT=${filePort}\n${fileHost ? `HOST=${fileHost}\n` : ''}`,
  );
  const env = { ...process.env, NODE_ENV: 'production' };
  delete env.PORT;
  delete env.HOST;
  for (const key of Object.keys(env)) {
    if (key.startsWith('DOTENV_CONFIG_')) delete env[key];
  }
  if (shellPort) env.PORT = String(shellPort);
  if (shellHost) env.HOST = shellHost;
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
  const address = await new Promise((resolve, reject) => {
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
        /Server listening on http:\/\/([^:\s]+):(\d+)/,
      );
      if (match) {
        clearTimeout(timer);
        resolve({ host: match[1], port: Number(match[2]) });
      }
    });
  });
  return { ...address, filePort };
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

test('server defaults to the loopback address', async (t) => {
  const { host, port } = await startWithEnv(t);
  assert.equal(host, '127.0.0.1');
  const response = await fetch(`http://${host}:${port}/`);
  assert.equal(response.headers.get('x-powered-by'), 'Express');
});

test('server reads HOST from .env', async (t) => {
  const { host } = await startWithEnv(t, undefined, '0.0.0.0');
  assert.equal(host, '0.0.0.0');
});

test('shell HOST takes precedence over .env', async (t) => {
  const { host } = await startWithEnv(t, undefined, '0.0.0.0', '127.0.0.1');
  assert.equal(host, '127.0.0.1');
});
