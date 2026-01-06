import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import express, { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { IncomingMessage, ServerResponse } from "http";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import packageJson from "../package.json";
import { YApiService } from "./services/yapi/api";
import { ProjectInfoCache } from "./services/yapi/cache";
import { Logger } from "./services/yapi/logger";
import { YApiAuthService } from "./services/yapi/auth";

type JsonLike = unknown;

function normalizeJsonArrayInput(value: JsonLike, fieldName: string): { ok: true; value: any[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (Array.isArray(value)) return { ok: true, value };
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return { ok: false, error: `${fieldName} 需要是 JSON 数组` };
      return { ok: true, value: parsed };
    } catch (e) {
      return { ok: false, error: `${fieldName} JSON 解析错误: ${e}` };
    }
  }
  return { ok: false, error: `${fieldName} 需要是 JSON 数组或数组类型` };
}

function normalizeStringOrJson(value: JsonLike, fieldName: string): { ok: true; value: string } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value === "string") return { ok: true, value };
  try {
    return { ok: true, value: JSON.stringify(value, null, 2) };
  } catch (e) {
    return { ok: false, error: `${fieldName} 无法序列化为 JSON 字符串: ${e}` };
  }
}

function normalizeTagInput(value: JsonLike): { ok: true; value: string[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (Array.isArray(value)) return { ok: true, value: value.map(String).filter(Boolean) };
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return { ok: true, value: [] };
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) return { ok: false, error: "tag 需要是 JSON 数组" };
        return { ok: true, value: parsed.map(String).filter(Boolean) };
      } catch (e) {
        return { ok: false, error: `tag JSON 解析错误: ${e}` };
      }
    }
    return { ok: true, value: trimmed.split(/[\s,]+/).map(s => s.trim()).filter(Boolean) };
  }
  return { ok: false, error: "tag 需要是字符串或字符串数组" };
}

export class YapiMcpServer {
  private readonly server: McpServer;
  private readonly yapiService: YApiService;
  private readonly projectInfoCache: ProjectInfoCache;
  private readonly logger: Logger;
  private readonly authService: YApiAuthService | null;
  private readonly authMode: "token" | "global";
  private readonly toolset: "basic" | "full";
  private sseTransport: SSEServerTransport | null = null;
  private readonly isStdioMode: boolean;

  constructor(
    yapiBaseUrl: string,
    yapiToken: string,
    yapiLogLevel: string = "info",
    yapiCacheTTL: number = 10,
    auth?: { mode?: "token" | "global"; email?: string; password?: string },
    http?: { timeoutMs?: number },
    tools?: { toolset?: "basic" | "full" },
  ) {
    this.logger = new Logger("YapiMCP", yapiLogLevel);
    this.yapiService = new YApiService(yapiBaseUrl, yapiToken, yapiLogLevel, { timeoutMs: http?.timeoutMs });
    this.projectInfoCache = new ProjectInfoCache(yapiBaseUrl, yapiCacheTTL, yapiLogLevel);
    this.authMode = auth?.mode ?? (auth?.email && auth?.password ? "global" : "token");
    this.authService =
      this.authMode === "global" && auth?.email && auth?.password
        ? new YApiAuthService(yapiBaseUrl, auth.email, auth.password, yapiLogLevel, { timeoutMs: http?.timeoutMs })
        : null;
    this.toolset = tools?.toolset ?? "full";

    if (this.authService) {
      const cachedCookie = this.authService.getCachedCookieHeader();
      if (cachedCookie) {
        this.yapiService.setCookieHeader(cachedCookie);
        this.logger.info("全局模式已启用：已从本地缓存加载登录态 cookie");
      }
    }
    // 判断是否为stdio模式
    this.isStdioMode = process.env.NODE_ENV === "cli" || process.argv.includes("--stdio");
    
    this.logger.info(`YapiMcpServer初始化，日志级别: ${yapiLogLevel}, 缓存TTL: ${yapiCacheTTL}分钟`);
    
    this.server = new McpServer({
      name: "Yapi MCP Server",
      version: String((packageJson as any)?.version ?? "0.0.0"),
    });

    this.registerTools();
    // stdio 模式下 MCP client 需要快速完成握手；不要在启动阶段做任何网络请求/全量缓存预热
    if (this.isStdioMode) {
      this.loadCacheFromDiskOnly();
    } else {
      this.initializeCache();
    }
  }

  private loadCacheFromDiskOnly(): void {
    try {
      const cachedProjectInfo = this.projectInfoCache.loadFromCache();
      if (cachedProjectInfo.size === 0) return;
      cachedProjectInfo.forEach((info, id) => {
        this.yapiService.getProjectInfoCache().set(id, info);
      });
      this.logger.info(`stdio 模式：已从缓存加载 ${cachedProjectInfo.size} 个项目信息（未做预热请求）`);
    } catch (e) {
      this.logger.warn(`stdio 模式：读取缓存失败（忽略）：${e}`);
    }
  }

  private async initializeCache(): Promise<void> {
    try {
      // 检查缓存是否过期
      if (this.projectInfoCache.isCacheExpired()) {
        this.logger.info('缓存已过期，将异步更新缓存数据');

        // 异步加载最新的项目信息，不阻塞初始化过程
        setTimeout(() => {
          this.asyncUpdateCache().catch(error => {
            this.logger.error('异步更新缓存失败:', error);
          });
        }, 0);
      } else {
        // 从缓存加载数据
        const cachedProjectInfo = this.projectInfoCache.loadFromCache();

        // 如果缓存中有数据，直接使用
        if (cachedProjectInfo.size > 0) {
          // 将缓存数据设置到服务中
          cachedProjectInfo.forEach((info, id) => {
            this.yapiService.getProjectInfoCache().set(id, info);
          });

          this.logger.info(`已从缓存加载 ${cachedProjectInfo.size} 个项目信息`);
        } else {
          // 缓存为空，异步更新
          this.logger.info('缓存为空，将异步更新缓存数据');
          setTimeout(() => {
            this.asyncUpdateCache().catch(error => {
              this.logger.error('异步更新缓存失败:', error);
            });
          }, 0);
        }
      }
    } catch (error) {
      this.logger.error('加载或检查缓存时出错:', error);

      // 出错时也尝试异步更新缓存
      setTimeout(() => {
        this.asyncUpdateCache().catch(err => {
          this.logger.error('异步更新缓存失败:', err);
        });
      }, 0);
    }
  }

