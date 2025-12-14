import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectWorkspace, getNodeModulesPaths } from '../src/workspace.js';
import { createTempDir, cleanupTempDir } from './utils/fixtures.js';

describe('workspace detection', async () => {
  describe('detectWorkspace', async () => {
    it('should detect a single package project', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'package.json'),
          JSON.stringify({ name: 'single-project', version: '1.0.0' })
        );

        const workspace = await detectWorkspace(tempDir);

        assert.strictEqual(workspace.type, 'single');
        assert.strictEqual(workspace.root, tempDir);
        assert.deepStrictEqual(workspace.packages, []);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should detect npm workspaces', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'package.json'),
          JSON.stringify({
            name: 'npm-monorepo',
            workspaces: ['packages/*'],
          })
        );

        const workspace = await detectWorkspace(tempDir);

        assert.strictEqual(workspace.type, 'npm');
        assert.strictEqual(workspace.root, tempDir);
        assert.deepStrictEqual(workspace.packages, ['packages/*']);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should detect npm workspaces with object syntax', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'package.json'),
          JSON.stringify({
            name: 'npm-monorepo',
            workspaces: {
              packages: ['apps/*', 'packages/*'],
            },
          })
        );

        const workspace = await detectWorkspace(tempDir);

        assert.strictEqual(workspace.type, 'npm');
        assert.deepStrictEqual(workspace.packages, ['apps/*', 'packages/*']);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should detect yarn workspaces when yarn.lock exists', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'package.json'),
          JSON.stringify({
            name: 'yarn-monorepo',
            workspaces: ['packages/*'],
          })
        );
        await writeFile(join(tempDir, 'yarn.lock'), '# yarn lockfile v1\n');

        const workspace = await detectWorkspace(tempDir);

        assert.strictEqual(workspace.type, 'yarn');
        assert.deepStrictEqual(workspace.packages, ['packages/*']);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should detect pnpm workspaces', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({ name: 'pnpm-monorepo' }));
        await writeFile(
          join(tempDir, 'pnpm-workspace.yaml'),
          `packages:\n  - 'packages/*'\n  - 'apps/*'\n`
        );

        const workspace = await detectWorkspace(tempDir);

        assert.strictEqual(workspace.type, 'pnpm');
        assert.deepStrictEqual(workspace.packages, ['packages/*', 'apps/*']);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle pnpm workspace with quoted paths', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({ name: 'pnpm-monorepo' }));
        await writeFile(
          join(tempDir, 'pnpm-workspace.yaml'),
          `packages:\n  - "packages/*"\n  - 'libs/*'\n`
        );

        const workspace = await detectWorkspace(tempDir);

        assert.strictEqual(workspace.type, 'pnpm');
        assert.deepStrictEqual(workspace.packages, ['packages/*', 'libs/*']);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should prioritize pnpm over npm workspaces', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'package.json'),
          JSON.stringify({
            name: 'mixed-monorepo',
            workspaces: ['npm-packages/*'],
          })
        );
        await writeFile(join(tempDir, 'pnpm-workspace.yaml'), `packages:\n  - 'pnpm-packages/*'\n`);

        const workspace = await detectWorkspace(tempDir);

        assert.strictEqual(workspace.type, 'pnpm');
        assert.deepStrictEqual(workspace.packages, ['pnpm-packages/*']);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should return single type when no package.json exists', async () => {
      const tempDir = await createTempDir();
      try {
        const workspace = await detectWorkspace(tempDir);

        assert.strictEqual(workspace.type, 'single');
        assert.deepStrictEqual(workspace.packages, []);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle empty workspaces array', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'package.json'),
          JSON.stringify({
            name: 'empty-workspaces',
            workspaces: [],
          })
        );

        const workspace = await detectWorkspace(tempDir);

        assert.strictEqual(workspace.type, 'npm');
        assert.deepStrictEqual(workspace.packages, []);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });

  describe('getNodeModulesPaths', async () => {
    it('should return root node_modules for single project', async () => {
      const tempDir = await createTempDir();
      try {
        await mkdir(join(tempDir, 'node_modules'), { recursive: true });

        const workspace = { root: tempDir, packages: [], type: 'single' as const };
        const paths = await getNodeModulesPaths(workspace);

        assert.strictEqual(paths.length, 1);
        assert.strictEqual(paths[0], join(tempDir, 'node_modules'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should return multiple paths for workspaces', async () => {
      const tempDir = await createTempDir();
      try {
        await mkdir(join(tempDir, 'node_modules'), { recursive: true });
        await mkdir(join(tempDir, 'packages', 'pkg-a', 'node_modules'), { recursive: true });
        await mkdir(join(tempDir, 'packages', 'pkg-b', 'node_modules'), { recursive: true });

        const workspace = {
          root: tempDir,
          packages: ['packages/*'],
          type: 'npm' as const,
        };

        const paths = await getNodeModulesPaths(workspace);

        assert.ok(paths.includes(join(tempDir, 'node_modules')));
        assert.ok(paths.includes(join(tempDir, 'packages', 'pkg-a', 'node_modules')));
        assert.ok(paths.includes(join(tempDir, 'packages', 'pkg-b', 'node_modules')));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should skip workspace packages without node_modules', async () => {
      const tempDir = await createTempDir();
      try {
        await mkdir(join(tempDir, 'node_modules'), { recursive: true });
        await mkdir(join(tempDir, 'packages', 'pkg-a', 'node_modules'), { recursive: true });
        await mkdir(join(tempDir, 'packages', 'pkg-b'), { recursive: true });

        const workspace = {
          root: tempDir,
          packages: ['packages/*'],
          type: 'npm' as const,
        };

        const paths = await getNodeModulesPaths(workspace);

        assert.strictEqual(paths.length, 2);
        assert.ok(!paths.includes(join(tempDir, 'packages', 'pkg-b', 'node_modules')));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle explicit package paths without globs', async () => {
      const tempDir = await createTempDir();
      try {
        await mkdir(join(tempDir, 'node_modules'), { recursive: true });
        await mkdir(join(tempDir, 'my-package', 'node_modules'), { recursive: true });

        const workspace = {
          root: tempDir,
          packages: ['my-package'],
          type: 'npm' as const,
        };

        const paths = await getNodeModulesPaths(workspace);

        assert.ok(paths.includes(join(tempDir, 'my-package', 'node_modules')));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });
});
