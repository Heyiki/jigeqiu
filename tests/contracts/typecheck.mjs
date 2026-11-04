import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const result = spawnSync(process.execPath, [
  join(root, 'node_modules/typescript/bin/tsc'),
  '--ignoreConfig', '--noEmit', '--strict', '--target', 'es2022',
  '--lib', 'es2022,dom', '--skipLibCheck',
  join(root, 'tests/contracts/asset-contracts.ts'),
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (result.status === 0) console.log('Contract declarations typechecked (declarations only, not implementation)');
