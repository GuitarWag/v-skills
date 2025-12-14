import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { VSkillsConfig } from './types.js';
import { fileExists } from './utils.js';

const CONFIG_FILES = [
  'v-skills.config.js',
  'v-skills.config.mjs',
  'v-skills.config.cjs',
  'v-skills.config.json',
  'v-skills.config.yaml',
  'v-skills.config.yml',
];

/**
 * Load configuration from various sources in order of priority:
 * 1. v-skills.config.{js,mjs,cjs,json,yaml,yml}
 * 2. "vskills" field in package.json
 */
export async function loadConfig(cwd: string): Promise<VSkillsConfig | null> {
  // Try config files first
  for (const fileName of CONFIG_FILES) {
    const filePath = join(cwd, fileName);
    if (await fileExists(filePath)) {
      return await loadConfigFile(filePath, fileName);
    }
  }

  // Try package.json "vskills" field
  const packageJsonPath = join(cwd, 'package.json');
  if (await fileExists(packageJsonPath)) {
    try {
      const content = await readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      if (pkg.vskills && typeof pkg.vskills === 'object') {
        return validateConfig(pkg.vskills);
      }
    } catch {
      // Invalid package.json, ignore
    }
  }

  return null;
}

async function loadConfigFile(filePath: string, fileName: string): Promise<VSkillsConfig> {
  // JSON config
  if (fileName.endsWith('.json')) {
    const content = await readFile(filePath, 'utf-8');
    return validateConfig(JSON.parse(content));
  }

  // YAML config
  if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
    const content = await readFile(filePath, 'utf-8');
    return validateConfig(parseYaml(content));
  }

  // JavaScript config (ESM or CJS)
  try {
    const fileUrl = pathToFileURL(filePath).href;
    const module = await import(fileUrl);
    const config = module.default || module;
    return validateConfig(config);
  } catch (err) {
    throw new Error(`Failed to load config from ${fileName}: ${err}`);
  }
}

/**
 * Simple YAML parser for our config format
 * Supports: strings, arrays, booleans
 */
function parseYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Array item
    if (trimmed.startsWith('-') && currentKey) {
      if (!currentArray) {
        currentArray = [];
        result[currentKey] = currentArray;
      }
      const value = trimmed
        .slice(1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      currentArray.push(value);
      continue;
    }

    // Key-value pair
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      currentKey = key;
      currentArray = null;

      if (value) {
        // Inline value
        result[key] = parseYamlValue(value);
        currentKey = null;
      }
    }
  }

  return result;
}

function parseYamlValue(value: string): unknown {
  // Remove quotes
  const unquoted = value.replace(/^['"]|['"]$/g, '');

  // Booleans
  if (unquoted === 'true') return true;
  if (unquoted === 'false') return false;

  // Numbers
  if (/^-?\d+$/.test(unquoted)) return parseInt(unquoted, 10);
  if (/^-?\d+\.\d+$/.test(unquoted)) return parseFloat(unquoted);

  return unquoted;
}

/**
 * Validate and normalize config
 */
function validateConfig(config: unknown): VSkillsConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }

  const cfg = config as Record<string, unknown>;
  const result: VSkillsConfig = {};

  if (cfg.include !== undefined) {
    if (!Array.isArray(cfg.include)) {
      throw new Error('Config "include" must be an array');
    }
    result.include = cfg.include.map(String);
  }

  if (cfg.exclude !== undefined) {
    if (!Array.isArray(cfg.exclude)) {
      throw new Error('Config "exclude" must be an array');
    }
    result.exclude = cfg.exclude.map(String);
  }

  if (cfg.directOnly !== undefined) {
    result.directOnly = Boolean(cfg.directOnly);
  }

  if (cfg.output !== undefined) {
    result.output = String(cfg.output);
  }

  return result;
}

/**
 * Merge CLI options with config file options
 * CLI options take precedence
 */
export function mergeConfig(
  cliOptions: VSkillsConfig,
  fileConfig: VSkillsConfig | null
): VSkillsConfig {
  if (!fileConfig) {
    return cliOptions;
  }

  return {
    include: cliOptions.include ?? fileConfig.include,
    exclude: cliOptions.exclude ?? fileConfig.exclude,
    directOnly: cliOptions.directOnly ?? fileConfig.directOnly,
    output: cliOptions.output ?? fileConfig.output,
  };
}
