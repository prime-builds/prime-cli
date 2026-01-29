export type JSONSchema = Record<string, unknown>;

export interface WebSurfaceUrl {
  url: string;
  method?: string;
  status?: number;
  content_type?: string;
  source: string;
}

export interface WebSurfaceForm {
  action: string;
  method?: string;
}

export interface WebSurfaceLink {
  url: string;
  source?: string;
}

export interface WebSurfaceEvidence {
  kind: string;
  path: string;
  description: string;
}

export interface WebSurfaceArtifact {
  target: string;
  timestamp: string;
  urls: WebSurfaceUrl[];
  forms?: WebSurfaceForm[];
  links?: WebSurfaceLink[];
  notes?: string[];
  evidence?: WebSurfaceEvidence[];
}

export interface WebHeaderEntry {
  name: string;
  value: string;
  source?: string;
  url?: string;
}

export interface WebHeadersArtifact {
  target: string;
  timestamp: string;
  headers: WebHeaderEntry[];
  evidence?: WebSurfaceEvidence[];
  notes?: string[];
}

export interface RobotsSitemapArtifact {
  target: string;
  timestamp: string;
  robots_url?: string;
  sitemap_urls?: string[];
  discovered_urls?: string[];
  notes?: string[];
  evidence?: WebSurfaceEvidence[];
}

export interface LinkGraphNode {
  url: string;
}

export interface LinkGraphEdge {
  from: string;
  to: string;
  source?: string;
}

export interface LinkGraphArtifact {
  target: string;
  timestamp: string;
  nodes: LinkGraphNode[];
  edges: LinkGraphEdge[];
  stats?: {
    node_count?: number;
    edge_count?: number;
  };
}

export type FindingEvidence = {
  kind: "url" | "header" | "html" | "text";
  value: string;
  path?: string;
};

export type FindingRef = {
  source: "kb";
  doc_id: string;
  chunk_id: string;
  label?: string;
};

export type FindingCandidate = {
  id: string;
  type: string;
  title: string;
  description: string;
  evidence: FindingEvidence[];
  confidence: "low" | "medium" | "high";
  severity_hint: "info" | "low" | "medium" | "high";
  tags: string[];
  refs: FindingRef[];
};

export type FindingsCandidatesArtifact = {
  target: string;
  timestamp: string;
  source_artifacts: string[];
  candidates: FindingCandidate[];
};

export type TriagedFinding = {
  candidate_id: string;
  decision: "keep" | "drop" | "needs_review";
  severity: "info" | "low" | "medium" | "high";
  rationale: string;
  tags: string[];
  refs: FindingRef[];
};

export type FindingsTriagedArtifact = {
  target: string;
  timestamp: string;
  source_artifacts: string[];
  triaged: TriagedFinding[];
  summary: {
    kept: number;
    dropped: number;
    needs_review: number;
  };
};

export type ReportArtifact = {
  target: string;
  timestamp: string;
  artifacts: string[];
  report_path: string;
};

export type ReportExportArtifact = {
  target: string;
  timestamp: string;
  artifacts: string[];
  report_path: string;
  export_path: string;
};

export type ArtifactSchemas = Record<string, JSONSchema>;
