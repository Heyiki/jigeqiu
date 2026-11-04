import { defaultTreeAdapter, parse } from 'parse5';
import type { DefaultTreeAdapterTypes as AST, TreeAdapter, DefaultTreeAdapterMap } from 'parse5';
import type { AppError, ErrorCode, Result } from '../../domain/assets/model';
import { ASSET_LIMITS, captureJsonInput } from '../../domain/assets/validation';
import type { ImportDocument, ImportNode } from './model';

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const AST_NODES = 100000;
const AST_DEPTH = 512;
const ignoredTags = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'svg']);
const structuralTags = new Set(['dt', 'dl', 'h3', 'a']);

class HtmlFailure {
  constructor(readonly error: AppError) {}
}
function reject(reason: string, code: ErrorCode = 'IMPORT_INVALID'): never {
  throw new HtmlFailure({ code, details: { reason } });
}
function ignored(node: AST.Node): boolean {
  return defaultTreeAdapter.isElementNode(node)
    && (node.namespaceURI !== HTML_NAMESPACE || ignoredTags.has(node.tagName));
}
function children(node: AST.Node): AST.ChildNode[] {
  return 'childNodes' in node ? node.childNodes : [];
}

function parseBounded(text: string): AST.Document {
  let created = 0;
  let open = 0;
  function allocate(): void {
    if (++created > AST_NODES) reject('html-ast-node-budget', 'IMPORT_TOO_LARGE');
  }
  // Keep parse5's adapter; only guard allocations and its open-element stack.
  // Text and template contents are also counted in the complete AST pass below.
  const treeAdapter: TreeAdapter<DefaultTreeAdapterMap> = {
    ...defaultTreeAdapter,
    createElement(...args) { allocate(); return defaultTreeAdapter.createElement(...args); },
    createCommentNode(...args) { allocate(); return defaultTreeAdapter.createCommentNode(...args); },
    createDocumentFragment() { allocate(); return defaultTreeAdapter.createDocumentFragment(); },
    onItemPush() {
      if (++open > AST_DEPTH) reject('html-ast-depth', 'IMPORT_TOO_LARGE');
    },
    onItemPop() { open--; },
  };
  const ast = parse(text, { treeAdapter, scriptingEnabled: true, sourceCodeLocationInfo: true });
  let count = 0;
  const stack: { node: AST.Node; depth: number }[] = [{ node: ast, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (++count > AST_NODES) reject('html-ast-node-budget', 'IMPORT_TOO_LARGE');
    if (depth > AST_DEPTH) reject('html-ast-depth', 'IMPORT_TOO_LARGE');
    if (defaultTreeAdapter.isElementNode(node) && node.namespaceURI !== HTML_NAMESPACE) {
      const location = node.sourceCodeLocation;
      const end = location?.startTag?.endOffset;
      if (!location?.endTag && (end === undefined || text.slice(end - 2, end) !== '/>')) {
        // HTML breakout tokens can escape SVG/MathML in the repaired tree.
        // An implicitly closed foreign element cannot establish safe ownership.
        reject('ambiguous-foreign-content');
      }
    }
    for (const child of children(node)) stack.push({ node: child, depth: depth + 1 });
    if (defaultTreeAdapter.isElementNode(node) && node.tagName === 'template') {
      stack.push({ node: defaultTreeAdapter.getTemplateContent(node as AST.Template), depth: depth + 1 });
    }
  }
  return ast;
}

function rootList(ast: AST.Document): AST.Element {
  let root: AST.Element | undefined;
  const stack: AST.Node[] = [ast];
  while (stack.length) {
    const node = stack.pop()!;
    if (ignored(node)) continue;
    if (defaultTreeAdapter.isElementNode(node) && node.tagName === 'dl') {
      if (root) reject('multiple-root-lists');
      root = node;
      continue;
    }
    for (const child of children(node)) stack.push(child);
  }
  if (!root) reject('missing-bookmark-list');
  return root;
}

function label(element: AST.Element): string {
  const parts: string[] = [];
  const stack: AST.Node[] = [...element.childNodes].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    if (ignored(node)) continue;
    if (defaultTreeAdapter.isTextNode(node)) parts.push(node.value);
    else {
      if (defaultTreeAdapter.isElementNode(node) && structuralTags.has(node.tagName)) {
        reject('nested-bookmark-label');
      }
      const nodes = children(node);
      for (let index = nodes.length - 1; index >= 0; index--) stack.push(nodes[index]);
    }
  }
  return parts.join('').trim();
}

type ListToken = { kind: 'start-dt' | 'end-dt' } | { kind: 'entry'; element: AST.Element };

function hasStructure(element: AST.Element, tags: Set<string> = structuralTags): boolean {
  const stack: AST.Node[] = [...element.childNodes];
  while (stack.length) {
    const node = stack.pop()!;
    if (ignored(node)) continue;
    if (defaultTreeAdapter.isElementNode(node) && tags.has(node.tagName)) return true;
    for (const child of children(node)) stack.push(child);
  }
  return false;
}

function* listTokens(list: AST.Element): Generator<ListToken> {
  const stack: (AST.Node | 'end-dt')[] = [...list.childNodes].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    if (node === 'end-dt') { yield { kind: 'end-dt' }; continue; }
    if (ignored(node)) continue;
    if (defaultTreeAdapter.isTextNode(node)) {
      if (node.value.trim()) reject('unexpected-list-text');
      continue;
    }
    if (!defaultTreeAdapter.isElementNode(node)) continue;
    if (['h3', 'a', 'dl'].includes(node.tagName)) {
      yield { kind: 'entry', element: node };
      continue;
    }
    if (node.tagName === 'dt') {
      yield { kind: 'start-dt' };
      stack.push('end-dt');
    } else if (node.tagName === 'dd') {
      // Descriptions are not bookmark entries, but cannot hide a second tree.
      if (hasStructure(node, new Set(['dt', 'h3', 'dl']))) reject('ambiguous-description-tree');
      continue;
    } else if (node.tagName !== 'p') {
      if (hasStructure(node)) reject('ambiguous-list-wrapper');
      continue;
    }
    for (let index = node.childNodes.length - 1; index >= 0; index--) stack.push(node.childNodes[index]);
  }
}

