import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { readdir, access } from 'node:fs/promises';
import {
  createTempDir,
  cleanupTempDir,
  createMockWorkspace,
  testPackages,
} from './utils/fixtures.js';

const CLI_PATH = join(import.meta.dirname, '..', 'src', 'cli.ts');

function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const proc = spawn('node', ['--import', 'tsx', CLI_PATH, ...args], {
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      stdout += data.toString();
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', code => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

describe('CLI', async () => {
  describe('help command', async () => {
    it('should display help with --help flag', async () => {
      const { code, stdout } = await runCli(['--help']);

      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('v-skills'));
      assert.ok(stdout.includes('Usage:'));
      assert.ok(stdout.includes('Commands:'));
      assert.ok(stdout.includes('Options:'));
    });

    it('should display help with help command', async () => {
      const { code, stdout } = await runCli(['help']);

      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('v-skills'));
    });

    it('should display help with -h flag', async () => {
      const { code, stdout } = await runCli(['-h']);

      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('v-skills'));
    });
  });

  describe('generate command', async () => {
    it('should generate skills with default command', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react, testPackages.zod],
        });

        const { code, stdout } = await runCli(['--cwd', tempDir]);

        assert.strictEqual(code, 0);
        assert.ok(stdout.includes('v-skills generated'));
        assert.ok(stdout.includes('2 skill files'));

        const files = await readdir(join(tempDir, '.claude/skills/v-skills'));
        // New folder structure: package-name/SKILL.md
        assert.ok(files.includes('react'));
        assert.ok(files.includes('zod'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should generate skills with explicit generate command', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.express],
        });

        const { code, stdout } = await runCli(['generate', '--cwd', tempDir]);

        assert.strictEqual(code, 0);
        assert.ok(stdout.includes('1 skill files'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should support --cwd option', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react],
        });

        const { code, stdout } = await runCli(['--cwd', tempDir]);

        assert.strictEqual(code, 0);
        assert.ok(stdout.includes('1 skill files'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should support --output option', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react],
        });

        const customOutput = join(tempDir, 'custom-output');
        const { code } = await runCli(['--cwd', tempDir, '--output', customOutput]);

        assert.strictEqual(code, 0);

        const files = await readdir(customOutput);
        assert.ok(files.includes('react'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should support --direct-only option', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react, testPackages.express],
          directDeps: ['react'],
        });

        const { code, stdout } = await runCli(['--cwd', tempDir, '--direct-only']);

        assert.strictEqual(code, 0);
        assert.ok(stdout.includes('1 skill files'));

        const files = await readdir(join(tempDir, '.claude/skills/v-skills'));
        assert.ok(files.includes('react'));
        assert.ok(!files.includes('express'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should support --include option', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react, testPackages.express, testPackages.zod],
        });

        const { code, stdout } = await runCli(['--cwd', tempDir, '--include', 'react,zod']);

        assert.strictEqual(code, 0);
        assert.ok(stdout.includes('2 skill files'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should support --exclude option', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react, testPackages.express, testPackages.zod],
        });

        const { code, stdout } = await runCli(['--cwd', tempDir, '--exclude', 'express']);

        assert.strictEqual(code, 0);
        assert.ok(stdout.includes('2 skill files'));

        const files = await readdir(join(tempDir, '.claude/skills/v-skills'));
        assert.ok(!files.includes('express'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should suppress output with --silent option', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react],
        });

        const { code, stdout } = await runCli(['--cwd', tempDir, '--silent']);

        assert.strictEqual(code, 0);
        assert.strictEqual(stdout.trim(), '');
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should display workspace type in output', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react],
          workspaceConfig: { type: 'pnpm', packages: ['packages/*'] },
        });

        const { code, stdout } = await runCli(['--cwd', tempDir]);

        assert.strictEqual(code, 0);
        assert.ok(stdout.includes('Workspace: pnpm'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });

  describe('clean command', async () => {
    it('should remove generated skills', async () => {
      const tempDir = await createTempDir();
      try {
        await createMockWorkspace({
          root: tempDir,
          packages: [testPackages.react],
        });

        // Generate first
        await runCli(['--cwd', tempDir]);

        // Verify exists
        const outputDir = join(tempDir, '.claude/skills/v-skills');
        let exists = true;
        try {
          await access(outputDir);
        } catch {
          exists = false;
        }
        assert.ok(exists);

        // Clean
        const { code, stdout } = await runCli(['clean', '--cwd', tempDir]);

        assert.strictEqual(code, 0);
        assert.ok(stdout.includes('cleaned'));

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

    it('should support --silent option for clean', async () => {
      const tempDir = await createTempDir();
      try {
        const { code, stdout } = await runCli(['clean', '--cwd', tempDir, '--silent']);

        assert.strictEqual(code, 0);
        assert.strictEqual(stdout.trim(), '');
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });

  describe('init command', async () => {
    it('should create v-skills.config.mjs file', async () => {
      const tempDir = await createTempDir();
      try {
        const { code, stdout } = await runCli(['init', '--cwd', tempDir]);

        assert.strictEqual(code, 0);
        assert.ok(stdout.includes('Created v-skills.config.mjs'));

        // Verify file exists
        const configPath = join(tempDir, 'v-skills.config.mjs');
        let exists = true;
        try {
          await access(configPath);
        } catch {
          exists = false;
        }
        assert.ok(exists);

        // Verify content
        const { readFile } = await import('node:fs/promises');
        const content = await readFile(configPath, 'utf-8');
        assert.ok(content.includes('export default'));
        assert.ok(content.includes('VSkillsConfig'));
        assert.ok(content.includes('exclude'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should create config with default template content', async () => {
      const tempDir = await createTempDir();
      try {
        await runCli(['init', '--cwd', tempDir]);

        const { readFile } = await import('node:fs/promises');
        const configPath = join(tempDir, 'v-skills.config.mjs');
        const content = await readFile(configPath, 'utf-8');

        // Check for key template elements
        assert.ok(content.includes('@types/*'));
        assert.ok(content.includes('typescript'));
        assert.ok(content.includes('eslint*'));
        assert.ok(content.includes('prettier'));
        assert.ok(content.includes('directOnly'));
        assert.ok(content.includes('include'));
        assert.ok(content.includes('output'));
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should work with init as standalone command', async () => {
      const tempDir = await createTempDir();
      try {
        const { code } = await runCli(['init', '--cwd', tempDir]);

        assert.strictEqual(code, 0);

        const configPath = join(tempDir, 'v-skills.config.mjs');
        let exists = true;
        try {
          await access(configPath);
        } catch {
          exists = false;
        }
        assert.ok(exists);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });
});
