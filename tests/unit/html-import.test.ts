import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ASSET_LIMITS, captureJsonInput } from '../../src/domain/assets/validation';
import { parseHtml } from '../../src/services/import-export/html';
import type { ImportDocument, ImportNode } from '../../src/services/import-export/model';

function document(html: string): ImportDocument {
  const result = parseHtml(html);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('expected parsed document');
  return result.value;
}
function rejects(html: string, code = 'IMPORT_INVALID'): void {
  const result = parseHtml(html);
  assert.equal(result.ok, false, 'must reject, not truncate');
  if (!result.ok) assert.equal(result.error.code, code);
}
function bookmark(sourceId: string, title: string, url: string): ImportNode {
  return { kind: 'bookmark', sourceId, input: { title, url, icon: null, notes: '', keywords: [] } };
}
function nested(depth: number): string {
  return '<DL>' + '<DT><H3>F</H3><DL>'.repeat(depth)
    + '<DT><A HREF="https://leaf.test">leaf</A>' + '</DL></DT>'.repeat(depth) + '</DL>';
}

test('HTML accepts empty DL but rejects an ordinary webpage or absent bookmark tree', () => {
  assert.deepEqual(document('<DL><p></DL>'), { format: 'html', roots: [], collections: [], notices: [] });
  for (const html of ['', '<!doctype html><h1>Site</h1><a href="https://x.test">X</a>',
    '<script><DL></DL></script>', '<template><DL></DL></template>', '<svg><foreignObject><dl></dl></foreignObject></svg>']) {
    rejects(html);
  }
});

test('HTML preserves same-name and empty folders, nested mixed order and sequential identities', () => {
  const source = `<DL>
    <DT><A HREF="https://root.test">root</A></DT>
    <DT><H3>Same</H3><DL>
      <DT><A HREF="https://child.test">child</A></DT>
      <DT><H3></H3><DL></DL></DT>
      <DT><A HREF="https://tail.test">tail</A></DT>
    </DL></DT>
    <DT><H3>Same</H3></DT><DL></DL>
    <DT><A HREF="https://end.test">end</A></DT>
  </DL>`;
  assert.deepEqual(document(source), {
    format: 'html', collections: [], notices: [], roots: [
      bookmark('html-1', 'root', 'https://root.test'),
      { kind: 'folder', sourceId: 'html-2', name: 'Same', children: [
        bookmark('html-3', 'child', 'https://child.test'),
        { kind: 'folder', sourceId: 'html-4', name: '', children: [] },
        bookmark('html-5', 'tail', 'https://tail.test'),
      ] },
      { kind: 'folder', sourceId: 'html-6', name: 'Same', children: [] },
      bookmark('html-7', 'end', 'https://end.test'),
    ],
  });
});

test('HTML supports Netscape DOCTYPE and implied DT and P closing tags', () => {
  assert.deepEqual(document(`<!DOCTYPE NETSCAPE-Bookmark-file-1>
    <TITLE>Bookmarks</TITLE><H1>Bookmarks</H1><DL><p>
    <DT><H3>Folder</H3><DL><p>
    <DT><A HREF="https://one.test">one</A>
    <DT><H3>Empty</H3><DL><p></DL><p>
    </DL><p><DT><A HREF="https://two.test">two</A>
    </DL><p>`).roots, [
    { kind: 'folder', sourceId: 'html-1', name: 'Folder', children: [
      bookmark('html-2', 'one', 'https://one.test'),
      { kind: 'folder', sourceId: 'html-3', name: 'Empty', children: [] },
    ] },
    bookmark('html-4', 'two', 'https://two.test'),
  ]);
});

test('HTML decodes Unicode, entities and inline title text without HTML or remote icons', () => {
  assert.deepEqual(document(`<DL><DT><H3>&#x4E66; &amp; &#128214;</H3><DL>
    <DT><A HREF=" HTTPS://EXAMPLE.COM:443/a?x=1&amp;y=2 " ICON="https://remote.test/icon">
    &#x4E2D;<b> &amp; &lt;tag&gt;</b><img src="https://remote.test/image"></A>
    </DL></DL>`).roots, [
    { kind: 'folder', sourceId: 'html-1', name: '\u4e66 & \ud83d\udcd6', children: [
      bookmark('html-2', '\u4e2d & <tag>', 'HTTPS://EXAMPLE.COM:443/a?x=1&y=2'),
    ] },
  ]);
});

