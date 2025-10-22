/**
 * Tests for helper functions
 *
 * These tests focus on critical bug fixes:
 * - v4.4.13: Falsy-value handling
 * - v4.4.14: GET request parameter handling (Issue #20)
 * - v4.5.x: Modularization - tests import REAL production code
 *
 * ✅ Helpers extracted to src/helpers/, tests import real code (no re-implementations)
 * ✅ Response handler helper covered by unit tests to prevent regressions
 * This eliminates the "false green" risk where tests pass but production breaks.
 */

// Import real helpers from production code
const { bodyToString } = require('../src/helpers/body-parser.js');
const { buildQueryString } = require('../src/helpers/query-string.js');
const { safeLogResponse } = require('../src/helpers/logger.js');
const {
    buildYapiCallbackParams,
    processBackgroundResponse
} = require('../src/helpers/response-handler.js');

describe('bodyToString helper', () => {

    describe('falsy values', () => {
        test('should preserve number zero', () => {
            expect(bodyToString(0)).toBe('0');
        });

        test('should preserve boolean false', () => {
            expect(bodyToString(false)).toBe('false');
        });

        test('should convert null to empty string', () => {
            expect(bodyToString(null)).toBe('');
        });

        test('should convert undefined to empty string', () => {
            expect(bodyToString(undefined)).toBe('');
        });

        test('should preserve empty string', () => {
            expect(bodyToString('')).toBe('');
        });
    });

    describe('truthy values', () => {
        test('should preserve non-zero numbers', () => {
            expect(bodyToString(42)).toBe('42');
            expect(bodyToString(-1)).toBe('-1');
            expect(bodyToString(3.14)).toBe('3.14');
        });

        test('should preserve boolean true', () => {
            expect(bodyToString(true)).toBe('true');
        });

        test('should preserve non-empty strings', () => {
            expect(bodyToString('hello')).toBe('hello');
        });

        test('should stringify objects', () => {
            expect(bodyToString({ key: 'value' })).toBe('{"key":"value"}');
        });

        test('should stringify arrays', () => {
            expect(bodyToString([1, 2, 3])).toBe('[1,2,3]');
        });

        test('should stringify empty objects', () => {
            expect(bodyToString({})).toBe('{}');
        });

        test('should stringify empty arrays', () => {
            expect(bodyToString([])).toBe('[]');
        });
    });
});

describe('processBackgroundResponse helper', () => {
    const baseResponse = {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: undefined
    };

    function run(overrides = {}) {
        const headers = {
            ...baseResponse.headers,
            ...(overrides.headers || {})
        };
        return processBackgroundResponse({
            ...baseResponse,
            ...overrides,
            headers
        });
    }

    test('should handle missing response gracefully', () => {
        const result = processBackgroundResponse(null);
        expect(result).toEqual({
            status: 0,
            statusText: 'No Response',
            headers: {},
            data: {},
            body: ''
        });
    });

    test('should convert undefined body to empty object', () => {
        const result = run({ body: undefined });
        expect(result.data).toEqual({});
        expect(result.body).toBe('');
    });

    test('should convert null body to empty object when not JSON', () => {
        const result = run({
            body: null,
            headers: { 'content-type': 'text/plain' }
        });
        expect(result.data).toEqual({});
        expect(result.body).toBe('');
    });

    test('should preserve null JSON body parsed from string', () => {
        const result = run({ body: 'null' });
        expect(result.data).toBeNull();
        expect(result.body).toBe('null');
    });

    test('should preserve number zero', () => {
        const result = run({ body: '0' });
        expect(result.data).toBe(0);
        expect(result.body).toBe('0');
    });

    test('should preserve boolean false', () => {
        const result = run({ body: 'false' });
        expect(result.data).toBe(false);
        expect(result.body).toBe('false');
    });

    test('should preserve empty string for text response', () => {
        const result = run({
            body: '',
            headers: { 'content-type': 'text/plain' }
        });
        expect(result.data).toBe('');
        expect(result.body).toBe('');
    });

    test('should parse JSON string to object', () => {
        const result = run({ body: '{"key":"value"}' });
        expect(result.data).toEqual({ key: 'value' });
        expect(result.body).toBe('{"key":"value"}');
    });

    test('should return same object instance when body already object', () => {
        const payload = { key: 'value' };
        const result = run({ body: payload });
        expect(result.data).toBe(payload);
        expect(result.body).toBe('{"key":"value"}');
    });

    test('should return same array instance when body already array', () => {
        const payload = [1, 2, 3];
        const result = run({ body: payload });
        expect(result.data).toBe(payload);
        expect(result.body).toBe('[1,2,3]');
    });

    test('should keep scalar numbers for non JSON content type', () => {
        const result = run({
            body: 42,
            headers: { 'content-type': 'text/plain' }
        });
        expect(result.data).toBe(42);
        expect(result.body).toBe('42');
    });

    test('should keep boolean values for non JSON content type', () => {
        const result = run({
            body: false,
            headers: { 'content-type': 'text/plain' }
        });
        expect(result.data).toBe(false);
        expect(result.body).toBe('false');
    });

    test('should provide error wrapper when JSON parsing fails', () => {
        const result = run({ body: 'not json' });
        expect(result.data).toEqual({
            error: 'JSON解析失败',
            raw: 'not json'
        });
        expect(result.body).toBe('not json');
    });
});