type UrlResult = { ok: true; url: string } | { ok: false; reason: string };
function normalizeUrl(raw: string | undefined): UrlResult {
  if (raw === undefined) return { ok: false, reason: 'missing-href' };
  let url = raw.trim();
  if (!url) return { ok: false, reason: 'empty-url' };
  if (/[\s\u0000-\u001f\u007f]/u.test(url)) return { ok: false, reason: 'url-whitespace' };
  if (url.includes('\\')) return { ok: false, reason: 'malformed-url' };
  if (!/^https?:\/\//i.test(url)) {
    // Only host-like numeric ports may be mistaken for a scheme. Never turn
    // javascript:123 (or another explicit scheme) into an HTTPS hostname.
    const hostPort = /^(?:localhost|[^/:?#]+\.[^/:?#]+|\[[\da-f:.]+\]):\d+(?:[/?#]|$)/i.test(url);
    if (/^[a-z][a-z\d+.-]*:/i.test(url) && !hostPort) {
      return { ok: false, reason: 'unsupported-protocol' };
    }
    if (/^[/.?#]/.test(url)) return { ok: false, reason: 'relative-url' };
    url = `https://${url}`;
  }
  // URL accepts empty authorities and repairs extra slashes; the import must not.
  if (!/^https?:\/\/[^/?#]/i.test(url)) return { ok: false, reason: 'malformed-url' };
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || !['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, reason: 'malformed-url' };
    }
  } catch {
    return { ok: false, reason: 'malformed-url' };
  }
  return { ok: true, url };
}

type Folder = Extract<ImportNode, { kind: 'folder' }>;
interface ListFrame {
  tokens: Generator<ListToken>;
  output: ImportNode[];
  depth: number;
  inDt: boolean;
  dtHasEntry: boolean;
  pending: Folder | null;
}
function frame(list: AST.Element, output: ImportNode[], depth: number): ListFrame {
  return { tokens: listTokens(list), output, depth, inDt: false, dtHasEntry: false, pending: null };
}

export function parseHtml(text: string): Result<ImportDocument> {
  try {
    if (typeof text !== 'string') reject('string-required');
    if (text.length > ASSET_LIMITS.bytes || new TextEncoder().encode(text).byteLength > ASSET_LIMITS.bytes) {
      reject('byte-budget', 'IMPORT_TOO_LARGE');
    }
    const root = rootList(parseBounded(text));
    const document: ImportDocument = { format: 'html', roots: [], collections: [], notices: [] };
    const stack = [frame(root, document.roots, 0)];
    let sequence = 0;
    while (stack.length) {
      const current = stack[stack.length - 1];
      const next = current.tokens.next();
      if (next.done) { stack.pop(); continue; }
      const token = next.value;
      if (token.kind === 'start-dt') {
        if (current.inDt) reject('nested-dt');
        current.inDt = true;
        current.dtHasEntry = false;
        current.pending = null;
        continue;
      }
      if (token.kind === 'end-dt') { current.inDt = false; continue; }
      if (token.kind !== 'entry') continue;
      const element = token.element;
      if (element.tagName === 'dl') {
        if (!current.pending) reject('unowned-bookmark-list');
        const folder = current.pending;
        current.pending = null;
        stack.push(frame(element, folder.children, current.depth + 1));
        continue;
      }
      if (current.inDt && current.dtHasEntry) reject('multiple-dt-entries');
      current.dtHasEntry = true;
      current.pending = null;
      if (++sequence > ASSET_LIMITS.nodes) reject('source-entity-budget', 'IMPORT_TOO_LARGE');
      const sourceId = `html-${sequence}`;
      if (element.tagName === 'h3') {
        if (current.depth >= ASSET_LIMITS.libraryDepth) reject('library-depth', 'IMPORT_TOO_LARGE');
        const name = label(element);
        if (name.length > ASSET_LIMITS.titleLength) reject('title-length', 'IMPORT_TOO_LARGE');
        const folder: Folder = { kind: 'folder', sourceId, name, children: [] };
        current.output.push(folder);
        current.pending = folder;
      } else {
        const text = label(element);
        const raw = element.attrs.find(attr => attr.name === 'href' && !attr.namespace)?.value;
        const normalized = normalizeUrl(raw);
        if (!normalized.ok) {
          document.notices.push({ code: 'INVALID_HTML_BOOKMARK',
            details: { sourceId, url: raw ?? '', reason: normalized.reason } });
          continue;
        }
        const title = text || normalized.url;
        if (title.length > ASSET_LIMITS.titleLength || normalized.url.length > ASSET_LIMITS.urlLength) {
          reject('bookmark-text-length', 'IMPORT_TOO_LARGE');
        }
        current.output.push({ kind: 'bookmark', sourceId, input: {
          title, url: normalized.url, icon: null, notes: '', keywords: [],
        } });
      }
    }
    const captured = captureJsonInput(document, 144);
    if (!captured.ok) return { ok: false, error: { ...captured.error, code: 'IMPORT_TOO_LARGE' } };
    return { ok: true, value: captured.value as unknown as ImportDocument };
  } catch (error) {
    if (error instanceof HtmlFailure) return { ok: false, error: error.error };
    return { ok: false, error: { code: 'IMPORT_INVALID', details: { reason: 'unreadable-html' } } };
  }
}
