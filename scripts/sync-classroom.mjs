import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSROOM_MODULES } from '../app/classroom-catalog.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Package the existing self-contained classroom files, without changing their
// simulation scripts. Original double-click files remain untouched.
export function classroomDocument(source, moduleId) {
  if (!CLASSROOM_MODULES.some((item) => item.id === moduleId) || !source.includes('</head>')) {
    throw new Error('Invalid classroom source');
  }
  return source.replace('</head>', `  <link rel="stylesheet" href="classroom.css">\n  <script id="classroom-bridge" data-module="${moduleId}" src="classroom-bridge.js" defer></script>\n</head>`);
}

export async function syncClassroom() {
  const output = resolve(root, 'public/classroom');
  await mkdir(output, { recursive: true });
  // Classic scripts also work when the root HTML is opened with file://.
  // Ship the same circuit engine/editor to both classroom and legacy URLs.
  for (const directory of ['electricity', 'mechanics', 'optics', 'labs']) {
    await cp(resolve(root, directory), resolve(output, directory), { recursive: true });
    await cp(resolve(root, directory), resolve(root, 'public', directory), { recursive: true });
  }
  for (const experiment of CLASSROOM_MODULES) {
    const source = await readFile(resolve(root, experiment.filename), 'utf8');
    const target = resolve(output, experiment.filename);
    const next = classroomDocument(source, experiment.id);
    const previous = await readFile(target, 'utf8').catch(() => null);
    if (previous !== next) await writeFile(target, next, 'utf8');

    // Preserve the public URLs used by the original teaching site and old
    // browser bookmarks. These copies remain the original standalone pages.
    const legacyTarget = resolve(root, 'public', experiment.filename);
    const previousLegacy = await readFile(legacyTarget, 'utf8').catch(() => null);
    if (previousLegacy !== source) await writeFile(legacyTarget, source, 'utf8');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await syncClassroom();
  console.log('声、光、电、力学课堂实验已打包；原始独立文件未修改。');
}
