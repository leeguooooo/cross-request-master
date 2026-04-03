import { joinUrl } from "./utils";

export class HttpStatusError extends Error {
  status: number;
  statusText: string;
  body: string;
  endpoint: string;

  constructor(endpoint: string, status: number, statusText: string, body: string) {
    super(`request failed: ${status} ${statusText} ${body}`);
    this.name = "HttpStatusError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.endpoint = endpoint;
  }
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function buildUrl(
  baseUrl: string | null,
  endpoint: string,
  queryItems: [string, string][],
  token: string,
  tokenParam: string,
): string {
  const url = baseUrl ? joinUrl(baseUrl, endpoint) : endpoint;
  const parsed = new URL(url);
  for (const [key, value] of queryItems) {
    if (key) parsed.searchParams.append(key, value ?? "");
  }
  if (token && !parsed.searchParams.has(tokenParam)) {
    parsed.searchParams.append(tokenParam, token);
  }
  return parsed.toString();
}
