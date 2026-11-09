import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractBookmarkTitle, fetchBookmarkTitle } from '../../src/services/bookmark-title';

test('metadata names prefer site_name and preserve the original title without shortening', () => {
  const cases = [
    ['<title>  学习 React  -  知乎 </title><meta property="og:site_name" content="知乎">', '/article', '知乎'],
    ['<title>知乎 | 学习 React</title><meta property="og:site_name" content="知乎">', '/article', '知乎'],
    ['<title>首页 - 知乎</title><meta property="og:site_name" content="知乎">', '/', '知乎'],
    ['<title>GitHub - Where the world builds software</title>', '/', 'GitHub - Where the world builds software'],
    ['<title>设计 - 开发 - 实践</title>', '/article', '设计 - 开发 - 实践'],
    ['<title>UTF-8 与 Web APIs</title>', '/article', 'UTF-8 与 Web APIs'],
    ['<title>GitHub - 搜索结果</title>', '/?q=react', 'GitHub - 搜索结果'],
    ['<title>A &amp; B\n 入门</title>', '/', 'A & B\n 入门'],
    ['<title> </title><meta property="og:title" content="网页标题 - GitHub">', '/article', '网页标题 - GitHub'],
    ['<meta property="og:site_name" content="  网站 | 原名  "><title>标题</title>', '/', '网站 | 原名'],
    ['<meta property="og:site_name" content=" "><title> 原标题 - 网站 </title>', '/', '原标题 - 网站'],
    ['<title>原始标题</title><meta property="og:title" content="其他标题">', '/', '原始标题'],
    [`<title>${'长'.repeat(200)}</title>`, '/', '长'.repeat(200)],
    ['<template><title>错误</title></template><title>正确</title>', '/', '正确'],
  ];
  for (const [html, , expected] of cases) {
    assert.equal(extractBookmarkTitle(html), expected);
  }
});

test('optional title request reads the full destination without credentials or referrer', async () => {
  let requested = '';
  let options: RequestInit | undefined;
  const title = await fetchBookmarkTitle('github.com/article?q=react#section', new AbortController().signal, {
    fetch: async (input, init) => {
      requested = String(input); options = init;
      return new Response('<title>指南 - GitHub</title>', { headers: { 'content-type': 'text/html' } });
    },
  });
  assert.equal(title, '指南 - GitHub');
  assert.equal(requested, 'https://github.com/article?q=react');
  assert.equal(options?.credentials, 'omit');
  assert.equal(options?.mode, 'cors');
  assert.equal(options?.referrerPolicy, 'no-referrer');
});

test('unreadable, non-HTML, oversized and failed pages leave the domain fallback available', async () => {
  for (const response of [
    new Response('failure', { status: 403 }),
    new Response('<title>Not HTML</title>', { headers: { 'content-type': 'application/json' } }),
    new Response('<title>Too large</title>', { headers: { 'content-type': 'text/html', 'content-length': '999999' } }),
    new Response('x'.repeat(262145), { headers: { 'content-type': 'text/html' } }),
  ]) {
    assert.equal(await fetchBookmarkTitle('https://github.com', new AbortController().signal, {
      fetch: async () => response,
    }), undefined);
  }
  assert.equal(await fetchBookmarkTitle('javascript:alert(1)', new AbortController().signal, {
    fetch: async () => { throw new Error('must not request'); },
  }), undefined);
  assert.equal(await fetchBookmarkTitle('github.com', new AbortController().signal, {
    fetch: async () => { throw new TypeError('CORS'); },
  }), undefined);
});

test('timeout and cancellation settle even when transport ignores abort', async () => {
  const controller = new AbortController();
  const never: typeof fetch = async () => new Promise(() => {});
  assert.equal(await fetchBookmarkTitle('github.com', controller.signal, { fetch: never, timeoutMs: 10 }), undefined);
  const result = fetchBookmarkTitle('github.com', controller.signal, { fetch: never });
  controller.abort();
  assert.equal(await result, undefined);
});

test('deadline cancels a stalled response body and pre-cancelled work never starts', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('<title>Incomplete')); },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'text/html' } });
  const controller = new AbortController();
  assert.equal(await fetchBookmarkTitle('github.com', controller.signal, {
    fetch: async () => response, timeoutMs: 10,
  }), undefined);
  assert.equal(cancelled, true);
  controller.abort();
  let requested = false;
  await fetchBookmarkTitle('github.com', controller.signal, {
    fetch: async () => { requested = true; return response; },
  });
  assert.equal(requested, false);
});
