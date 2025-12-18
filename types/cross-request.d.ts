export interface ProcessedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  body: string;
  bodyParsed?: any;
  isError?: boolean;
  ok?: boolean;
}

export interface YApiCallbackData {
  res: {
    body: string;
    header: Record<string, string>;
    status: number;
    statusText: string;
    success: boolean;
  };
  status: number;
  statusText: string;
  success: boolean;
}

export type RequestBody =
  | Record<string, any>
  | string
  | number
  | boolean
  | null
  | FormData
  | Blob
  | File
  | URLSearchParams
  | ArrayBuffer
  | DataView;

export interface CrossRequestOptions {
  url: string;
  method?: string;
  type?: string;
  headers?: Record<string, string>;
  data?: RequestBody;
  body?: RequestBody;
  // Legacy interface (YMFE/cross-request PR #7): map form field -> file input element id/element
  files?: Record<string, string | HTMLInputElement>;
  // Legacy interface: file input element id/element as raw body
  file?: string | HTMLInputElement;
  timeout?: number;
  success?: (res: any, header: Record<string, string>, data: YApiCallbackData) => void;
  error?: (err: any, header: Record<string, string>, data: YApiCallbackData) => void;
}

export type CrossRequestFn = (options: CrossRequestOptions | string) => Promise<ProcessedResponse>;

export interface YapiOpenApiClientConfig {
  baseUrl?: string;
  token?: string;
  timeout?: number;
}

export interface YapiSearchApisParams {
  projectId?: string;
  projectKeyword?: string;
  nameKeyword?: string;
  pathKeyword?: string;
  tagKeyword?: string;
  limit?: number;
  page?: number;
}

export interface YapiGetCategoriesParams {
  projectId: string;
  includeApis?: boolean;
  limitPerCategory?: number;
}

export interface YapiGetApiDescParams {
  projectId: string;
  apiId: string;
}

export type YapiSaveApiPayload = Record<string, any> & {
  projectId: string;
  catid: string;
  id?: string;
  title: string;
  path: string;
  method: string;
};

export interface YapiOpenApiClient {
  configure: (config: YapiOpenApiClientConfig) => { baseUrl: string; token: string; timeout: number };
  getConfig: () => { baseUrl: string; token: string; timeout: number };
  yapi_get_api_desc: (params: YapiGetApiDescParams) => Promise<any>;
  yapi_save_api: (payload: YapiSaveApiPayload) => Promise<any>;
  yapi_list_projects: () => Promise<any[]>;
  yapi_get_categories: (params: YapiGetCategoriesParams) => Promise<any>;
  yapi_search_apis: (params: YapiSearchApisParams) => Promise<{ total: number; list: any[] }>;
}

export type CrossRequest = CrossRequestFn & {
  fetch?: (options: CrossRequestOptions) => Promise<ProcessedResponse>;
  ajax?: (options: any) => Promise<any>;
  yapiMcp?: YapiOpenApiClient;
  yapi?: YapiOpenApiClient;
};

declare global {
  const crossRequest: CrossRequest;

  interface Window {
    crossRequest: CrossRequest;
    __crossRequestSilentMode?: boolean;
  }
}
