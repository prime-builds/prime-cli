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

export type ArtifactSchemas = Record<string, JSONSchema>;
