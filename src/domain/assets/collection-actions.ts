import type { ActionContext } from './command-context';
import type { AssetAction } from './commands';
import type { Collection, Cover, Icon, Provenance } from './model';

function sameIcon(left: Icon | null, right: Icon | null): boolean {
  if (left === null || right === null) return left === right;
  return left.kind === right.kind && left.value === right.value && left.color === right.color;
}

function sameCover(left: Cover | null, right: Cover | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.kind === 'symbol' && right.kind === 'symbol') {
    return left.symbol === right.symbol && left.color === right.color;
  }
  return left.kind === 'url' && right.kind === 'url' && left.url === right.url;
}

function sameProvenance(left: Provenance[], right: Provenance[]): boolean {
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index];
    return entry.sourceId === other.sourceId && entry.title === other.title
      && entry.author === other.author && entry.url === other.url;
  });
}

function sameBody(source: Collection, copy: Collection): boolean {
  return source.title === copy.title && source.description === copy.description
    && sameCover(source.cover, copy.cover)
    && source.sections.length === copy.sections.length
    && source.sections.every((section, sectionIndex) => {
      const other = copy.sections[sectionIndex];
      return section.title === other.title && section.description === other.description
        && section.items.length === other.items.length
        && section.items.every((item, itemIndex) => {
          const otherItem = other.items[itemIndex];
          return item.title === otherItem.title && item.url === otherItem.url
            && item.bookmarkId === otherItem.bookmarkId
            && item.recommendationReason === otherItem.recommendationReason
            && sameIcon(item.icon, otherItem.icon);
        });
    });
}

function claimCollection(ctx: ActionContext, next: Collection, current?: Collection): void {
  if (!current) ctx.claim(next.id);
  const sectionIds = new Set(current?.sections.map((section) => section.id));
  const itemIds = new Set(current?.sections.flatMap((section) => section.items.map((item) => item.id)));
  const seen = new Set([next.id]);
  for (const section of next.sections) {
    if (seen.has(section.id)) ctx.reject('ID_COLLISION', { id: section.id });
    seen.add(section.id);
    if (!sectionIds.has(section.id)) ctx.claim(section.id);
    for (const item of section.items) {
      if (seen.has(item.id)) ctx.reject('ID_COLLISION', { id: item.id });
      seen.add(item.id);
      if (!itemIds.has(item.id)) ctx.claim(item.id);
    }
  }
}

export function applyCollectionAction(
  ctx: ActionContext,
  action: Extract<AssetAction, { type: `collection.${string}` }>,
): void {
  const collections = ctx.snapshot.collections;
  switch (action.type) {
    case 'collection.save': {
      const index = collections.findIndex((entry) => entry.id === action.collection.id);
      const current = action.mode === 'update' ? collections[index] : undefined;
      if (action.mode === 'update' && !current) {
        ctx.reject('NOT_FOUND', { id: action.collection.id });
      }
      const next = structuredClone(action.collection);
      claimCollection(ctx, next, current);
      next.createdAt = current ? current.createdAt : ctx.at;
      next.updatedAt = ctx.at;
      if (current) collections[index] = next;
      else collections.push(next);
      ctx.affected.add(next.id);
      return;
    }
    case 'collection.copy': {
      const source = collections.find((entry) => entry.id === action.sourceId);
      if (!source) ctx.reject('NOT_FOUND', { id: action.sourceId });
      const provenance: Provenance[] = [
        ...source.provenance,
        { sourceId: source.id, title: source.title, author: null, url: null },
      ];
      if (!sameBody(source, action.copy) || !sameProvenance(provenance, action.copy.provenance)) {
        ctx.reject('INVALID_INPUT', { id: action.copy.id, sourceId: source.id });
      }
      const next = structuredClone(action.copy);
      claimCollection(ctx, next);
      next.createdAt = ctx.at;
      next.updatedAt = ctx.at;
      collections.push(next);
      ctx.affected.add(next.id);
      return;
    }
    case 'collection.trash': {
      const index = collections.findIndex((entry) => entry.id === action.id);
      if (index === -1) ctx.reject('NOT_FOUND', { id: action.id });
      ctx.claim(action.trashId);
      const [collection] = collections.splice(index, 1);
      ctx.snapshot.trash.push({
        id: action.trashId,
        deletedAt: ctx.at,
        origin: null,
        payload: { kind: 'collection', collection, index },
      });
      ctx.affected.add(action.id);
      ctx.affected.add(action.trashId);
      return;
    }
  }
}
