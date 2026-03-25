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
