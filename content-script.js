'use strict';

// 检测是否为目标网站（YApi 或其他 API 管理平台）
function isTargetWebsite() {
  // 0. 最强特征：YApi 根节点（用户反馈：目标站一定存在）
  if (document.getElementById('yapi')) {
    return true;
  }

  // 1. 检测 YApi 明确特征
  const metaKeywords = document.querySelector('meta[name="keywords"]');
  const metaDescription = document.querySelector('meta[name="description"]');
  const title = document.title;

  // 优先检测 YApi 强特征
  if (metaKeywords) {
    const keywords = metaKeywords.getAttribute('content') || '';
    if (keywords.toLowerCase().includes('yapi')) {
      return true;
    }
  }

  if (metaDescription) {
    const description = metaDescription.getAttribute('content') || '';
    if (description.toLowerCase().includes('yapi')) {
      return true;
    }
  }

  if (title.toLowerCase().includes('yapi')) {
    return true;
  }

  // 2. 检测 API 管理平台特征（更严格的规则）
  if (metaKeywords) {
    const keywords = metaKeywords.getAttribute('content') || '';
    // 需要同时包含多个关键词才判定为目标网站
    if (
      (keywords.includes('api管理') || keywords.includes('接口管理')) &&
      (keywords.includes('测试') || keywords.includes('文档'))
    ) {
      return true;
    }
  }

  if (metaDescription) {
    const description = metaDescription.getAttribute('content') || '';
    if (description.includes('api管理平台') || description.includes('接口管理平台')) {
      return true;
    }
  }

  // 3. 检测 URL 特征（需要组合判断）
  const url = window.location.href;
  const hasApiPath = url.includes('/interface/') || url.includes('/project/');
  const hasApiDomain = url.includes('yapi') || url.includes('api-doc') || url.includes('apidoc');

  if (hasApiPath && hasApiDomain) {
    return true;
  }

  // 4. 检测特殊标记（给用户手动启用的选项）
  if (document.querySelector('meta[name="cross-request-enabled"]')) {
    return true;
  }

  return false;
}

console.log('[Content-Script] Content script 开始加载');

// 早期检测，如果不是目标网站，输出日志后静默退出
if (!isTargetWebsite()) {
  console.log('[Content-Script] 非目标网站，插件保持静默');
  // 不返回，但设置一个标记，让后续代码知道应该最小化运行
  window.__crossRequestSilentMode = true;
}

