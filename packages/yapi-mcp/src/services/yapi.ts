import axios, { AxiosError } from "axios";
import { Logger } from "./yapi/logger";

export interface ApiInterface {
  _id: string;
  title: string;
  path: string;
  method: string;
  req_params: any[];
  req_body_form: any[];
  req_headers: any[];
  req_query: any[];
  req_body_type: string;
  res_body_type: string;
  res_body: string;
  desc: string;
  markdown: string;
  // 其他可能的字段...
}

export interface GetApiResponse {
  errcode: number;
  errmsg: string;
  data: ApiInterface;
}

export class YApiService {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly logger: Logger;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.logger = new Logger("YApiService", "debug");
  }

  private async request<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    try {
      this.logger.debug(`调用 ${this.baseUrl}${endpoint}`);
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        params: {
          ...params,
          token: this.token // YApi要求在请求参数中传递token
        }
      });

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        throw {
          status: error.response.status,
          message: error.response.data.errmsg || "未知错误",
        };
      }
      throw new Error("与YApi服务器通信失败");
    }
  }

  async getApiInterface(id: string): Promise<ApiInterface> {
    try {
      // 根据YApi文档，接口需要传递id参数
      const response = await this.request<GetApiResponse>("/api/interface/get", { id });
      
      // YApi接口返回errcode为0表示成功
      if (response.errcode !== 0) {
        throw new Error(response.errmsg || "获取API接口失败");
      }
      
      return response.data;
    } catch (error) {
      console.error("获取API接口失败:", error);
      throw error;
    }
  }
} 