test('HTML normalizes only trim and missing HTTPS, preserving URL spelling', () => {
  const doc = document(`<DL>
    <DT><A HREF=" example.com/Case?b=2&amp;a=1#frag ">Domain</A>
    <DT><A HREF="localhost:8080/x"></A>
    <DT><A HREF="HTTP://Example.COM:80/A">HTTP</A>
    <DT><A HREF="[::1]:8080/a">IPv6</A>
    </DL>`);
  assert.deepEqual(doc.roots, [
    bookmark('html-1', 'Domain', 'https://example.com/Case?b=2&a=1#frag'),
    bookmark('html-2', 'https://localhost:8080/x', 'https://localhost:8080/x'),
    bookmark('html-3', 'HTTP', 'HTTP://Example.COM:80/A'),
    bookmark('html-4', 'IPv6', 'https://[::1]:8080/a'),
  ]);
});

test('HTML emits exactly one stable per-entry invalid URL notice with globally distinct IDs', () => {
  const doc = document(`<DL><DT><A HREF="https://ok.test">ok</A>
    <DT><A HREF="javascript:alert(1)">bad</A>
    <DT><H3>F</H3><DL><DT><A>missing</A>
    <DT><A HREF=" ">empty</A><DT><A HREF="https://two.test">two</A></DL>
    <DT><A HREF="https://has space.test">space</A></DL>`);
  assert.deepEqual(doc.notices, [
    { code: 'INVALID_HTML_BOOKMARK', details: { sourceId: 'html-2', url: 'javascript:alert(1)', reason: 'unsupported-protocol' } },
    { code: 'INVALID_HTML_BOOKMARK', details: { sourceId: 'html-4', url: '', reason: 'missing-href' } },
    { code: 'INVALID_HTML_BOOKMARK', details: { sourceId: 'html-5', url: ' ', reason: 'empty-url' } },
    { code: 'INVALID_HTML_BOOKMARK', details: { sourceId: 'html-7', url: 'https://has space.test', reason: 'url-whitespace' } },
  ]);
  assert.deepEqual(doc.roots, [
    bookmark('html-1', 'ok', 'https://ok.test'),
    { kind: 'folder', sourceId: 'html-3', name: 'F', children: [
      bookmark('html-6', 'two', 'https://two.test'),
    ] },
  ]);
});

test('HTML all-invalid URLs return a noticed empty document, never a fake bookmark', () => {
  const values = ['javascript:1', 'javascript:123', 'data:text/html,hello', 'file:///tmp/a',
    'ftp://example.com', 'mailto:a@example.com', '/relative', '../relative', '//example.com',
    'https://', 'https://bad\\host.test', 'https://bad&#10;host.test', 'http:example.com', '#fragment', '?query'];
  const doc = document('<DL>' + values.map(value => `<DT><A HREF="${value}">bad</A>`).join('') + '</DL>');
  assert.deepEqual(doc.roots, []);
  assert.equal(doc.notices.length, values.length);
  assert.equal(new Set(doc.notices.map(notice => notice.details.sourceId)).size, values.length);
  assert.ok(doc.notices.every(notice => notice.code === 'INVALID_HTML_BOOKMARK'
    && typeof notice.details.reason === 'string' && notice.details.reason.length > 0));
});

for (const [hrefKind, href] of [['invalid', ' HREF="javascript:1"'], ['missing', '']] as const) {
  for (const [tag, body, reason] of [
    ['H3', '<H3>Folder</H3>', 'nested-bookmark-label'],
    ['DL', '<DL></DL>', 'nested-bookmark-label'],
    // A nested DT makes parse5 reparent this populated DL outside the anchor.
    ['populated DL', '<DL><DT><A HREF="https://hidden.test">hidden</A></DL>', 'unowned-bookmark-list'],
    // parse5 repairs nested anchors into sibling entries in the same DT.
    ['A', '<A HREF="https://hidden.test">hidden</A>', 'multiple-dt-entries'],
  ] as const) {
    test(`HTML ${hrefKind} href cannot bypass structural validation of nested ${tag}`, () => {
      for (const attribute of [' HREF="https://outer.test"', href]) {
        const result = parseHtml(`<DL><DT><A${attribute}>outer${body}</A></DL>`);
        assert.deepEqual(result, { ok: false, error: { code: 'IMPORT_INVALID', details: { reason } } });
      }
    });
  }
}

test('HTML structurally valid invalid and missing href entries still skip even with overlong labels', () => {
  const long = 'x'.repeat(ASSET_LIMITS.titleLength + 1);
  const doc = document(`<DL><DT><A HREF="javascript:1"><b>${long}</b></A>
    <DT><A>${long}</A><DT><A HREF="https://safe.test">safe</A></DL>`);
  assert.deepEqual(doc.roots, [bookmark('html-3', 'safe', 'https://safe.test')]);
  assert.deepEqual(doc.notices, [
    { code: 'INVALID_HTML_BOOKMARK', details: { sourceId: 'html-1', url: 'javascript:1', reason: 'unsupported-protocol' } },
    { code: 'INVALID_HTML_BOOKMARK', details: { sourceId: 'html-2', url: '', reason: 'missing-href' } },
  ]);
});

