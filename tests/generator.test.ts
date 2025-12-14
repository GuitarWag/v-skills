import { describe, it } from 'node:test';
import assert from 'node:assert';
import { join } from 'node:path';
import { readFile, readdir, access } from 'node:fs/promises';
import { generate, clean } from '../src/generator.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockWorkspace,
  testPackages,
} from './utils/fixtures.js';

describe('generator', async () => {
  describe('generate', async () => {
    it('should generate skill files for all packages', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react, testPackages.express, testPackages.zod],
        });

        const result = await generate({
          cwd: tempDir,
          output: join(tempDir, '.claude/skills/v-skills'),
        });

        assert.strictEqual(result.skills.length, 3);
        assert.strictEqual(result.workspaceType, 'single');
        assert.ok(result.duration >= 0);

        // Verify folders exist (new folder structure)
        const files = await readdir(join(tempDir, '.claude/skills/v-skills'));
        assert.ok(files.includes('react'));
        assert.ok(files.includes('express'));
        assert.ok(files.includes('zod'));
        assert.ok(files.includes('_index.md'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should generate index file with package table', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react, testPackages.zod],
        });

        await generate({
          cwd: tempDir,
          output: join(tempDir, '.claude/skills/v-skills'),
        });

        const indexContent = await readFile(
          join(tempDir, '.claude/skills/v-skills/_index.md'),
          'utf-8'
        );

        assert.ok(indexContent.includes('# Dependency Skills Index'));
        assert.ok(indexContent.includes('| Package | Version |'));
        assert.ok(indexContent.includes('| [react](./react/SKILL.md) | 18.3.1 |'));
        assert.ok(indexContent.includes('| [zod](./zod/SKILL.md) | 3.23.8 |'));
        assert.ok(indexContent.includes('Workspace: single'));
        assert.ok(indexContent.includes('2 packages'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should filter to direct dependencies only with directOnly option', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react, testPackages.express, testPackages.zod],
          directDeps: ['react', 'zod'],
        });

        const result = await generate({
          cwd: tempDir,
          output: join(tempDir, '.claude/skills/v-skills'),
          directOnly: true,
        });

        assert.strictEqual(result.skills.length, 2);

        const skillNames = result.skills.map(s => s.name);
        assert.ok(skillNames.includes('react'));
        assert.ok(skillNames.includes('zod'));
        assert.ok(!skillNames.includes('express'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should skip packages without any content', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react, testPackages.noContent],
        });

        const result = await generate({
          cwd: tempDir,
          output: join(tempDir, '.claude/skills/v-skills'),
        });

        // Only react has content (noContent has no readme, description, or homepage)
        assert.strictEqual(result.skills.length, 1);
        assert.strictEqual(result.skills[0].name, 'react');
        assert.strictEqual(result.packagesScanned, 2);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle scoped packages', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.scopedPackage],
        });

        const result = await generate({
          cwd: tempDir,
          output: join(tempDir, '.claude/skills/v-skills'),
        });

        assert.strictEqual(result.skills.length, 1);
        assert.strictEqual(result.skills[0].name, '@company/utils');

        // New folder structure: @scope/package/SKILL.md
        const files = await readdir(join(tempDir, '.claude/skills/v-skills'));
        assert.ok(files.includes('@company'));

        const scopeFiles = await readdir(join(tempDir, '.claude/skills/v-skills/@company'));
        assert.ok(scopeFiles.includes('utils'));

        // Verify SKILL.md exists
        await access(join(tempDir, '.claude/skills/v-skills/@company/utils/SKILL.md'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should detect npm workspace type', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react],
          workspaceConfig: {
            type: 'npm',
            packages: ['packages/*'],
          },
        });

        const result = await generate({
          cwd: tempDir,
          output: join(tempDir, '.claude/skills/v-skills'),
        });

        assert.strictEqual(result.workspaceType, 'npm');
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should detect yarn workspace type', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react],
          workspaceConfig: {
            type: 'yarn',
            packages: ['packages/*'],
          },
        });

        const result = await generate({
          cwd: tempDir,
          output: join(tempDir, '.claude/skills/v-skills'),
        });

        assert.strictEqual(result.workspaceType, 'yarn');
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should detect pnpm workspace type', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react],
          workspaceConfig: {
            type: 'pnpm',
            packages: ['packages/*'],
          },
        });

        const result = await generate({
          cwd: tempDir,
          output: join(tempDir, '.claude/skills/v-skills'),
        });

        assert.strictEqual(result.workspaceType, 'pnpm');
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should use default output directory', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react],
        });

        await generate({ cwd: tempDir });

        // New folder structure: package-name/SKILL.md
        const files = await readdir(join(tempDir, '.claude/skills/v-skills'));
        assert.ok(files.includes('react'));

        // Verify SKILL.md exists
        await access(join(tempDir, '.claude/skills/v-skills/react/SKILL.md'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle empty node_modules', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [],
        });

        const result = await generate({
          cwd: tempDir,
          output: join(tempDir, '.claude/skills/v-skills'),
        });

        assert.strictEqual(result.skills.length, 0);
        assert.strictEqual(result.packagesScanned, 0);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should apply include filter', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react, testPackages.express, testPackages.zod],
        });

        const result = await generate({
          cwd: tempDir,
          output: join(tempDir, '.claude/skills/v-skills'),
          include: ['react'],
        });

        assert.strictEqual(result.skills.length, 1);
        assert.strictEqual(result.skills[0].name, 'react');
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should apply exclude filter', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react, testPackages.express, testPackages.zod],
        });

        const result = await generate({
          cwd: tempDir,
          output: join(tempDir, '.claude/skills/v-skills'),
          exclude: ['express'],
        });

        assert.strictEqual(result.skills.length, 2);
        const names = result.skills.map(s => s.name);
        assert.ok(!names.includes('express'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });

  describe('clean', async () => {
    it('should remove generated skills directory', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react],
        });

        const outputDir = join(tempDir, '.claude/skills/v-skills');
        await generate({ cwd: tempDir, output: outputDir });

        // Verify files exist
        let exists = true;
        try {
          await access(outputDir);
        } catch {
          exists = false;
        }
        assert.ok(exists);

        // Clean
        await clean({ cwd: tempDir, output: outputDir });

        // Verify removed
        exists = true;
        try {
          await access(outputDir);
        } catch {
          exists = false;
        }
        assert.ok(!exists);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should not throw when directory does not exist', async () => {
      const tempDir = await createTempDir();
      try {
        await clean({
          cwd: tempDir,
          output: join(tempDir, 'non-existent'),
        });
        // Should not throw
        assert.ok(true);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });
});
