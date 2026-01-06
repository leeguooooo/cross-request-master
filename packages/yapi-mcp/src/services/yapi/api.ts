import axios, { AxiosError } from "axios";
import { Logger } from "./logger";
import type {
  ApiInterface,
  GetApiResponse,
  ProjectInfo,
  CategoryInfo,
  ApiSearchResultItem,
  ApiSearchResponse,
  GetProjectResponse,
  GetCategoryListResponse,
  SaveApiInterfaceParams,
  SaveApiResponse
} from "./types";

export class YApiService {
  private readonly baseUrl: string;
  private readonly tokenMap: Map<string, string>;
  private readonly defaultToken: string;
  private cookieHeader: string | null = null;
  private projectInfoCache: Map<string, ProjectInfo> = new Map(); // 缓存项目信息
  private categoryListCache: Map<string, CategoryInfo[]> = new Map(); // 缓存项目分类列表
  private readonly logger: Logger;
  private readonly httpTimeoutMs: number;
  private readonly httpMaxContentLength: number;
  private readonly httpMaxBodyLength: number;

  constructor(
    baseUrl: string,
    token: string,
    logLevel: string = "info",
    options: { timeoutMs?: number; maxContentLength?: number; maxBodyLength?: number } = {},
  ) {
    this.baseUrl = baseUrl;
    this.tokenMap = new Map();
    this.defaultToken = "";
    this.logger = new Logger('YApiService', logLevel);
    this.httpTimeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 15_000;
    this.httpMaxContentLength = Number.isFinite(options.maxContentLength) ? Number(options.maxContentLength) : 10 * 1024 * 1024;
    this.httpMaxBodyLength = Number.isFinite(options.maxBodyLength) ? Number(options.maxBodyLength) : 10 * 1024 * 1024;
    
    // 解析 token 字符串：
    // - 默认 token: "token"
    // - 多项目 token: "projectId:token,projectId:token"
    if (token) {
      const tokenPairs = token.split(",");
      for (const rawPair of tokenPairs) {
        const pair = String(rawPair ?? "").trim();
        if (!pair) continue;

        const idx = pair.indexOf(":");
        if (idx === -1) {
          this.defaultToken = pair;
          continue;
        }

        const projectId = pair.slice(0, idx).trim();
        const projectToken = pair.slice(idx + 1).trim();
        if (!projectId) {
          this.logger.warn(`忽略无效 token 配置（缺少 projectId）: ${pair}`);
          continue;
        }
        if (!projectToken) {
          this.logger.warn(`忽略无效 token 配置（缺少 token）: ${pair}`);
          continue;
        }
        this.tokenMap.set(projectId, projectToken);
      }
    }
    
    this.logger.info(`YApiService已初始化，baseUrl=${baseUrl}`);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  buildInterfaceWebUrl(projectId: string, apiId: string): string {
    const base = String(this.baseUrl || "").replace(/\/+$/, "");
    const pid = encodeURIComponent(String(projectId ?? ""));
    const aid = encodeURIComponent(String(apiId ?? ""));
    return `${base}/project/${pid}/interface/api/${aid}`;
  }

  /**
   * 设置 Cookie（全局模式：使用登录态调用 YApi；也可与 token 并用）
   */
  setCookieHeader(cookieHeader: string | null): void {
    this.cookieHeader = cookieHeader ? String(cookieHeader).trim() : null;
  }

  hasCookieAuth(): boolean {
    return Boolean(this.cookieHeader);
  }

  /**
   * 动态更新某个项目的 token（用于全局模式缓存刷新）
   */
  setProjectToken(projectId: string, token: string): void {
    if (!projectId || !token) return;
    this.tokenMap.set(String(projectId), String(token));
  }

  /**
   * 批量更新项目 token（用于全局模式缓存刷新）
   */
  setProjectTokens(tokens: Map<string, string>, options: { overwrite?: boolean } = {}): void {
    const overwrite = options.overwrite !== false;
    tokens.forEach((token, projectId) => {
      const pid = String(projectId);
      if (!pid || !token) return;
      if (!overwrite && this.tokenMap.has(pid)) return;
      this.tokenMap.set(pid, String(token));
    });
  }

  /**
   * 获取已配置的项目ID列表
   */
  getConfiguredProjectIds(): string[] {
    const ids = new Set<string>();
    for (const id of this.tokenMap.keys()) ids.add(String(id));
    for (const id of this.projectInfoCache.keys()) ids.add(String(id));
    return Array.from(ids);
  }

  /**
   * 获取项目信息缓存
   */
  getProjectInfoCache(): Map<string, ProjectInfo> {
    return this.projectInfoCache;
  }

  /**
   * 获取项目分类列表缓存
   */
  getCategoryListCache(): Map<string, CategoryInfo[]> {
    return this.categoryListCache;
  }

  /**
   * 根据项目ID获取对应的token
   */
  private getToken(projectId: string): string {
    return this.tokenMap.get(projectId) || this.defaultToken;
  }

  hasProjectToken(projectId: string): boolean {
    return Boolean(this.getToken(projectId));
  }

  /**
   * 搜索项目（/api/project/search?q=...）
   * 仅在全局模式（Cookie 登录态）下更可靠。
   */
  async searchProjects(q: string): Promise<any[]> {
    const res = await this.globalSearch(q);
    return res.project;
  }

  /**
   * 全局搜索（/api/project/search?q=...）
   * 注意：该接口除了 project 之外，还会返回 group / interface。
   */
  async globalSearch(q: string): Promise<{ project: any[]; group: any[]; interface: any[] }> {
    const keyword = String(q ?? "").trim();
    if (!keyword) return { project: [], group: [], interface: [] };

    const response = await this.request<any>("/api/project/search", { q: keyword }, undefined, "GET");
    if (response?.errcode !== 0) throw new Error(response?.errmsg || "搜索失败");

    const data = response?.data ?? {};
    const projects = Array.isArray(data.project) ? data.project : Array.isArray(data.projects) ? data.projects : [];
    const groups = Array.isArray(data.group) ? data.group : Array.isArray(data.groups) ? data.groups : [];
    const interfaces = Array.isArray(data.interface) ? data.interface : Array.isArray(data.interfaces) ? data.interfaces : [];
    return { project: projects, group: groups, interface: interfaces };
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, any> = {},
    projectId?: string,
    method: "GET" | "POST" = "GET",
    options: { contentType?: "json" | "form" } = {},
  ): Promise<T> {
    try {
      this.logger.debug(`调用 ${this.baseUrl}${endpoint} 方法: ${method}`);
      
      // 使用项目ID获取对应的 token；未提供 projectId 时尽量从任意已配置 token 中挑一个（兼容多项目 token 但未配置默认 token 的场景）
      const token = projectId ? this.getToken(projectId) : this.getAnyToken();
      const cookieHeader = this.cookieHeader;
      
      if (!token && !cookieHeader) {
        const pid = projectId ? `projectId=${projectId}` : "projectId=未提供";
        throw new Error(
          `未配置鉴权信息（${pid}）。` +
            `请通过 --yapi-token / YAPI_TOKEN 配置项目 token；` +
            `或在全局模式下配置账号密码并调用 yapi_update_token 刷新登录态 Cookie。`,
        );
      }
      
      let response;
      const headers: Record<string, string> | undefined = cookieHeader ? { Cookie: cookieHeader } : undefined;
      
      if (method === 'GET') {
        response = await axios.get(`${this.baseUrl}${endpoint}`, {
          params: {
            ...params,
            ...(token ? { token } : {})
          },
          headers,
          timeout: this.httpTimeoutMs,
          maxContentLength: this.httpMaxContentLength,
          maxBodyLength: this.httpMaxBodyLength,
        });
      } else {
        const contentType = options.contentType || "json";
        const body = {
          ...params,
          ...(token ? { token } : {}),
        };
        if (contentType === "form") {
          const form = new URLSearchParams();
          for (const [key, value] of Object.entries(body)) {
            if (value === undefined || value === null) continue;
            if (typeof value === "string") form.set(key, value);
            else if (typeof value === "number" || typeof value === "boolean") form.set(key, String(value));
            else form.set(key, JSON.stringify(value));
          }
          response = await axios.post(`${this.baseUrl}${endpoint}`, form, {
            headers: { "Content-Type": "application/x-www-form-urlencoded", ...(headers ?? {}) },
            timeout: this.httpTimeoutMs,
            maxContentLength: this.httpMaxContentLength,
            maxBodyLength: this.httpMaxBodyLength,
          });
        } else {
          response = await axios.post(`${this.baseUrl}${endpoint}`, body, {
            headers,
            timeout: this.httpTimeoutMs,
            maxContentLength: this.httpMaxContentLength,
            maxBodyLength: this.httpMaxBodyLength,
          });
        }
      }

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        const errmsg =
          (typeof error.response.data === "object" && error.response.data
            ? (error.response.data as any).errmsg
            : undefined) ||
          error.message ||
          "未知错误";
        throw new Error(errmsg);
      }
      if (error instanceof Error) throw error;
      throw new Error(`与YApi服务器通信失败: ${String(error)}`);
    }
  }