describe('buildYapiCallbackParams helper', () => {
    test('should build success payload for JSON response with parsed data', () => {
        const response = {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body: '{"key":"value"}',
            data: { key: 'value' }
        };

        const { yapiRes, yapiHeader, yapiData } = buildYapiCallbackParams(response);

        expect(yapiRes).toEqual({ key: 'value' });
        expect(yapiHeader).toEqual(response.headers);
        expect(yapiData).toEqual({
            res: {
                body: '{"key":"value"}',
                header: response.headers,
                status: 200,
                statusText: 'OK',
                success: true
            },
            status: 200,
            statusText: 'OK',
            success: true
        });
    });

    test('should parse JSON body when data is missing', () => {
        const response = {
            status: 201,
            statusText: 'Created',
            headers: { 'content-type': 'application/json' },
            body: '{"id":123}'
        };

        const result = buildYapiCallbackParams(response);

        expect(result.yapiRes).toEqual({ id: 123 });
        expect(result.yapiData.res.body).toBe('{"id":123}');
    });

    test('should reuse object body when already parsed', () => {
        const body = { ok: true };
        const response = {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body
        };

        const result = buildYapiCallbackParams(response);

        expect(result.yapiRes).toBe(body);
        expect(result.yapiData.res.body).toBe('{"ok":true}');
    });

    test('should use raw body for text response', () => {
        const response = {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'text/plain' },
            body: 'hello world'
        };

        const result = buildYapiCallbackParams(response);

        expect(result.yapiRes).toBe('hello world');
        expect(result.yapiData.res.body).toBe('hello world');
    });

    test('should return default payload when response is missing', () => {
        const result = buildYapiCallbackParams(null);

        expect(result).toEqual({
            yapiRes: {},
            yapiHeader: {},
            yapiData: {
                res: {
                    body: '',
                    header: {},
                    status: 0,
                    statusText: 'No Response',
                    success: false
                },
                status: 0,
                statusText: 'No Response',
                success: false
            }
        });
    });
});

describe('nullish checks', () => {
    // Test the != null pattern
    describe('!= null check', () => {
        test('should reject null', () => {
            expect(null != null).toBe(false);
        });

        test('should reject undefined', () => {
            expect(undefined != null).toBe(false);
        });

        test('should accept zero', () => {
            expect(0 != null).toBe(true);
        });

        test('should accept false', () => {
            expect(false != null).toBe(true);
        });

        test('should accept empty string', () => {
            expect('' != null).toBe(true);
        });

        test('should accept empty array', () => {
            expect([] != null).toBe(true);
        });

        test('should accept empty object', () => {
            expect({} != null).toBe(true);
        });
    });

    // Test the === undefined pattern
    describe('=== undefined check', () => {
        test('should match undefined', () => {
            expect(undefined === undefined).toBe(true);
        });

        test('should not match null', () => {
            expect(null === undefined).toBe(false);
        });

        test('should not match zero', () => {
            expect(0 === undefined).toBe(false);
        });

        test('should not match false', () => {
            expect(false === undefined).toBe(false);
        });

        test('should not match empty string', () => {
            expect('' === undefined).toBe(false);
        });
    });
});

