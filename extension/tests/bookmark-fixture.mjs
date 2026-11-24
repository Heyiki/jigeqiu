import assert from 'node:assert/strict';

export function bookmarkFixture() {
  let sequence = 20;
  const tree = [{ id: '0', title: '', children: [
    { id: '1', title: 'Bookmarks bar', folderType: 'bookmarks-bar', children: [
      { id: '10', title: 'Example', url: 'https://example.com/', dateAdded: 1 },
      { id: '11', title: 'Work', children: [{ id: '12', title: 'Another copy', url: 'https://example.com/' }] },
      { id: '13', title: 'Settings', url: 'chrome://settings/' },
    ] },
    { id: '2', title: 'Other bookmarks', children: [{ id: '14', title: 'Private', url: 'https://other.test/' }] },
  ] }];
  function find(id, node = tree[0]) {
    if (node.id === id) return node;
    for (const child of node.children ?? []) { const found = find(id, child); if (found) return found; }
  }
  function parent(id, node = tree[0]) {
    if (node.children?.some(child => child.id === id)) return node;
    for (const child of node.children ?? []) { const found = parent(id, child); if (found) return found; }
  }
  const calls = [];
  const api = {
    async getTree() { return structuredClone(tree); },
    async create({ parentId, title, url, index }) {
      const node = { id: String(sequence++), title, ...(url === undefined ? { children: [] } : { url }) };
      const target = find(parentId);
      assert.ok(target?.children);
      target.children.splice(index ?? target.children.length, 0, node);
      calls.push(['create', node.id]);
      return structuredClone(node);
    },
    async update(id, changes) { Object.assign(find(id), changes); calls.push(['update', id]); return structuredClone(find(id)); },
    async move(id, { parentId, index }) {
      const node = find(id);
      const from = parent(id);
      from.children.splice(from.children.findIndex(child => child.id === id), 1);
      const target = find(parentId);
      target.children.splice(index ?? target.children.length, 0, node);
      calls.push(['move', id]);
      return structuredClone(node);
    },
    async remove(id) {
      const node = find(id);
      if (node.children?.length) throw new Error('Folder not empty');
      const from = parent(id);
      from.children.splice(from.children.findIndex(child => child.id === id), 1);
      calls.push(['remove', id]);
    },
  };
  return { api, tree, find, calls };
}