  private getAnyToken(): string {
    if (this.defaultToken) return this.defaultToken;
    const it = this.tokenMap.values().next();
    return it && !it.done && it.value ? String(it.value) : "";
  }

  /**
   * 获取分类列表
   * @param projectId 项目ID
   */
  async getCategoryList(projectId: string): Promise<CategoryInfo[]> {
    try {
      // 先检查缓存
      if (this.categoryListCache.has(projectId)) {
        return this.categoryListCache.get(projectId)!;
      }
      
      // 缓存中没有，从API获取
      this.logger.debug(`从API获取项目分类列表，projectId=${projectId}`);
      const response = await this.request<GetCategoryListResponse>("/api/interface/getCatMenu", { project_id: projectId }, projectId);
      
      if (response.errcode !== 0) {
        throw new Error(response.errmsg || "获取分类列表失败");
      }
      
      // 保存到缓存
      this.categoryListCache.set(projectId, response.data);
      
      return response.data;
    } catch (error) {
      this.logger.error(`获取项目分类列表失败, projectId=${projectId}:`, error);
      throw error;
    }
  }

  /**
   * 新增接口分类（/api/interface/add_cat）
   */
  async addCategory(projectId: string, name: string, desc: string = ""): Promise<any> {
    const response = await this.request<any>(
      "/api/interface/add_cat",
      { project_id: projectId, name, desc },
      projectId,
      "POST",
      { contentType: "form" },
    );
    if (response?.errcode !== 0) {
      throw new Error(response?.errmsg || "新增接口分类失败");
    }
    // 成功后清理缓存，避免读到旧数据
    this.categoryListCache.delete(projectId);
    return response.data;
  }

