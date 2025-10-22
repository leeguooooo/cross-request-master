/**
 * Tests for YApi context.responseData (Issue #22)
 * 
 * YApi 的 request/response 脚本期望 context.responseData 是解析后的对象
 * Issue #22: 用户报告 responseData 仍然是字符串而不是对象
 * 
 * 这些测试直接调用生产代码的实际函数，确保真实的回归保护
 */

// Import real helpers from production code
const { bodyToString } = require('../src/helpers/body-parser.js');
const { buildYapiCallbackParams, processBackgroundResponse } = require('../src/helpers/response-handler.js');

describe('YApi context.responseData (Issue #22)', () => {
    
    describe('bodyToString helper - used for yapiData.res.body', () => {
        test('should convert object to JSON string', () => {
            const obj = { message: 'success', code: 0 };
            const result = bodyToString(obj);
            
            expect(typeof result).toBe('string');
            expect(result).toBe('{"message":"success","code":0}');
        });

        test('should preserve string as-is', () => {
            const str = '{"message":"success"}';
            const result = bodyToString(str);
            
            expect(result).toBe(str);
        });

        test('should convert null to empty string', () => {
            expect(bodyToString(null)).toBe('');
        });

        test('should convert undefined to empty string', () => {
            expect(bodyToString(undefined)).toBe('');
        });

        test('should preserve number zero', () => {
            expect(bodyToString(0)).toBe('0');
        });

        test('should preserve boolean false', () => {
            expect(bodyToString(false)).toBe('false');
        });
    });

    describe('processBackgroundResponse - production function', () => {
        test('should parse JSON response body correctly', () => {
            // Simulate what background.js returns
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: { message: 'success', data: [1, 2, 3] }, // Already parsed
                ok: true
            };

            // Call REAL production function
            const processed = processBackgroundResponse(mockResponse);

            // Verify: data is the parsed object
            expect(processed.data).toEqual({ message: 'success', data: [1, 2, 3] });
            expect(typeof processed.data).toBe('object');
            expect(Array.isArray(processed.data.data)).toBe(true);
            
            // Verify: body is string (backward compat)
            expect(typeof processed.body).toBe('string');
            expect(processed.body).toBe('{"message":"success","data":[1,2,3]}');
        });

        test('should handle string body by parsing it', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: '{"id":123}', // String that needs parsing
                ok: true
            };

            // Call REAL production function
            const processed = processBackgroundResponse(mockResponse);

            expect(processed.data).toEqual({ id: 123 });
            expect(typeof processed.data).toBe('object');
        });

        test('should handle non-JSON responses', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'text/plain' },
                body: 'Hello World',
                ok: true
            };

            // Call REAL production function
            const processed = processBackgroundResponse(mockResponse);

            // Non-JSON should keep body as-is
            expect(processed.data).toBe('Hello World');
            expect(processed.body).toBe('Hello World');
        });
    });

    describe('buildYapiCallbackParams - production function', () => {
        test('should build correct YApi callback parameters for JSON response', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: { message: 'success', code: 0 },
                data: { message: 'success', code: 0 }, // processBackgroundResponse would have set this
                ok: true
            };

            // Call REAL production function that builds YApi params
            const { yapiRes, yapiHeader, yapiData } = buildYapiCallbackParams(mockResponse);

            // yapiRes (first param) should be the parsed object
            expect(typeof yapiRes).toBe('object');
            expect(yapiRes).toEqual({ message: 'success', code: 0 });

            // yapiHeader (second param) should be headers
            expect(yapiHeader).toEqual({ 'content-type': 'application/json' });

            // yapiData.res.body (third param) should be string
            expect(typeof yapiData.res.body).toBe('string');
            expect(yapiData.res.body).toBe('{"message":"success","code":0}');
            
            // Verify it can be parsed back
            const reparsed = JSON.parse(yapiData.res.body);
            expect(reparsed.message).toBe('success');
        });

        test('should handle response with missing data field', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: { id: 456 }, // No data field, will use body
                ok: true
            };

            // Call REAL production function
            const { yapiRes, yapiHeader, yapiData } = buildYapiCallbackParams(mockResponse);

            // Should fall back to body
            expect(yapiRes).toEqual({ id: 456 });
            expect(typeof yapiRes).toBe('object');
        });
    });

    describe('Complete integration tests using production functions', () => {
        test('full flow: background response -> processed response -> YApi params', () => {
            // 1. Simulate background.js returning parsed JSON
            const backgroundResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: { id: 123, name: 'test', data: { userId: 456 } },
                ok: true
            };

            // 2. Call REAL processBackgroundResponse (what handleResponse does)
            const processed = processBackgroundResponse(backgroundResponse);
            
            // Verify processed response
            expect(processed.data).toEqual({ id: 123, name: 'test', data: { userId: 456 } });
            expect(typeof processed.data).toBe('object');
            expect(processed.data.data.userId).toBe(456);

            // 3. Call REAL buildYapiCallbackParams (what success callback prep does)
            const { yapiRes, yapiHeader, yapiData } = buildYapiCallbackParams(processed);

            // Verify YApi callback params
            expect(typeof yapiRes).toBe('object');
            expect(yapiRes).toHaveProperty('id', 123);
            expect(yapiRes.data.userId).toBe(456);
            
            expect(typeof yapiData.res.body).toBe('string');
            expect(yapiData.res.body).toContain('"id":123');
            
            // Can be reparsed
            const reparsed = JSON.parse(yapiData.res.body);
            expect(reparsed.id).toBe(123);
        });

        test('nested objects flow through production code correctly', () => {
            const backgroundResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: {
                    status: 'ok',
                    result: {
                        user: {
                            id: 1,
                            profile: { name: 'John', age: 30 }
                        }
                    }
                },
                ok: true
            };

            // Use REAL production pipeline
            const processed = processBackgroundResponse(backgroundResponse);
            const { yapiRes, yapiData } = buildYapiCallbackParams(processed);
            
            // Verify nested access works
            expect(yapiRes.result.user.profile.name).toBe('John');
            
            // Verify string conversion
            const parsed = JSON.parse(yapiData.res.body);
            expect(parsed.result.user.profile.name).toBe('John');
        });

        test('array responses flow through production code correctly', () => {
            const backgroundResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: [
                    { id: 1, name: 'Item 1' },
                    { id: 2, name: 'Item 2' }
                ],
                ok: true
            };

            // Use REAL production pipeline
            const processed = processBackgroundResponse(backgroundResponse);
            const { yapiRes, yapiData } = buildYapiCallbackParams(processed);
            
            expect(Array.isArray(yapiRes)).toBe(true);
            expect(yapiRes[0].name).toBe('Item 1');
            
            const parsed = JSON.parse(yapiData.res.body);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed[0].name).toBe('Item 1');
        });
    });

    describe('Regression tests for Issue #22 using production code', () => {
        test('context.responseData should be object not string - using REAL functions', () => {
            // This is what Issue #22 reported: responseData was a string
            // Test the actual fix using production functions
            const backgroundResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json; charset=utf-8' },
                body: { code: 0, message: 'success', data: { userId: 456 } },
                ok: true
            };

            // Call REAL production functions
            const processed = processBackgroundResponse(backgroundResponse);
            const { yapiRes } = buildYapiCallbackParams(processed);

            // YApi passes yapiRes as context.responseData
            const context = { responseData: yapiRes };

            // User's response script should be able to access as object
            expect(context.responseData).toBeInstanceOf(Object);
            expect(context.responseData.code).toBe(0);
            expect(context.responseData.message).toBe('success');
            expect(context.responseData.data).toBeInstanceOf(Object);
            expect(context.responseData.data.userId).toBe(456);
            
            // Critical: should NOT be a string
            expect(typeof context.responseData).not.toBe('string');
        });

        test('regression protection: if production code changes, this test fails', () => {
            // This test will FAIL if processBackgroundResponse stops parsing JSON
            const backgroundResponse = {
                status: 200,
                headers: { 'content-type': 'application/json' },
                body: '{"broken":"if this stays string"}', // Should be parsed
                ok: true
            };

            const processed = processBackgroundResponse(backgroundResponse);
            
            // If production code regresses and stops parsing, this will fail
            expect(typeof processed.data).toBe('object');
            expect(processed.data).toHaveProperty('broken');
        });
    });
});

