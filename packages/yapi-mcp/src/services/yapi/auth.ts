import axios, { AxiosError } from "axios";
import { Logger } from "./logger";
import { YApiAuthCache, YApiSessionCookie } from "./authCache";

type JsonObject = Record<string, any>;

function looksLikeToken(val: unknown): boolean {
  if (typeof val !== "string") return false;
  const s = val.trim();
  if (s.length < 24) return false;
  if (s.length > 128) return false;
  if (/^[a-f0-9]{32}$/i.test(s)) return true;
  if (/^[a-f0-9]{64}$/i.test(s)) return true;
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return false;
  if (!/[a-zA-Z]/.test(s) || !/[0-9]/.test(s)) return false;
  return true;
}

function findTokenInObject(obj: unknown, depth: number = 0): string | undefined {
  if (depth > 6) return undefined;
  if (!obj) return undefined;
  if (typeof obj === "string") return looksLikeToken(obj) ? obj.trim() : undefined;
  if (typeof obj !== "object") return undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const hit = findTokenInObject(item, depth + 1);
      if (hit) return hit;
    }
    return undefined;
  }

  const record = obj as Record<string, unknown>;
  const preferredKeys = ["token", "project_token", "projectToken", "projectTokenValue"];
  for (const key of preferredKeys) {
    const v = record[key];
    if (typeof v === "string" && looksLikeToken(v)) return v.trim();
  }

  for (const key of Object.keys(record)) {
    const hit = findTokenInObject(record[key], depth + 1);
    if (hit) return hit;
  }
  return undefined;
}

function pickCookieValue(setCookie: string[] | undefined, key: string): string | undefined {
  if (!setCookie || setCookie.length === 0) return undefined;
  const prefix = `${key}=`;
  for (const item of setCookie) {
    const trimmed = String(item || "").trim();
    if (!trimmed.startsWith(prefix)) continue;
    const value = trimmed.slice(prefix.length).split(";")[0];
    return value || undefined;
  }
  return undefined;
}

function pickCookieExpiresAt(setCookie: string[] | undefined, key: string): number | undefined {
  if (!setCookie || setCookie.length === 0) return undefined;
  const prefix = `${key}=`;
  for (const item of setCookie) {
    const trimmed = String(item || "").trim();
    if (!trimmed.startsWith(prefix)) continue;
    const parts = trimmed.split(";").map(s => s.trim());
    const expiresPart = parts.find(p => /^expires=/i.test(p));
    if (!expiresPart) return undefined;
    const dateStr = expiresPart.split("=").slice(1).join("=");
    const ts = Date.parse(dateStr);
    return Number.isFinite(ts) ? ts : undefined;
  }
  return undefined;
}

export class YApiAuthService {
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly password: string;
  private readonly logger: Logger;
  private readonly cache: YApiAuthCache;
  private readonly httpTimeoutMs: number;
  private readonly httpMaxContentLength: number;
  private readonly httpMaxBodyLength: number;
  private readonly httpMaxHtmlBytes: number;

  constructor(
    baseUrl: string,
    email: string,
    password: string,
    logLevel: string = "info",
    options: { timeoutMs?: number; maxContentLength?: number; maxBodyLength?: number; maxHtmlBytes?: number } = {},
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.email = email;
    this.password = password;
    this.logger = new Logger("YApiAuthService", logLevel);
    this.cache = new YApiAuthCache(this.baseUrl, logLevel);
    this.httpTimeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 15_000;
    this.httpMaxContentLength = Number.isFinite(options.maxContentLength) ? Number(options.maxContentLength) : 10 * 1024 * 1024;
    this.httpMaxBodyLength = Number.isFinite(options.maxBodyLength) ? Number(options.maxBodyLength) : 10 * 1024 * 1024;
    this.httpMaxHtmlBytes = Number.isFinite(options.maxHtmlBytes) ? Number(options.maxHtmlBytes) : 2 * 1024 * 1024;
  }

  loadCachedProjectTokens(): Map<string, string> {
    return this.cache.loadProjectTokens();
  }

  getCachedCookieHeader(): string | null {
    const cached = this.cache.loadSession();
    if (!this.isSessionValid(cached)) return null;
    return this.getCookieHeader(cached);
  }

  private getCookieHeader(session: YApiSessionCookie): string {
    const parts = [`_yapi_token=${session.yapiToken}`];
    if (session.yapiUid) parts.push(`_yapi_uid=${session.yapiUid}`);
    return parts.join("; ");
  }