  /**
   * 加载所有项目的分类列表
   */
  async loadAllCategoryLists(): Promise<void> {
    // 获取已缓存的项目ID列表
    const projectIds = Array.from(this.projectInfoCache.keys());
    
    if (projectIds.length === 0) {
      this.logger.info('项目信息未加载，无法加载分类列表');
      return;
    }
    
    this.logger.info(`开始加载 ${projectIds.length} 个项目的分类列表...`);
    
    try {
      // 并行加载所有项目的分类列表
      await Promise.all(projectIds.map(id => this.getCategoryList(id)));
      this.logger.info(`已加载 ${this.categoryListCache.size} 个项目的分类列表`);
    } catch (error) {
      this.logger.error('加载项目分类列表失败:', error);
    }
  }

  /**
   * 获取项目信息
   * @param projectId 项目ID
   */
  async getProjectInfo(projectId: string): Promise<ProjectInfo> {
    try {
      // 先检查缓存
      if (this.projectInfoCache.has(projectId)) {
        return this.projectInfoCache.get(projectId)!;
      }
      
      // 缓存中没有，从API获取
      this.logger.debug(`从API获取项目信息，projectId=${projectId}`);
      const response = await this.request<GetProjectResponse>("/api/project/get", { id: projectId }, projectId);
      
      if (response.errcode !== 0) {
        throw new Error(response.errmsg || "获取项目信息失败");
      }
      
      // 保存到缓存
      this.projectInfoCache.set(projectId, response.data);
      
      return response.data;
    } catch (error) {
      this.logger.error(`获取项目信息失败, projectId=${projectId}:`, error);
      throw error;
    }
  }

