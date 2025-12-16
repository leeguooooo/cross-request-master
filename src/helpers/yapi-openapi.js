/**
 * YApi OpenAPI Helper
 *
 * 在浏览器端基于 YApi OpenAPI 提供一组与 Yapi-MCP tool 同名的方法，
 * 方便用户在安装本扩展后直接通过 window.crossRequest 调用/管理 YApi 接口文档。
 *
 * 文档参考：
 * - https://hellosean1025.github.io/yapi/openapi.html
 * - https://github.com/lzsheng/Yapi-MCP
 */

(function (window) {
  'use strict';

  function normalizeBaseUrl(baseUrl, fallbackOrigin) {
    const trimmed = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    const candidate = trimmed || (typeof fallbackOrigin === 'string' ? fallbackOrigin : '');
    if (!candidate) return '';
    return candidate.endsWith('/') ? candidate.slice(0, -1) : candidate;
  }

  function joinUrl(baseUrl, endpointPath) {
    const base = normalizeBaseUrl(baseUrl);
    if (!base) return '';
    const path = typeof endpointPath === 'string' ? endpointPath.trim() : '';
    if (!path) return base;
    if (path.startsWith('/')) return base + path;
    return base + '/' + path;
  }

  function splitKeywords(input) {
    if (typeof input !== 'string') return [];
    return input
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * 解析 token 配置字符串
   * - 多项目：projectId:token,projectId2:token2
   * - 默认：tokenOnly（没有冒号）
   */
  function parseYapiTokenConfig(tokenString) {
    const raw = typeof tokenString === 'string' ? tokenString.trim() : '';
    const tokenMap = new Map();
    let defaultToken = '';

    if (!raw) {
      return { raw: '', tokenMap, defaultToken };
    }

    raw.split(',').forEach((pair) => {
      const item = String(pair || '').trim();
      if (!item) return;

      const colonIndex = item.indexOf(':');
      if (colonIndex === -1) {
        // 没有冒号：作为默认 token（最后一个生效）
        defaultToken = item;
        return;
      }

      const projectId = item.slice(0, colonIndex).trim();
      const projectToken = item.slice(colonIndex + 1).trim();
      if (projectId && projectToken) {
        tokenMap.set(String(projectId), projectToken);
      }
    });

    return { raw, tokenMap, defaultToken };
  }

  function getTokenForProject(tokenConfig, projectId) {
    const pid = projectId != null ? String(projectId) : '';
    if (tokenConfig && tokenConfig.tokenMap && pid && tokenConfig.tokenMap.has(pid)) {
      return tokenConfig.tokenMap.get(pid);
    }
    return tokenConfig ? tokenConfig.defaultToken : '';
  }

  function isYapiEnvelope(payload) {
    return payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'errcode');
  }

  function unwrapYapiEnvelope(payload) {
    if (!isYapiEnvelope(payload)) {
      return payload;
    }

    const errcode = payload.errcode;
    if (errcode === 0) {
      return payload.data;
    }

    const message = payload.errmsg || payload.message || 'YApi 调用失败';
    const error = new Error(message);
    error.errcode = errcode;
    error.yapi = payload;
    throw error;
  }

  function createYapiOpenApiClient(fetchFn, initialConfig) {
    if (typeof fetchFn !== 'function') {
      throw new Error('createYapiOpenApiClient 需要传入 fetchFn');
    }

    const initial = initialConfig && typeof initialConfig === 'object' ? initialConfig : {};
    const fallbackOrigin =
      typeof window !== 'undefined' && window.location && window.location.origin
        ? window.location.origin
        : '';

    let baseUrl = normalizeBaseUrl(initial.baseUrl, fallbackOrigin);
    let tokenConfig = parseYapiTokenConfig(initial.token);
    let timeout = typeof initial.timeout === 'number' ? initial.timeout : 30000;

    function configure(next) {
      const cfg = next && typeof next === 'object' ? next : {};
      if (cfg.baseUrl !== undefined) {
        baseUrl = normalizeBaseUrl(cfg.baseUrl, fallbackOrigin);
      }
      if (cfg.token !== undefined) {
        tokenConfig = parseYapiTokenConfig(cfg.token);
      }
      if (cfg.timeout !== undefined) {
        timeout = typeof cfg.timeout === 'number' ? cfg.timeout : timeout;
      }
      return getConfig();
    }

    function getConfig() {
      return {
        baseUrl,
        token: tokenConfig.raw,
        timeout
      };
    }

    function getConfiguredProjectIds() {
      return Array.from(tokenConfig.tokenMap.keys());
    }

    async function requestYapi(projectId, endpoint, params, method) {
      const url = joinUrl(baseUrl, endpoint);
      if (!url) {
        throw new Error('未配置 YApi baseUrl');
      }

      const token = getTokenForProject(tokenConfig, projectId);
      if (!token) {
        throw new Error(`未配置项目 ${projectId || ''} 的 token`);
      }

      const httpMethod = (method || 'GET').toUpperCase();
      const payloadParams = params && typeof params === 'object' ? params : {};

      const options = {
        url,
        method: httpMethod,
        timeout
      };

      if (httpMethod === 'GET' || httpMethod === 'HEAD') {
        options.data = { ...payloadParams, token };
      } else {
        options.body = { ...payloadParams, token };
        options.headers = { 'Content-Type': 'application/json' };
      }

      const resp = await fetchFn(options);
      const envelope = resp && Object.prototype.hasOwnProperty.call(resp, 'data') ? resp.data : resp;
      return unwrapYapiEnvelope(envelope);
    }

    async function yapi_get_api_desc({ projectId, apiId }) {
      return requestYapi(projectId, '/api/interface/get', { id: apiId }, 'GET');
    }

    async function yapi_save_api(payload) {
      const data = payload && typeof payload === 'object' ? { ...payload } : {};
      const projectId = data.projectId;
      delete data.projectId;

      const endpoint = data.id ? '/api/interface/up' : '/api/interface/add';
      return requestYapi(projectId, endpoint, data, 'POST');
    }

    async function yapi_list_projects() {
      const projectIds = getConfiguredProjectIds();
      if (!projectIds.length) {
        throw new Error('未配置 projectId:token，无法列出项目');
      }

      const results = await Promise.all(
        projectIds.map(async (id) => {
          const info = await requestYapi(id, '/api/project/get', { id }, 'GET');
          return { projectId: String(id), ...info };
        })
      );

      return results;
    }

    async function yapi_get_categories({ projectId, includeApis = true, limitPerCategory = 100 }) {
      const categories = await requestYapi(
        projectId,
        '/api/interface/getCatMenu',
        { project_id: projectId },
        'GET'
      );

      if (!includeApis) {
        return categories;
      }

      const cats = Array.isArray(categories) ? categories : [];
      const categoriesWithApis = await Promise.all(
        cats.map(async (cat) => {
          const catId = cat && (cat._id != null ? String(cat._id) : '');
          if (!catId) {
            return { ...cat, apis: [] };
          }

          const listResp = await requestYapi(
            projectId,
            '/api/interface/list_cat',
            { project_id: projectId, catid: catId, page: 1, limit: limitPerCategory },
            'GET'
          );

          const list = listResp && listResp.list ? listResp.list : Array.isArray(listResp) ? listResp : [];
          return { ...cat, apis: list };
        })
      );

      return categoriesWithApis;
    }

    async function yapi_search_apis({
      projectId,
      projectKeyword,
      nameKeyword,
      pathKeyword,
      tagKeyword,
      limit = 20,
      page = 1
    }) {
      const nameKeywords = splitKeywords(nameKeyword);
      const pathKeywords = splitKeywords(pathKeyword);
      const tagKeywords = splitKeywords(tagKeyword);

      const getTargetProjectIds = async () => {
        if (projectId) return [String(projectId)];

        const configuredIds = getConfiguredProjectIds();
        if (!configuredIds.length) {
          throw new Error('未配置 projectId:token，无法跨项目搜索');
        }

        if (!projectKeyword) return configuredIds;

        const projects = await yapi_list_projects();
        return projects
          .filter((p) => String(p.name || '').includes(projectKeyword))
          .map((p) => String(p.projectId || p._id || ''))
          .filter(Boolean);
      };

      const targetProjectIds = await getTargetProjectIds();

      const effectiveNameKeywords = nameKeywords.length ? nameKeywords : [''];
      const effectivePathKeywords = pathKeywords.length ? pathKeywords : [''];
      const effectiveTagKeywords = tagKeywords.length ? tagKeywords : [''];

      const results = [];

      for (const pid of targetProjectIds) {
        for (const nk of effectiveNameKeywords) {
          for (const pk of effectivePathKeywords) {
            for (const tk of effectiveTagKeywords) {
              const params = { project_id: pid, page, limit };
              if (nk) params.keyword = nk;
              if (pk) params.path = pk;
              if (tk) params['tag[]'] = [tk];

              const resp = await requestYapi(pid, '/api/interface/list', params, 'GET');
              const list = resp && resp.list ? resp.list : [];
              list.forEach((item) => results.push(item));
            }
          }
        }
      }

      // 去重并限制返回数量
      const seen = new Set();
      const deduped = [];
      results.forEach((item) => {
        const id = item && item._id != null ? String(item._id) : '';
        if (!id || seen.has(id)) return;
        seen.add(id);
        deduped.push(item);
      });

      return {
        total: deduped.length,
        list: deduped.slice(0, limit)
      };
    }

    return {
      configure,
      getConfig,
      yapi_get_api_desc,
      yapi_save_api,
      yapi_list_projects,
      yapi_get_categories,
      yapi_search_apis
    };
  }

  window.CrossRequestHelpers = window.CrossRequestHelpers || {};
  window.CrossRequestHelpers.createYapiOpenApiClient = createYapiOpenApiClient;
  window.CrossRequestHelpers.parseYapiTokenConfig = parseYapiTokenConfig;
  window.CrossRequestHelpers.joinUrl = joinUrl;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createYapiOpenApiClient,
      parseYapiTokenConfig,
      joinUrl
    };
  }
})(typeof window !== 'undefined' ? window : global);
