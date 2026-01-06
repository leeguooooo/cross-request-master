import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import crypto from "crypto";
import { Logger } from "./logger";

export interface YApiSessionCookie {
  yapiToken: string;
  yapiUid?: string;
  expiresAt?: number; // ms since epoch
  updatedAt: number; // ms since epoch
}

export interface YApiProjectTokenEntry {
  token: string;
  updatedAt: number; // ms since epoch
}

export interface YApiAuthCacheData {
  version: 1;
  baseUrl: string;
  session?: YApiSessionCookie;
  projectTokens: Record<string, YApiProjectTokenEntry>;
}

function hashBaseUrl(baseUrl: string): string {
  return crypto.createHash("sha256").update(baseUrl).digest("hex").slice(0, 16);
}

function ensureDirSecure(dirPath: string): void {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    }
    try {
      fs.chmodSync(dirPath, 0o700);
    } catch {
      // best effort (e.g. on Windows)
    }
  } catch {
    // ignore
  }
}

function writeFileAtomicSync(filePath: string, content: string, options: { mode: number }): void {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmpPath, content, { encoding: "utf8", mode: options.mode });
    try {
      fs.renameSync(tmpPath, filePath);
    } catch (e) {
      // Windows 上 rename 覆盖可能失败，退化为先删除再 rename
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        fs.renameSync(tmpPath, filePath);
      } catch {
        throw e;
      }
    }
    try {
      fs.chmodSync(filePath, options.mode);
    } catch {
      // best effort
    }
  } finally {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
  }
}

export class YApiAuthCache {
  private readonly logger: Logger;
  private readonly baseUrl: string;
  private readonly cacheDir: string;
  private readonly cacheFilePath: string;

  constructor(baseUrl: string, logLevel: string = "info") {
    this.logger = new Logger("YApiAuthCache", logLevel);
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.cacheDir = path.join(os.homedir(), ".yapi-mcp");
    this.cacheFilePath = path.join(this.cacheDir, `auth-${hashBaseUrl(this.baseUrl)}.json`);

    ensureDirSecure(this.cacheDir);
  }

  load(): YApiAuthCacheData {
    const empty: YApiAuthCacheData = {
      version: 1,
      baseUrl: this.baseUrl,
      projectTokens: {},
    };

    try {
      if (!fs.existsSync(this.cacheFilePath)) return empty;
      const raw = fs.readFileSync(this.cacheFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<YApiAuthCacheData>;
      if (!parsed || parsed.version !== 1 || parsed.baseUrl !== this.baseUrl) return empty;
      return {
        version: 1,
        baseUrl: this.baseUrl,
        session: parsed.session,
        projectTokens: parsed.projectTokens ?? {},
      };
    } catch (e) {
      this.logger.warn(`读取全局鉴权缓存失败，将使用空缓存: ${e}`);
      return empty;
    }
  }

  save(data: YApiAuthCacheData): void {
    try {
      writeFileAtomicSync(this.cacheFilePath, JSON.stringify(data, null, 2), { mode: 0o600 });
    } catch (e) {
      this.logger.warn(`写入全局鉴权缓存失败: ${e}`);
    }
  }

  loadSession(): YApiSessionCookie | null {
    const data = this.load();
    if (!data.session?.yapiToken) return null;
    return data.session;
  }

  saveSession(session: YApiSessionCookie): void {
    const data = this.load();
    data.session = session;
    this.save(data);
  }

  loadProjectTokens(): Map<string, string> {
    const data = this.load();
    const map = new Map<string, string>();
    for (const [projectId, entry] of Object.entries(data.projectTokens ?? {})) {
      if (entry?.token) map.set(projectId, entry.token);
    }
    return map;
  }

  saveProjectTokens(tokens: Map<string, string>): void {
    const data = this.load();
    const now = Date.now();
    const obj: Record<string, YApiProjectTokenEntry> = {};
    tokens.forEach((token, projectId) => {
      obj[String(projectId)] = { token, updatedAt: now };
    });
    data.projectTokens = obj;
    this.save(data);
  }
}