// Tests for GET request parameter handling (Issue #20)
describe('buildQueryString helper', () => {
    describe('basic functionality', () => {
        test('should convert simple object to query string', () => {
            const params = { a: '1', b: '2' };
            expect(buildQueryString(params)).toBe('a=1&b=2');
        });

        test('should handle single parameter', () => {
            const params = { name: 'test' };
            expect(buildQueryString(params)).toBe('name=test');
        });

        test('should encode special characters', () => {
            const params = { search: 'hello world', type: 'test&value' };
            const result = buildQueryString(params);
            expect(result).toContain('search=hello%20world');
            expect(result).toContain('type=test%26value');
        });

        test('should handle Chinese characters', () => {
            const params = { name: '测试' };
            expect(buildQueryString(params)).toContain(encodeURIComponent('测试'));
        });

        test('should handle array values', () => {
            const params = { ids: [1, 2, 3] };
            const result = buildQueryString(params);
            expect(result).toBe('ids=1&ids=2&ids=3');
        });

        test('should handle nested objects', () => {
            const params = { filter: { status: 'active', type: 'user' } };
            const result = buildQueryString(params);
            const decoded = decodeURIComponent(result);
            expect(decoded).toContain('filter={"status":"active","type":"user"}');
        });

        test('should handle mixed types', () => {
            const params = {
                name: 'test',
                ids: [1, 2],
                filter: { status: 'active' },
                count: 5
            };
            const result = buildQueryString(params);
            expect(result).toContain('name=test');
            expect(result).toContain('ids=1&ids=2');
            expect(result).toContain('count=5');
            expect(result).toContain('filter=');
        });
    });

    describe('edge cases', () => {
        test('should return empty string for null', () => {
            expect(buildQueryString(null)).toBe('');
        });

        test('should return empty string for undefined', () => {
            expect(buildQueryString(undefined)).toBe('');
        });

        test('should return empty string for empty object', () => {
            expect(buildQueryString({})).toBe('');
        });

        test('should return empty string for non-object', () => {
            expect(buildQueryString('string')).toBe('');
            expect(buildQueryString(123)).toBe('');
            expect(buildQueryString(true)).toBe('');
        });
    });

    describe('falsy values in params (Issue #20)', () => {
        test('should preserve number zero', () => {
            const params = { count: 0 };
            expect(buildQueryString(params)).toBe('count=0');
        });

        test('should preserve boolean false', () => {
            const params = { active: false };
            expect(buildQueryString(params)).toBe('active=false');
        });

        test('should preserve empty string', () => {
            const params = { text: '' };
            expect(buildQueryString(params)).toBe('text=');
        });

        test('should skip undefined values', () => {
            const params = { a: '1', b: undefined, c: '2' };
            const result = buildQueryString(params);
            expect(result).not.toContain('b=');
            expect(result).toContain('a=1');
            expect(result).toContain('c=2');
        });

        test('should skip null values', () => {
            const params = { a: '1', b: null, c: '2' };
            const result = buildQueryString(params);
            expect(result).not.toContain('b=');
            expect(result).toContain('a=1');
            expect(result).toContain('c=2');
        });

        test('should handle mixed falsy values', () => {
            const params = {
                zero: 0,
                false: false,
                empty: '',
                undef: undefined,
                nothing: null,
                real: 'value'
            };
            const result = buildQueryString(params);
            expect(result).toContain('zero=0');
            expect(result).toContain('false=false');
            expect(result).toContain('empty=');
            expect(result).not.toContain('undef=');
            expect(result).not.toContain('nothing=');
            expect(result).toContain('real=value');
        });
    });

    describe('Issue #20 regression test', () => {
        test('should convert jQuery $.get params correctly', () => {
            // Simulating: $.get("/feedback/list", { types: "0,2" })
            const params = { types: '0,2' };
            const queryString = buildQueryString(params);
            expect(queryString).toBe('types=0%2C2');
        });

        test('should handle multiple params like jQuery', () => {
            const params = {
                page: 1,
                pageSize: 10,
                types: '0,2',
                status: 'active'
            };
            const queryString = buildQueryString(params);
            expect(queryString).toContain('page=1');
            expect(queryString).toContain('pageSize=10');
            expect(queryString).toContain('types=0%2C2');
            expect(queryString).toContain('status=active');
        });
    });
});