  private isSessionValid(session: YApiSessionCookie | null): session is YApiSessionCookie {
    if (!session?.yapiToken) return false;
    if (!session.expiresAt) return true;
    return Date.now() < session.expiresAt - 60_000; // 预留 1 分钟
  }

  async login(force: boolean = false): Promise<YApiSessionCookie> {
    const cached = this.cache.loadSession();
    if (!force && this.isSessionValid(cached)) return cached;

    try {
      this.logger.info("正在登录 YApi 以刷新全局登录态（Cookie）...");
      const response = await axios.post(
        `${this.baseUrl}/api/user/login`,
        { email: this.email, password: this.password },
        {
          headers: { "Content-Type": "application/json;charset=UTF-8" },
          timeout: this.httpTimeoutMs,
          maxContentLength: this.httpMaxContentLength,
          maxBodyLength: this.httpMaxBodyLength,
        },
      );

      const setCookie = response.headers["set-cookie"] as string[] | undefined;
      const yapiToken = pickCookieValue(setCookie, "_yapi_token");
      const yapiUid = pickCookieValue(setCookie, "_yapi_uid");
      const expiresAt = pickCookieExpiresAt(setCookie, "_yapi_token");

      if (!yapiToken) {
        const msg = (response.data as any)?.errmsg || "登录失败，未返回 _yapi_token";
        throw new Error(msg);
      }

      const session: YApiSessionCookie = {
        yapiToken,
        yapiUid,
        expiresAt,
        updatedAt: Date.now(),
      };
      this.cache.saveSession(session);
      return session;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        throw new Error(error.response.data?.errmsg || "登录失败");
      }
      throw error instanceof Error ? error : new Error("登录失败");
    }
  }

  /**
   * 获取可直接用于请求头的 Cookie（必要时会自动登录刷新）。
   */
  async getCookieHeaderWithLogin(options: { forceLogin?: boolean } = {}): Promise<string> {
    const session = await this.login(Boolean(options.forceLogin));
    return this.getCookieHeader(session);
  }

  private async cookieRequest<T>(
    method: "GET" | "POST",
    endpoint: string,
    session: YApiSessionCookie,
    options: { params?: JsonObject; data?: JsonObject } = {},
  ): Promise<T> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const cookie = this.getCookieHeader(session);
      const headers: Record<string, string> = { Cookie: cookie, Accept: "application/json, text/plain, */*" };
      const res =
        method === "GET"
          ? await axios.get(url, {
              params: options.params,
              headers,
              timeout: this.httpTimeoutMs,
              maxContentLength: this.httpMaxContentLength,
              maxBodyLength: this.httpMaxBodyLength,
            })
          : await axios.post(url, options.data ?? {}, {
              params: options.params,
              headers,
              timeout: this.httpTimeoutMs,
              maxContentLength: this.httpMaxContentLength,
              maxBodyLength: this.httpMaxBodyLength,
            });
      return res.data as T;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        throw new Error(error.response.data?.errmsg || "请求失败");
      }
      throw error instanceof Error ? error : new Error("请求失败");
    }
  }

  private async cookieRequestText(
    endpoint: string,
    session: YApiSessionCookie,
    options: { params?: JsonObject } = {},
  ): Promise<string> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const cookie = this.getCookieHeader(session);
      const headers: Record<string, string> = {
        Cookie: cookie,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      };
      const res = await axios.get(url, {
        params: options.params,
        headers,
        responseType: "text",
        timeout: this.httpTimeoutMs,
        maxContentLength: this.httpMaxHtmlBytes,
        maxBodyLength: this.httpMaxBodyLength,
      });
      return String(res.data ?? "");
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        throw new Error((error.response.data as any)?.errmsg || "请求失败");
      }
      throw error instanceof Error ? error : new Error("请求失败");
    }
  }

  private async listGroups(session: YApiSessionCookie): Promise<any[]> {
    // 有些实例同时支持 group/get_mygroup 和 group/list，这里尽量都试一下并去重
    const groups: any[] = [];
    const tryFetch = async (endpoint: string) => {
      try {
        const res = await this.cookieRequest<any>("GET", endpoint, session);
        if (res?.errcode === 0 && Array.isArray(res.data)) groups.push(...res.data);
      } catch {
        // ignore
      }
    };
    await tryFetch("/api/group/get_mygroup");
    await tryFetch("/api/group/list");

    const seen = new Set<string>();
    return groups.filter(g => {
      const id = String(g?._id ?? g?.id ?? "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  private async listProjectsInGroup(session: YApiSessionCookie, groupId: string): Promise<any[]> {
    const all: any[] = [];
    const limit = 50;
    let page = 1;
    while (true) {
      const res = await this.cookieRequest<any>("GET", "/api/project/list", session, {
        params: { group_id: groupId, page, limit },
      });
      if (res?.errcode !== 0) break;
      const list = res?.data?.list;
      if (Array.isArray(list)) all.push(...list);
      const total = Number(res?.data?.total ?? NaN);
      if (!Number.isFinite(total)) {
        if (!Array.isArray(list) || list.length < limit) break;
      } else if (all.length >= total) {
        break;
      }
      page += 1;
      if (page > 200) break;
    }
    return all;
  }

  private async getProjectDetail(session: YApiSessionCookie, projectId: string): Promise<any> {
    const res = await this.cookieRequest<any>("GET", "/api/project/get", session, { params: { id: projectId } });
    if (res?.errcode !== 0) throw new Error(res?.errmsg || "获取项目详情失败");
    return res.data;
  }

  private async getProjectTokenFromSettingPage(session: YApiSessionCookie, projectId: string): Promise<string | undefined> {
    const html = await this.cookieRequestText(`/project/${encodeURIComponent(projectId)}/setting`, session);
    const tokenRegexes = [
      /(?:project\s*token|项目\s*token|token)\s*[:：]\s*([a-zA-Z0-9_-]{24,128})/i,
      /name\s*=\s*"token"[\s\S]{0,200}?value\s*=\s*"([a-zA-Z0-9_-]{24,128})"/i,
      /id\s*=\s*"token"[\s\S]{0,200}?value\s*=\s*"([a-zA-Z0-9_-]{24,128})"/i,
    ];
    for (const re of tokenRegexes) {
      const m = re.exec(html);
      if (m && m[1] && looksLikeToken(m[1])) return m[1].trim();
    }
    return undefined;
  }

  async listAccessibleProjects(options: { forceLogin?: boolean } = {}): Promise<{ groups: any[]; projects: any[] }> {
    const session = await this.login(Boolean(options.forceLogin));
    const groups = await this.listGroups(session);
    const projects: any[] = [];
    const seenProjectId = new Set<string>();

    for (const g of groups) {
      const groupId = String(g?._id ?? g?.id ?? "");
      if (!groupId) continue;
      try {
        const list = await this.listProjectsInGroup(session, groupId);
        for (const p of list) {
          const pid = String(p?._id ?? p?.id ?? "");
          if (!pid) continue;
          if (seenProjectId.has(pid)) continue;
          seenProjectId.add(pid);
          projects.push(p);
        }
      } catch (e) {
        this.logger.warn(`获取分组项目列表失败(groupId=${groupId}): ${e}`);
      }
    }

    return { groups, projects };
  }

  async refreshProjectTokens(
    options: { forceLogin?: boolean } = {},
  ): Promise<{ tokens: Map<string, string>; projects: any[]; groups: any[]; cookieHeader: string }> {
    const session = await this.login(Boolean(options.forceLogin));
    const cookieHeader = this.getCookieHeader(session);
    const groups = await this.listGroups(session);
    const projects: any[] = [];

    for (const g of groups) {
      const groupId = String(g?._id ?? g?.id ?? "");
      if (!groupId) continue;
      try {
        const list = await this.listProjectsInGroup(session, groupId);
        projects.push(...list);
      } catch (e) {
        this.logger.warn(`获取分组项目列表失败(groupId=${groupId}): ${e}`);
      }
    }

    const tokens = new Map<string, string>();
    for (const p of projects) {
      const projectId = String(p?._id ?? p?.id ?? "");
      if (!projectId) continue;
      try {
        const tokenFromList = findTokenInObject(p);
        if (tokenFromList) {
          tokens.set(projectId, tokenFromList);
          continue;
        }

        const detail = await this.getProjectDetail(session, projectId);
        const tokenFromGet = findTokenInObject(detail);
        if (tokenFromGet) {
          tokens.set(projectId, tokenFromGet);
          continue;
        }

        const tokenFromHtml = await this.getProjectTokenFromSettingPage(session, projectId);
        if (tokenFromHtml) tokens.set(projectId, tokenFromHtml);
      } catch (e) {
        this.logger.warn(`获取项目 token 失败(projectId=${projectId}): ${e}`);
      }
    }

    this.cache.saveProjectTokens(tokens);
    return { tokens, projects, groups, cookieHeader };
  }
}
