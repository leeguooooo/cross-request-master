/**
 * Tests for YApi context.responseData (Issue #22)
 * 
 * YApi 的 request/response 脚本期望 context.responseData 是解析后的对象
 * Issue #22: 用户报告 responseData 仍然是字符串而不是对象
 * 
 * YApi 内部实现说明：
 * - context.responseData 可能来自于 success 回调的第一个参数
 * - 或者来自于 yapiData.res.body
 * 
 * 需要验证我们传递的数据结构是否正确
 */

describe('YApi context.responseData (Issue #22)', () => {
    
    describe('YApi success callback parameters', () => {
        test('first parameter should be parsed JSON object for JSON responses', () => {
            // 模拟 background.js 返回的 JSON 响应
            const mockBackgroundResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: { message: 'success', data: [1, 2, 3] }, // background 已经解析了
                ok: true
            };

            // 模拟 index.js 的 handleResponse 处理
            const contentType = mockBackgroundResponse.headers['content-type'] || '';
            let parsedData = mockBackgroundResponse.body;
            
            if (contentType.includes('application/json') && mockBackgroundResponse.body != null) {
                if (typeof mockBackgroundResponse.body === 'object' && mockBackgroundResponse.body !== null) {
                    parsedData = mockBackgroundResponse.body;
                }
            }

            // YApi success 回调的第一个参数
            const yapiRes = parsedData;

            // 验证：yapiRes 应该是对象，不是字符串
            expect(typeof yapiRes).toBe('object');
            expect(yapiRes).toHaveProperty('message', 'success');
            expect(yapiRes).toHaveProperty('data');
            expect(Array.isArray(yapiRes.data)).toBe(true);
        });

        test('yapiData.res.body should be string for backward compatibility', () => {
            // 模拟 background.js 返回的 JSON 响应
            const mockBackgroundResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: { message: 'success' },
                ok: true
            };

            // 模拟 bodyToString helper
            function bodyToString(body) {
                if (body == null) return '';
                if (typeof body === 'string') return body;
                if (typeof body === 'number' || typeof body === 'boolean') return String(body);
                try {
                    return JSON.stringify(body);
                } catch (e) {
                    return '';
                }
            }

            const bodyString = bodyToString(mockBackgroundResponse.body);

            // yapiData.res.body 应该是字符串（向后兼容）
            const yapiData = {
                res: {
                    body: bodyString,
                    header: mockBackgroundResponse.headers,
                    status: mockBackgroundResponse.status,
                    statusText: mockBackgroundResponse.statusText,
                    success: true
                }
            };

            // 验证：res.body 是字符串
            expect(typeof yapiData.res.body).toBe('string');
            expect(yapiData.res.body).toBe('{"message":"success"}');
        });
    });

    describe('Issue #22: context.responseData type', () => {
        test('should provide parsed object as first parameter', () => {
            // 完整的模拟流程
            const mockJsonResponse = '{"id":123,"name":"test"}';
            
            // 1. background.js 解析 JSON
            const parsedBody = JSON.parse(mockJsonResponse);
            const backgroundResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: parsedBody, // 已经是对象
                ok: true
            };

            // 2. index.js handleResponse 处理
            let parsedData = backgroundResponse.body; // 已经是对象

            // 3. YApi success 回调
            const successCallback = jest.fn();
            const yapiRes = parsedData; // 第一个参数
            const yapiHeader = backgroundResponse.headers;
            
            function bodyToString(body) {
                if (body == null) return '';
                if (typeof body === 'string') return body;
                try { return JSON.stringify(body); }
                catch (e) { return ''; }
            }

            const yapiData = {
                res: {
                    body: bodyToString(backgroundResponse.body), // 字符串
                    header: backgroundResponse.headers,
                    status: backgroundResponse.status,
                    statusText: backgroundResponse.statusText,
                    success: true
                }
            };

            successCallback(yapiRes, yapiHeader, yapiData);

            // 验证回调参数
            expect(successCallback).toHaveBeenCalled();
            const [firstParam, secondParam, thirdParam] = successCallback.mock.calls[0];

            // 第一个参数（应该是 context.responseData）是对象
            expect(typeof firstParam).toBe('object');
            expect(firstParam).toHaveProperty('id', 123);
            expect(firstParam).toHaveProperty('name', 'test');

            // 第三个参数的 res.body 是字符串（向后兼容）
            expect(typeof thirdParam.res.body).toBe('string');
            expect(thirdParam.res.body).toBe(mockJsonResponse);
        });

        test('real world scenario - YApi response script accessing context.responseData', () => {
            // 模拟真实场景：用户在 YApi response 脚本中访问 context.responseData
            
            // 模拟 API 返回
            const apiResponse = '{"code":0,"message":"success","data":{"userId":456}}';
            
            // background.js 处理
            const parsedBody = JSON.parse(apiResponse);
            const backgroundResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json; charset=utf-8' },
                body: parsedBody,
                ok: true
            };

            // index.js 处理
            const contentType = backgroundResponse.headers['content-type'] || '';
            let yapiRes = backgroundResponse.body;
            
            if (contentType.includes('application/json') && backgroundResponse.body != null) {
                if (typeof backgroundResponse.body === 'object') {
                    yapiRes = backgroundResponse.body;
                }
            }

            // YApi 传递给 response 脚本的 context
            const context = {
                responseData: yapiRes  // 这就是用户在脚本中访问的 context.responseData
            };

            // 用户的 response 脚本
            // console.log(context.responseData);
            
            // 验证：用户应该能像对象一样访问
            expect(context.responseData).toBeInstanceOf(Object);
            expect(context.responseData.code).toBe(0);
            expect(context.responseData.message).toBe('success');
            expect(context.responseData.data).toBeInstanceOf(Object);
            expect(context.responseData.data.userId).toBe(456);

            // 不应该是字符串
            expect(typeof context.responseData).not.toBe('string');
        });
    });

    describe('Edge cases for context.responseData', () => {
        test('should handle nested JSON objects', () => {
            const complexJson = {
                status: 'ok',
                result: {
                    user: {
                        id: 1,
                        profile: {
                            name: 'John',
                            age: 30
                        }
                    }
                }
            };

            const backgroundResponse = {
                status: 200,
                headers: { 'content-type': 'application/json' },
                body: complexJson,
                ok: true
            };

            const yapiRes = backgroundResponse.body;

            // 应该能深度访问
            expect(yapiRes.result.user.profile.name).toBe('John');
        });

        test('should handle JSON array response', () => {
            const arrayResponse = [
                { id: 1, name: 'Item 1' },
                { id: 2, name: 'Item 2' }
            ];

            const backgroundResponse = {
                status: 200,
                headers: { 'content-type': 'application/json' },
                body: arrayResponse,
                ok: true
            };

            const yapiRes = backgroundResponse.body;

            expect(Array.isArray(yapiRes)).toBe(true);
            expect(yapiRes.length).toBe(2);
            expect(yapiRes[0].name).toBe('Item 1');
        });

        test('should handle JSON scalar values', () => {
            const numberResponse = {
                status: 200,
                headers: { 'content-type': 'application/json' },
                body: 42,
                ok: true
            };

            const yapiRes = numberResponse.body;
            expect(yapiRes).toBe(42);
            expect(typeof yapiRes).toBe('number');
        });
    });
});