  /**
   * 异步更新缓存数据
   * 该方法会在后台加载最新的项目信息和分类列表，并更新缓存
   */
  private async asyncUpdateCache(): Promise<void> {
    try {
      this.logger.debug('开始异步更新缓存数据');

      // 加载最新的项目信息
      await this.yapiService.loadAllProjectInfo();
      this.logger.debug(`已加载 ${this.yapiService.getProjectInfoCache().size} 个项目信息`);

      // 更新缓存
      this.projectInfoCache.saveToCache(this.yapiService.getProjectInfoCache());

      // 加载所有项目的分类列表
      await this.yapiService.loadAllCategoryLists();
      this.logger.debug('已加载所有项目的分类列表');

      this.logger.info('缓存数据已成功更新');
    } catch (error) {
      this.logger.error('更新缓存数据失败:', error);
      throw error;
    }
  }

  private registerTools(): void {
    const isFull = this.toolset === "full";

    const yapiParamItemSchema = z
      .object({
        name: z.string().describe("参数名"),
        desc: z.string().optional().describe("中文备注/说明（建议把枚举、单位、范围等写清楚）"),
        type: z.string().optional().describe("类型，如 string/number/boolean/integer/object/array"),
        example: z.string().optional().describe("示例值"),
        required: z.union([z.string(), z.number(), z.boolean()]).optional().describe("是否必填（YApi 常用 '1'/'0'）"),
      })
      .passthrough();

    const yapiHeaderItemSchema = yapiParamItemSchema
      .extend({
        value: z.string().optional().describe("Header 值（如 application/json）"),
      })
      .passthrough();

    const normalizeRequiredString = (value: unknown): string => String(value ?? "").trim();

    const normalizeProjectId = (value: unknown): string => {
      const s = normalizeRequiredString(value);
      // 允许从 URL/片段中提取数字 id
      const m = /(\d+)/.exec(s);
      return m ? m[1] : s;
    };

    const normalizeCatId = (value: unknown): string => {
      const s = normalizeRequiredString(value);
      // 兼容页面路由里的 cat_ 前缀
      const m = /^cat_(\d+)$/i.exec(s);
      return m ? m[1] : s;
    };

    const normalizeHttpMethod = (value: unknown): string => normalizeRequiredString(value).toUpperCase();

    const normalizeApiPath = (value: unknown): string => {
      // LLM 容易把 path 输出成多行；path 里不应出现空白字符
      const raw = String(value ?? "");
      const compact = raw.replace(/\s+/g, "");
      if (!compact) return "";
      return compact.startsWith("/") ? compact : `/${compact}`;
    };

    const buildInterfaceSaveParams = async (input: {
      projectId: string;
      catid?: string;
      id?: string;
      title?: string;
      path?: string;
      method?: string;
      status?: string;
      tag?: unknown;
      req_params?: unknown;
      req_query?: unknown;
      req_headers?: unknown;
      req_body_type?: string;
      req_body_form?: unknown;
      req_body_other?: unknown;
      req_body_is_json_schema?: boolean;
      res_body_type?: string;
      res_body?: unknown;
      res_body_is_json_schema?: boolean;
      switch_notice?: boolean;
      api_opened?: boolean;
      desc?: string;
      markdown?: string;
      message?: string;
    }): Promise<{ ok: true; params: any; isUpdate: boolean } | { ok: false; error: string }> => {
      const isUpdate = Boolean(input.id);
      let current: any | null = null;

      if (isUpdate) {
        current = await this.yapiService.getApiInterface(normalizeProjectId(input.projectId), String(input.id));
      }

      const finalProjectId = normalizeProjectId(input.projectId);
      const finalCatid = normalizeCatId(input.catid ?? (current ? String((current as any).catid ?? "") : ""));
      const finalTitle = normalizeRequiredString(input.title ?? (current ? String((current as any).title ?? "") : ""));
      const finalPath = normalizeApiPath(input.path ?? (current ? String((current as any).path ?? "") : ""));
      const finalMethod = normalizeHttpMethod(input.method ?? (current ? String((current as any).method ?? "") : ""));

      if (!finalCatid) return { ok: false, error: "缺少 catid：新增必填；更新可省略但必须能从原接口读取到" };
      if (!finalTitle) return { ok: false, error: "缺少 title：新增必填；更新可省略但必须能从原接口读取到" };
      if (!finalPath) return { ok: false, error: "缺少 path：新增必填；更新可省略但必须能从原接口读取到" };
      if (!finalMethod) return { ok: false, error: "缺少 method：新增必填；更新可省略但必须能从原接口读取到" };

      const params: any = {
        project_id: finalProjectId,
        catid: finalCatid,
        title: finalTitle,
        path: finalPath,
        method: finalMethod,
      };

      if (isUpdate) params.id = input.id;

      const tagRaw = input.tag !== undefined ? input.tag : isUpdate ? (current as any)?.tag : undefined;
      const tagResult = normalizeTagInput(tagRaw);
      if (!tagResult.ok) return { ok: false, error: tagResult.error };
      params.tag = tagResult.value;

      params.status = input.status ?? (isUpdate ? (current as any)?.status : "undone");
      params.desc = input.desc ?? (isUpdate ? (current as any)?.desc : "");
      params.markdown = input.markdown ?? (isUpdate ? (current as any)?.markdown : "");
      params.message = input.message ?? (isUpdate ? (current as any)?.message : "");

      const reqParamsRaw = input.req_params !== undefined ? input.req_params : isUpdate ? (current as any)?.req_params : [];
      const reqParamsParsed = normalizeJsonArrayInput(reqParamsRaw, "req_params");
      if (!reqParamsParsed.ok) return { ok: false, error: reqParamsParsed.error };
      params.req_params = reqParamsParsed.value;

      const reqQueryRaw = input.req_query !== undefined ? input.req_query : isUpdate ? (current as any)?.req_query : [];
      const reqQueryParsed = normalizeJsonArrayInput(reqQueryRaw, "req_query");
      if (!reqQueryParsed.ok) return { ok: false, error: reqQueryParsed.error };
      params.req_query = reqQueryParsed.value;

      const reqHeadersRaw = input.req_headers !== undefined ? input.req_headers : isUpdate ? (current as any)?.req_headers : [];
      const reqHeadersParsed = normalizeJsonArrayInput(reqHeadersRaw, "req_headers");
      if (!reqHeadersParsed.ok) return { ok: false, error: reqHeadersParsed.error };
      params.req_headers = reqHeadersParsed.value;

      params.req_body_type = input.req_body_type ?? (isUpdate ? (current as any)?.req_body_type : "");
      if (!isUpdate && !params.req_body_type) {
        params.req_body_type = "json";
      }

      const reqBodyFormRaw = input.req_body_form !== undefined ? input.req_body_form : isUpdate ? (current as any)?.req_body_form : [];
      const reqBodyFormParsed = normalizeJsonArrayInput(reqBodyFormRaw, "req_body_form");
      if (!reqBodyFormParsed.ok) return { ok: false, error: reqBodyFormParsed.error };
      params.req_body_form = reqBodyFormParsed.value;

      const reqBodyOtherRaw = input.req_body_other !== undefined ? input.req_body_other : isUpdate ? (current as any)?.req_body_other : "";
      const reqBodyOtherNormalized = normalizeStringOrJson(reqBodyOtherRaw, "req_body_other");
      if (!reqBodyOtherNormalized.ok) return { ok: false, error: reqBodyOtherNormalized.error };
      params.req_body_other = reqBodyOtherNormalized.value;

      params.req_body_is_json_schema =
        input.req_body_is_json_schema ?? (isUpdate ? (current as any)?.req_body_is_json_schema : undefined);

      params.res_body_type = input.res_body_type ?? (isUpdate ? (current as any)?.res_body_type : "json");

      const resBodyRaw = input.res_body !== undefined ? input.res_body : isUpdate ? (current as any)?.res_body : "";
      const resBodyNormalized = normalizeStringOrJson(resBodyRaw, "res_body");
      if (!resBodyNormalized.ok) return { ok: false, error: resBodyNormalized.error };
      params.res_body = resBodyNormalized.value;
      if (!isUpdate && !params.res_body) {
        params.res_body = "{\"type\":\"object\",\"title\":\"title\",\"properties\":{}}";
      }

      params.res_body_is_json_schema =
        input.res_body_is_json_schema ?? (isUpdate ? (current as any)?.res_body_is_json_schema : undefined);
      if (!isUpdate && params.res_body_is_json_schema === undefined) {
        params.res_body_is_json_schema = true;
      }

      params.switch_notice = input.switch_notice ?? (isUpdate ? (current as any)?.switch_notice : undefined);
      params.api_opened = input.api_opened ?? (isUpdate ? (current as any)?.api_opened : undefined);

      return { ok: true, params, isUpdate };
    };

    // 全局模式：登录并刷新本地登录态 Cookie
    this.server.tool(
      "yapi_update_token",
      "全局模式：使用用户名/密码登录 YApi，刷新本地登录态 Cookie（并可选刷新项目信息缓存）",
      {
        forceLogin: z.boolean().optional().describe("是否强制重新登录（忽略已缓存的 cookie）"),
      },
      async ({ forceLogin }) => {
        try {
          if (!this.authService) {
            return {
              content: [
                {
                  type: "text",
                  text:
                    "未启用全局模式：请在 MCP 配置中提供 --yapi-auth-mode=global 以及 --yapi-email/--yapi-password（或对应环境变量），然后再调用 yapi_update_token。",
                },
              ],
            };
          }

          const cookieHeader = await this.authService.getCookieHeaderWithLogin({ forceLogin });
          this.yapiService.setCookieHeader(cookieHeader);

          // 刷新项目信息/分类缓存（可选，但有助于 list/search）
          const { groups, projects } = await this.authService.listAccessibleProjects({ forceLogin });

          // 用 project/list 的结果快速填充项目缓存，避免强依赖“项目 token”
          projects.forEach((p: any) => {
            const projectId = String(p?._id ?? p?.id ?? "");
            if (!projectId) return;
            const groupIdRaw = p?.group_id ?? p?.groupId ?? 0;
            const uidRaw = p?.uid ?? 0;
            const groupId = Number(groupIdRaw);
            const uid = Number(uidRaw);
            const info = {
              _id: projectId,
              name: p?.name || p?.project_name || p?.title || "",
              desc: p?.desc || "",
              group_id: Number.isFinite(groupId) ? groupId : 0,
              uid: Number.isFinite(uid) ? uid : 0,
              basepath: p?.basepath || "",
            } as any;
            this.yapiService.getProjectInfoCache().set(projectId, info);
          });

          // 如项目缓存为空（或希望补全字段），可以再走 project/get 逐个拉取
          await this.yapiService.loadAllProjectInfo();
          this.projectInfoCache.saveToCache(this.yapiService.getProjectInfoCache());
          await this.yapiService.loadAllCategoryLists();

          return {
            content: [
              {
                type: "text",
                text: `登录态刷新完成：分组 ${groups.length} 个，项目 ${projects.length} 个；已更新 Cookie，并刷新项目信息/分类缓存。`,
              },
            ],
          };
        } catch (error) {
          this.logger.error("刷新登录态失败:", error);
          return { content: [{ type: "text", text: `刷新登录态失败: ${error}` }] };
        }
      },
    );

    // 获取API接口详情
    this.server.tool(
      "yapi_get_api_desc",
      "获取YApi中特定接口的详细信息",
      {
        projectId: z.string().describe("YApi项目ID；如连接/project/28/interface/api/66，则ID为28"),
        apiId: z.string().describe("YApi接口的ID；如连接/project/1/interface/api/66，则ID为66")
      },
      async ({ projectId, apiId }) => {
        try {
          this.logger.info(`获取API接口: ${apiId}, 项目ID: ${projectId}`);
          const apiInterface = await this.yapiService.getApiInterface(projectId, apiId);
          this.logger.info(`成功获取API接口: ${apiInterface.title || apiId}`);

          const webUrl = this.yapiService.buildInterfaceWebUrl(projectId, apiId);

          // 格式化返回数据，使其更易于阅读
          const formattedResponse = {
            基本信息: {
              接口ID: apiInterface._id,
              接口名称: apiInterface.title,
              接口路径: apiInterface.path,
              请求方式: apiInterface.method,
              接口描述: apiInterface.desc,
              接口页面: webUrl
            },
            请求参数: {
              URL参数: apiInterface.req_params,
              查询参数: apiInterface.req_query,
              请求头: apiInterface.req_headers,
              请求体类型: apiInterface.req_body_type,
              表单参数: apiInterface.req_body_form,
              Json参数: apiInterface.req_body_other
            },
            响应信息: {
              响应类型: apiInterface.res_body_type,
              响应内容: apiInterface.res_body
            },
            其他信息: {
              接口文档: apiInterface.markdown
            },
            编辑建议: {
              优先更新字段: "req_params / req_query / req_headers / req_body_* / res_body（把枚举值、中文备注、示例尽量放在这些结构字段里）",
              避免滥用字段: "desc 只写简要概述；长文档写 markdown；不要用 desc 替代结构化字段",
              对应开放API工具: "需要原始字段或精确对应开放 API 时，用 yapi_interface_* / yapi_open_import_data / yapi_project_get"
            }
          };

          return {
            content: [{ type: "text", text: JSON.stringify(formattedResponse, null, 2) }],
          };
        } catch (error) {
          this.logger.error(`获取API接口 ${apiId} 时出错:`, error);
          return {
            content: [{ type: "text", text: `获取API接口出错: ${error}` }],
          };
        }
      }
    );

    // 获取项目详情（/api/project/get）
    this.server.tool(
      "yapi_project_get",
      "获取 YApi 项目详情（对应 /api/project/get）",
      {
        projectId: z.string().describe("YApi项目ID"),
      },
      async ({ projectId }) => {
        try {
          const projectInfo = await this.yapiService.getProjectInfo(projectId);
          return { content: [{ type: "text", text: JSON.stringify(projectInfo, null, 2) }] };
        } catch (error) {
          this.logger.error(`获取项目详情失败:`, error);
          return { content: [{ type: "text", text: `获取项目详情失败: ${error}` }] };
        }
      },
    );

    // 搜索项目（/api/project/search）
    this.server.tool(
      "yapi_project_search",
      "搜索项目（对应 /api/project/search）",
      {
        q: z.string().describe("搜索关键字"),
      },
      async ({ q }) => {
        try {
          const data = await this.yapiService.globalSearch(q);
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        } catch (error) {
          this.logger.error(`搜索项目失败:`, error);
          return { content: [{ type: "text", text: `搜索项目失败: ${error}` }] };
        }
      },
    );

    // 获取接口数据（/api/interface/get）
    if (isFull) {
      this.server.tool(
        "yapi_interface_get",
        "获取接口数据（对应 /api/interface/get，返回原始字段）",
        {
          projectId: z.string().describe("YApi项目ID（用于选择 token）"),
          apiId: z.string().describe("接口ID"),
        },
        async ({ projectId, apiId }) => {
          try {
            const apiInterface = await this.yapiService.getApiInterface(projectId, apiId);
            return { content: [{ type: "text", text: JSON.stringify(apiInterface, null, 2) }] };
          } catch (error) {
            this.logger.error(`获取接口数据失败:`, error);
            return { content: [{ type: "text", text: `获取接口数据失败: ${error}` }] };
          }
        },
      );
    }

    // 保存API接口
    this.server.tool(
      "yapi_save_api",
      "新增或更新YApi中的接口信息",
      {
        projectId: z.string().describe("YApi项目ID"),
        catid: z.string().optional().describe("接口分类ID；新增接口时必填，更新时可省略（会保留原值）"),
        id: z.string().optional().describe("接口ID，更新时必填，新增时不需要"),
        title: z.string().optional().describe("接口标题；新增接口时必填，更新时可省略（会保留原值）"),
        path: z.string().optional().describe("接口路径，如：/api/user；新增接口时必填，更新时可省略（会保留原值）"),
        method: z.string().optional().describe("请求方法，如：GET, POST, PUT, DELETE等；新增接口时必填，更新时可省略（会保留原值）"),
        status: z.string().optional().describe("接口状态，done代表完成，undone代表未完成；更新时可省略（不覆盖原值）"),
        tag: z.union([z.string(), z.array(z.string())]).optional().describe("接口标签列表；支持 JSON 数组字符串或字符串数组；更新时可省略（不覆盖原值）"),
        req_params: z
          .union([z.string(), z.array(yapiParamItemSchema)])
          .optional()
          .describe("路径参数；强烈建议填写（枚举值/中文备注放这里）；支持 JSON 数组字符串或数组"),
        req_query: z
          .union([z.string(), z.array(yapiParamItemSchema)])
          .optional()
          .describe("查询参数；支持 JSON 数组字符串或数组"),
        req_headers: z
          .union([z.string(), z.array(yapiHeaderItemSchema)])
          .optional()
          .describe("请求头参数；支持 JSON 数组字符串或数组"),
        req_body_type: z.string().optional().describe("请求体类型（常见：raw/form/json/file；新增建议填 json，避免空值导致创建失败）"),
        req_body_form: z
          .union([z.string(), z.array(yapiParamItemSchema)])
          .optional()
          .describe("表单请求体；支持 JSON 数组字符串或数组"),
        req_body_other: z.union([z.string(), z.record(z.any()), z.array(z.any())]).optional().describe("其他请求体（通常是 JSON / JSON Schema）；支持字符串或对象/数组"),
        req_body_is_json_schema: z.boolean().optional().describe("是否开启JSON Schema，默认false"),
        res_body_type: z.string().optional().describe("返回数据类型（常见：json/raw）"),
        res_body: z.union([z.string(), z.record(z.any()), z.array(z.any())]).optional().describe("返回数据；新增时不要留空，建议提供 JSON Schema（枚举值/中文备注放这里）；支持字符串或对象/数组（会自动序列化）"),
        res_body_is_json_schema: z.boolean().optional().describe("返回数据是否为JSON Schema（新增默认 true）"),
        switch_notice: z.boolean().optional().describe("开启接口运行通知，默认true"),
        api_opened: z.boolean().optional().describe("开启API文档页面，默认true"),
        message: z.string().optional().describe("接口备注信息（对应 openapi 示例中的 message 字段）"),
        desc: z.string().optional().describe("接口简要描述（不要把请求/响应结构都塞进 desc；结构请写到 req_* / res_body）"),
        markdown: z.string().optional().describe("markdown格式的接口描述（补充说明/示例；结构仍建议写到 req_* / res_body）")
      },
      async ({
        projectId,
        catid,
        id,
        title,
        path,
        method,
        status,
        tag,
        req_params,
        req_query,
        req_headers,
        req_body_type,
        req_body_form,
        req_body_other,
        req_body_is_json_schema,
        res_body_type,
        res_body,
        res_body_is_json_schema,
        switch_notice,
        api_opened,
        message,
        desc,
        markdown
      }) => {
        try {
          const built = await buildInterfaceSaveParams({
            projectId,
            catid,
            id,
            title,
            path,
            method,
            status,
            tag,
            req_params,
            req_query,
            req_headers,
            req_body_type,
            req_body_form,
            req_body_other,
            req_body_is_json_schema,
            res_body_type,
            res_body,
            res_body_is_json_schema,
            switch_notice,
            api_opened,
            desc,
            markdown,
            message,
          });

          if (!built.ok) {
            return { content: [{ type: "text", text: built.error }] };
          }

          // 调用API保存接口
          const response = await this.yapiService.saveInterface(built.params);

          // 返回保存结果
          const resultApiId = response.data._id;
          return {
            content: [{ 
              type: "text", 
              text: `接口${id ? '更新' : '新增'}成功！\n接口ID: ${resultApiId}\n接口名称: ${built.params.title}\n请求方法: ${built.params.method}\n接口路径: ${built.params.path}` 
            }],
          };
        } catch (error) {
          this.logger.error(`保存API接口时出错:`, error);
          return {
            content: [{ type: "text", text: `保存API接口出错: ${error}` }],
          };
        }
      }
    );

    // 新增接口分类（/api/interface/add_cat）
    this.server.tool(
      "yapi_interface_add_cat",
      "新增接口分类（对应 /api/interface/add_cat）",
      {
        projectId: z.string().describe("YApi项目ID"),
        name: z.string().describe("分类名称"),
        desc: z.string().optional().describe("分类描述"),
      },
      async ({ projectId, name, desc }) => {
        try {
          const data = await this.yapiService.addCategory(projectId, name, desc || "");
          return { content: [{ type: "text", text: `新增分类成功：\n${JSON.stringify(data, null, 2)}` }] };
        } catch (error) {
          this.logger.error(`新增接口分类失败:`, error);
          return { content: [{ type: "text", text: `新增接口分类失败: ${error}` }] };
        }
      },
    );

    if (isFull) {
    // 获取菜单列表（/api/interface/getCatMenu）
    this.server.tool(
      "yapi_interface_get_cat_menu",
      "获取菜单列表（对应 /api/interface/getCatMenu）",
      {
        projectId: z.string().describe("YApi项目ID"),
      },
      async ({ projectId }) => {
        try {
          const list = await this.yapiService.getCategoryList(projectId);
          return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
        } catch (error) {
          this.logger.error(`获取菜单列表失败:`, error);
          return { content: [{ type: "text", text: `获取菜单列表失败: ${error}` }] };
        }
      },
    );

    // 获取接口列表数据（/api/interface/list）
    this.server.tool(
      "yapi_interface_list",
      "获取接口列表数据（对应 /api/interface/list）",
      {
        projectId: z.string().describe("YApi项目ID"),
        page: z.number().optional().describe("页码，默认 1"),
        limit: z.number().optional().describe("每页数量，默认 10"),
      },
      async ({ projectId, page, limit }) => {
        try {
          const data = await this.yapiService.listInterfaces(projectId, page ?? 1, limit ?? 10);
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        } catch (error) {
          this.logger.error(`获取接口列表失败:`, error);
          return { content: [{ type: "text", text: `获取接口列表失败: ${error}` }] };
        }
      },
    );

    // 获取某个分类下接口列表（/api/interface/list_cat）
    this.server.tool(
      "yapi_interface_list_cat",
      "获取某个分类下接口列表（对应 /api/interface/list_cat）",
      {
        projectId: z.string().describe("YApi项目ID"),
        catId: z.string().describe("分类ID"),
        page: z.number().optional().describe("页码，默认 1"),
        limit: z.number().optional().describe("每页数量，默认 10"),
      },
      async ({ projectId, catId, page, limit }) => {
        try {
          const response = await this.yapiService.listCategoryInterfaces(projectId, catId, page ?? 1, limit ?? 10);
          return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
        } catch (error) {
          this.logger.error(`获取分类接口列表失败:`, error);
          return { content: [{ type: "text", text: `获取分类接口列表失败: ${error}` }] };
        }
      },
    );

    // 获取接口菜单列表（/api/interface/list_menu）
    this.server.tool(
      "yapi_interface_list_menu",
      "获取接口菜单列表（对应 /api/interface/list_menu）",
      {
        projectId: z.string().describe("YApi项目ID"),
      },
      async ({ projectId }) => {
        try {
          const data = await this.yapiService.getInterfaceMenu(projectId);
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        } catch (error) {
          this.logger.error(`获取接口菜单列表失败:`, error);
          return { content: [{ type: "text", text: `获取接口菜单列表失败: ${error}` }] };
        }
      },
    );

    // 新增接口（/api/interface/add）
    this.server.tool(
      "yapi_interface_add",
      "新增接口（对应 /api/interface/add）",
      {
        projectId: z.string().describe("YApi项目ID"),
        catid: z.string().describe("接口分类ID"),
        title: z.string().describe("接口标题"),
        path: z.string().describe("接口路径"),
        method: z.string().describe("请求方法"),
        status: z.string().optional().describe("接口状态，默认 undone"),
        tag: z.union([z.string(), z.array(z.string())]).optional().describe("标签"),
        req_params: z.union([z.string(), z.array(yapiParamItemSchema)]).optional().describe("路径参数"),
        req_query: z.union([z.string(), z.array(yapiParamItemSchema)]).optional().describe("查询参数"),
        req_headers: z.union([z.string(), z.array(yapiHeaderItemSchema)]).optional().describe("请求头"),
        req_body_type: z.string().optional().describe("请求体类型（新增建议填 json，避免空值导致创建失败）"),
        req_body_form: z.union([z.string(), z.array(yapiParamItemSchema)]).optional().describe("表单请求体"),
        req_body_other: z.union([z.string(), z.record(z.any()), z.array(z.any())]).optional().describe("其他请求体"),
        req_body_is_json_schema: z.boolean().optional().describe("请求体是否 JSON Schema"),
        res_body_type: z.string().optional().describe("响应类型，默认 json"),
        res_body: z.union([z.string(), z.record(z.any()), z.array(z.any())]).optional().describe("响应内容（新增时不要留空，建议提供 JSON Schema）"),
        res_body_is_json_schema: z.boolean().optional().describe("响应是否 JSON Schema（新增默认 true）"),
        switch_notice: z.boolean().optional().describe("是否通知"),
        api_opened: z.boolean().optional().describe("是否公开"),
        message: z.string().optional().describe("接口备注信息"),
        desc: z.string().optional().describe("接口描述"),
        markdown: z.string().optional().describe("markdown 描述"),
      },
      async (input) => {
        try {
          const built = await buildInterfaceSaveParams({ ...input, id: undefined });
          if (!built.ok) return { content: [{ type: "text", text: built.error }] };
          const response = await this.yapiService.addInterface(built.params);
          return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
        } catch (error) {
          this.logger.error(`新增接口失败:`, error);
          return { content: [{ type: "text", text: `新增接口失败: ${error}` }] };
        }
      },
    );

    // 更新接口（/api/interface/up）
    this.server.tool(
      "yapi_interface_up",
      "更新接口（对应 /api/interface/up）",
      {
        projectId: z.string().describe("YApi项目ID"),
        id: z.string().describe("接口ID"),
        catid: z.string().optional().describe("分类ID（可省略，会保留原值）"),
        title: z.string().optional().describe("接口标题（可省略，会保留原值）"),
        path: z.string().optional().describe("接口路径（可省略，会保留原值）"),
        method: z.string().optional().describe("请求方法（可省略，会保留原值）"),
        status: z.string().optional().describe("接口状态"),
        tag: z.union([z.string(), z.array(z.string())]).optional().describe("标签"),
        req_params: z.union([z.string(), z.array(yapiParamItemSchema)]).optional().describe("路径参数"),
        req_query: z.union([z.string(), z.array(yapiParamItemSchema)]).optional().describe("查询参数"),
        req_headers: z.union([z.string(), z.array(yapiHeaderItemSchema)]).optional().describe("请求头"),
        req_body_type: z.string().optional().describe("请求体类型（新增建议填 json，避免空值导致创建失败）"),
        req_body_form: z.union([z.string(), z.array(yapiParamItemSchema)]).optional().describe("表单请求体"),
        req_body_other: z.union([z.string(), z.record(z.any()), z.array(z.any())]).optional().describe("其他请求体"),
        req_body_is_json_schema: z.boolean().optional().describe("请求体是否 JSON Schema"),
        res_body_type: z.string().optional().describe("响应类型"),
        res_body: z.union([z.string(), z.record(z.any()), z.array(z.any())]).optional().describe("响应内容（新增时不要留空，建议提供 JSON Schema）"),
        res_body_is_json_schema: z.boolean().optional().describe("响应是否 JSON Schema（新增默认 true）"),
        switch_notice: z.boolean().optional().describe("是否通知"),
        api_opened: z.boolean().optional().describe("是否公开"),
        message: z.string().optional().describe("接口备注信息"),
        desc: z.string().optional().describe("接口描述"),
        markdown: z.string().optional().describe("markdown 描述"),
      },
      async (input) => {
        try {
          const built = await buildInterfaceSaveParams(input);
          if (!built.ok) return { content: [{ type: "text", text: built.error }] };
          const response = await this.yapiService.updateInterface(built.params);
          return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
        } catch (error) {
          this.logger.error(`更新接口失败:`, error);
          return { content: [{ type: "text", text: `更新接口失败: ${error}` }] };
        }
      },
    );

    // 新增或者更新接口（/api/interface/save）
    this.server.tool(
      "yapi_interface_save",
      "新增或者更新接口（对应 /api/interface/save）",
      {
        projectId: z.string().describe("YApi项目ID"),
        id: z.string().optional().describe("接口ID（有则更新，无则新增）"),
        catid: z.string().optional().describe("接口分类ID"),
        title: z.string().optional().describe("接口标题"),
        path: z.string().optional().describe("接口路径"),
        method: z.string().optional().describe("请求方法"),
        status: z.string().optional().describe("接口状态"),
        tag: z.union([z.string(), z.array(z.string())]).optional().describe("标签"),
        req_params: z.union([z.string(), z.array(yapiParamItemSchema)]).optional().describe("路径参数"),
        req_query: z.union([z.string(), z.array(yapiParamItemSchema)]).optional().describe("查询参数"),
        req_headers: z.union([z.string(), z.array(yapiHeaderItemSchema)]).optional().describe("请求头"),
        req_body_type: z.string().optional().describe("请求体类型"),
        req_body_form: z.union([z.string(), z.array(yapiParamItemSchema)]).optional().describe("表单请求体"),
        req_body_other: z.union([z.string(), z.record(z.any()), z.array(z.any())]).optional().describe("其他请求体"),
        req_body_is_json_schema: z.boolean().optional().describe("请求体是否 JSON Schema"),
        res_body_type: z.string().optional().describe("响应类型"),
        res_body: z.union([z.string(), z.record(z.any()), z.array(z.any())]).optional().describe("响应内容"),
        res_body_is_json_schema: z.boolean().optional().describe("响应是否 JSON Schema"),
        switch_notice: z.boolean().optional().describe("是否通知"),
        api_opened: z.boolean().optional().describe("是否公开"),
        message: z.string().optional().describe("接口备注信息"),
        desc: z.string().optional().describe("接口描述"),
        markdown: z.string().optional().describe("markdown 描述"),
      },
      async (input) => {
        try {
          const built = await buildInterfaceSaveParams(input);
          if (!built.ok) return { content: [{ type: "text", text: built.error }] };
          const response = await this.yapiService.saveInterfaceUnified(built.params);
          return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
        } catch (error) {
          this.logger.error(`保存接口失败:`, error);
          return { content: [{ type: "text", text: `保存接口失败: ${error}` }] };
        }
      },
    );

    // 服务端数据导入（/api/open/import_data）
    this.server.tool(
      "yapi_open_import_data",
      "服务端数据导入（对应 /api/open/import_data）",
      {
        projectId: z.string().describe("YApi项目ID（用于选择 token）"),
        type: z.string().describe("导入方式，如 swagger"),
        merge: z.enum(["normal", "good", "merge"]).describe("同步模式：normal/good/merge"),
        json: z.union([z.string(), z.record(z.any()), z.array(z.any())]).optional().describe("导入数据 JSON（会自动序列化为字符串）"),
        url: z.string().optional().describe("导入数据 URL（提供后会走 url 方式）"),
      },
      async ({ projectId, type, merge, json, url }) => {
        try {
          let jsonString: string | undefined;
          if (json !== undefined) {
            const normalized = normalizeStringOrJson(json, "json");
            if (!normalized.ok) return { content: [{ type: "text", text: normalized.error }] };
            jsonString = normalized.value;
          }
          const data = await this.yapiService.importData(projectId, { type, merge, json: jsonString, url });
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        } catch (error) {
          this.logger.error(`导入数据失败:`, error);
          return { content: [{ type: "text", text: `导入数据失败: ${error}` }] };
        }
      },
    );
    }

    // 搜索API接口
    this.server.tool(
      "yapi_search_apis",
      "搜索YApi中的接口",
      {
        projectKeyword: z.string().optional().describe("项目关键字，用于过滤项目"),
        nameKeyword: z.string().optional().describe("接口名称关键字"),
        pathKeyword: z.string().optional().describe("接口路径关键字"),
        tagKeyword: z.string().optional().describe("接口标签关键字"),
        limit: z.number().optional().describe("返回结果数量限制，默认20")
      },
      async ({ projectKeyword, nameKeyword, pathKeyword, tagKeyword, limit }) => {
        try {
          const searchOptions = {
            projectKeyword,
            nameKeyword: nameKeyword ? nameKeyword.split(/[\s,]+/) : undefined,
            pathKeyword: pathKeyword ? pathKeyword.split(/[\s,]+/) : undefined,
            tagKeyword: tagKeyword ? tagKeyword.split(/[\s,]+/) : undefined,
            limit: limit || 20
          };

          this.logger.info(`搜索API接口: ${JSON.stringify(searchOptions)}`);
          const searchResults = await this.yapiService.searchApis(searchOptions);

          // 按项目分组整理结果
          const apisByProject: Record<string, {
            projectId: string,
            projectName: string,
            apis: Array<{
              id: string,
              title: string,
              path: string,
              method: string,
              catName: string,
              createTime: string,
              updateTime: string,
              webUrl: string
            }>
          }> = {};

          // 格式化搜索结果
          searchResults.list.forEach(api => {
            const projectId = String(api.project_id);
            const projectName = api.project_name || `未知项目(${projectId})`;

            if (!apisByProject[projectId]) {
              apisByProject[projectId] = {
                projectId,
                projectName,
                apis: []
              };
            }

            apisByProject[projectId].apis.push({
              id: api._id,
              title: api.title,
              path: api.path,
              method: api.method,
              catName: api.cat_name || '未知分类',
              createTime: new Date(api.add_time).toLocaleString(),
              updateTime: new Date(api.up_time).toLocaleString(),
              webUrl: this.yapiService.buildInterfaceWebUrl(projectId, api._id)
            });
          });

          // 构建响应内容
          let responseContent = `共找到 ${searchResults.total} 个符合条件的接口（已限制显示 ${searchResults.list.length} 个）\n\n`;

          // 添加搜索条件说明
          responseContent += "搜索条件:\n";
          if (projectKeyword) responseContent += `- 项目关键字: ${projectKeyword}\n`;
          if (nameKeyword) responseContent += `- 接口名称关键字: ${nameKeyword}\n`;
          if (pathKeyword) responseContent += `- API路径关键字: ${pathKeyword}\n`;
          if (tagKeyword) responseContent += `- 标签关键字: ${tagKeyword}\n\n`;

          // 按项目分组展示结果
          Object.values(apisByProject).forEach(projectGroup => {
            responseContent += `## 项目: ${projectGroup.projectName} (${projectGroup.apis.length}个接口)\n\n`;

            if (projectGroup.apis.length <= 10) {
              // 少量接口，展示详细信息
              projectGroup.apis.forEach(api => {
                responseContent += `### ${api.title} (${api.method} ${api.path})\n\n`;
                responseContent += `- 接口ID: ${api.id}\n`;
                responseContent += `- 所属分类: ${api.catName}\n`;
                responseContent += `- 接口页面: ${api.webUrl}\n`;
                responseContent += `- 更新时间: ${api.updateTime}\n\n`;
              });
            } else {
              // 大量接口，展示简洁表格
              responseContent += "| 接口ID | 接口名称 | 请求方式 | 接口路径 | 所属分类 | YApi 页面 |\n";
              responseContent += "| ------ | -------- | -------- | -------- | -------- | -------- |\n";

              projectGroup.apis.forEach(api => {
                responseContent += `| ${api.id} | ${api.title} | ${api.method} | ${api.path} | ${api.catName} | ${api.webUrl} |\n`;
              });

              responseContent += "\n";
            }
          });

          // 添加使用提示
          responseContent += "\n提示: 可以使用 `yapi_get_api_desc` 工具获取接口的详细信息，例如: `yapi_get_api_desc projectId=232 apiId=12961`";

          return {
            content: [{ type: "text", text: responseContent }],
          };
        } catch (error) {
          this.logger.error(`搜索接口时出错:`, error);
          let errorMsg = "搜索接口时发生错误";

          if (error instanceof Error) {
            errorMsg += `: ${error.message}`;
          } else if (typeof error === 'object' && error !== null) {
            errorMsg += `: ${JSON.stringify(error)}`;
          }

          return {
            content: [{ type: "text", text: errorMsg }],
          };
        }
      }
    );

    // 列出项目
    this.server.tool(
      "yapi_list_projects",
      "列出YApi的项目ID(projectId)和项目名称",
      {},
      async () => {
        try {
          if (this.authService) {
            const { projects } = await this.authService.listAccessibleProjects();
            if (!projects.length) {
              return {
                content: [{ type: "text", text: "没有找到任何项目信息，请确认已登录且账号有权限访问项目" }],
              };
            }

            const projectsList = projects.map(p => {
              const id = String(p?._id ?? p?.id ?? "");
              return {
                项目ID: id,
                项目名称: p?.name || p?.project_name || p?.title || "",
                项目描述: p?.desc || "无描述",
                基础路径: p?.basepath || "/",
                项目分组ID: p?.group_id ?? p?.groupId ?? "",
                鉴权方式: "Cookie（全局模式）",
              };
            });

            return {
              content: [
                {
                  type: "text",
                  text: `已发现 ${projectsList.length} 个可访问项目（全局模式）:\n\n${JSON.stringify(projectsList, null, 2)}`,
                },
              ],
            };
          }

          // 获取项目信息缓存
          const projectInfoCache = this.yapiService.getProjectInfoCache();

          if (projectInfoCache.size === 0) {
            return {
              content: [{ type: "text", text: "没有找到任何项目信息，请检查配置的token是否正确" }],
            };
          }

          // 构建项目信息列表
          const projectsList = Array.from(projectInfoCache.entries()).map(([id, info]) => ({
            项目ID: id,
            项目名称: info.name,
            项目描述: info.desc || '无描述',
            基础路径: info.basepath || '/',
            项目分组ID: info.group_id
          }));

          return {
            content: [{
              type: "text",
              text: `已配置 ${projectInfoCache.size} 个YApi项目:\n\n${JSON.stringify(projectsList, null, 2)}`
            }],
          };
        } catch (error) {
          this.logger.error(`获取项目信息列表时出错:`, error);
          return {
            content: [{ type: "text", text: `获取项目信息列表出错: ${error}` }],
          };
        }
      }
    );

    // 获取分类
    this.server.tool(
      "yapi_get_categories",
      "获取YApi项目下的接口分类列表，以及每个分类下的接口信息",
      {
        projectId: z.string().describe("YApi项目ID"),
        includeApis: z.boolean().optional().describe("是否包含分类下接口列表，默认 true"),
        limitPerCategory: z.number().optional().describe("每个分类最多返回多少接口（默认 100）")
      },
      async ({ projectId, includeApis, limitPerCategory }) => {
        try {
          const shouldIncludeApis = includeApis ?? true;
          const perCatLimit = limitPerCategory ?? 100;

          // 获取项目信息（必要时从 API 拉取）
          const projectInfo = await this.yapiService.getProjectInfo(projectId);

          // 获取项目下的分类列表（必要时从 API 拉取）
          const categoryList = await this.yapiService.getCategoryList(projectId);

          if (!categoryList || categoryList.length === 0) {
            return {
              content: [{ type: "text", text: `项目 "${projectInfo.name}" (ID: ${projectId}) 下没有找到任何接口分类` }],
            };
          }

          if (!shouldIncludeApis) {
            const simplified = categoryList.map(cat => ({
              分类ID: cat._id,
              分类名称: cat.name,
              分类描述: cat.desc || "无描述",
              创建时间: new Date(cat.add_time).toLocaleString(),
              更新时间: new Date(cat.up_time).toLocaleString(),
            }));
            return {
              content: [
                {
                  type: "text",
                  text: `项目 "${projectInfo.name}" (ID: ${projectId}) 下共有 ${categoryList.length} 个接口分类:\n\n${JSON.stringify(
                    simplified,
                    null,
                    2,
                  )}`,
                },
              ],
            };
          }

          // 构建包含接口列表的分类信息
          const categoriesWithApisPromises = categoryList.map(async (cat) => {
            // 获取分类下的接口列表
            try {
              const apisResponse = await this.yapiService.listCategoryInterfaces(projectId, cat._id, 1, perCatLimit);
              const apis = apisResponse.data.list;

              // 将接口信息简化为所需字段
              const simplifiedApis = apis?.map(api => ({
                接口ID: api._id,
                接口名称: api.title,
                接口路径: api.path,
                请求方法: api.method
              })) || [];

              return {
                分类ID: cat._id,
                分类名称: cat.name,
                分类描述: cat.desc || '无描述',
                创建时间: new Date(cat.add_time).toLocaleString(),
                更新时间: new Date(cat.up_time).toLocaleString(),
                接口列表: simplifiedApis
              };
            } catch (error) {
              this.logger.error(`获取分类 ${cat._id} 下的接口列表失败:`, error);
              // 发生错误时仍然返回分类信息，但不包含接口列表
              return {
                分类ID: cat._id,
                分类名称: cat.name,
                分类描述: cat.desc || '无描述',
                创建时间: new Date(cat.add_time).toLocaleString(),
                更新时间: new Date(cat.up_time).toLocaleString(),
                接口列表: [],
                错误: `获取接口列表失败: ${error}`
              };
            }
          });

          // 等待所有分类的接口列表加载完成
          const categoriesWithApis = await Promise.all(categoriesWithApisPromises);

          return {
            content: [{
              type: "text",
              text: `项目 "${projectInfo.name}" (ID: ${projectId}) 下共有 ${categoryList.length} 个接口分类:\n\n${JSON.stringify(categoriesWithApis, null, 2)}`
            }],
          };
        } catch (error) {
          this.logger.error(`获取接口分类列表时出错:`, error);
          return {
            content: [{ type: "text", text: `获取接口分类列表出错: ${error}` }],
          };
        }
      }
    );
  }

  async connect(transport: Transport): Promise<void> {
    this.logger.info("连接到传输层...");
    await this.server.connect(transport);
    this.logger.info("服务器已连接，准备处理请求");
  }

  async startHttpServer(port: number): Promise<void> {
    const app = express();

    app.get("/sse", async (req: Request, res: Response) => {
      this.logger.info("建立新的SSE连接");
      this.sseTransport = new SSEServerTransport(
        "/messages",
        res as unknown as ServerResponse<IncomingMessage>,
      );
      await this.server.connect(this.sseTransport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      if (!this.sseTransport) {
        // Express types 可能与实际使用不匹配，直接使用
        // @ts-ignore
        res.sendStatus(400);
        return;
      }
      await this.sseTransport.handlePostMessage(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse<IncomingMessage>,
      );
    });

    app.listen(port, () => {
      this.logger.info(`HTTP服务器监听端口 ${port}`);
      this.logger.info(`SSE端点: http://localhost:${port}/sse`);
      this.logger.info(`消息端点: http://localhost:${port}/messages`);
    });
  }
}
