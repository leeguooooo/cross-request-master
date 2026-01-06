import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Logger } from "./services/yapi/logger";

interface ServerConfig {
  yapiBaseUrl: string;
  yapiToken: string;
  yapiAuthMode: "token" | "global";
  yapiEmail: string;
  yapiPassword: string;
  yapiToolset: "basic" | "full";
  port: number;
  yapiCacheTTL: number; // 缓存时效，单位为分钟
  yapiLogLevel: string; // 日志级别：debug, info, warn, error
  yapiHttpTimeoutMs: number;
  configSources: {
    yapiBaseUrl: "cli" | "env" | "default";
    yapiToken: "cli" | "env" | "default";
    yapiAuthMode: "cli" | "env" | "default";
    yapiEmail: "cli" | "env" | "default";
    yapiPassword: "cli" | "env" | "default";
    yapiToolset: "cli" | "env" | "default";
    port: "cli" | "env" | "default";
    yapiCacheTTL: "cli" | "env" | "default";
    yapiLogLevel: "cli" | "env" | "default";
    yapiHttpTimeoutMs: "cli" | "env" | "default";
  };
}

function maskApiKey(key: string): string {
  if (key.length <= 4) return "****";
  return `****${key.slice(-4)}`;
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 2) return "**";
  return `${value[0]}***${value[value.length - 1]}`;
}

function maskEmail(email: string): string {
  const v = String(email || "").trim();
  if (!v) return "";
  const at = v.indexOf("@");
  if (at <= 1) return "***";
  return `${v[0]}***${v.slice(at)}`;
}

interface CliArgs {
  "yapi-base-url"?: string;
  "yapi-token"?: string;
  "yapi-auth-mode"?: "token" | "global";
  "yapi-email"?: string;
  "yapi-password"?: string;
  "yapi-toolset"?: "basic" | "full";
  port?: number;
  "yapi-cache-ttl"?: number;
  "yapi-log-level"?: string;
  "yapi-http-timeout-ms"?: number;
}

