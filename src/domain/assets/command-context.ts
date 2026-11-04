import type { AssetSnapshot, ErrorCode, Id, Json, Timestamp } from './model';

export interface ActionContext {
  snapshot: AssetSnapshot;
  at: Timestamp;
  affected: Set<Id>;
  claim(id: Id): void;
  reject(code: ErrorCode, details?: { [key: string]: Json }): never;
}
