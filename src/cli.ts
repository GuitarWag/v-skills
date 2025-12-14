#!/usr/bin/env node

import { generate, clean } from './generator.js';
import { loadConfig, mergeConfig } from './config.js';
import type { GenerateOptions, VSkillsConfig } from './types.js';

const HELP = `
v-skills - Auto-generate AI agent skills from node_modules

Usage:
  v-skills [command] [options]

Commands:
  generate    Generate skill files from node_modules (default)
  clean       Remove generated skill files
  init        Create a v-skills.config.js template
  help        Show this help message

Options:
  --cwd <path>        Working directory (default: current directory)
  --output <path>     Output directory (default: .claude/skills/v-skills)
  --direct-only       Only include direct dependencies
  --include <pkgs>    Comma-separated packages to include
  --exclude <pkgs>    Comma-separated packages to exclude
  --silent            Suppress output (for postinstall)
  --no-config         Ignore config file

Config Files (auto-detected):
  v-skills.config.js    JavaScript/ESM config
  v-skills.config.json  JSON config
  v-skills.config.yaml  YAML config
  package.json          "vskills" field

Examples:
  v-skills                           Generate all skills
  v-skills generate --direct-only    Only direct dependencies
  v-skills --exclude "typescript,eslint*"
  v-skills init                      Create config template
  v-skills clean                     Remove generated files

Postinstall:
  Add to package.json scripts:
  "postinstall": "v-skills generate --silent"
`;

const CONFIG_TEMPLATE = `/** @type {import('v-skills').VSkillsConfig} */
export default {
  // Only include direct dependencies (skip transitive)
  // directOnly: true,

  // Packages to include (supports globs)
  // include: ['react', 'express', '@tanstack/*'],

  // Packages to exclude (supports globs)
  exclude: [
    '@types/*',
    'typescript',
    'eslint*',
    'prettier',
  ],

  // Output directory
  // output: '.claude/skills/v-skills',
};
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse command
  let command = 'generate';
  if (args[0] && !args[0].startsWith('-')) {
    command = args.shift()!;
  }

  // Parse CLI options
  const cliOptions: VSkillsConfig & { cwd?: string } = {};
  let silent = false;
  let noConfig = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--cwd':
        cliOptions.cwd = args[++i];
        break;
      case '--output':
        cliOptions.output = args[++i];
        break;
      case '--direct-only':
        cliOptions.directOnly = true;
        break;
      case '--include':
        cliOptions.include = args[++i]?.split(',').map(s => s.trim());
        break;
      case '--exclude':
        cliOptions.exclude = args[++i]?.split(',').map(s => s.trim());
        break;
      case '--silent':
        silent = true;
        break;
      case '--no-config':
        noConfig = true;
        break;
      case '--help':
      case '-h':
        command = 'help';
        break;
    }
  }

  const cwd = cliOptions.cwd || process.cwd();

  try {
    switch (command) {
      case 'generate': {
        // Load and merge config
        const fileConfig = noConfig ? null : await loadConfig(cwd);
        const mergedConfig = mergeConfig(cliOptions, fileConfig);

        const options: GenerateOptions = {
          cwd,
          ...mergedConfig,
        };

        const result = await generate(options);

        if (!silent) {
          if (fileConfig) {
            console.log(`\n  Using config file`);
          }
          console.log(`\n✓ v-skills generated ${result.skills.length} skill files`);
          console.log(`  Workspace: ${result.workspaceType}`);
          console.log(`  Scanned: ${result.packagesScanned} packages`);
          console.log(`  Duration: ${result.duration}ms`);
          console.log(`  Output: ${options.output || '.claude/skills/v-skills'}\n`);
        }
        break;
      }

      case 'clean': {
        const fileConfig = noConfig ? null : await loadConfig(cwd);
        const mergedConfig = mergeConfig(cliOptions, fileConfig);

        await clean({ cwd, output: mergedConfig.output });
        if (!silent) {
          console.log('\n✓ v-skills cleaned generated files\n');
        }
        break;
      }

      case 'init': {
        const { writeFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const configPath = join(cwd, 'v-skills.config.js');

        await writeFile(configPath, CONFIG_TEMPLATE);
        console.log(`\n✓ Created v-skills.config.js\n`);
        break;
      }

      case 'help':
      default:
        console.log(HELP);
        break;
    }
  } catch (err) {
    if (!silent) {
      console.error('v-skills error:', err instanceof Error ? err.message : err);
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
  });
