// M8: Monorepo sub-application discovery.
// Detects whether a repo is a monorepo and enumerates independently-deployable apps.
// Non-monorepo → returns a single app at root.
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface App {
  path: string;       // relative to repo root (e.g. 'apps/web', or '.' for single-repo)
  name: string;       // app name (from manifest or dir name)
  type: string;       // 'single' | 'package' | 'app' | 'workspace-member'
  description: string;
  manifest?: string;  // relative path to manifest (package.json, pyproject.toml, etc.)
}

// Glob-expand workspace patterns like 'packages/*' into actual directory paths.
function expandGlob(root: string, pattern: string): string[] {
  const parts = pattern.replace(/\/$/, '').split('/');
  const base = parts.slice(0, -1).join('/');
  const tail = parts[parts.length - 1];
  const baseDir = path.join(root, base);
  let entries: string[] = [];
  try { entries = fs.readdirSync(baseDir, { withFileTypes: true }); } catch { return []; }
  if (tail === '*') {
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(base, e.name).replace(/\\/g, '/'));
  }
  // specific dir name
  return entries.filter((e) => e.isDirectory() && e.name === tail).map((e) => path.join(base, e.name).replace(/\\/g, '/'));
}

// Read a description from a manifest file (package.json description, pyproject description, etc.).
function readDescription(root: string, rel: string): string {
  try {
    const content = fs.readFileSync(path.join(root, rel), 'utf8');
    // package.json
    const pj = JSON.parse(content);
    if (pj.description) return pj.description;
    if (pj.name) return pj.name;
  } catch { /* not json or missing */ }
  // pyproject.toml description
  try {
    const content = fs.readFileSync(path.join(root, rel), 'utf8');
    const m = content.match(/description\s*=\s*"([^"]*)"/);
    if (m) return m[1];
  } catch { /* missing */ }
  return '';
}

export function discoverApps(root: string): App[] {
  const apps: App[] = [];
  const seen = new Set<string>();

  const addApp = (rel: string, type: string, manifest?: string) => {
    const clean = rel.replace(/\\/g, '/').replace(/^\.\//, '');
    if (seen.has(clean)) return;
    seen.add(clean);
    const name = manifest ? path.basename(path.dirname(manifest)) : path.basename(clean) || path.basename(root);
    const desc = manifest ? readDescription(root, manifest) : '';
    apps.push({ path: clean || '.', name, type, description: desc, manifest });
  };

  // 1. package.json workspaces
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (pkg.workspaces) {
      const patterns: string[] = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages || [];
      for (const pat of patterns) {
        for (const dir of expandGlob(root, pat)) {
          if (fs.existsSync(path.join(root, dir, 'package.json'))) {
            addApp(dir, 'workspace-member', path.join(dir, 'package.json'));
          }
        }
      }
    }
  } catch { /* not package.json or no workspaces */ }

  // 2. pnpm-workspace.yaml
  try {
    const pnpm = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
    const patterns = pnpm.match(/-\s+(['"]?[^'"\n]+['"]?)/g) || [];
    for (const p of patterns) {
      const pat = p.replace(/^-\s+/, '').replace(/['"]/g, '').trim();
      for (const dir of expandGlob(root, pat)) {
        if (fs.existsSync(path.join(root, dir, 'package.json'))) {
          addApp(dir, 'pnpm-member', path.join(dir, 'package.json'));
        }
      }
    }
  } catch { /* no pnpm-workspace.yaml */ }

  // 3. turbo.json / nx.json / lerna.json (signal for monorepo; apps found via globs)
  const hasMonorepoConfig = fs.existsSync(path.join(root, 'turbo.json')) || fs.existsSync(path.join(root, 'nx.json')) || fs.existsSync(path.join(root, 'lerna.json'));

  // 4. Glob: packages/*/package.json and apps/*/package.json
  if (apps.length === 0 || hasMonorepoConfig) {
    for (const dir of expandGlob(root, 'packages/*')) {
      if (fs.existsSync(path.join(root, dir, 'package.json'))) addApp(dir, 'package', path.join(dir, 'package.json'));
    }
    for (const dir of expandGlob(root, 'apps/*')) {
      if (fs.existsSync(path.join(root, dir, 'package.json'))) addApp(dir, 'app', path.join(dir, 'package.json'));
    }
  }

  // 5. go.work (Go multi-module)
  try {
    const gowork = fs.readFileSync(path.join(root, 'go.work'), 'utf8');
    const dirs = gowork.match(/directory\s*=\s*([^\n]+)/g) || gowork.match(/^\s*\.\.\/(\S+)/gm) || [];
    for (const d of dirs) {
      const rel = d.replace(/directory\s*=\s*/, '').replace(/^\s*\.\.\//, '').trim();
      if (fs.existsSync(path.join(root, rel, 'go.mod'))) addApp(rel, 'go-module', path.join(rel, 'go.mod'));
    }
  } catch { /* no go.work */ }

  // 6. Cargo.toml [workspace] members
  try {
    const cargo = fs.readFileSync(path.join(root, 'Cargo.toml'), 'utf8');
    const wsSection = cargo.match(/\[workspace\][\s\S]*?(?=\n\[)/);
    if (wsSection) {
      const membersMatch = wsSection[0].match(/members\s*=\s*\[([^\]]*)\]/);
      if (membersMatch) {
        const members = membersMatch[1].match(/"([^"]+)"/g) || [];
        for (const m of members) {
          const pat = m.replace(/"/g, '');
          for (const dir of expandGlob(root, pat)) {
            if (fs.existsSync(path.join(root, dir, 'Cargo.toml'))) addApp(dir, 'rust-crate', path.join(dir, 'Cargo.toml'));
          }
        }
      }
    }
  } catch { /* no Cargo.toml or not a workspace */ }

  // 7. Python: multiple pyproject.toml in subdirs (packages/*/pyproject.toml)
  for (const dir of expandGlob(root, 'packages/*')) {
    if (fs.existsSync(path.join(root, dir, 'pyproject.toml'))) addApp(dir, 'python-package', path.join(dir, 'pyproject.toml'));
  }

  // Fallback: single-app repo
  if (apps.length === 0) {
    const name = path.basename(root) || 'root';
    let manifest: string | undefined;
    for (const m of ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml']) {
      if (fs.existsSync(path.join(root, m))) { manifest = m; break; }
    }
    apps.push({ path: '.', name, type: 'single', description: '', manifest });
  }

  return apps;
}
