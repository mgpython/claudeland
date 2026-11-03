import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

run('pnpm', ['build']);

const dist = resolve(root, 'dist');

const metadata = JSON.parse(await readFile(resolve(dist, 'metadata.json'), 'utf8'));
if (metadata.uuid !== 'claudeland@mgpython.github.io') {
  throw new Error('Refusing to install an extension with an unexpected UUID');
}

const extensionRoot = resolve(homedir(), '.local/share/gnome-shell/extensions');
const destination = resolve(extensionRoot, metadata.uuid);
if (!destination.startsWith(`${extensionRoot}/`)) {
  throw new Error('Resolved extension destination escaped the user extension directory');
}

await mkdir(extensionRoot, { recursive: true });
await rm(destination, { recursive: true, force: true });
// The GJS verification harnesses are build outputs, not part of the extension.
const DEV_ONLY = new Set(['smoke-test.js', 'session-check.js']);
await cp(dist, destination, {
  recursive: true,
  filter: (source) => !DEV_ONLY.has(basename(source)),
});

console.log(`Installed ${metadata.uuid} in ${destination}`);
console.log(`Package built for GNOME Shell ${metadata['shell-version'].join(', ')}`);
console.log('Log out and back in after the first install, then run:');
console.log(`  gnome-extensions enable ${metadata.uuid}`);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