export function getServerConfig(): ServerConfig {
  // Parse command line arguments
  const argv = yargs(hideBin(process.argv))
    .options({
      "yapi-base-url": {
        type: "string",
        description: "YApi服务器基础URL",
      },
      "yapi-token": {
        type: "string",
        description: "YApi服务器授权Token",
      },
      "yapi-auth-mode": {
        type: "string",
        description: "鉴权模式：token=项目 token；global=用户名/密码登录（Cookie 登录态）",
        choices: ["token", "global"],
      },
      "yapi-email": {
        type: "string",
        description: "全局模式登录邮箱（/api/user/login 的 email 字段）",
      },
      "yapi-password": {
        type: "string",
        description: "全局模式登录密码（/api/user/login 的 password 字段）",
      },
      "yapi-toolset": {
        type: "string",
        description: "工具集：basic=常用精简；full=完整（包含底层接口封装工具）",
        choices: ["basic", "full"],
      },
      port: {
        type: "number",
        description: "Port to run the server on",
      },
      "yapi-cache-ttl": {
        type: "number",
        description: "YApi缓存有效期（分钟），默认10分钟",
      },
      "yapi-log-level": {
        type: "string",
        description: "YApi日志级别 (debug, info, warn, error)",
        choices: ["debug", "info", "warn", "error"],
      },
      "yapi-http-timeout-ms": {
        type: "number",
        description: "YApi HTTP 请求超时（毫秒），默认 15000",
      },
    })
    .help()
    .parseSync() as CliArgs;

  const config: ServerConfig = {
    yapiBaseUrl: "http://localhost:3000",
    yapiToken: "",
    yapiAuthMode: "token",
    yapiEmail: "",
    yapiPassword: "",
    yapiToolset: "basic",
    port: 3388,
    yapiCacheTTL: 10, // 默认缓存10分钟
    yapiLogLevel: "info", // 默认日志级别
    yapiHttpTimeoutMs: 15_000,
    configSources: {
      yapiBaseUrl: "default",
      yapiToken: "default",
      yapiAuthMode: "default",
      yapiEmail: "default",
      yapiPassword: "default",
      yapiToolset: "default",
      port: "default",
      yapiCacheTTL: "default",
      yapiLogLevel: "default",
      yapiHttpTimeoutMs: "default",
    },
  };


  // Handle YAPI_BASE_URL
  if (argv["yapi-base-url"]) {
    config.yapiBaseUrl = argv["yapi-base-url"];
    config.configSources.yapiBaseUrl = "cli";
  } else if (process.env.YAPI_BASE_URL) {
    config.yapiBaseUrl = process.env.YAPI_BASE_URL;
    config.configSources.yapiBaseUrl = "env";
  }

  // Handle YAPI_TOKEN
  if (argv["yapi-token"]) {
    config.yapiToken = argv["yapi-token"];
    config.configSources.yapiToken = "cli";
  } else if (process.env.YAPI_TOKEN) {
    config.yapiToken = process.env.YAPI_TOKEN;
    config.configSources.yapiToken = "env";
  }

  // Handle YAPI_EMAIL / YAPI_PASSWORD (global mode)
  if (argv["yapi-email"]) {
    config.yapiEmail = argv["yapi-email"];
    config.configSources.yapiEmail = "cli";
  } else if (process.env.YAPI_EMAIL) {
    config.yapiEmail = process.env.YAPI_EMAIL;
    config.configSources.yapiEmail = "env";
  }

  if (argv["yapi-password"]) {
    config.yapiPassword = argv["yapi-password"];
    config.configSources.yapiPassword = "cli";
  } else if (process.env.YAPI_PASSWORD) {
    config.yapiPassword = process.env.YAPI_PASSWORD;
    config.configSources.yapiPassword = "env";
  }

  // Handle YAPI_AUTH_MODE
  if (argv["yapi-auth-mode"]) {
    config.yapiAuthMode = argv["yapi-auth-mode"];
    config.configSources.yapiAuthMode = "cli";
  } else if (process.env.YAPI_AUTH_MODE) {
    const mode = process.env.YAPI_AUTH_MODE.toLowerCase();
    if (mode === "token" || mode === "global") {
      config.yapiAuthMode = mode;
      config.configSources.yapiAuthMode = "env";
    }
  } else {
    // default: token 优先；未配置 token 且提供了账号密码则自动切到 global
    config.yapiAuthMode = config.yapiToken ? "token" : config.yapiEmail && config.yapiPassword ? "global" : "token";
  }

  // Handle YAPI_TOOLSET
  if (argv["yapi-toolset"]) {
    config.yapiToolset = argv["yapi-toolset"];
    config.configSources.yapiToolset = "cli";
  } else if (process.env.YAPI_TOOLSET) {
    const set = process.env.YAPI_TOOLSET.toLowerCase();
    if (set === "basic" || set === "full") {
      config.yapiToolset = set;
      config.configSources.yapiToolset = "env";
    }
  }

  // Handle PORT
  if (argv.port) {
    config.port = argv.port;
    config.configSources.port = "cli";
  } else if (process.env.PORT) {
    config.port = parseInt(process.env.PORT, 10);
    config.configSources.port = "env";
  }

  // Handle YAPI_CACHE_TTL
  if (argv["yapi-cache-ttl"]) {
    config.yapiCacheTTL = argv["yapi-cache-ttl"];
    config.configSources.yapiCacheTTL = "cli";
  } else if (process.env.YAPI_CACHE_TTL) {
    const cacheTTL = parseInt(process.env.YAPI_CACHE_TTL, 10);
    if (!isNaN(cacheTTL)) {
      config.yapiCacheTTL = cacheTTL;
      config.configSources.yapiCacheTTL = "env";
    }
  }

  // Handle YAPI_LOG_LEVEL
  if (argv["yapi-log-level"]) {
    config.yapiLogLevel = argv["yapi-log-level"];
    config.configSources.yapiLogLevel = "cli";
  } else if (process.env.YAPI_LOG_LEVEL) {
    const validLevels = ["debug", "info", "warn", "error"];
    const logLevel = process.env.YAPI_LOG_LEVEL.toLowerCase();
    if (validLevels.includes(logLevel)) {
      config.yapiLogLevel = logLevel;
      config.configSources.yapiLogLevel = "env";
    }
  }

  // Handle YAPI_HTTP_TIMEOUT_MS
  if (argv["yapi-http-timeout-ms"]) {
    config.yapiHttpTimeoutMs = argv["yapi-http-timeout-ms"];
    config.configSources.yapiHttpTimeoutMs = "cli";
  } else if (process.env.YAPI_HTTP_TIMEOUT_MS) {
    const ms = parseInt(process.env.YAPI_HTTP_TIMEOUT_MS, 10);
    if (!isNaN(ms)) {
      config.yapiHttpTimeoutMs = ms;
      config.configSources.yapiHttpTimeoutMs = "env";
    }
  }

  // 创建日志实例
  const logger = new Logger("Config", config.yapiLogLevel);

  // Log configuration sources
  logger.info("\nConfiguration:");
  logger.info(
    `- YAPI_BASE_URL: ${config.yapiBaseUrl} (source: ${config.configSources.yapiBaseUrl})`,
  );
  logger.info(
    `- YAPI_TOKEN: ${config.yapiToken ? maskApiKey(config.yapiToken) : "未配置"} (source: ${config.configSources.yapiToken})`,
  );
  logger.info(`- YAPI_AUTH_MODE: ${config.yapiAuthMode} (source: ${config.configSources.yapiAuthMode})`);
  logger.info(
    `- YAPI_EMAIL: ${config.yapiEmail ? maskEmail(config.yapiEmail) : "未配置"} (source: ${config.configSources.yapiEmail})`,
  );
  logger.info(
    `- YAPI_PASSWORD: ${config.yapiPassword ? maskSecret(config.yapiPassword) : "未配置"} (source: ${config.configSources.yapiPassword})`,
  );
  logger.info(`- YAPI_TOOLSET: ${config.yapiToolset} (source: ${config.configSources.yapiToolset})`);
  logger.info(`- PORT: ${config.port} (source: ${config.configSources.port})`);
  logger.info(`- YAPI_CACHE_TTL: ${config.yapiCacheTTL} 分钟 (source: ${config.configSources.yapiCacheTTL})`);
  logger.info(`- YAPI_LOG_LEVEL: ${config.yapiLogLevel} (source: ${config.configSources.yapiLogLevel})`);
  logger.info(`- YAPI_HTTP_TIMEOUT_MS: ${config.yapiHttpTimeoutMs} (source: ${config.configSources.yapiHttpTimeoutMs})`);
  logger.info(""); // Empty line for better readability

  return config;
}
