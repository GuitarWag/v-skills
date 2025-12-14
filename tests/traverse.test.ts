import { describe, it } from 'node:test';
import assert from 'node:assert';
import { join } from 'node:path';
import { traverseNodeModules, getDirectDependencies } from '../src/traverse.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockPackage,
  testPackages,
} from './utils/fixtures.js';
import { mkdir, writeFile, symlink } from 'node:fs/promises';

describe('traverse', async () => {
  describe('traverseNodeModules', async () => {
    it('should find packages in node_modules', async () => {
      const tempDir = await createTempDir();
      try {
        const nodeModules = join(tempDir, 'node_modules');
        await mkdir(nodeModules, { recursive: true });

        await createMockPackage(nodeModules, testPackages.react);
        await createMockPackage(nodeModules, testPackages.express);

        const packages: string[] = [];
        for await (const pkg of traverseNodeModules(nodeModules)) {
          packages.push(pkg.name);
        }

        assert.ok(packages.includes('react'));
        assert.ok(packages.includes('express'));
        assert.strictEqual(packages.length, 2);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should extract package metadata', async () => {
      const tempDir = await createTempDir();
      try {
        const nodeModules = join(tempDir, 'node_modules');
        await mkdir(nodeModules, { recursive: true });

        await createMockPackage(nodeModules, testPackages.react);

        let reactPkg;
        for await (const pkg of traverseNodeModules(nodeModules)) {
          if (pkg.name === 'react') reactPkg = pkg;
        }

        assert.ok(reactPkg);
        assert.strictEqual(reactPkg.version, '18.3.1');
        assert.strictEqual(reactPkg.description, testPackages.react.description);
        assert.strictEqual(reactPkg.homepage, testPackages.react.homepage);
        assert.deepStrictEqual(reactPkg.engines, testPackages.react.engines);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should extract README content', async () => {
      const tempDir = await createTempDir();
      try {
        const nodeModules = join(tempDir, 'node_modules');
        await mkdir(nodeModules, { recursive: true });

        await createMockPackage(nodeModules, testPackages.zod);

        let zodPkg;
        for await (const pkg of traverseNodeModules(nodeModules)) {
          if (pkg.name === 'zod') zodPkg = pkg;
        }

        assert.ok(zodPkg);
        assert.ok(zodPkg.readme);
        assert.ok(zodPkg.readme.includes('TypeScript-first schema validation'));
        assert.ok(zodPkg.readmePath?.endsWith('README.md'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle scoped packages', async () => {
      const tempDir = await createTempDir();
      try {
        const nodeModules = join(tempDir, 'node_modules');
        await mkdir(nodeModules, { recursive: true });

        await createMockPackage(nodeModules, testPackages.scopedPackage);

        const packages: string[] = [];
        for await (const pkg of traverseNodeModules(nodeModules)) {
          packages.push(pkg.name);
        }

        assert.ok(packages.includes('@company/utils'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should extract peer dependencies', async () => {
      const tempDir = await createTempDir();
      try {
        const nodeModules = join(tempDir, 'node_modules');
        await mkdir(nodeModules, { recursive: true });

        await createMockPackage(nodeModules, testPackages.scopedPackage);

        let scopedPkg;
        for await (const pkg of traverseNodeModules(nodeModules)) {
          if (pkg.name === '@company/utils') scopedPkg = pkg;
        }

        assert.ok(scopedPkg);
        assert.deepStrictEqual(scopedPkg.peerDependencies, { typescript: '^5.0.0' });
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle packages without README', async () => {
      const tempDir = await createTempDir();
      try {
        const nodeModules = join(tempDir, 'node_modules');
        await mkdir(nodeModules, { recursive: true });

        await createMockPackage(nodeModules, testPackages.noReadme);

        let noReadmePkg;
        for await (const pkg of traverseNodeModules(nodeModules)) {
          if (pkg.name === 'no-readme-pkg') noReadmePkg = pkg;
        }

        assert.ok(noReadmePkg);
        assert.strictEqual(noReadmePkg.readme, undefined);
        assert.strictEqual(noReadmePkg.readmePath, undefined);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should skip hidden directories', async () => {
      const tempDir = await createTempDir();
      try {
        const nodeModules = join(tempDir, 'node_modules');
        await mkdir(nodeModules, { recursive: true });

        await createMockPackage(nodeModules, testPackages.react);
        await mkdir(join(nodeModules, '.cache'), { recursive: true });
        await writeFile(
          join(nodeModules, '.cache', 'package.json'),
          JSON.stringify({ name: '.cache', version: '1.0.0' })
        );

        const packages: string[] = [];
        for await (const pkg of traverseNodeModules(nodeModules)) {
          packages.push(pkg.name);
        }

        assert.ok(!packages.includes('.cache'));
        assert.strictEqual(packages.length, 1);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should filter with include option', async () => {
      const tempDir = await createTempDir();
      try {
        const nodeModules = join(tempDir, 'node_modules');
        await mkdir(nodeModules, { recursive: true });

        await createMockPackage(nodeModules, testPackages.react);
        await createMockPackage(nodeModules, testPackages.express);
        await createMockPackage(nodeModules, testPackages.zod);

        const packages: string[] = [];
        for await (const pkg of traverseNodeModules(nodeModules, { include: ['react', 'zod'] })) {
          packages.push(pkg.name);
        }

        assert.ok(packages.includes('react'));
        assert.ok(packages.includes('zod'));
        assert.ok(!packages.includes('express'));
        assert.strictEqual(packages.length, 2);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should filter with exclude option', async () => {
      const tempDir = await createTempDir();
      try {
        const nodeModules = join(tempDir, 'node_modules');
        await mkdir(nodeModules, { recursive: true });

        await createMockPackage(nodeModules, testPackages.react);
        await createMockPackage(nodeModules, testPackages.express);
        await createMockPackage(nodeModules, testPackages.zod);

        const packages: string[] = [];
        for await (const pkg of traverseNodeModules(nodeModules, { exclude: ['express'] })) {
          packages.push(pkg.name);
        }

        assert.ok(packages.includes('react'));
        assert.ok(packages.includes('zod'));
        assert.ok(!packages.includes('express'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should support glob patterns in include/exclude', async () => {
      const tempDir = await createTempDir();
      try {
        const nodeModules = join(tempDir, 'node_modules');
        await mkdir(nodeModules, { recursive: true });

        await createMockPackage(nodeModules, testPackages.scopedPackage);
        await createMockPackage(nodeModules, testPackages.react);

        const packages: string[] = [];
        for await (const pkg of traverseNodeModules(nodeModules, { exclude: ['@company/*'] })) {
          packages.push(pkg.name);
        }

        assert.ok(packages.includes('react'));
        assert.ok(!packages.includes('@company/utils'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle non-existent node_modules gracefully', async () => {
      const tempDir = await createTempDir();
      try {
        const packages: string[] = [];
        for await (const pkg of traverseNodeModules(join(tempDir, 'node_modules'))) {
          packages.push(pkg.name);
        }

        assert.strictEqual(packages.length, 0);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should find README with different case variations', async () => {
      const tempDir = await createTempDir();
      try {
        const nodeModules = join(tempDir, 'node_modules');
        const pkgPath = join(nodeModules, 'lowercase-readme');
        await mkdir(pkgPath, { recursive: true });

        await writeFile(
          join(pkgPath, 'package.json'),
          JSON.stringify({ name: 'lowercase-readme', version: '1.0.0' })
        );
        await writeFile(join(pkgPath, 'readme.md'), '# Lowercase Readme');

        let pkg;
        for await (const p of traverseNodeModules(nodeModules)) {
          pkg = p;
        }

        assert.ok(pkg);
        assert.ok(pkg.readme);
        assert.ok(pkg.readme.includes('Lowercase Readme'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle symlinked packages (workspace packages)', async () => {
      const tempDir = await createTempDir();
      try {
        // Create workspace package outside node_modules
        const workspaceDir = join(tempDir, 'packages', 'my-workspace-pkg');
        await mkdir(workspaceDir, { recursive: true });
        await writeFile(
          join(workspaceDir, 'package.json'),
          JSON.stringify({
            name: 'my-workspace-pkg',
            version: '1.0.0',
            description: 'A workspace package',
          })
        );
        await writeFile(
          join(workspaceDir, 'README.md'),
          '# My Workspace Package\n\nThis is a workspace package.'
        );

        // Create node_modules with symlink to workspace package
        const nodeModules = join(tempDir, 'node_modules');
        await mkdir(nodeModules, { recursive: true });
        await symlink(workspaceDir, join(nodeModules, 'my-workspace-pkg'), 'dir');

        // Also add a regular package for comparison
        await createMockPackage(nodeModules, testPackages.react);

        const packages: { name: string; readme?: string }[] = [];
        for await (const pkg of traverseNodeModules(nodeModules)) {
          packages.push({ name: pkg.name, readme: pkg.readme });
        }

        // Should find both the regular package and symlinked workspace package
        assert.strictEqual(packages.length, 2);
        assert.ok(packages.some(p => p.name === 'react'));
        assert.ok(packages.some(p => p.name === 'my-workspace-pkg'));

        const workspacePkg = packages.find(p => p.name === 'my-workspace-pkg');
        assert.ok(workspacePkg);
        assert.ok(workspacePkg.readme);
        assert.ok(workspacePkg.readme.includes('This is a workspace package'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle symlinked scoped packages (workspace packages)', async () => {
      const tempDir = await createTempDir();
      try {
        // Create workspace package outside node_modules
        const workspaceDir = join(tempDir, 'packages', 'utils');
        await mkdir(workspaceDir, { recursive: true });
        await writeFile(
          join(workspaceDir, 'package.json'),
          JSON.stringify({
            name: '@myorg/utils',
            version: '2.0.0',
            description: 'Shared utilities',
          })
        );
        await writeFile(
          join(workspaceDir, 'README.md'),
          '# @myorg/utils\n\nShared workspace utilities.'
        );

        // Create node_modules with scoped symlink
        const nodeModules = join(tempDir, 'node_modules');
        const scopeDir = join(nodeModules, '@myorg');
        await mkdir(scopeDir, { recursive: true });
        await symlink(workspaceDir, join(scopeDir, 'utils'), 'dir');

        const packages: { name: string; readme?: string }[] = [];
        for await (const pkg of traverseNodeModules(nodeModules)) {
          packages.push({ name: pkg.name, readme: pkg.readme });
        }

        assert.strictEqual(packages.length, 1);
        assert.strictEqual(packages[0].name, '@myorg/utils');
        assert.ok(packages[0].readme);
        assert.ok(packages[0].readme.includes('Shared workspace utilities'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });

  describe('getDirectDependencies', async () => {
    it('should return direct dependencies from package.json', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'package.json'),
          JSON.stringify({
            name: 'test-project',
            dependencies: {
              react: '^18.0.0',
              express: '^4.0.0',
            },
            devDependencies: {
              typescript: '^5.0.0',
            },
          })
        );

        const deps = await getDirectDependencies(tempDir);

        assert.ok(deps.has('react'));
        assert.ok(deps.has('express'));
        assert.ok(deps.has('typescript'));
        assert.strictEqual(deps.size, 3);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should return empty set when no package.json', async () => {
      const tempDir = await createTempDir();
      try {
        const deps = await getDirectDependencies(tempDir);
        assert.strictEqual(deps.size, 0);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle package.json with no dependencies', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'package.json'),
          JSON.stringify({ name: 'empty-deps', version: '1.0.0' })
        );

        const deps = await getDirectDependencies(tempDir);
        assert.strictEqual(deps.size, 0);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });
});
