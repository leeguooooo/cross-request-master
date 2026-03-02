import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import axios from "axios";
import { YApiService } from "../src/services/yapi/api";

type AxiosLike = {
  get: (...args: any[]) => Promise<any>;
  post: (...args: any[]) => Promise<any>;
};

const axiosLike = axios as unknown as AxiosLike;
const originalGet = axiosLike.get;
const originalPost = axiosLike.post;

afterEach(() => {
  axiosLike.get = originalGet;
  axiosLike.post = originalPost;
});

describe("YApiService auto login", () => {
  test("deduplicates concurrent lazy logins", async () => {
    const service = new YApiService("https://yapi.example.com", "", "error");
    let loginCount = 0;
    let requestCount = 0;

    service.setCookieLoginProvider(async () => {
      loginCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "_yapi_token=token_a; _yapi_uid=1";
    });

    axiosLike.get = async () => {
      requestCount += 1;
      return { data: { errcode: 0, data: { project: [], group: [], interface: [] } } };
    };

    await Promise.all([service.globalSearch("demo"), service.globalSearch("demo")]);
    assert.equal(loginCount, 1);
    assert.equal(requestCount, 2);
  });

  test("retries once with force login when API payload says unauthenticated", async () => {
    const service = new YApiService("https://yapi.example.com", "", "error");
    const forceFlags: boolean[] = [];
    let requestCount = 0;

    service.setCookieLoginProvider(async ({ forceLogin } = {}) => {
      forceFlags.push(Boolean(forceLogin));
      return forceLogin ? "_yapi_token=fresh; _yapi_uid=1" : "_yapi_token=stale; _yapi_uid=1";
    });

    axiosLike.get = async () => {
      requestCount += 1;
      if (requestCount === 1) return { data: { errcode: 40011, errmsg: "请先登录" } };
      return { data: { errcode: 0, data: { project: [], group: [], interface: [] } } };
    };

    const result = await service.globalSearch("demo");
    assert.deepEqual(result, { project: [], group: [], interface: [] });
    assert.deepEqual(forceFlags, [false, true]);
    assert.equal(requestCount, 2);
  });

  test("retries once with force login when request throws auth-like error", async () => {
    const service = new YApiService("https://yapi.example.com", "", "error");
    const forceFlags: boolean[] = [];
    let requestCount = 0;

    service.setCookieHeader("_yapi_token=old; _yapi_uid=1");
    service.setCookieLoginProvider(async ({ forceLogin } = {}) => {
      forceFlags.push(Boolean(forceLogin));
      return "_yapi_token=new; _yapi_uid=1";
    });

    axiosLike.get = async () => {
      requestCount += 1;
      if (requestCount === 1) throw new Error("Unauthorized");
      return { data: { errcode: 0, data: { project: [], group: [], interface: [] } } };
    };

    const result = await service.globalSearch("demo");
    assert.deepEqual(result, { project: [], group: [], interface: [] });
    assert.deepEqual(forceFlags, [true]);
    assert.equal(requestCount, 2);
  });

  test("does not auto login when disabled", async () => {
    const service = new YApiService("https://yapi.example.com", "", "error", { autoLoginEnabled: false });
    let loginCount = 0;
    service.setCookieLoginProvider(async () => {
      loginCount += 1;
      return "_yapi_token=token_a; _yapi_uid=1";
    });

    await assert.rejects(async () => {
      await service.globalSearch("demo");
    }, /未配置鉴权信息/);
    assert.equal(loginCount, 0);
  });
});

