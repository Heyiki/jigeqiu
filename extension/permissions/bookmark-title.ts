import { fetchBookmarkTitle as sharedTitle } from '../../src/services/bookmark-title';
import { permissionFetch } from './network';
export { extractBookmarkTitle } from '../../src/services/bookmark-title';

export const fetchBookmarkTitle: typeof sharedTitle = (
  input,
  signal,
  deps = {},
) => sharedTitle(input, signal, { ...deps, fetch: permissionFetch });