  /**
   * 加载所有已配置项目的信息
   */
  async loadAllProjectInfo(): Promise<void> {
    const projectIds = this.getConfiguredProjectIds();
    
    if (projectIds.length === 0) {
      this.logger.info('未配置项目ID，无法加载项目信息');
      return;
    }
    
    this.logger.info(`开始加载 ${projectIds.length} 个项目的信息...`);
    
    try {
      // 并行加载所有项目的信息
      await Promise.all(projectIds.map(id => this.getProjectInfo(id)));
      this.logger.info(`已加载 ${this.projectInfoCache.size} 个项目的信息`);
    } catch (error) {
      this.logger.error('加载项目信息失败:', error);
    }
  }

  /**
   * 获取接口菜单列表（/api/interface/list_menu）
   */
  async getInterfaceMenu(projectId: string): Promise<any[]> {
    const response = await this.request<any>("/api/interface/list_menu", { project_id: projectId }, projectId);
    if (response?.errcode !== 0) {
      throw new Error(response?.errmsg || "获取接口菜单列表失败");
    }
    return response.data;
  }

  /**
   * 获取接口详情
   * @param projectId 项目ID
   * @param id 接口ID
   */
  async getApiInterface(projectId: string, id: string): Promise<ApiInterface> {
    try {
      this.logger.debug(`获取接口详情，projectId=${projectId}, apiId=${id}`);
      const response = await this.request<GetApiResponse>("/api/interface/get", { id }, projectId);
      
      if (response.errcode !== 0) {
        throw new Error(response.errmsg || "获取接口详情失败");
      }
      
      return response.data;
    } catch (error) {
      this.logger.error(`获取接口详情失败, projectId=${projectId}, apiId=${id}:`, error);
      throw error;
    }
  }

  /**
   * 新增或更新接口
   * @param params 接口参数
   */
  async saveInterface(params: SaveApiInterfaceParams): Promise<SaveApiResponse> {
    try {
      const projectId = params.project_id;
      const isAdd = !params.id;
      
      this.logger.debug(`${isAdd ? '新增' : '更新'}接口, projectId=${projectId}, title=${params.title}`);
      
      // 选择合适的API端点
      const endpoint = isAdd ? "/api/interface/add" : "/api/interface/up";
      
      const response = await this.request<SaveApiResponse>(
        endpoint,
        params,
        projectId,
        'POST'
      );
      
      if (response.errcode !== 0) {
        throw new Error(response.errmsg || `${isAdd ? '新增' : '更新'}接口失败`);
      }
      
      return response;
    } catch (error) {
      this.logger.error(`${params.id ? '更新' : '新增'}接口失败:`, error);
      throw error;
    }
  }

  /**
   * 新增接口（/api/interface/add）
   */
  async addInterface(params: SaveApiInterfaceParams): Promise<SaveApiResponse> {
    const response = await this.request<SaveApiResponse>("/api/interface/add", params, params.project_id, "POST");
    if (response.errcode !== 0) {
      throw new Error(response.errmsg || "新增接口失败");
    }
    return response;
  }

  /**
   * 更新接口（/api/interface/up）
   */
  async updateInterface(params: SaveApiInterfaceParams): Promise<SaveApiResponse> {
    const response = await this.request<SaveApiResponse>("/api/interface/up", params, params.project_id, "POST");
    if (response.errcode !== 0) {
      throw new Error(response.errmsg || "更新接口失败");
    }
    return response;
  }

  /**
   * 新增或更新接口（/api/interface/save）
   */
  async saveInterfaceUnified(params: SaveApiInterfaceParams): Promise<any> {
    const response = await this.request<any>("/api/interface/save", params, params.project_id, "POST");
    if (response?.errcode !== 0) {
      throw new Error(response?.errmsg || "保存接口失败");
    }
    return response;
  }

  /**
   * 获取接口列表数据（/api/interface/list）
   */
  async listInterfaces(projectId: string, page: number = 1, limit: number = 10): Promise<any> {
    const response = await this.request<any>("/api/interface/list", { project_id: projectId, page, limit }, projectId);
    if (response?.errcode !== 0) {
      throw new Error(response?.errmsg || "获取接口列表失败");
    }
    return response.data;
  }