test('HTML ignores executable, inert and foreign content including nested fake bookmark trees', () => {
  const fake = '<DL><DT><H3>fake</H3><DL><DT><A href="https://fake.test">fake</A></DL></DL>';
  const tags = ['script', 'style', 'template', 'noscript', 'iframe'];
  const foreign = `<svg><foreignObject>${fake}</foreignObject></svg>`
    + `<math><annotation-xml encoding="text/html">${fake}</annotation-xml></math>`;
  const doc = document('<DL>' + foreign + tags.map(tag => `<${tag}>${fake}</${tag}>`).join('')
    + '<DT><A HREF="https://safe.test" onclick="throw 1">safe'
    + [...tags, 'svg', 'math'].map(tag => `<${tag}>bad</${tag}>`).join('') + '</A></DL>');
  assert.deepEqual(doc.roots, [bookmark('html-1', 'safe', 'https://safe.test')]);
  assert.deepEqual(doc.notices, []);
});

test('HTML rejects foreign-content breakout instead of importing reparented fake entries', () => {
  rejects('<svg><DL><DT><A href="https://fake.test">fake</A></DL></svg>');
  rejects('<math><DL><DT><A href="https://fake.test">fake</A></DL></math>');
  assert.deepEqual(document('<svg><path /></svg><DL></DL>').roots, []);
});

test('HTML rejects ambiguous folder ownership rather than silently flattening', () => {
  for (const html of [
    '<DL><DL><DT><A href="https://a.test">a</A></DL></DL>',
    '<DL><DT><H3>A</H3><H3>B</H3><DL></DL></DL>',
    '<DL><DT><A href="https://a.test">a</A><DL></DL></DL>',
    '<DL><DT><H3>A</H3><DL></DL><DL></DL></DL>',
    '<DL><div><DT><H3>A</H3><DL></DL></div></DL>',
    '<DL><DT><H3>A<DL></DL></H3></DL>',
    '<DL></DL><DL></DL>',
  ]) rejects(html);
});

test('HTML folder depth 64 succeeds and 65 rejects without truncation', () => {
  const doc = document(nested(64));
  assert.equal(captureJsonInput(doc, 144).ok, true);
  let nodes = doc.roots;
  for (let index = 0; index < 64; index++) {
    const folder = nodes[0];
    assert.equal(folder.kind, 'folder');
    if (folder.kind === 'folder') nodes = folder.children;
  }
  assert.deepEqual(nodes, [bookmark('html-65', 'leaf', 'https://leaf.test')]);
  rejects(nested(65), 'IMPORT_TOO_LARGE');
});

test('HTML entity budget includes skipped invalid URLs as well as folders and bookmarks', () => {
  const item = '<DT><A HREF="https://x.test">x</A>';
  assert.equal(document('<DL>' + item.repeat(20000) + '</DL>').roots.length, 20000);
  rejects('<DL>' + item.repeat(20001) + '</DL>', 'IMPORT_TOO_LARGE');
  const invalid = '<DT><A HREF="javascript:1">x</A>';
  assert.equal(document('<DL>' + invalid.repeat(20000) + '</DL>').notices.length, 20000);
  rejects('<DL><DT><H3>F</H3><DL>' + invalid.repeat(20000) + '</DL></DL>', 'IMPORT_TOO_LARGE');
});

test('HTML input is bounded by UTF-8 bytes, not UTF-16 length', () => {
  const suffix = '<DL></DL>';
  assert.deepEqual(document(' '.repeat(ASSET_LIMITS.bytes - suffix.length) + suffix).roots, []);
  rejects(' '.repeat(ASSET_LIMITS.bytes) + suffix, 'IMPORT_TOO_LARGE');
  rejects('<!--' + '\u4e2d'.repeat(Math.ceil(ASSET_LIMITS.bytes / 3)) + '--><DL></DL>', 'IMPORT_TOO_LARGE');
});

test('HTML bounds ignored AST nodes and malicious non-library nesting', () => {
  rejects('<DL></DL>' + '<!--x-->'.repeat(100001), 'IMPORT_TOO_LARGE');
  rejects('<DL></DL><template>' + '<!--x-->'.repeat(100001) + '</template>', 'IMPORT_TOO_LARGE');
  rejects('<div>'.repeat(600) + '<DL></DL>' + '</div>'.repeat(600), 'IMPORT_TOO_LARGE');
  rejects('<DL><DT><A href="https://x.test">' + '<span>'.repeat(600) + 'x'
    + '</span>'.repeat(600) + '</A></DL>', 'IMPORT_TOO_LARGE');
});

