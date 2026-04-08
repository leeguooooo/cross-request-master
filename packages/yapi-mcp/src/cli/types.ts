import type { DiagramRenderMetric } from "../docs/markdown";

export type Options = {
  config?: string;
  baseUrl?: string;
  loginUrl?: string;
  token?: string;
  projectId?: string;
  authMode?: string;
  browser?: boolean;
  email?: string;
  password?: string;
  cookie?: string;
  tokenParam?: string;
  method?: string;
  path?: string;
  url?: string;
  query?: string[];
  header?: string[];
  data?: string;
  dataFile?: string;
  timeout?: number;
  id?: string;
  name?: string;
  desc?: string;
  catId?: string;
  groupId?: string;
  type?: string;
  typeId?: string;
  page?: number;
  limit?: number | string;
  noUpdate?: boolean;
  q?: string;
  noPretty?: boolean;
  help?: boolean;
  version?: boolean;
};

export type DocsSyncOptions = {
  config?: string;
  baseUrl?: string;
  token?: string;
  projectId?: string;
  authMode?: string;
  email?: string;
  password?: string;
  cookie?: string;
  tokenParam?: string;
  timeout?: number;
  dirs: string[];
  bindings: string[];
  sourceFiles: string[];
  dryRun?: boolean;
  noMermaid?: boolean;
  mermaidLook?: "classic" | "handDrawn";
  mermaidHandDrawnSeed?: number;
  force?: boolean;
  help?: boolean;
};

export type DocsSyncMapping = {
  project_id?: number;
  catid?: number;
  template_id?: number;
  source_files?: string[];
  files?: Record<string, number>;
  file_hashes?: Record<string, string>;
  file_render_modes?: Record<string, "classic" | "no-mermaid">;
  [key: string]: unknown;
};

export type DocsSyncFileInfo = {
  docId: number;
  apiPath: string;
};

export type DocsSyncPreviewAction = "create" | "update" | "skip" | "preview-only";

export type DocsSyncPreviewItem = {
  fileName: string;
  action: DocsSyncPreviewAction;
  markdownBytes: number;
  htmlBytes: number;
  payloadBytes: number;
  apiPath: string;
  docId?: number;
  largestMermaid?: DiagramRenderMetric;
};

export type DocsSyncBinding = DocsSyncMapping & {
  dir: string;
};

export type DocsSyncConfig = {
  version: number;
  bindings: Record<string, DocsSyncBinding>;
};

export type DocsSyncLinkEntry = {
  doc_id: number;
  api_path: string;
  url: string;
};

export type DocsSyncLinksBinding = {
  dir: string;
  project_id?: number;
  catid?: number;
  files: Record<string, DocsSyncLinkEntry>;
};

export type DocsSyncLinksConfig = {
  version: number;
  bindings: Record<string, DocsSyncLinksBinding>;
};

export type DocsSyncProjectEnv = {
  name: string;
  domain: string;
};

export type DocsSyncProjectInfo = {
  project_id: number;
  name?: string;
  basepath?: string;
  envs?: DocsSyncProjectEnv[];
  base_url?: string;
};

export type DocsSyncProjectsConfig = {
  version: number;
  projects: Record<string, DocsSyncProjectInfo>;
};

export type DocsSyncDeploymentEntry = {
  api_path: string;
  env_urls: Record<string, string>;
};

export type DocsSyncDeploymentBinding = {
  dir: string;
  project_id?: number;
  files: Record<string, DocsSyncDeploymentEntry>;
};

export type DocsSyncDeploymentsConfig = {
  version: number;
  bindings: Record<string, DocsSyncDeploymentBinding>;
};

export type DocsSyncBindArgs = {
  name?: string;
  dir?: string;
  projectId?: number;
  catId?: number;
  templateId?: number;
  sourceFiles?: string[];
  clearSourceFiles?: boolean;
  help?: boolean;
};

export type ConfigInitOptions = Pick<Options, "baseUrl" | "email" | "password" | "token" | "projectId">;

export type SimpleRequestResult = {
  ok: boolean;
  queryItems?: [string, string][];
  method?: "GET" | "POST";
  data?: unknown;
};

export type SimpleRequestQueryBuilder = (options: Options) => SimpleRequestResult;

export type YapiRequest = (
  endpoint: string,
  method: "GET" | "POST",
  query?: Record<string, unknown>,
  data?: unknown,
) => Promise<any>;

export type AgentBrowserCookie = {
  name?: string;
  value?: string;
  expires?: number | string;
  expiresAt?: number | string;
};

export type UpdateCache = {
  lastChecked?: number;
  latest?: string;
  lastNotified?: string;
  lastNotifiedAt?: number;
};
