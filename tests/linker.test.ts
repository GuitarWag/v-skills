import { describe, it } from 'node:test';
import assert from 'node:assert';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createSkillFile, createSkillFileName } from '../src/linker.js';
import { createTempDir, cleanupTempDir } from './utils/fixtures.js';
import type { PackageInfo } from '../src/types.js';

describe('linker', async () => {
  describe('createSkillFileName', async () => {
    it('should create filename with name and version', () => {
      const fileName = createSkillFileName('react', '18.3.1');
      assert.strictEqual(fileName, 'react@18.3.1.md');
    });

    it('should handle scoped packages', () => {
      const fileName = createSkillFileName('@company/utils', '1.0.0');
      assert.strictEqual(fileName, 'company__utils@1.0.0.md');
    });

    it('should handle deeply scoped packages', () => {
      const fileName = createSkillFileName('@org/sub/pkg', '2.0.0');
      assert.strictEqual(fileName, 'org__sub__pkg@2.0.0.md');
    });
  });

  describe('createSkillFile', async () => {
    it('should create a skill file with content', async () => {
      const tempDir = await createTempDir();
      try {
        const outputDir = join(tempDir, 'skills');
        const pkg: PackageInfo = {
          name: 'react',
          version: '18.3.1',
          description: 'A JavaScript library for building user interfaces',
          homepage: 'https://react.dev/',
          readme: '# React\n\nThis is the readme content.',
        };

        const skill = await createSkillFile(pkg, outputDir);

        assert.ok(skill);
        assert.strictEqual(skill.name, 'react');
        assert.strictEqual(skill.version, '18.3.1');

        const content = await readFile(skill.targetPath, 'utf-8');
        assert.ok(content.includes('<!-- v-skills: react@18.3.1 -->'));
        assert.ok(content.includes('# react'));
        assert.ok(content.includes('**Version:** 18.3.1'));
        assert.ok(
          content.includes('**Description:** A JavaScript library for building user interfaces')
        );
        assert.ok(content.includes('**Homepage:** https://react.dev/'));
        assert.ok(content.includes('# React'));
        assert.ok(content.includes('This is the readme content.'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should include repository in header', async () => {
      const tempDir = await createTempDir();
      try {
        const outputDir = join(tempDir, 'skills');
        const pkg: PackageInfo = {
          name: 'test-pkg',
          version: '1.0.0',
          repository: { type: 'git', url: 'git+https://github.com/user/repo.git' },
          readme: '# Test',
        };

        const skill = await createSkillFile(pkg, outputDir);
        assert.ok(skill);

        const content = await readFile(skill.targetPath, 'utf-8');
        assert.ok(content.includes('**Repository:** https://github.com/user/repo'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should include engines in header', async () => {
      const tempDir = await createTempDir();
      try {
        const outputDir = join(tempDir, 'skills');
        const pkg: PackageInfo = {
          name: 'test-pkg',
          version: '1.0.0',
          engines: { node: '>=18.0.0', npm: '>=9.0.0' },
          readme: '# Test',
        };

        const skill = await createSkillFile(pkg, outputDir);
        assert.ok(skill);

        const content = await readFile(skill.targetPath, 'utf-8');
        assert.ok(content.includes('**Engines:** node: >=18.0.0, npm: >=9.0.0'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should include peer dependencies in header', async () => {
      const tempDir = await createTempDir();
      try {
        const outputDir = join(tempDir, 'skills');
        const pkg: PackageInfo = {
          name: 'test-pkg',
          version: '1.0.0',
          peerDependencies: { react: '^18.0.0', typescript: '^5.0.0' },
          readme: '# Test',
        };

        const skill = await createSkillFile(pkg, outputDir);
        assert.ok(skill);

        const content = await readFile(skill.targetPath, 'utf-8');
        assert.ok(content.includes('**Peer Dependencies:** react@^18.0.0, typescript@^5.0.0'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should return null for packages without readme', async () => {
      const tempDir = await createTempDir();
      try {
        const outputDir = join(tempDir, 'skills');
        const pkg: PackageInfo = {
          name: 'no-readme',
          version: '1.0.0',
        };

        const skill = await createSkillFile(pkg, outputDir);
        assert.strictEqual(skill, null);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should create output directory if it does not exist', async () => {
      const tempDir = await createTempDir();
      try {
        const outputDir = join(tempDir, 'deep', 'nested', 'skills');
        const pkg: PackageInfo = {
          name: 'test-pkg',
          version: '1.0.0',
          readme: '# Test',
        };

        const skill = await createSkillFile(pkg, outputDir);
        assert.ok(skill);

        const content = await readFile(skill.targetPath, 'utf-8');
        assert.ok(content.includes('# test-pkg'));
        assert.ok(content.includes('**Version:** 1.0.0'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should overwrite existing skill file', async () => {
      const tempDir = await createTempDir();
      try {
        const outputDir = join(tempDir, 'skills');

        // Create first version
        const pkg1: PackageInfo = {
          name: 'test-pkg',
          version: '1.0.0',
          readme: '# Version 1',
        };
        await createSkillFile(pkg1, outputDir);

        // Create second version (same name)
        const pkg2: PackageInfo = {
          name: 'test-pkg',
          version: '1.0.0',
          readme: '# Version 2',
        };
        const skill = await createSkillFile(pkg2, outputDir);
        assert.ok(skill);

        const content = await readFile(skill.targetPath, 'utf-8');
        assert.ok(content.includes('# Version 2'));
        assert.ok(!content.includes('# Version 1'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle string repository format', async () => {
      const tempDir = await createTempDir();
      try {
        const outputDir = join(tempDir, 'skills');
        const pkg: PackageInfo = {
          name: 'test-pkg',
          version: '1.0.0',
          repository: 'github:user/repo',
          readme: '# Test',
        };

        const skill = await createSkillFile(pkg, outputDir);
        assert.ok(skill);

        const content = await readFile(skill.targetPath, 'utf-8');
        assert.ok(content.includes('**Repository:** github:user/repo'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });
});
