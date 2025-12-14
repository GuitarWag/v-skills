import { describe, it } from 'node:test';
import assert from 'node:assert';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { loadConfig, mergeConfig } from '../src/config.js';
import { createTempDir, cleanupTempDir } from './utils/fixtures.js';

describe('config', async () => {
  describe('loadConfig', async () => {
    it('should return null when no config exists', async () => {
      const tempDir = await createTempDir();
      try {
        const config = await loadConfig(tempDir);
        assert.strictEqual(config, null);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should load JSON config', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'v-skills.config.json'),
          JSON.stringify({
            exclude: ['@types/*', 'typescript'],
            directOnly: true,
          })
        );

        const config = await loadConfig(tempDir);

        assert.ok(config);
        assert.deepStrictEqual(config.exclude, ['@types/*', 'typescript']);
        assert.strictEqual(config.directOnly, true);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should load YAML config', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'v-skills.config.yaml'),
          `exclude:
  - '@types/*'
  - typescript
directOnly: true
output: custom/output
`
        );

        const config = await loadConfig(tempDir);

        assert.ok(config);
        assert.deepStrictEqual(config.exclude, ['@types/*', 'typescript']);
        assert.strictEqual(config.directOnly, true);
        assert.strictEqual(config.output, 'custom/output');
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should load YML config', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'v-skills.config.yml'),
          `include:
  - react
  - express
directOnly: true
`
        );

        const config = await loadConfig(tempDir);

        assert.ok(config);
        assert.deepStrictEqual(config.include, ['react', 'express']);
        assert.strictEqual(config.directOnly, true);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should load JS config (ESM)', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'v-skills.config.js'),
          `export default {
  exclude: ['eslint*'],
  directOnly: false,
};`
        );

        const config = await loadConfig(tempDir);

        assert.ok(config);
        assert.deepStrictEqual(config.exclude, ['eslint*']);
        assert.strictEqual(config.directOnly, false);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should load MJS config (ESM)', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'v-skills.config.mjs'),
          `export default {
  exclude: ['@types/*'],
  directOnly: true,
  output: 'custom-output',
};`
        );

        const config = await loadConfig(tempDir);

        assert.ok(config);
        assert.deepStrictEqual(config.exclude, ['@types/*']);
        assert.strictEqual(config.directOnly, true);
        assert.strictEqual(config.output, 'custom-output');
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should prioritize .mjs over .js when both exist', async () => {
      const tempDir = await createTempDir();
      try {
        // Create .js config
        await writeFile(
          join(tempDir, 'v-skills.config.js'),
          `export default {
  exclude: ['from-js-config'],
};`
        );

        // Create .mjs config
        await writeFile(
          join(tempDir, 'v-skills.config.mjs'),
          `export default {
  exclude: ['from-mjs-config'],
};`
        );

        const config = await loadConfig(tempDir);

        assert.ok(config);
        // Should use .mjs, not .js
        assert.deepStrictEqual(config.exclude, ['from-mjs-config']);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should prioritize .mjs over other formats', async () => {
      const tempDir = await createTempDir();
      try {
        // Create JSON config
        await writeFile(
          join(tempDir, 'v-skills.config.json'),
          JSON.stringify({
            exclude: ['from-json'],
          })
        );

        // Create YAML config
        await writeFile(
          join(tempDir, 'v-skills.config.yaml'),
          `exclude:
  - from-yaml`
        );

        // Create .mjs config
        await writeFile(
          join(tempDir, 'v-skills.config.mjs'),
          `export default {
  exclude: ['from-mjs'],
};`
        );

        const config = await loadConfig(tempDir);

        assert.ok(config);
        // Should use .mjs, not JSON or YAML
        assert.deepStrictEqual(config.exclude, ['from-mjs']);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should load config from package.json vskills field', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'package.json'),
          JSON.stringify({
            name: 'test-project',
            vskills: {
              exclude: ['@types/*'],
              output: '.ai/deps',
            },
          })
        );

        const config = await loadConfig(tempDir);

        assert.ok(config);
        assert.deepStrictEqual(config.exclude, ['@types/*']);
        assert.strictEqual(config.output, '.ai/deps');
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should prioritize config file over package.json', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'package.json'),
          JSON.stringify({
            name: 'test-project',
            vskills: {
              exclude: ['from-package-json'],
            },
          })
        );
        await writeFile(
          join(tempDir, 'v-skills.config.json'),
          JSON.stringify({
            exclude: ['from-config-file'],
          })
        );

        const config = await loadConfig(tempDir);

        assert.ok(config);
        assert.deepStrictEqual(config.exclude, ['from-config-file']);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle YAML with quoted values', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'v-skills.config.yaml'),
          `exclude:
  - "@types/*"
  - 'eslint*'
output: ".claude/skills"
`
        );

        const config = await loadConfig(tempDir);

        assert.ok(config);
        assert.deepStrictEqual(config.exclude, ['@types/*', 'eslint*']);
        assert.strictEqual(config.output, '.claude/skills');
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should handle YAML inline values', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'v-skills.config.yaml'),
          `directOnly: true
output: deps
`
        );

        const config = await loadConfig(tempDir);

        assert.ok(config);
        assert.strictEqual(config.directOnly, true);
        assert.strictEqual(config.output, 'deps');
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should validate include must be array', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'v-skills.config.json'),
          JSON.stringify({ include: 'not-an-array' })
        );

        await assert.rejects(() => loadConfig(tempDir), /include.*must be an array/i);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should validate exclude must be array', async () => {
      const tempDir = await createTempDir();
      try {
        await writeFile(
          join(tempDir, 'v-skills.config.json'),
          JSON.stringify({ exclude: 'not-an-array' })
        );

        await assert.rejects(() => loadConfig(tempDir), /exclude.*must be an array/i);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });

  describe('mergeConfig', async () => {
    it('should return CLI options when no file config', () => {
      const cliOptions = { exclude: ['typescript'], directOnly: true };
      const result = mergeConfig(cliOptions, null);

      assert.deepStrictEqual(result, cliOptions);
    });

    it('should merge CLI and file config', () => {
      const cliOptions = { exclude: ['cli-exclude'] };
      const fileConfig = {
        exclude: ['file-exclude'],
        include: ['react'],
        directOnly: true,
      };

      const result = mergeConfig(cliOptions, fileConfig);

      // CLI takes precedence for exclude
      assert.deepStrictEqual(result.exclude, ['cli-exclude']);
      // File config used for include and directOnly
      assert.deepStrictEqual(result.include, ['react']);
      assert.strictEqual(result.directOnly, true);
    });

    it('should let CLI options override file config', () => {
      const cliOptions = {
        directOnly: false,
        output: 'cli-output',
      };
      const fileConfig = {
        directOnly: true,
        output: 'file-output',
        include: ['react'],
      };

      const result = mergeConfig(cliOptions, fileConfig);

      assert.strictEqual(result.directOnly, false);
      assert.strictEqual(result.output, 'cli-output');
      assert.deepStrictEqual(result.include, ['react']); // from file
    });

    it('should handle empty CLI options', () => {
      const cliOptions = {};
      const fileConfig = {
        exclude: ['@types/*'],
        directOnly: true,
        output: 'custom',
      };

      const result = mergeConfig(cliOptions, fileConfig);

      assert.deepStrictEqual(result.exclude, ['@types/*']);
      assert.strictEqual(result.directOnly, true);
      assert.strictEqual(result.output, 'custom');
    });
  });
});