  /**
   * 服务端数据导入（/api/open/import_data）
   */
  async importData(projectId: string, params: { type: string; merge: string; json?: string; url?: string }): Promise<any> {
    const response = await this.request<any>("/api/open/import_data", params, projectId, "POST", { contentType: "form" });
    if (response?.errcode !== 0) {
      throw new Error(response?.errmsg || "导入数据失败");
    }
    return response.data;
  }

  /**
   * 搜索接口
   */
  async searchApis(options: {
    projectKeyword?: string; // 项目关键字
    nameKeyword?: string[] | string;    // 接口名称关键字，支持数组或字符串
    pathKeyword?: string[] | string;    // 接口路径关键字，支持数组或字符串
    tagKeyword?: string[] | string;     // 接口标签关键字，支持数组或字符串
    page?: number;           // 当前页码，默认1
    limit?: number;          // 每页数量，默认20
    maxProjects?: number;    // 最多搜索多少个项目，默认5个
  }): Promise<{
    total: number;
    list: Array<ApiSearchResultItem & { project_name?: string; cat_name?: string }>;
  }> {
    // 提取查询参数
    const {
      projectKeyword,
      nameKeyword,
      pathKeyword,
      tagKeyword,
      page = 1,
      limit = 20,
      maxProjects = 5
    } = options;
    
    // 转换查询关键字为数组
    const nameKeywords = Array.isArray(nameKeyword) ? nameKeyword : nameKeyword ? [nameKeyword] : [];
    const pathKeywords = Array.isArray(pathKeyword) ? pathKeyword : pathKeyword ? [pathKeyword] : [];
    const tagKeywords = Array.isArray(tagKeyword) ? tagKeyword : tagKeyword ? [tagKeyword] : [];
    
    this.logger.debug(
      `搜索接口 项目关键字: ${projectKeyword || '无'}, ` +
      `接口名称关键字: ${nameKeywords.join(',')} ` +
      `路径关键字: ${pathKeywords.join(',')} ` +
      `标签关键字: ${tagKeywords.join(',')}`
    );
    
    try {
      // 1. 获取项目列表（全局模式优先走服务端 project/search，避免本地全量加载）
      let projects: any[] = [];

      if (projectKeyword && projectKeyword.trim().length > 0 && this.hasCookieAuth()) {
        projects = await this.searchProjects(projectKeyword);

        // project/search 可能返回的是最小字段集合，这里做一下标准化
        projects = projects
          .map(p => ({
            _id: p?._id ?? p?.id ?? p?.project_id,
            name: p?.name ?? p?.project_name ?? p?.title ?? "",
            desc: p?.desc ?? "",
            group_id: p?.group_id ?? p?.groupId,
            basepath: p?.basepath ?? p?.base_path ?? "/",
          }))
          .filter(p => p._id != null);

        // 某些部署的 project/search 只搜名称，不搜描述；为避免行为变化，空结果时回退到本地过滤
        if (projects.length === 0) {
          this.logger.debug("project/search 返回空结果，回退到本地项目缓存过滤");
          await this.loadAllProjectInfo();
          projects = Array.from(this.projectInfoCache.values());

          const keyword = projectKeyword.trim().toLowerCase();
          projects = projects.filter(project => {
            const name = String((project as any)?.name ?? "").toLowerCase();
            const desc = String((project as any)?.desc ?? "").toLowerCase();
            const id = String((project as any)?._id ?? "");
            return name.includes(keyword) || desc.includes(keyword) || id.includes(keyword);
          });
        }
      } else if (this.hasCookieAuth() && (projectKeyword || nameKeywords.length || pathKeywords.length || tagKeywords.length)) {
        // 全局模式：若提供了任意关键词，优先用 /api/project/search 一次性拿 interface 命中集，避免逐项目扫接口
        const q = [projectKeyword, ...nameKeywords, ...pathKeywords, ...tagKeywords].filter(Boolean).join(" ").trim();
        if (q) {
          const searched = await this.globalSearch(q);

          const projectNameById = new Map<string, string>();
          for (const p of searched.project) {
            const pid = String(p?._id ?? p?.id ?? p?.projectId ?? p?.project_id ?? "");
            if (!pid) continue;
            const name = String(p?.name ?? p?.project_name ?? p?.title ?? "").trim();
            if (name) projectNameById.set(pid, name);
          }

          const candidates = (searched.interface ?? [])
            .map((it: any) => ({
              _id: String(it?._id ?? it?.id ?? ""),
              projectId: String(it?.projectId ?? it?.project_id ?? it?.project ?? ""),
              title: String(it?.title ?? ""),
              addTime: it?.addTime ?? it?.add_time,
              upTime: it?.upTime ?? it?.up_time,
            }))
            .filter(it => it._id && it.projectId);

          if (candidates.length === 0) {
            this.logger.info("全局搜索未命中任何接口");
            return { total: 0, list: [] };
          }

          const limitedCandidates = candidates.slice(0, limit);
          const byProject = new Map<string, typeof limitedCandidates>();
          for (const it of limitedCandidates) {
            const arr = byProject.get(it.projectId) ?? [];
            arr.push(it);
            byProject.set(it.projectId, arr);
          }

          const catNameByProject = new Map<string, Map<string, string>>();
          await Promise.all(
            Array.from(byProject.keys()).map(async pid => {
              try {
                const cats = await this.getCategoryList(pid);
                const m = new Map<string, string>();
                for (const c of cats) m.set(String((c as any)._id), String((c as any).name ?? ""));
                catNameByProject.set(pid, m);
              } catch {
                // ignore
              }
            }),
          );

          const results: Array<any> = [];
          for (const it of limitedCandidates) {
            try {
              const detail = await this.getApiInterface(it.projectId, it._id);
              const catid = String((detail as any).catid ?? "");
              const catName = catid ? catNameByProject.get(it.projectId)?.get(catid) : undefined;

              results.push({
                _id: String((detail as any)._id ?? it._id),
                title: String((detail as any).title ?? it.title ?? ""),
                path: String((detail as any).path ?? ""),
                method: String((detail as any).method ?? ""),
                project_id: Number.isFinite(Number(it.projectId)) ? Number(it.projectId) : it.projectId,
                add_time: (detail as any).add_time ?? it.addTime ?? Date.now() / 1000,
                up_time: (detail as any).up_time ?? it.upTime ?? Date.now() / 1000,
                catid: (detail as any).catid,
                project_name: projectNameById.get(it.projectId) || undefined,
                cat_name: catName || undefined,
              });
            } catch (e) {
              this.logger.debug(`全局搜索命中接口但拉取详情失败(projectId=${it.projectId}, id=${it._id}):`, e);
            }
          }

          const deduplicated = this.deduplicateResults(results);
          return { total: deduplicated.length, list: deduplicated };
        }
      } else {
        await this.loadAllProjectInfo();
        projects = Array.from(this.projectInfoCache.values());

        if (projectKeyword && projectKeyword.trim().length > 0) {
          const keyword = projectKeyword.trim().toLowerCase();
          projects = projects.filter(project => {
            const name = String((project as any)?.name ?? "").toLowerCase();
            const desc = String((project as any)?.desc ?? "").toLowerCase();
            const id = String((project as any)?._id ?? "");
            return name.includes(keyword) || desc.includes(keyword) || id.includes(keyword);
          });
        }
      }
      
      // 限制只搜索前几个匹配的项目
      if (projects.length > maxProjects) {
        this.logger.info(`符合条件的项目过多，只搜索前 ${maxProjects} 个项目`);
        projects = projects.slice(0, maxProjects);
      }
      
      // 如果没有符合条件的项目，返回空结果
      if (projects.length === 0) {
        this.logger.info('没有找到符合条件的项目');
        return { total: 0, list: [] };
      }
      
      this.logger.info(`在 ${projects.length} 个项目中搜索接口...`);
      
      // 2. 在每个项目中搜索接口
      let allResults: ApiSearchResultItem[] = [];
      for (const project of projects) {
        const projectId = String(project._id);
        
        for (const nameKey of nameKeywords.length ? nameKeywords : [""]) {
          for (const pathKey of pathKeywords.length ? pathKeywords : [""]) {
            for (const tagKey of tagKeywords.length ? tagKeywords : [""]) {
              // 准备查询参数
              const queryParams: Record<string, any> = {};
              if (nameKey) queryParams.keyword = nameKey;
              if (pathKey) queryParams.path = pathKey;
              if (tagKey) queryParams.tag = [tagKey];
              
              // 执行搜索
              const projectResults = await this.searchWithSingleKeyword(
                projectId, 
                queryParams, 
                page, 
                limit
              );
              
              // 添加项目名称和分类名称
              const resultsWithProjectInfo = await Promise.all(
                projectResults.list.map(async (item) => {
                  // 添加项目名称
                  const result = { 
                    ...item, 
                    project_name: project.name 
                  };
                  
                  // 尝试添加分类名称
                  try {
                    const catId = String(item.catid);
                    if (catId) {
                      // 获取项目的分类列表
                      const categories = await this.getCategoryList(projectId);
                      const category = categories.find(cat => String(cat._id) === catId);
                      if (category) {
                        result.cat_name = category.name;
                      }
                    }
                  } catch (error) {
                    // 忽略获取分类名称的错误
                    this.logger.debug(`无法获取分类名称，项目ID=${projectId}, 分类ID=${item.catid}:`, error);
                  }
                  
                  return result;
                })
              );
              
              // 将结果添加到总结果中
              allResults = [...allResults, ...resultsWithProjectInfo];
            }
          }
        }
      }
      
      // 3. 对结果去重
      const deduplicated = this.deduplicateResults(allResults);
      
      // 如果结果太多，截取合适的数量
      const limitedResults = deduplicated.slice(0, limit);
      
      this.logger.info(`共找到 ${deduplicated.length} 个符合条件的接口，显示 ${limitedResults.length} 个`);
      
      return {
        total: deduplicated.length,
        list: limitedResults
      };
    } catch (error) {
      this.logger.error('搜索接口失败:', error);
      throw error;
    }
  }

