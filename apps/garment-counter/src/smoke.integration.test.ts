import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

// Vitest runs with cwd at the app root (where vite.config.ts lives).
const projectRoot = process.cwd();
const srcRoot = join(projectRoot, 'src');

function readText(relative: string): string {
  return readFileSync(join(projectRoot, relative), 'utf8');
}

/** Recursively collect .ts/.tsx source files (excluding test files). */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
      continue;
    }
    const ext = extname(full);
    if ((ext === '.ts' || ext === '.tsx') && !/\.test\.tsx?$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

describe('PWA manifest configuration (Req 7.1, 11.1, 11.6)', () => {
  const viteConfig = readText('vite.config.ts');

  it('declares landscape orientation and standalone kiosk display', () => {
    expect(viteConfig).toMatch(/orientation:\s*'landscape'/);
    expect(viteConfig).toMatch(/display:\s*'standalone'/);
  });

  it('registers the PWA plugin with autoUpdate', () => {
    expect(viteConfig).toMatch(/VitePWA\(/);
    expect(viteConfig).toMatch(/registerType:\s*'autoUpdate'/);
  });
});

describe('dual-server boundaries and standalone isolation (Req 11.5)', () => {
  const sources = collectSourceFiles(srcRoot);

  it('has source files to check', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('does not import from the admin (or any sibling) app', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      // any import that escapes this app into apps/admin, apps/customer, etc.
      if (/from\s+['"][^'"]*apps[\\/](admin|customer|driver-app)/.test(text)) {
        offenders.push(file);
      }
      // relative escape out of the garment-counter app
      if (/from\s+['"](\.\.\/){3,}/.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('package.json has no dependency on the admin app', () => {
    const pkg = JSON.parse(readText('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of Object.keys(all)) {
      expect(name).not.toMatch(/smart-laundry-admin|my-app/);
    }
  });
});
