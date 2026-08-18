/**
 * npm workspaces live under 05_data/; product code stays in 04_script/apps.
 * 1) 05_data/apps -> ../04_script/apps
 * 2) 04_script/node_modules -> ../05_data/node_modules
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');

function linkDir(linkPath, target) {
  if (fs.existsSync(linkPath)) return true;
  if (!fs.existsSync(target)) {
    console.error('ensure-apps-link: missing target', target);
    return false;
  }
  if (process.platform === 'win32') {
    const r = spawnSync('cmd', ['/c', 'mklink', '/J', linkPath, target], { stdio: 'inherit' });
    return (r.status ?? 1) === 0;
  }
  fs.symlinkSync(target, linkPath, 'dir');
  return true;
}

const appsLink = path.join(here, 'apps');
const appsTarget = path.join(repoRoot, '04_script', 'apps');
if (!linkDir(appsLink, appsTarget)) process.exit(1);

const nmLink = path.join(repoRoot, '04_script', 'node_modules');
const nmTarget = path.join(here, 'node_modules');
if (fs.existsSync(nmTarget)) {
  if (!linkDir(nmLink, nmTarget)) process.exit(1);
}

process.exit(0);