// 创建扩展命名空间
const CrossRequest = {
  // 配置
  config: {
    container: 'y-request',
    checkInterval: 100,
    maxRetries: 50
  },

  // 请求队列
  requestQueue: new Map(),

  // 初始化
  init() {
    const isSilent = window.__crossRequestSilentMode;

    if (isSilent) {
      console.log('[Content-Script] 静默模式：核心功能启用，UI 和日志关闭');
    } else {
      console.log('[Content-Script] 完整模式：所有功能启用');
    }

    // 静默模式下仍然需要 observeDOM 来处理手动调用
    this.observeDOM();
    this.injectScript();

    // 只有完整模式才启用 cURL 事件监听
    if (!isSilent) {
      this.initCurlEventListeners();
      this.initYapiAiAssist();
    }

    console.log('[Content-Script] 扩展初始化完成');
  },

  // YApi 接口页：AI 辅助（MCP 配置 + Markdown 复制）
  initYapiAiAssist() {
    const STYLE_ID = 'crm-yapi-ai-style';
    const MODAL_ID = 'crm-yapi-ai-modal';
    const BTN_GROUP_ID = 'crm-yapi-ai-btn-group';

    const tokenCache = new Map();
    let lastHref = location.href;

    const ensureStyle = () => {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        #${BTN_GROUP_ID} { display: inline-flex; gap: 8px; margin-left: auto; }
        #${BTN_GROUP_ID} .crm-btn { height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid #d0d7de; background: #fff; color: #24292f; font-size: 12px; cursor: pointer; }
        #${BTN_GROUP_ID} .crm-btn:hover { background: #f6f8fa; }
        #${BTN_GROUP_ID} .crm-btn.crm-primary { background: #1677ff; border-color: #1677ff; color: #fff; }
        #${BTN_GROUP_ID} .crm-btn.crm-primary:hover { background: #0958d9; border-color: #0958d9; }
        #${BTN_GROUP_ID} .crm-btn:disabled { opacity: .6; cursor: not-allowed; }

        #${MODAL_ID} { position: fixed; inset: 0; z-index: 2147483647; display: none; }
        #${MODAL_ID} .crm-mask { position: absolute; inset: 0; background: rgba(0,0,0,.35); }
        #${MODAL_ID} .crm-panel { position: absolute; top: 10vh; left: 50%; transform: translateX(-50%); width: min(980px, calc(100vw - 32px)); max-height: 80vh; background: #fff; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.2); overflow: hidden; display: flex; flex-direction: column; }
        #${MODAL_ID} .crm-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #eee; }
        #${MODAL_ID} .crm-title { font-size: 14px; font-weight: 600; color: #111; }
        #${MODAL_ID} .crm-close { border: none; background: transparent; cursor: pointer; font-size: 18px; line-height: 18px; padding: 4px 6px; color: #666; }
        #${MODAL_ID} .crm-body { padding: 14px; overflow: auto; }
        #${MODAL_ID} .crm-section { margin-bottom: 16px; }
        #${MODAL_ID} .crm-section h3 { font-size: 13px; margin: 0 0 8px; color: #111; }
        #${MODAL_ID} .crm-row { display: flex; gap: 10px; align-items: center; margin: 6px 0; flex-wrap: wrap; }
        #${MODAL_ID} .crm-hint { font-size: 12px; color: #666; }
        #${MODAL_ID} .crm-code { position: relative; }
        #${MODAL_ID} pre { margin: 0; padding: 10px 10px; background: #0b1020; color: #d6deeb; border-radius: 8px; overflow: auto; font-size: 12px; line-height: 1.5; }
        #${MODAL_ID} .crm-copy { position: absolute; top: 8px; right: 8px; height: 26px; padding: 0 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.08); color: #fff; cursor: pointer; font-size: 12px; }
        #${MODAL_ID} .crm-copy:hover { background: rgba(255,255,255,.14); }
      `;
      (document.head || document.documentElement).appendChild(style);
    };

    const parseYapiInterfaceRoute = () => {
      const href = location.href;
      const m = href.match(/(?:#\/|\/)project\/(\d+)\/interface\/api\/(\d+)/);
      if (!m) return null;
      return { projectId: m[1], apiId: m[2] };
    };

    const safeWriteClipboard = async (text) => {
      const content = String(text == null ? '' : text);
      if (!content) return false;

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(content);
          return true;
        }
      } catch (e) {
        // fallback
      }

      try {
        const ta = document.createElement('textarea');
        ta.value = content;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (e) {
        return false;
      }
    };

    const fetchJson = async (url) => {
      const resp = await fetch(url, { credentials: 'include' });
      const text = await resp.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        return null;
      }
    };

    const looksLikeToken = (val) => {
      if (typeof val !== 'string') return false;
      const s = val.trim();
      if (s.length < 24) return false;
      if (s.length > 128) return false;

      // YApi 项目 token 常见为 32 位 hex（优先）
      if (/^[a-f0-9]{32}$/i.test(s)) return true;
      if (/^[a-f0-9]{64}$/i.test(s)) return true;

      // 兜底：只接受较“像 token”的字符串（同时包含字母与数字）
      if (!/^[a-zA-Z0-9_-]+$/.test(s)) return false;
      if (!/[a-zA-Z]/.test(s) || !/[0-9]/.test(s)) return false;
      return true;
    };

    const looksLikeEmail = (val) => {
      if (typeof val !== 'string') return false;
      const s = val.trim();
      if (!s) return false;
      if (s.length > 128) return false;
      if (/[\s"'<>]/.test(s)) return false;
      return /^[^@]+@[^@]+\.[^@]+$/.test(s);
    };

    const findTokenInObject = (obj) => {
      if (!obj || typeof obj !== 'object') return '';
      const queue = [{ value: obj, depth: 0, key: '' }];
      const maxDepth = 6;
      let best = '';

      while (queue.length) {
        const { value, depth, key } = queue.shift();
        if (depth > maxDepth || !value) continue;

        if (typeof value === 'string') {
          const tokenKey = String(key || '');
          const isTokenField = /(^token$|token$|project.*token|token.*project)/i.test(tokenKey);
          if (looksLikeToken(value) && isTokenField) {
            if (value.length > best.length) best = value;
          }
          continue;
        }

        if (Array.isArray(value)) {
          value.forEach((v) => queue.push({ value: v, depth: depth + 1, key }));
          continue;
        }

        if (typeof value === 'object') {
          Object.keys(value).forEach((k) => {
            queue.push({ value: value[k], depth: depth + 1, key: k });
          });
        }
      }

      return best;
    };

    const resolveProjectName = async (origin, projectId) => {
      const pid = String(projectId || '');
      if (!pid) return '';

      const ssKey = `__crm_yapi_project_name_${pid}`;
      try {
        const cached = sessionStorage.getItem(ssKey);
        if (cached) return cached;
      } catch (e) {
        // ignore
      }

      try {
        const projectGetUrl = `${origin}/api/project/get?id=${encodeURIComponent(pid)}`;
        const projectResp = await fetchJson(projectGetUrl);
        const name =
          projectResp && projectResp.errcode === 0 && projectResp.data && projectResp.data.name
            ? String(projectResp.data.name)
            : '';

        if (name) {
          try {
            sessionStorage.setItem(ssKey, name);
          } catch (e) {
            // ignore
          }
        }

        return name;
      } catch (e) {
        return '';
      }
    };

    const resolveProjectToken = async (origin, projectId) => {
      const pid = String(projectId || '');
      if (!pid) throw new Error('缺少 projectId');

      if (tokenCache.has(pid)) return tokenCache.get(pid);

      const ssKey = `__crm_yapi_project_token_${pid}`;
      try {
        const cached = sessionStorage.getItem(ssKey);
        if (cached && looksLikeToken(cached)) {
          tokenCache.set(pid, cached);
          return cached;
        }
      } catch (e) {
        // ignore
      }

      // 1) 优先使用 /api/project/token 获取（更稳定）
      const projectTokenUrl = `${origin}/api/project/token?project_id=${encodeURIComponent(pid)}`;
      const projectTokenResp = await fetchJson(projectTokenUrl);
      if (projectTokenResp && projectTokenResp.errcode === 0) {
        const data = projectTokenResp.data;
        const tokenFromTokenApi =
          (data &&
            typeof data === 'object' &&
            (data.token || data.project_token || data.projectToken)) ||
          (typeof data === 'string' ? data : '') ||
          findTokenInObject(data);

        if (tokenFromTokenApi && looksLikeToken(tokenFromTokenApi)) {
          tokenCache.set(pid, tokenFromTokenApi);
          try {
            sessionStorage.setItem(ssKey, tokenFromTokenApi);
          } catch {
            // ignore
          }
          return tokenFromTokenApi;
        }
      }

      // 2) 兜底：尝试从 /api/project/get 获取（部分部署可能会回 token 字段）
      const projectGetUrl = `${origin}/api/project/get?id=${encodeURIComponent(pid)}`;
      const projectResp = await fetchJson(projectGetUrl);
      if (projectResp && projectResp.errcode === 0) {
        const tokenFromApi = findTokenInObject(projectResp.data);
        if (tokenFromApi) {
          tokenCache.set(pid, tokenFromApi);
          try {
            sessionStorage.setItem(ssKey, tokenFromApi);
          } catch {
            // ignore
          }
          return tokenFromApi;
        }
      }

      // 3) 最后兜底：从项目设置页 HTML 抓取（通常会显示 token）
      const settingUrl = `${origin}/project/${encodeURIComponent(pid)}/setting`;
      const htmlResp = await fetch(settingUrl, { credentials: 'include' });
      const html = await htmlResp.text();
      const tokenRegexes = [
        // 更强上下文：token 字段附近
        /(?:project\\s*token|项目\\s*token|token)\\s*[:：]\\s*([a-zA-Z0-9_-]{24,128})/i,
        /name\\s*=\\s*"token"[\\s\\S]{0,200}?value\\s*=\\s*"([a-zA-Z0-9_-]{24,128})"/i,
        /id\\s*=\\s*"token"[\\s\\S]{0,200}?value\\s*=\\s*"([a-zA-Z0-9_-]{24,128})"/i
      ];
      let tokenFromHtml = '';

      for (const re of tokenRegexes) {
        const m = re.exec(html);
        if (m && m[1] && looksLikeToken(m[1])) {
          tokenFromHtml = m[1];
          break;
        }
      }

      if (tokenFromHtml) {
        tokenCache.set(pid, tokenFromHtml);
        try {
          sessionStorage.setItem(ssKey, tokenFromHtml);
        } catch {
          // ignore
        }
        return tokenFromHtml;
      }

      throw new Error('未能自动获取项目 token（请确认已登录且有项目权限）');
    };

    const buildMcpConfigBlocks = ({ origin, projectId, projectName, token }) => {
      const mcpPkg = '@leeguooooo/yapi-auto-mcp';
      const baseUrl = String(origin || '').replace(/\/$/, '');
      const yapiToken = `${projectId}:${token}`;
      const normalizedProjectName = String(projectName || '')
        .replace(/\s+/g, ' ')
        .replace(/\n/g, ' ')
        .trim();
      const serverNameBase = normalizedProjectName || `project-${projectId}`;
      const serverName = `${serverNameBase}-${projectId}-mcp`;
      const cliServerName = /\s/.test(serverName) ? JSON.stringify(serverName) : serverName;

      const stdioArgs = [
        '-y',
        mcpPkg,
        '--stdio',
        `--yapi-base-url=${baseUrl}`,
        `--yapi-token=${yapiToken}`
      ];

      const cursor = JSON.stringify(
        {
          mcpServers: {
            [serverName]: {
              command: 'npx',
              args: stdioArgs
            }
          }
        },
        null,
        2
      );

      const codex = `[mcp_servers.${JSON.stringify(serverName)}]\ncommand = "npx"\nargs = ${JSON.stringify(
        stdioArgs
      )}\n`;

      const gemini = JSON.stringify(
        {
          mcpServers: {
            [serverName]: {
              command: 'npx',
              args: stdioArgs
            }
          }
        },
        null,
        2
      );

      const claudeCode = `claude mcp add --transport stdio ${cliServerName} -- npx ${stdioArgs
        .map((a) => (a.includes(' ') ? JSON.stringify(a) : a))
        .join(' ')}`;

      const geminiCli = `gemini mcp add --transport stdio ${cliServerName} npx ${stdioArgs
        .map((a) => (a.includes(' ') ? JSON.stringify(a) : a))
        .join(' ')}`;

      const rawCommand = `npx ${stdioArgs.join(' ')}`;

      return {
        cursor,
        codex,
        gemini,
        claudeCode,
        geminiCli,
        rawCommand,
        serverName
      };
    };

    const buildGlobalMcpConfigBlocks = ({ origin, email }) => {
      const mcpPkg = '@leeguooooo/yapi-auto-mcp';
      const baseUrl = String(origin || '').replace(/\/$/, '');
      const host = String(location.hostname || 'yapi').replace(/[^a-zA-Z0-9._-]/g, '');
      const serverName = `yapi-global-${host.replace(/\./g, '-')}-mcp`;
      const cliServerName = /\s/.test(serverName) ? JSON.stringify(serverName) : serverName;
      const safeEmail = looksLikeEmail(email) ? String(email).trim() : 'YOUR_EMAIL';

      const stdioArgs = [
        '-y',
        mcpPkg,
        '--stdio',
        `--yapi-base-url=${baseUrl}`,
        '--yapi-auth-mode=global',
        `--yapi-email=${safeEmail}`,
        '--yapi-password=YOUR_PASSWORD'
      ];

      const cursor = JSON.stringify(
        {
          mcpServers: {
            [serverName]: {
              command: 'npx',
              args: stdioArgs
            }
          }
        },
        null,
        2
      );

      const codex = `[mcp_servers.${JSON.stringify(serverName)}]\ncommand = "npx"\nargs = ${JSON.stringify(
        stdioArgs
      )}\n`;

      const gemini = JSON.stringify(
        {
          mcpServers: {
            [serverName]: {
              command: 'npx',
              args: stdioArgs
            }
          }
        },
        null,
        2
      );

      const claudeCode = `claude mcp add --transport stdio ${cliServerName} -- npx ${stdioArgs
        .map((a) => (a.includes(' ') ? JSON.stringify(a) : a))
        .join(' ')}`;

      const geminiCli = `gemini mcp add --transport stdio ${cliServerName} npx ${stdioArgs
        .map((a) => (a.includes(' ') ? JSON.stringify(a) : a))
        .join(' ')}`;

      const rawCommand = `npx ${stdioArgs.join(' ')}`;

      return {
        cursor,
        codex,
        gemini,
        claudeCode,
        geminiCli,
        rawCommand,
        serverName
      };
    };

    const getCookieValue = (key) => {
      const name = `${String(key || '').trim()}=`;
      if (!name || name === '=') return '';
      const cookies = String(document.cookie || '').split(';');
      for (const c of cookies) {
        const trimmed = String(c || '').trim();
        if (!trimmed.startsWith(name)) continue;
        return trimmed.slice(name.length);
      }
      return '';
    };

    const resolveCurrentUserEmail = async (origin) => {
      // 1) 优先用 status（不依赖读取 cookie；只要 fetch 带 credentials 即可）
      try {
        const statusUrl = `${origin}/api/user/status`;
        const statusPayload = await fetchJson(statusUrl);
        const emailFromStatus = statusPayload && statusPayload.data && statusPayload.data.email;
        if (looksLikeEmail(emailFromStatus)) return String(emailFromStatus).trim();

        const uidFromStatus =
          statusPayload && statusPayload.data && (statusPayload.data.uid || statusPayload.data._id);
        if (uidFromStatus) {
          const url = `${origin}/api/user/find?id=${encodeURIComponent(String(uidFromStatus))}`;
          const payload = await fetchJson(url);
          if (
            payload &&
            payload.errcode === 0 &&
            payload.data &&
            looksLikeEmail(payload.data.email)
          ) {
            return String(payload.data.email || '').trim();
          }
        }
      } catch {
        // ignore
      }

      // 2) 兜底：尝试从非 HttpOnly 的 _yapi_uid 读取
      const uid = getCookieValue('_yapi_uid');
      if (!uid) return '';
      const url = `${origin}/api/user/find?id=${encodeURIComponent(uid)}`;
      const payload = await fetchJson(url);
      if (payload && payload.errcode === 0 && payload.data && looksLikeEmail(payload.data.email)) {
        return String(payload.data.email || '').trim();
      }
      return '';
    };

    const isTruthyRequired = (val) => {
      if (val === true) return true;
      if (val === 1) return true;
      if (val === '1') return true;
      if (val === 'true') return true;
      return false;
    };

    const parseJsonMaybe = (text) => {
      const s = typeof text === 'string' ? text.trim() : '';
      if (!s) return null;
      if (!(s.startsWith('{') || s.startsWith('['))) return null;
      try {
        return JSON.parse(s);
      } catch (e) {
        return null;
      }
    };

    const isJsonSchemaLike = (obj) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
      if (obj.$schema) return true;
      if (obj.type && obj.properties) return true;
      if (obj.properties && typeof obj.properties === 'object') return true;
      return false;
    };

    const valueType = (v) => {
      if (v === null) return 'null';
      if (Array.isArray(v)) return 'array';
      return typeof v;
    };

    const schemaToFieldRows = (schema, prefix, requiredSet) => {
      const rows = [];
      const s = schema && typeof schema === 'object' ? schema : {};
      const type = s.type || (s.properties ? 'object' : '');
      const props = s.properties && typeof s.properties === 'object' ? s.properties : null;
      const reqList = Array.isArray(s.required) ? s.required.map(String) : [];
      const localRequired = new Set(reqList);
      const combinedRequired = requiredSet || localRequired;

      if (type === 'object' && props) {
        Object.keys(props).forEach((key) => {
          const prop = props[key];
          const name = prefix ? `${prefix}.${key}` : key;
          const isReq = localRequired.has(String(key));

          const propType =
            (prop && typeof prop === 'object' && prop.type) ||
            (prop && typeof prop === 'object' && prop.properties ? 'object' : '') ||
            '';
          const desc = prop && typeof prop === 'object' ? prop.description || prop.desc || '' : '';

          if (propType === 'object' || (prop && typeof prop === 'object' && prop.properties)) {
            rows.push({ name, type: 'object', required: isReq ? '是' : '', desc });
            rows.push(...schemaToFieldRows(prop, name));
          } else if (propType === 'array' || (prop && typeof prop === 'object' && prop.items)) {
            const items = prop && typeof prop === 'object' ? prop.items : null;
            const itemsType =
              items && typeof items === 'object'
                ? items.type || (items.properties ? 'object' : '')
                : '';
            rows.push({
              name,
              type: itemsType ? `array<${itemsType}>` : 'array',
              required: isReq ? '是' : '',
              desc
            });

            if (items && typeof items === 'object') {
              if (items.type === 'object' || items.properties) {
                rows.push(...schemaToFieldRows(items, `${name}[*]`));
              }
            }
          } else {
            rows.push({ name, type: propType || 'any', required: isReq ? '是' : '', desc });
          }
        });
        return rows;
      }

      // 非 object schema：仅输出自身（用于根不是 object 的情况）
      const rootName = prefix || '(root)';
      rows.push({
        name: rootName,
        type: type || 'any',
        required: combinedRequired && combinedRequired.size ? '是' : '',
        desc: s.description || s.desc || ''
      });
      return rows;
    };

    const jsonValueToRows = (val, prefix) => {
      const rows = [];
      const name = prefix || '(root)';
      const t = valueType(val);

      if (t === 'object') {
        const keys = Object.keys(val || {});
        keys.forEach((k) => {
          rows.push(...jsonValueToRows(val[k], prefix ? `${prefix}.${k}` : k));
        });
        return rows;
      }

      if (t === 'array') {
        const first = Array.isArray(val) && val.length ? val[0] : undefined;
        const itemType = valueType(first);
        rows.push({
          name,
          type: itemType ? `array<${itemType}>` : 'array',
          required: '',
          desc: ''
        });
        if (itemType === 'object') {
          rows.push(...jsonValueToRows(first, `${name}[*]`));
        }
        return rows;
      }

      rows.push({ name, type: t, required: '', desc: val == null ? '' : String(val) });
      return rows;
    };

    const rowsToMarkdownTable = (rows, columns) => {
      const cols = Array.isArray(columns) ? columns : [];
      const list = Array.isArray(rows) ? rows : [];
      if (!cols.length || !list.length) return '';

      const escape = (s) =>
        String(s == null ? '' : s)
          .replace(/\|/g, '\\|')
          .replace(/\n/g, ' ');
      const header = `| ${cols.map((c) => escape(c.label)).join(' | ')} |`;
      const sep = `| ${cols.map(() => '---').join(' | ')} |`;
      const lines = list.map((r) => `| ${cols.map((c) => escape(r[c.key])).join(' | ')} |`);
      return [header, sep, ...lines].join('\n');
    };

    const interfaceToMarkdown = (api) => {
      if (!api || typeof api !== 'object') return '';

      const lines = [];
      const title = api.title ? String(api.title) : '';
      if (title) lines.push(`# ${title}`);

      const method = api.method ? String(api.method).toUpperCase() : '';
      const path = api.path ? String(api.path) : '';
      const desc = api.desc ? String(api.desc).trim() : '';

      if (method || path) {
        lines.push('');
        if (method) lines.push(`- Method: \`${method}\``);
        if (path) lines.push(`- Path: \`${path}\``);
      }

      if (desc) {
        lines.push('');
        lines.push('## 描述');
        lines.push(desc);
      }

      const reqParams = Array.isArray(api.req_params) ? api.req_params : [];
      const reqQuery = Array.isArray(api.req_query) ? api.req_query : [];
      const reqHeaders = Array.isArray(api.req_headers) ? api.req_headers : [];
      const reqBodyType = api.req_body_type ? String(api.req_body_type) : '';
      const reqBodyForm = Array.isArray(api.req_body_form) ? api.req_body_form : [];
      const reqBodyOther = api.req_body_other ? String(api.req_body_other) : '';

      const responseBody = api.res_body ? String(api.res_body) : '';
      const responseType = api.res_body_type ? String(api.res_body_type) : '';
      const markdownDoc = api.markdown ? String(api.markdown).trim() : '';

      const hasRequest =
        reqParams.length ||
        reqQuery.length ||
        reqHeaders.length ||
        reqBodyForm.length ||
        reqBodyOther ||
        reqBodyType;

      if (hasRequest) {
        lines.push('');
        lines.push('## 请求');

        if (reqParams.length) {
          const rows = reqParams.map((p) => ({
            name: p.name || p.key || '',
            required: isTruthyRequired(p.required) ? '是' : '',
            desc: p.desc || p.description || ''
          }));
          lines.push('');
          lines.push('### Path 参数');
          lines.push(
            rowsToMarkdownTable(rows, [
              { key: 'name', label: 'name' },
              { key: 'required', label: 'required' },
              { key: 'desc', label: 'desc' }
            ])
          );
        }

        if (reqQuery.length) {
          const rows = reqQuery.map((p) => ({
            name: p.name || p.key || '',
            required: isTruthyRequired(p.required) ? '是' : '',
            desc: p.desc || p.description || ''
          }));
          lines.push('');
          lines.push('### Query 参数');
          lines.push(
            rowsToMarkdownTable(rows, [
              { key: 'name', label: 'name' },
              { key: 'required', label: 'required' },
              { key: 'desc', label: 'desc' }
            ])
          );
        }

        if (reqHeaders.length) {
          const rows = reqHeaders.map((h) => ({
            name: h.name || h.key || '',
            required: isTruthyRequired(h.required) ? '是' : '',
            desc: h.desc || h.description || ''
          }));
          lines.push('');
          lines.push('### Headers');
          lines.push(
            rowsToMarkdownTable(rows, [
              { key: 'name', label: 'name' },
              { key: 'required', label: 'required' },
              { key: 'desc', label: 'desc' }
            ])
          );
        }

        if (reqBodyType || reqBodyForm.length || reqBodyOther) {
          lines.push('');
          lines.push('### Body');
          if (reqBodyType) lines.push(`- Type: \`${reqBodyType}\``);

          if (reqBodyForm.length) {
            const rows = reqBodyForm.map((f) => ({
              name: f.name || f.key || '',
              required: isTruthyRequired(f.required) ? '是' : '',
              type: f.type || '',
              desc: f.desc || f.description || ''
            }));
            lines.push('');
            lines.push(
              rowsToMarkdownTable(rows, [
                { key: 'name', label: 'name' },
                { key: 'required', label: 'required' },
                { key: 'type', label: 'type' },
                { key: 'desc', label: 'desc' }
              ])
            );
          }

          if (reqBodyOther) {
            const parsed = parseJsonMaybe(reqBodyOther);
            if (parsed) {
              const rows = isJsonSchemaLike(parsed)
                ? schemaToFieldRows(parsed, '')
                : jsonValueToRows(parsed, '');
              if (rows.length) {
                lines.push('');
                lines.push('#### Body 字段');
                lines.push(
                  rowsToMarkdownTable(rows, [
                    { key: 'name', label: 'field' },
                    { key: 'type', label: 'type' },
                    { key: 'required', label: 'required' },
                    { key: 'desc', label: 'desc' }
                  ])
                );
              }
            } else {
              lines.push('');
              lines.push('#### Body（原始）');
              lines.push(reqBodyOther);
            }
          }
        }
      }

      if (responseType || responseBody) {
        lines.push('');
        lines.push('## 响应');
        if (responseType) lines.push(`- Type: \`${responseType}\``);
        if (responseBody) {
          const parsed = parseJsonMaybe(responseBody);
          if (parsed) {
            const rows = isJsonSchemaLike(parsed)
              ? schemaToFieldRows(parsed, '')
              : jsonValueToRows(parsed, '');
            if (rows.length) {
              lines.push('');
              lines.push('### 响应字段');
              lines.push(
                rowsToMarkdownTable(rows, [
                  { key: 'name', label: 'field' },
                  { key: 'type', label: 'type' },
                  { key: 'required', label: 'required' },
                  { key: 'desc', label: 'desc' }
                ])
              );
            }
          } else {
            lines.push('');
            lines.push('### 响应（原始）');
            lines.push(responseBody);
          }
        }
      }

      if (markdownDoc) {
        lines.push('');
        lines.push('## 备注');
        lines.push(markdownDoc);
      }

      return lines.join('\n').trim() + '\n';
    };

    const fetchInterfaceDetail = async (origin, apiId) => {
      const url = `${origin}/api/interface/get?id=${encodeURIComponent(String(apiId || ''))}`;
      const payload = await fetchJson(url);
      if (payload && payload.errcode === 0 && payload.data) {
        return payload.data;
      }
      return null;
    };

    const ensureModal = () => {
      let modal = document.getElementById(MODAL_ID);
      if (modal) return modal;

      modal = document.createElement('div');
      modal.id = MODAL_ID;
      modal.innerHTML = `
	        <div class="crm-mask"></div>
	        <div class="crm-panel" role="dialog" aria-modal="true">
	          <div class="crm-header">
	            <div class="crm-title">MCP 配置</div>
	            <button class="crm-close" aria-label="Close">×</button>
	          </div>
	          <div class="crm-body">
	            <div class="crm-section">
	              <h3 id="crm-mcp-title">MCP 配置</h3>
	              <div class="crm-hint" id="crm-mcp-hint">已按当前项目自动拼好（Cursor / Codex / Gemini CLI / Claude Code）。</div>
	              <div id="crm-mcp-content" style="margin-top: 10px;"></div>
	            </div>
	          </div>
	        </div>
	      `;
      document.body.appendChild(modal);

      const close = () => {
        modal.style.display = 'none';
      };
      modal.querySelector('.crm-mask').addEventListener('click', close);
      modal.querySelector('.crm-close').addEventListener('click', close);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') close();
      });

      return modal;
    };

    const renderCodeBlock = (label, text) => {
      const container = document.createElement('div');
      container.className = 'crm-section';
      container.innerHTML = `
        <div class="crm-row" style="justify-content: space-between;">
          <div style="font-size: 12px; font-weight: 600; color: #111;">${label}</div>
        </div>
        <div class="crm-code">
          <button class="crm-copy">复制</button>
          <pre><code></code></pre>
        </div>
      `;
      container.querySelector('code').textContent = text;
      container.querySelector('.crm-copy').addEventListener('click', async () => {
        await safeWriteClipboard(text);
      });
      return container;
    };

    const openModal = async (mode) => {
      const route = parseYapiInterfaceRoute();
      if (!route) return;

      ensureStyle();
      const modal = ensureModal();
      modal.style.display = 'block';

      const headerTitle = modal.querySelector('.crm-title');
      const panelTitle = modal.querySelector('#crm-mcp-title');
      const panelHint = modal.querySelector('#crm-mcp-hint');

      const mcpContainer = modal.querySelector('#crm-mcp-content');
      mcpContainer.textContent = '生成中...';

      const origin = location.origin;

      try {
        const mcpMode = mode === 'global' ? 'global' : 'project';
        if (mcpMode === 'global') {
          if (headerTitle) headerTitle.textContent = 'MCP 配置（所有项目）';
          if (panelTitle) panelTitle.textContent = 'MCP 配置（所有项目）';
          if (panelHint) {
            panelHint.textContent =
              '全局模式：邮箱会尽量自动填入；只需填写密码。启动后先在对话里调用一次 yapi_update_token 自动缓存所有项目 token。';
          }
        } else {
          if (headerTitle) headerTitle.textContent = 'MCP 配置（当前项目）';
          if (panelTitle) panelTitle.textContent = 'MCP 配置（当前项目）';
          if (panelHint)
            panelHint.textContent =
              '已按当前项目自动拼好（Cursor / Codex / Gemini CLI / Claude Code）。';
        }

        let blocks;
        if (mcpMode === 'global') {
          const email = await resolveCurrentUserEmail(origin);
          blocks = buildGlobalMcpConfigBlocks({ origin, email });
        } else {
          const [token, projectName] = await Promise.all([
            resolveProjectToken(origin, route.projectId),
            resolveProjectName(origin, route.projectId)
          ]);
          blocks = buildMcpConfigBlocks({
            origin,
            projectId: route.projectId,
            projectName,
            token
          });
        }

        mcpContainer.textContent = '';
        mcpContainer.style.display = 'block';
        mcpContainer.appendChild(
          renderCodeBlock(`Cursor（mcpServers: ${blocks.serverName}）`, blocks.cursor)
        );
        mcpContainer.appendChild(
          renderCodeBlock(`Codex（mcp_servers: ${blocks.serverName}）`, blocks.codex)
        );
        mcpContainer.appendChild(
          renderCodeBlock(`Gemini CLI（mcpServers: ${blocks.serverName}）`, blocks.gemini)
        );
        mcpContainer.appendChild(
          renderCodeBlock(`Claude Code（命令行: ${blocks.serverName}）`, blocks.claudeCode + '\n')
        );
        mcpContainer.appendChild(
          renderCodeBlock(`Gemini CLI（命令行: ${blocks.serverName}）`, blocks.geminiCli + '\n')
        );
        mcpContainer.appendChild(renderCodeBlock('通用（直接运行）', blocks.rawCommand + '\n'));
      } catch (e) {
        mcpContainer.textContent =
          'MCP 配置生成失败：' + (e && e.message ? e.message : String(e || ''));
      }
    };

    const copyMarkdownDirectly = async (btn) => {
      const route = parseYapiInterfaceRoute();
      if (!route) return;
      btn.disabled = true;
      const origin = location.origin;

      try {
        const api = await fetchInterfaceDetail(origin, route.apiId);
        const md = api ? interfaceToMarkdown(api) : '';
        if (!md) throw new Error('未能获取接口详情');
        await safeWriteClipboard(md);
      } catch (e) {
        console.error('[Content-Script] 复制接口 Markdown 失败:', e);
      } finally {
        btn.disabled = false;
      }
    };

    const mountButtons = () => {
      const route = parseYapiInterfaceRoute();
      if (!route) return;

      const titleElList = Array.from(document.querySelectorAll('h2.interface-title'));
      const titleEl = titleElList.find((el) => (el.textContent || '').trim().includes('基本信息'));
      if (!titleEl) return;

      if (document.getElementById(BTN_GROUP_ID)) return;

      ensureStyle();

      // 尽量不破坏原样式：把 h2 变成 flex 并把按钮推到最右侧
      titleEl.style.display = 'flex';
      titleEl.style.alignItems = 'center';
      titleEl.style.gap = '8px';

      const group = document.createElement('span');
      group.id = BTN_GROUP_ID;

      const mcpGlobalBtn = document.createElement('button');
      mcpGlobalBtn.className = 'crm-btn';
      mcpGlobalBtn.type = 'button';
      mcpGlobalBtn.textContent = '所有项目 MCP 配置';
      mcpGlobalBtn.addEventListener('click', () => openModal('global'));

      const mcpProjectBtn = document.createElement('button');
      mcpProjectBtn.className = 'crm-btn';
      mcpProjectBtn.type = 'button';
      mcpProjectBtn.textContent = '当前项目 MCP 配置';
      mcpProjectBtn.addEventListener('click', () => openModal('project'));

      const copyBtn = document.createElement('button');
      copyBtn.className = 'crm-btn crm-primary';
      copyBtn.type = 'button';
      copyBtn.textContent = '复制当前页面给 AI';
      copyBtn.addEventListener('click', () => copyMarkdownDirectly(copyBtn));

      group.appendChild(mcpGlobalBtn);
      group.appendChild(mcpProjectBtn);
      group.appendChild(copyBtn);
      titleEl.appendChild(group);
    };

    const tick = () => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        const old = document.getElementById(BTN_GROUP_ID);
        if (old) old.remove();
      }
      mountButtons();
    };

    tick();
    setInterval(tick, 800);

    const observer = new MutationObserver(() => tick());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  },

  // 注入页面脚本
  injectScript() {
    // 按顺序注入：helpers -> index.js
    // 使用链式加载确保执行顺序，避免竞态条件
    const helpers = [
      'src/helpers/query-string.js',
      'src/helpers/body-parser.js',
      'src/helpers/form-data.js',
      'src/helpers/yapi-openapi.js',
      'src/helpers/logger.js',
      'src/helpers/response-handler.js' // 必须在 body-parser.js 之后（有依赖）
    ];

    // 链式加载 helpers，然后加载 index.js
    let loadIndex = 0;

    const loadNextHelper = () => {
      if (loadIndex < helpers.length) {
        const helperPath = helpers[loadIndex++];
        const helperScript = document.createElement('script');
        helperScript.src = chrome.runtime.getURL(helperPath);
        helperScript.async = false; // 确保按顺序执行
        helperScript.onload = function () {
          console.log(`[Content-Script] Helper 加载成功: ${helperPath}`);
          loadNextHelper(); // 加载下一个
        };
        helperScript.onerror = function () {
          console.error(`[Content-Script] Helper 加载失败: ${helperPath}`);
          // 即使失败也继续，让 index.js 的 fallback 处理
          loadNextHelper();
        };
        (document.head || document.documentElement).appendChild(helperScript);
      } else {
        // 所有 helpers 加载完成，加载 index.js
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('index.js');
        script.async = false; // 确保在 helpers 之后执行
        script.onload = function () {
          console.log('[Content-Script] 页面脚本加载成功');
          this.remove();
        };
        script.onerror = function () {
          console.error('[Content-Script] 页面脚本加载失败');
        };
        (document.head || document.documentElement).appendChild(script);
      }
    };

    loadNextHelper(); // 开始加载
  },

  // 监听DOM变化
  observeDOM() {
    // 检查 body 是否存在
    if (!document.body) {
      console.warn('[Content-Script] document.body 不存在，延迟初始化');
      setTimeout(() => this.observeDOM(), 100);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.id && node.id.includes(this.config.container)) {
            this.handleRequestNode(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.checkExistingNodes();
  },

  // 检查现有节点
  checkExistingNodes() {
    const nodes = document.querySelectorAll(`[id*="${this.config.container}"]`);
    nodes.forEach((node) => this.handleRequestNode(node));
  },

  // 处理请求节点
  async handleRequestNode(node) {
    try {
      const requestData = this.parseRequestData(node);
      if (!requestData) return;

      console.log('[Content-Script] 处理请求:', {
        id: requestData.id,
        url: requestData.url,
        method: requestData.method
      });

      node.setAttribute('data-status', 'processing');
      const response = await this.sendRequest(requestData);
      this.handleResponse(node, response, requestData);
    } catch (error) {
      console.error('[Content-Script] 请求处理错误:', error.message);
      this.handleError(node, error);
    }
  },

  // 解析请求数据
  parseRequestData(node) {
    try {
      const data = node.textContent;
      if (!data) return null;
      const requestData = JSON.parse(decodeURIComponent(atob(data)));

      // Hack: Resolve relative URL to absolute based on current page origin
      if (requestData.url) {
        try {
          // If it's already absolute (starts with http/https), leave it
          if (!requestData.url.startsWith('http://') && !requestData.url.startsWith('https://')) {
            // Handle root-relative (e.g., '/path')
            if (requestData.url.startsWith('/')) {
              requestData.url = location.origin + requestData.url;
            } else {
              // Handle other relatives (e.g., 'path/to/endpoint')
              requestData.url = new URL(requestData.url, location.href).toString();
            }
          }
        } catch (urlError) {
          console.error('[Content-Script] URL resolution failed:', urlError);
          // Fallback: Leave as-is if resolution fails
        }
      }

      return requestData;
    } catch (e) {
      console.error('[Content-Script] 数据解析失败:', e);
      return null;
    }
  },

  // 发送请求
  sendRequest(requestData) {
    return new Promise((resolve, reject) => {
      if (!chrome.runtime?.id) {
        reject(new Error('扩展上下文无效'));
        return;
      }

      try {
        chrome.runtime.sendMessage(
          {
            action: 'crossOriginRequest',
            data: requestData
          },
          (response) => {
            if (chrome.runtime.lastError) {
              const errorMessage = chrome.runtime.lastError.message;
              if (
                errorMessage.includes('back/forward cache') ||
                errorMessage.includes('message channel is closed')
              ) {
                console.warn('[Content-Script] 页面缓存，请求取消');
                reject(new Error('请求取消：页面缓存'));
              } else {
                reject(new Error(errorMessage));
              }
              return;
            }

            if (!response) {
              console.error('[Content-Script] 未收到响应');
              reject(new Error('未收到响应'));
            } else if (response.success) {
              console.log('[Content-Script] 请求成功:', response.data?.status);
              resolve(response.data);
            } else {
              console.error('[Content-Script] 请求失败:', response.error);
              reject(new Error(response.error || '未知错误'));
            }
          }
        );
      } catch (e) {
        reject(new Error('消息发送失败: ' + e.message));
      }
    });
  },

  // 处理响应
  handleResponse(node, response, requestData) {
    console.log('[Content-Script] 发送响应事件');

    const responsePayload = {
      status: response.status || 0,
      statusText: response.statusText || 'OK',
      headers: response.headers || {},
      body: response.body !== undefined && response.body !== null ? response.body : '',
      ok: response.ok !== undefined ? response.ok : true,
      url: requestData.url
    };

    if (Object.prototype.hasOwnProperty.call(response, 'bodyParsed')) {
      responsePayload.bodyParsed = response.bodyParsed;
    }

    if (Object.prototype.hasOwnProperty.call(response, 'data')) {
      responsePayload.data = response.data;
    }

    const responseEvent = new CustomEvent('y-request-response', {
      detail: {
        id: requestData.id,
        response: responsePayload
      }
    });

    document.dispatchEvent(responseEvent);
    console.log('[Content-Script] 响应事件已触发');
    node.remove();
  },

  // 处理错误
  handleError(node, error) {
    const requestId = node.id.replace(this.config.container + '-', '');

    console.error('[Content-Script] 发送错误事件:', error.message);

    const errorEvent = new CustomEvent('y-request-error', {
      detail: {
        id: requestId,
        error: error.message || '未知错误'
      }
    });

    document.dispatchEvent(errorEvent);
    node.remove();
  },

  // 监听 cURL 相关事件
  initCurlEventListeners() {
    console.log('[Content-Script] 开始初始化 cURL 事件监听器');

    // 监听检查禁用状态事件
    document.addEventListener('curl-check-disabled', (event) => {
      const requestData = event.detail.requestData;
      console.log('[Content-Script] 收到检查 cURL 禁用状态请求:', requestData);

      // 向 background script 查询状态
      chrome.runtime.sendMessage(
        {
          action: 'getCurlDisplayDisabled'
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn(
              '[Content-Script] 获取 cURL 状态失败，默认显示:',
              chrome.runtime.lastError
            );
            // 失败时默认显示
            this.showCurlCommand(requestData);
            return;
          }

          if (response && response.disabled) {
            console.log('[Content-Script] cURL 显示已被永久关闭');
            return;
          }

          // 显示 cURL 弹窗
          this.showCurlCommand(requestData);
        }
      );
    });

    // 监听禁用请求事件
    document.addEventListener('curl-disable-request', (event) => {
      const disabled = event.detail.disabled;
      console.log('[Content-Script] 收到 cURL 禁用请求:', disabled);

      // 向 background script 保存设置
      chrome.runtime.sendMessage(
        {
          action: 'setCurlDisplayDisabled',
          disabled: disabled
        },
        (_response) => {
          if (chrome.runtime.lastError) {
            console.warn('[Content-Script] 保存 cURL 禁用设置失败:', chrome.runtime.lastError);
          } else {
            console.log('[Content-Script] cURL 禁用设置已保存');
          }
        }
      );
    });

    console.log('[Content-Script] cURL 事件监听器初始化完成');
  },

  // 显示 cURL 命令弹窗
  showCurlCommand(requestData) {
    console.log('[Content-Script] 准备发送 curl-show-command 事件:', requestData);
    const event = new CustomEvent('curl-show-command', {
      detail: requestData
    });
    document.dispatchEvent(event);
    console.log('[Content-Script] curl-show-command 事件已发送');
  }
};

// 监听来自 background 的调试消息
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === 'debug_log') {
    console.log(`[${message.source}] ${message.message}:`, message.data);
  }
});

// 启动扩展
console.log('[Content-Script] 当前页面:', window.location.href);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[Content-Script] DOM加载完成，初始化');
    CrossRequest.init();
  });
} else {
  console.log('[Content-Script] DOM已就绪，立即初始化');
  CrossRequest.init();
}

console.log('[Content-Script] Content script 加载完成');
