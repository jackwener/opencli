/**
 * Shared YAML CLI definition types.
 * Used by both discovery.ts (runtime) and build-manifest.ts (build-time).
 */

export interface YamlArgDefinition {
  type?: string;
  default?: unknown;
  required?: boolean;
  positional?: boolean;
  description?: string;
  help?: string;
  choices?: string[];
}

export interface YamlCliDefinition {
  site?: string;
  name?: string;
  description?: string;
  domain?: string;
  strategy?: string;
  browser?: boolean;
  args?: Record<string, YamlArgDefinition>;
  columns?: string[];
  pipeline?: Record<string, unknown>[];
  timeout?: number;
  navigateBefore?: boolean | string;
}

import type { Arg } from './registry.js';

/** Convert YAML args definition to the internal Arg[] format. */
export function parseYamlArgs(args: Record<string, YamlArgDefinition> | undefined): Arg[] {
  if (!args || typeof args !== 'object') return [];
  const result: Arg[] = [];
  for (const [argName, argDef] of Object.entries(args)) {
    result.push({
      name: argName,
      type: argDef?.type ?? 'str',
      default: argDef?.default,
      required: argDef?.required ?? false,
      positional: argDef?.positional ?? false,
      help: argDef?.description ?? argDef?.help ?? '',
      choices: argDef?.choices,
    });
  }
  return result;
}
