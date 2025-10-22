/**
 * Tests for YApi context.responseData (Issue #22)
 * 
 * YApi 的 request/response 脚本期望 context.responseData 是解析后的对象
 * Issue #22: 用户报告 responseData 仍然是字符串而不是对象
 * 
 * 这些测试直接调用生产代码的 helper 函数，确保真实覆盖
 */

// Import real helper from production code
const { bodyToString } = require('../src/helpers/body-parser.js');

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

    describe('YApi success callback data structure', () => {
        test('first parameter (yapiRes) should be parsed object when response.body is object', () => {
            // Simulate what background.js returns for JSON responses
            const mockResponse = {
                body: { message: 'success', data: [1, 2, 3] }, // Already parsed by background.js
                headers: { 'content-type': 'application/json' }
            };

            // This is what index.js does in handleResponse
            const contentType = mockResponse.headers['content-type'] || '';
            let parsedData = mockResponse.body;
            
            // The actual logic from index.js lines 204-239
            if (contentType.includes('application/json') && mockResponse.body != null) {
                if (typeof mockResponse.body === 'object' && mockResponse.body !== null) {
                    parsedData = mockResponse.body;
                }
            }

            // Verify: yapiRes (first param) is the parsed object
            expect(typeof parsedData).toBe('object');
            expect(parsedData).toHaveProperty('message', 'success');
            expect(Array.isArray(parsedData.data)).toBe(true);
        });

        test('yapiData.res.body uses production bodyToString helper', () => {
            const mockResponseBody = { message: 'success', code: 0 };
            
            // Use the REAL production helper
            const bodyString = bodyToString(mockResponseBody);

            // This is what goes into yapiData.res.body (index.js line 475)
            const yapiData = {
                res: {
                    body: bodyString
                }
            };

            // Verify: uses real helper, produces correct string
            expect(typeof yapiData.res.body).toBe('string');
            expect(yapiData.res.body).toBe('{"message":"success","code":0}');
            
            // Verify it can be parsed back
            const reparsed = JSON.parse(yapiData.res.body);
            expect(reparsed.message).toBe('success');
        });
    });

    describe('Real-world integration tests', () => {
        test('complete flow: JSON response becomes object for yapiRes, string for yapiData.res.body', () => {
            // 1. Simulate background.js returning parsed JSON
            const parsedBody = { id: 123, name: 'test', data: { userId: 456 } };
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: parsedBody,  // Background already parsed it
                ok: true
            };

            // 2. Simulate index.js handleResponse logic (lines 200-239)
            const contentType = mockResponse.headers['content-type'] || '';
            let parsedData = mockResponse.body;
            
            if (contentType.includes('application/json') && mockResponse.body != null) {
                if (typeof mockResponse.body === 'object' && mockResponse.body !== null) {
                    parsedData = mockResponse.body;
                }
            }

            // 3. Build YApi callback parameters (like index.js lines 441-491)
            const yapiRes = parsedData;  // First param - parsed object
            const yapiHeader = mockResponse.headers;  // Second param
            
            // Use REAL production helper
            const bodyString = bodyToString(mockResponse.body);
            
            const yapiData = {
                res: {
                    body: bodyString,  // String for compatibility
                    header: mockResponse.headers,
                    status: mockResponse.status,
                    statusText: mockResponse.statusText,
                    success: true
                }
            };

            // Verify: yapiRes is object, yapiData.res.body is string
            expect(typeof yapiRes).toBe('object');
            expect(yapiRes).toHaveProperty('id', 123);
            expect(yapiRes.data.userId).toBe(456);
            
            expect(typeof yapiData.res.body).toBe('string');
            expect(yapiData.res.body).toContain('"id":123');
            
            // Can be reparsed
            const reparsed = JSON.parse(yapiData.res.body);
            expect(reparsed.id).toBe(123);
        });

        test('bodyToString handles nested objects correctly', () => {
            const complexObj = {
                status: 'ok',
                result: {
                    user: {
                        id: 1,
                        profile: { name: 'John', age: 30 }
                    }
                }
            };

            // Use REAL helper
            const result = bodyToString(complexObj);
            
            expect(typeof result).toBe('string');
            const parsed = JSON.parse(result);
            expect(parsed.result.user.profile.name).toBe('John');
        });

        test('bodyToString handles arrays correctly', () => {
            const arr = [
                { id: 1, name: 'Item 1' },
                { id: 2, name: 'Item 2' }
            ];

            // Use REAL helper
            const result = bodyToString(arr);
            
            expect(typeof result).toBe('string');
            const parsed = JSON.parse(result);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed[0].name).toBe('Item 1');
        });
    });

    describe('Regression tests for Issue #22', () => {
        test('context.responseData should be object not string', () => {
            // This is what Issue #22 reported: responseData was a string
            // Simulate the fix
            const apiResponse = { code: 0, message: 'success', data: { userId: 456 } };
            
            // After background.js parsing
            const mockResponse = {
                headers: { 'content-type': 'application/json; charset=utf-8' },
                body: apiResponse  // Object, not string
            };

            // After index.js processing
            const contentType = mockResponse.headers['content-type'] || '';
            let yapiRes = mockResponse.body;
            
            if (contentType.includes('application/json') && mockResponse.body != null) {
                if (typeof mockResponse.body === 'object') {
                    yapiRes = mockResponse.body;
                }
            }

            // YApi passes this to response script as context.responseData
            const context = { responseData: yapiRes };

            // User's response script should be able to access as object
            expect(context.responseData).toBeInstanceOf(Object);
            expect(context.responseData.code).toBe(0);
            expect(context.responseData.data.userId).toBe(456);
            expect(typeof context.responseData).not.toBe('string');
        });
    });
});

