import type { SnapshotStore } from '../persistence/snapshot-store';
import { createJsonImportService } from './json-import-service';
import { parseHtml } from './html';
import type { ImportService } from './model';

export function createImportService(store: SnapshotStore): ImportService {
  return {
    ...createJsonImportService(store),
    parseHtml,
  };
}
