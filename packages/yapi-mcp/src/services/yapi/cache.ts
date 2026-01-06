import * as fs from 'fs';
import * as os from "os";
import * as path from 'path';
import crypto from "crypto";
import { ProjectInfo } from './types';
import { Logger } from './logger';

/**
 * 缓存数据结构
 */
interface CacheData<T> {
  version: number;
  timestamp: number; // 时间戳，缓存创建时间
  data: T;
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

/**
 * 项目信息缓存管理器
 */
export class ProjectInfoCache {
  private readonly cacheFilePath: string;
  private readonly logger: Logger;
  private readonly cacheTTLMinutes: number;
  private lastCacheMtimeMs: number | null = null;
  private lastCacheData: CacheData<Record<string, ProjectInfo>> | null = null;
  
  constructor(baseUrl: string, cacheTTLMinutes: number = 10, logLevel: string = "info") {
    const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
    const cacheDir = path.join(os.homedir(), ".yapi-mcp");
    ensureDirSecure(cacheDir);

    const suffix = normalizedBaseUrl ? `-${hashBaseUrl(normalizedBaseUrl)}` : "";
    this.cacheFilePath = path.join(cacheDir, `project-info${suffix}.json`);
    this.logger = new Logger("YApi Cache", logLevel);
    this.cacheTTLMinutes = cacheTTLMinutes;
  }

  private readCacheData(): CacheData<Record<string, ProjectInfo>> | null {
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        this.lastCacheMtimeMs = null;
        this.lastCacheData = null;
        return null;
      }
      const stat = fs.statSync(this.cacheFilePath);
      const mtimeMs = stat.mtimeMs;
      if (this.lastCacheData && this.lastCacheMtimeMs === mtimeMs) return this.lastCacheData;

      const cacheContent = fs.readFileSync(this.cacheFilePath, "utf8");
      const parsed = JSON.parse(cacheContent) as CacheData<Record<string, ProjectInfo>>;
      if (!parsed || !parsed.timestamp || !parsed.data) return null;

      this.lastCacheMtimeMs = mtimeMs;
      this.lastCacheData = parsed;
      return parsed;
    } catch (error) {
      this.logger.error("读取项目信息缓存失败:", error);
      this.lastCacheMtimeMs = null;
      this.lastCacheData = null;
      return null;
    }
  }
  
  /**
   * 清除缓存文件，使其重新从服务器获取数据
   */
  clearCache(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        fs.unlinkSync(this.cacheFilePath);
        this.lastCacheMtimeMs = null;
        this.lastCacheData = null;
        this.logger.info(`已清除YApi项目信息缓存: ${this.cacheFilePath}`);
      }
    } catch (error) {
      this.logger.error('清除YApi项目信息缓存失败:', error);
    }
  }
  
  /**
   * 保存项目信息到缓存文件
   * @param projectInfo 项目信息映射
   */
  saveToCache(projectInfo: Map<string, ProjectInfo>): void {
    try {
      // 将 Map 转换为对象
      const cacheObject: Record<string, ProjectInfo> = {};
      projectInfo.forEach((info, id) => {
        cacheObject[id] = info;
      });
      
      // 创建缓存数据结构
      const cacheData: CacheData<Record<string, ProjectInfo>> = {
        version: 1,
        timestamp: Date.now(),
        data: cacheObject
      };
      
      // 写入文件
      writeFileAtomicSync(this.cacheFilePath, JSON.stringify(cacheData, null, 2), { mode: 0o600 });
      this.lastCacheData = cacheData;
      try {
        this.lastCacheMtimeMs = fs.statSync(this.cacheFilePath).mtimeMs;
      } catch {
        this.lastCacheMtimeMs = null;
      }
      
      this.logger.info(`项目信息已缓存到: ${this.cacheFilePath}`);
    } catch (error) {
      this.logger.error('保存项目信息缓存失败:', error);
    }
  }
  
  /**
   * 检查缓存是否已过期
   * @returns 是否已过期
   */
  isCacheExpired(): boolean {
    try {
      const cacheData = this.readCacheData();
      if (!cacheData) {
        this.logger.debug('缓存文件不存在，视为已过期');
        return true;
      }
      
      // 检查缓存数据结构
      if (!cacheData || !cacheData.timestamp) {
        this.logger.debug('缓存文件格式无效，视为已过期');
        return true;
      }
      
      // 计算过期时间
      const expirationTime = cacheData.timestamp + (this.cacheTTLMinutes * 60 * 1000);
      const currentTime = Date.now();
      
      // 判断是否过期
      const isExpired = currentTime > expirationTime;
      
      if (isExpired) {
        this.logger.debug(`缓存已过期，生成时间: ${new Date(cacheData.timestamp).toLocaleString()}, 有效期: ${this.cacheTTLMinutes} 分钟`);
      } else {
        const remainingMinutes = Math.floor((expirationTime - currentTime) / (60 * 1000));
        this.logger.debug(`缓存有效，剩余时间: ${remainingMinutes} 分钟`);
      }
      
      return isExpired;
    } catch (error) {
      this.logger.error('检查缓存过期时出错:', error);
      return true; // 出错时视为已过期
    }
  }
  
  /**
   * 从缓存文件加载项目信息
   * @returns 项目信息映射
   */
  loadFromCache(): Map<string, ProjectInfo> {
    const projectInfoMap = new Map<string, ProjectInfo>();
    
    try {
      const cacheData = this.readCacheData();
      if (cacheData) {
        
        // 检查缓存是否过期
        if (this.isCacheExpired()) {
          this.logger.info('项目信息缓存已过期，将使用空缓存并在后台异步更新');
          return projectInfoMap;
        }
        
        // 将对象转换回 Map
        if (cacheData && cacheData.data) {
          Object.entries(cacheData.data).forEach(([id, info]) => {
            projectInfoMap.set(id, info);
          });
          
          this.logger.info(`已从缓存加载 ${projectInfoMap.size} 个项目信息，缓存生成时间: ${new Date(cacheData.timestamp).toLocaleString()}`);
        } else {
          this.logger.warn('项目信息缓存文件格式无效');
        }
      } else {
        this.logger.info('项目信息缓存文件不存在，将创建新缓存');
      }
    } catch (error) {
      this.logger.error('加载项目信息缓存失败:', error);
    }
    
    return projectInfoMap;
  }
} 