  /**
   * 使用单个关键字在单个项目中搜索接口
   */
  private async searchWithSingleKeyword(
    projectId: string, 
    queryParams: { keyword?: string; path?: string; tag?: string[] }, 
    page: number, 
    limit: number
  ): Promise<{ total: number; list: any[] }> {
    try {
      // 构建查询参数
      const params = {
        project_id: projectId,
        page,
        limit,
        ...queryParams
      };
      
      const response = await this.request<ApiSearchResponse>("/api/interface/list", params, projectId);
      
      if (response.errcode !== 0) {
        throw new Error(response.errmsg || "搜索接口失败");
      }
      
      return response.data;
    } catch (error) {
      this.logger.debug(`在项目 ${projectId} 中使用关键字 ${JSON.stringify(queryParams)} 搜索接口失败:`, error);
      // 搜索失败时返回空结果，而非抛出异常中断整个搜索流程
      return { total: 0, list: [] };
    }
  }

  /**
   * 对搜索结果去重
   */
  private deduplicateResults(results: any[]): any[] {
    // 使用接口ID作为唯一标识符去重
    const seen = new Set<string>();
    return results.filter(item => {
      const id = String(item._id);
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
  }

  /**
   * 获取分类下的所有接口
   */
  async getCategoryApis(projectId: string, catId: string): Promise<Array<ApiSearchResultItem>> {
    try {
      const response = await this.listCategoryInterfaces(projectId, catId, 1, 100);
      
      if (response.errcode !== 0) {
        throw new Error(response.errmsg || "获取分类接口列表失败");
      }
      
      return response.data.list;
    } catch (error) {
      this.logger.error(`获取分类接口列表失败, projectId=${projectId}, catId=${catId}:`, error);
      throw error;
    }
  }

  /**
   * 获取某个分类下接口列表（/api/interface/list_cat）
   */
  async listCategoryInterfaces(projectId: string, catId: string, page: number = 1, limit: number = 10): Promise<ApiSearchResponse> {
    const params = {
      project_id: projectId,
      catid: catId,
      page,
      limit,
    };

    const response = await this.request<ApiSearchResponse>("/api/interface/list_cat", params, projectId);

    if (response.errcode !== 0) {
      throw new Error(response.errmsg || "获取分类接口列表失败");
    }

    return response;
  }
} 
