import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../node_modules/vinext/dist/cli.js', import.meta.url));
const result = spawnSync(process.execPath, [cli, 'build'], {
  stdio: 'inherit',
  env: { ...process.env, PHYSICS_STATIC_EXPORT: '1' },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
