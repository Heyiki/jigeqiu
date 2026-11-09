import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPermissionFetch,
  sitePermission,
} from '../permissions/network.ts';

test('ungranted and unsupported sites never reach fetch', async () => {
  let calls = 0;
  const guarded = createPermissionFetch(
    { contains: async () => false },
    async () => {
      calls++;
      return new Response();
    },
  );
  for (const url of [
    'https://github.com/favicon.ico',
    'http://github.com/favicon.ico',
    'https://user:pass@github.com/icon.png',
  ]) {
    await assert.rejects(guarded(url), TypeError);
  }
  assert.equal(calls, 0);
  assert.equal(
    sitePermission('https://github.com/path?q=private'),
    'https://github.com/*',
  );
  assert.equal(sitePermission('http://github.com'), undefined);
});

test('granted fetch preserves cancellation and credentials restrictions and blocks redirects', async () => {
  const controller = new AbortController();
  let grant = true;
  const requests = [];
  const guarded = createPermissionFetch(
    {
      contains: async ({ origins }) =>
        grant && origins[0] === 'https://github.com/*',
    },
    async (input, init) => {
      requests.push({ input, init });
      return new Response('icon');
    },
  );
  assert.equal(
    await (
      await guarded('https://github.com/favicon.ico', {
        signal: controller.signal,
      })
    ).text(),
    'icon',
  );
  assert.equal(requests[0].init.signal, controller.signal);
  assert.equal(requests[0].init.credentials, 'omit');
  assert.equal(requests[0].init.redirect, 'error');
  assert.equal(requests[0].init.referrerPolicy, 'no-referrer');
  grant = false;
  await assert.rejects(guarded('https://github.com/favicon.ico'), TypeError);
  assert.equal(requests.length, 1);
});

test('aborted granted requests and other origins do not reach transport', async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const guarded = createPermissionFetch(
    { contains: async ({ origins }) => origins[0] === 'https://github.com/*' },
    async () => {
      calls++;
      return new Response();
    },
  );
  await assert.rejects(
    guarded('https://github.com/favicon.ico', { signal: controller.signal }),
    { name: 'AbortError' },
  );
  await assert.rejects(
    guarded('https://github.githubassets.com/icon.png'),
    TypeError,
  );
  assert.equal(calls, 0);
});
