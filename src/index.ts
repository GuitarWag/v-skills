export { generate, clean } from './generator.js';
export { detectWorkspace, getNodeModulesPaths } from './workspace.js';
export { traverseNodeModules, getDirectDependencies } from './traverse.js';
export {
  createSkillFile,
  createSkillFileName,
  createSkillFolderName,
  generateMarkdown,
} from './linker.js';
export { loadConfig, mergeConfig } from './config.js';
export type {
  DocumentationSources,
  PackageInfo,
  WorkspaceInfo,
  GenerateOptions,
  GenerateResult,
  SkillFile,
  VSkillsConfig,
} from './types.js';
