/**
 * Shared types for the explore module.
 */

export interface NetworkEntry {
  method: string;
  url: string;
  status: number | null;
  contentType: string;
  responseBody?: unknown;
  requestHeaders?: Record<string, string>;
}

export interface ResponseAnalysis {
  itemPath: string | null;
  itemCount: number;
  detectedFields: Record<string, string>;
  sampleFields: string[];
}

export interface AnalyzedEndpoint {
  pattern: string;
  method: string;
  url: string;
  status: number | null;
  contentType: string;
  queryParams: string[];
  score: number;
  hasSearchParam: boolean;
  hasPaginationParam: boolean;
  hasLimitParam: boolean;
  authIndicators: string[];
  responseAnalysis: ResponseAnalysis | null;
}

export interface InferredCapability {
  name: string;
  description: string;
  strategy: string;
  confidence: number;
  endpoint: string;
  itemPath: string | null;
  recommendedColumns: string[];
  recommendedArgs: Array<{ name: string; type: string; required: boolean; default?: unknown }>;
  storeHint?: { store: string; action: string };
}

export interface DiscoveredStore {
  type: 'pinia' | 'vuex';
  id: string;
  actions: string[];
  stateKeys: string[];
}

export interface ExploreManifest {
  site: string;
  target_url: string;
  final_url: string;
  title: string;
  framework: Record<string, boolean>;
  stores: Array<{ type: DiscoveredStore['type']; id: string; actions: string[] }>;
  top_strategy: string;
  explored_at?: string;
}

export interface ExploreAuthSummary {
  top_strategy: string;
  indicators: string[];
  framework: Record<string, boolean>;
}

export interface ExploreEndpointArtifact {
  pattern: string;
  method: string;
  url: string;
  status: number | null;
  contentType: string;
  score: number;
  queryParams: string[];
  itemPath: string | null;
  itemCount: number;
  detectedFields: Record<string, string>;
  authIndicators: string[];
}

export interface ExploreResult {
  site: string;
  target_url: string;
  final_url: string;
  title: string;
  framework: Record<string, boolean>;
  stores: DiscoveredStore[];
  top_strategy: string;
  endpoint_count: number;
  api_endpoint_count: number;
  capabilities: InferredCapability[];
  auth_indicators: string[];
  out_dir: string;
}

export interface ExploreBundle {
  manifest: ExploreManifest;
  endpoints: ExploreEndpointArtifact[];
  capabilities: InferredCapability[];
  auth: ExploreAuthSummary;
}
