import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WorkspaceInfo } from './types.js';
import { fileExists, readJson } from './utils.js';

interface PackageJson {
  workspaces?: string[] | { packages?: string[] };
}

// Used for type reference in parsePnpmWorkspace
interface _PnpmWorkspace {
  packages?: string[];
}

interface LernaJson {
  packages?: string[];
  useWorkspaces?: boolean;
}

interface NxJson {
  workspaceLayout?: {
    appsDir?: string;
    libsDir?: string;
  };
}

export async function detectWorkspace(cwd: string): Promise<WorkspaceInfo> {
  const packageJsonPath = join(cwd, 'package.json');
  const pnpmWorkspacePath = join(cwd, 'pnpm-workspace.yaml');
  const lernaJsonPath = join(cwd, 'lerna.json');
  const nxJsonPath = join(cwd, 'nx.json');

  // Check for pnpm workspaces (highest priority)
  if (await fileExists(pnpmWorkspacePath)) {
    const content = await readFile(pnpmWorkspacePath, 'utf-8');
    const packages = parsePnpmWorkspace(content);
    return { root: cwd, packages, type: 'pnpm' };
  }

  // Check for Nx workspace
  if (await fileExists(nxJsonPath)) {
    const nxJson = await readJson<NxJson>(nxJsonPath);
    const packages = await detectNxPackages(cwd, nxJson);
    if (packages.length > 0) {
      return { root: cwd, packages, type: 'nx' };
    }
  }

  // Check for Lerna
  if (await fileExists(lernaJsonPath)) {
    const lernaJson = await readJson<LernaJson>(lernaJsonPath);
    if (lernaJson && !lernaJson.useWorkspaces && lernaJson.packages) {
      // Lerna with its own packages config
      return { root: cwd, packages: lernaJson.packages, type: 'lerna' };
    }
    // If useWorkspaces is true, fall through to npm/yarn detection
  }

  const packageJson = await readJson<PackageJson>(packageJsonPath);
  if (!packageJson) {
    return { root: cwd, packages: [], type: 'single' };
  }

  // Check for npm/yarn workspaces in package.json
  if (packageJson.workspaces) {
    const workspaces = packageJson.workspaces;
    const packages = Array.isArray(workspaces) ? workspaces : workspaces.packages || [];

    // Check if Lerna is configured to use workspaces
    const hasLerna = await fileExists(lernaJsonPath);
    if (hasLerna) {
      const lernaJson = await readJson<LernaJson>(lernaJsonPath);
      if (lernaJson?.useWorkspaces) {
        return { root: cwd, packages, type: 'lerna' };
      }
    }

    // Determine if yarn or npm based on lock file
    const yarnLock = await fileExists(join(cwd, 'yarn.lock'));
    return {
      root: cwd,
      packages,
      type: yarnLock ? 'yarn' : 'npm',
    };
  }

  return { root: cwd, packages: [], type: 'single' };
}

/**
 * Detect Nx workspace packages based on nx.json and project structure
 */
async function detectNxPackages(cwd: string, nxJson: NxJson | null): Promise<string[]> {
  const packages: string[] = [];

  // Check for workspace layout in nx.json
  const appsDir = nxJson?.workspaceLayout?.appsDir || 'apps';
  const libsDir = nxJson?.workspaceLayout?.libsDir || 'libs';

  // Add common Nx patterns
  if (await fileExists(join(cwd, appsDir))) {
    packages.push(`${appsDir}/*`);
  }
  if (await fileExists(join(cwd, libsDir))) {
    packages.push(`${libsDir}/*`);
  }

  // Also check for packages directory (common in Nx)
  if (await fileExists(join(cwd, 'packages'))) {
    packages.push('packages/*');
  }

  return packages;
}

function parsePnpmWorkspace(content: string): string[] {
  const packages: string[] = [];
  const lines = content.split('\n');
  let inPackages = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'packages:') {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      if (trimmed.startsWith('-')) {
        const pkg = trimmed
          .slice(1)
          .trim()
          .replace(/^['"]|['"]$/g, '');
        if (pkg) packages.push(pkg);
      } else if (trimmed && !trimmed.startsWith('#')) {
        break;
      }
    }
  }
  return packages;
}

export async function getNodeModulesPaths(workspace: WorkspaceInfo): Promise<string[]> {
  const paths = [join(workspace.root, 'node_modules')];

  if (workspace.type !== 'single' && workspace.packages.length > 0) {
    const { glob } = await import('node:fs').then(async () => {
      // Use simple glob expansion for workspace packages
      return { glob: expandGlobs };
    });

    for (const pattern of workspace.packages) {
      const expanded = await glob(pattern, workspace.root);
      for (const dir of expanded) {
        const nodeModulesPath = join(dir, 'node_modules');
        if (await fileExists(nodeModulesPath)) {
          paths.push(nodeModulesPath);
        }
      }
    }
  }

  return paths;
}

async function expandGlobs(pattern: string, root: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const results: string[] = [];

  if (!pattern.includes('*')) {
    const fullPath = join(root, pattern);
    if (await fileExists(fullPath)) {
      results.push(fullPath);
    }
    return results;
  }

  // Handle simple glob patterns like "packages/*"
  const parts = pattern.split('/');
  const firstWildcard = parts.findIndex(p => p.includes('*'));

  if (firstWildcard === -1) {
    return [join(root, pattern)];
  }

  const basePath = join(root, ...parts.slice(0, firstWildcard));
  const wildcardPart = parts[firstWildcard];
  const remaining = parts.slice(firstWildcard + 1).join('/');

  try {
    const entries = await readdir(basePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const matches = wildcardPart === '*' || matchWildcard(entry.name, wildcardPart);
      if (matches) {
        const fullPath = join(basePath, entry.name);
        if (remaining) {
          const subResults = await expandGlobs(remaining, fullPath);
          results.push(...subResults);
        } else {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return results;
}

function matchWildcard(str: string, pattern: string): boolean {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return regex.test(str);
}