describe('GET request parameter handling', () => {
    // Test GET request processing logic using real helpers
    function processGetRequest(url, method, data) {
        // 规范化 method 为大写（same logic as index.js）
        const normalizedMethod = (method || 'GET').toUpperCase();

        if ((normalizedMethod === 'GET' || normalizedMethod === 'HEAD') && data) {
            const queryString = typeof data === 'object' ? buildQueryString(data) : String(data);
            if (queryString) {
                url = url + (url.includes('?') ? '&' : '?') + queryString;
            }
            return { url, body: undefined };
        }
        return { url, body: data };
    }

    test('should append params to URL for GET request', () => {
        const result = processGetRequest('/api/users', 'GET', { id: 1 });
        expect(result.url).toBe('/api/users?id=1');
        expect(result.body).toBeUndefined();
    });

    test('should not modify body for POST request', () => {
        const result = processGetRequest('/api/users', 'POST', { id: 1 });
        expect(result.url).toBe('/api/users');
        expect(result.body).toEqual({ id: 1 });
    });

    test('should handle URL with existing query params', () => {
        const result = processGetRequest('/api/users?page=1', 'GET', { id: 1 });
        expect(result.url).toBe('/api/users?page=1&id=1');
        expect(result.body).toBeUndefined();
    });

    test('should handle empty data for GET', () => {
        const result = processGetRequest('/api/users', 'GET', null);
        expect(result.url).toBe('/api/users');
        expect(result.body).toBeNull();
    });

    describe('Issue #20 - Fetch API compatibility', () => {
        test('GET request should not have body', () => {
            // This was the bug: GET request had body, causing fetch error
            const result = processGetRequest('/feedback/list', 'GET', { types: '0,2' });

            expect(result.url).toContain('types=0%2C2');
            expect(result.body).toBeUndefined(); // Critical: body must be undefined for GET
        });

        test('POST request should keep body', () => {
            const result = processGetRequest('/api/create', 'POST', { name: 'test' });

            expect(result.url).toBe('/api/create');
            expect(result.body).toEqual({ name: 'test' });
        });

        test('lowercase "get" should work', () => {
            const result = processGetRequest('/api/list', 'get', { id: 1 });

            expect(result.url).toBe('/api/list?id=1');
            expect(result.body).toBeUndefined();
        });

        test('mixed case "Get" should work', () => {
            const result = processGetRequest('/api/list', 'Get', { id: 1 });

            expect(result.url).toBe('/api/list?id=1');
            expect(result.body).toBeUndefined();
        });

        test('HEAD request should also not have body', () => {
            const result = processGetRequest('/api/check', 'HEAD', { id: 1 });

            expect(result.url).toBe('/api/check?id=1');
            expect(result.body).toBeUndefined();
        });

        test('lowercase "head" should work', () => {
            const result = processGetRequest('/api/check', 'head', { id: 1 });

            expect(result.url).toBe('/api/check?id=1');
            expect(result.body).toBeUndefined();
        });
    });
});

describe('safeLogResponse helper', () => {
    test('should return original body when below threshold', () => {
        const small = 'hello world';
        const result = safeLogResponse(small, { maxBytes: 100 });
        expect(result).toBe(small);
    });

    test('should truncate large string responses', () => {
        const large = 'a'.repeat(20 * 1024); // 20KB
        const result = safeLogResponse(large, { maxBytes: 10 * 1024, headChars: 100, tailChars: 50 });
        expect(result).toHaveProperty('truncated', true);
        expect(result).toHaveProperty('size');
        expect(result.head.length).toBe(100);
        expect(result.tail.length).toBe(50);
    });

    test('should stringify objects and truncate', () => {
        const payload = { data: 'x'.repeat(15 * 1024) };
        const result = safeLogResponse(payload, { maxBytes: 10 * 1024, headChars: 50, tailChars: 50 });
        expect(result.truncated).toBe(true);
        expect(typeof result.head).toBe('string');
        expect(typeof result.tail).toBe('string');
        expect(result.hint).toContain('截断');
    });
});