test('HTML valid overlong entity text rejects the entire file instead of skipping or truncating', () => {
  const long = 'x'.repeat(1025);
  rejects(`<DL><DT><A href="https://good.test">good</A><DT><H3>${long}</H3><DL></DL></DL>`, 'IMPORT_TOO_LARGE');
  rejects(`<DL><DT><A href="https://x.test">${long}</A></DL>`, 'IMPORT_TOO_LARGE');
  rejects(`<DL><DT><A href="https://x.test">${'&#120;'.repeat(1025)}</A></DL>`, 'IMPORT_TOO_LARGE');
  rejects(`<DL><DT><A href="https://x.test/${'a'.repeat(8192)}">x</A></DL>`, 'IMPORT_TOO_LARGE');
  rejects(`<DL><DT><A href="https://x.test/${'a'.repeat(1024)}"></A></DL>`, 'IMPORT_TOO_LARGE');
  assert.equal(document(`<DL><DT><A href="https://x.test">${'x'.repeat(1024)}</A></DL>`).roots.length, 1);
});

test('HTML rejects output amplification beyond the 16 MiB serialized capture budget', () => {
  const html = '<DL>' + `<DT><A href="https://x.test">${'"'.repeat(1000)}</A>`.repeat(10000) + '</DL>';
  assert.ok(new TextEncoder().encode(html).byteLength < ASSET_LIMITS.bytes);
  rejects(html, 'IMPORT_TOO_LARGE');
});

test('HTML invalid href notice preserves the full raw decoded URL or rejects the whole document', () => {
  const url = 'javascript:' + 'x'.repeat(20000);
  assert.deepEqual(document(`<DL><DT><A href="${url}">bad</A></DL>`).notices, [
    { code: 'INVALID_HTML_BOOKMARK', details: { sourceId: 'html-1', url, reason: 'unsupported-protocol' } },
  ]);
});

test('HTML rejects non-string inputs without reading coercion hooks', () => {
  const values: unknown[] = [null, undefined, 1, true, [], {}, Symbol('html'),
    { toString() { throw new Error('must not coerce'); } },
    new String('<DL></DL>'),
    new Proxy({}, { get() { throw new Error('must not inspect'); } })];
  for (const value of values) {
    const result = parseHtml(value as string);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'IMPORT_INVALID');
  }
});

test('HTML is detached, deterministic and never uses global browser, network or storage APIs', () => {
  const names = ['window', 'document', 'DOMParser', 'fetch', 'XMLHttpRequest', 'Image', 'localStorage', 'sessionStorage'];
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  try {
    for (const name of names) Object.defineProperty(globalThis, name, {
      configurable: true, get() { throw new Error(`unexpected global ${name}`); },
    });
    const source = '<DL><DT><H3>F</H3><DL><DT><A href="https://x.test">x</A></DL></DL>';
    const first = document(source);
    const original = structuredClone(first);
    const second = document(source);
    assert.deepEqual(second, first);
    assert.equal(source, '<DL><DT><H3>F</H3><DL><DT><A href="https://x.test">x</A></DL></DL>');
    const folder = second.roots[0];
    if (folder.kind === 'folder') folder.children.length = 0;
    assert.deepEqual(first, original);
    assert.deepEqual(document(source), original);
  } finally {
    for (const [index, name] of names.entries()) {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('HTML parses the shared synthetic browser fixture without merging same-name folders', () => {
  const source = readFileSync(new URL('../fixtures/synthetic-bookmarks.html', import.meta.url), 'utf8');
  const doc = document(source);
  assert.deepEqual(doc.roots.map(node => node.kind), ['bookmark', 'folder', 'folder', 'bookmark']);
  const first = doc.roots[1];
  const second = doc.roots[2];
  assert.equal(first.kind, 'folder');
  assert.equal(second.kind, 'folder');
  if (first.kind === 'folder' && second.kind === 'folder') {
    assert.equal(first.name, 'Same');
    assert.equal(second.name, 'Same');
    assert.deepEqual(first.children.map(node => node.kind), ['bookmark', 'folder']);
    assert.deepEqual(second.children, []);
    assert.notEqual(first.sourceId, second.sourceId);
  }
  assert.equal(doc.notices.length, 1);
  assert.equal(doc.notices[0].code, 'INVALID_HTML_BOOKMARK');
});
