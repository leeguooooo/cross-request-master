/**
 * Tests for YApi OpenAPI helper (Yapi-MCP compatible tools)
 *
 * These tests import REAL production helper code.
 */

const {
  createYapiOpenApiClient,
  parseYapiTokenConfig,
  joinUrl
} = require('../src/helpers/yapi-openapi.js');

describe('yapi-openapi helper', () => {
  test('parseYapiTokenConfig should support projectId:token pairs and default token', () => {
    const cfg = parseYapiTokenConfig('28:tok1, 29:tok2');
    expect(cfg.tokenMap.size).toBe(2);
    expect(cfg.tokenMap.get('28')).toBe('tok1');
    expect(cfg.tokenMap.get('29')).toBe('tok2');
    expect(cfg.defaultToken).toBe('');

    const cfg2 = parseYapiTokenConfig('tokonly');
    expect(cfg2.tokenMap.size).toBe(0);
    expect(cfg2.defaultToken).toBe('tokonly');

    const cfg3 = parseYapiTokenConfig('28:tok1, tokonly');
    expect(cfg3.tokenMap.get('28')).toBe('tok1');
    expect(cfg3.defaultToken).toBe('tokonly');
  });

  test('joinUrl should join baseUrl and endpointPath safely', () => {
    expect(joinUrl('https://yapi.example.com/', '/api/interface/get')).toBe(
      'https://yapi.example.com/api/interface/get'
    );
    expect(joinUrl('https://yapi.example.com', 'api/interface/get')).toBe(
      'https://yapi.example.com/api/interface/get'
    );
  });

  test('client should call YApi endpoints with token in params/body', async () => {
    const calls = [];
    const fetchFn = async (options) => {
      calls.push(options);

      if (options.url.endsWith('/api/interface/get')) {
        return { data: { errcode: 0, data: { ok: true, id: options.data.id } } };
      }

      if (options.url.endsWith('/api/interface/add') || options.url.endsWith('/api/interface/up')) {
        return { data: { errcode: 0, data: { saved: true, body: options.body } } };
      }

      if (options.url.endsWith('/api/project/get')) {
        return { data: { errcode: 0, data: { name: 'demo', _id: options.data.id } } };
      }

      return { data: { errcode: 0, data: {} } };
    };

    const client = createYapiOpenApiClient(fetchFn, {
      baseUrl: 'https://yapi.example.com',
      token: '28:tok1'
    });

    const desc = await client.yapi_get_api_desc({ projectId: '28', apiId: '66' });
    expect(desc).toEqual({ ok: true, id: '66' });
    expect(calls[0]).toMatchObject({
      url: 'https://yapi.example.com/api/interface/get',
      method: 'GET',
      data: { id: '66', token: 'tok1' }
    });

    const saved = await client.yapi_save_api({
      projectId: '28',
      catid: '1',
      title: 't',
      path: '/p',
      method: 'GET'
    });
    expect(saved.saved).toBe(true);
    expect(calls[1]).toMatchObject({
      url: 'https://yapi.example.com/api/interface/add',
      method: 'POST'
    });
    expect(calls[1].body).toMatchObject({
      catid: '1',
      title: 't',
      path: '/p',
      method: 'GET',
      token: 'tok1'
    });
    expect(calls[1].body.projectId).toBeUndefined();

    await client.yapi_save_api({
      projectId: '28',
      id: '66',
      catid: '1',
      title: 't2',
      path: '/p2',
      method: 'POST'
    });
    expect(calls[2].url).toBe('https://yapi.example.com/api/interface/up');

    const projects = await client.yapi_list_projects();
    expect(projects).toHaveLength(1);
    expect(projects[0].projectId).toBe('28');
    expect(calls[3]).toMatchObject({
      url: 'https://yapi.example.com/api/project/get',
      method: 'GET',
      data: { id: '28', token: 'tok1' }
    });
  });
});

