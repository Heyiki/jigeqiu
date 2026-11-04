# Bookmark Fixture Policy

No real-browser export samples have been collected in this batch.
Synthetic inputs must never be described as verified browser compatibility.

`synthetic-bookmarks.html` is hand-authored regression data. It exercises
mixed order, duplicate folder names, an empty nested folder, entity decoding,
a same-folder duplicate URL, and untrusted scripts/resources. Its expected tree
is maintained in `tests/browser/persistence.mjs`; it is NOT evidence of a
particular browser's export format or version. All external resource addresses
use the reserved `.invalid` test domain and must never be requested by parsing.

## Target Inventory

| Export source | Actual sample | Status |
|---|---|---|
| Chrome | None | Not verified |
| Safari | None | Not verified |
| Edge | None | Not verified |
| Firefox | None | Not verified |
| QQ Browser | None | Not verified |
| 360 Browser | None | Not verified |

For each browser, create a dedicated clean profile containing synthetic test
bookmarks, then use the browser's real export feature. Do not export an existing
personal profile and assume its data can all be identified later.

Record browser product/version, OS/version, export date, source method, expected
tree, URL/folder counts, and sanitization review in a sibling metadata document.
Distinguish variants such as 360 products; do not claim the full family tested.

## Required Content

- Unicode and long titles.
- Empty folders, nested folders and siblings sharing the same name.
- Mixed order of bookmarks and folders.
- Same URL in different folders and an explicit same-folder duplicate.
- URLs with query strings, fragments and non-default ports.
- A synthetic HTTP/HTTPS intranet address, not an actual private service.

Use separate clearly labeled synthetic fixtures for malformed HTML, script
bookmarks, unsupported schemes, cycles in JSON, unknown schema versions,
colliding IDs and corrupted data. Retain hand-checked expected results.

Never store personal URLs, access tokens, cookies, source browser profiles,
real private notes or credentials in this directory.
