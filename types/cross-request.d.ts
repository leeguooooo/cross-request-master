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

export interface CrossRequestOptions {
  url: string;
  method?: string;
  type?: string;
  headers?: Record<string, string>;
  data?: any;
  body?: any;
  timeout?: number;
  success?: (res: any, header: Record<string, string>, data: YApiCallbackData) => void;
  error?: (err: any, header: Record<string, string>, data: YApiCallbackData) => void;
}

export type CrossRequestFn = (options: CrossRequestOptions | string) => Promise<ProcessedResponse>;

declare global {
  const crossRequest: CrossRequestFn;

  interface Window {
    crossRequest: CrossRequestFn;
    __crossRequestSilentMode?: boolean;
  }
}
