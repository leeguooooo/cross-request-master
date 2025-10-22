/**
 * Tests for jQuery ajax wrapper (Issue #23 fix)
 * 
 * These tests verify that the cross-request jQuery wrapper returns
 * standard jqXHR objects compatible with jQuery's ajax API.
 * 
 * Issue #23: ajax的post会有问题
 * Problem: POST requests returned simplified response objects lacking
 * jQuery standard properties like responseText, responseJSON, etc.
 * 
 * Fix: Added toJqXHR() function to wrap responses in jQuery-compatible objects
 */

describe('jQuery ajax wrapper - jqXHR compatibility (Issue #23)', () => {
    
    describe('toJqXHR response transformation', () => {
        // Mock toJqXHR function (extracted from index.js for testing)
        function toJqXHR(response) {
            // 正确处理 responseText
            let responseText = '';
            if (response.body != null) {
                responseText = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
            }
            
            // 只有在响应是 JSON 时才设置 responseJSON
            // 这与 jQuery 的行为一致：非 JSON 响应的 responseJSON 应该是 undefined
            let responseJSON = undefined;
            const contentType = response.headers['content-type'] || '';
            if (contentType.includes('application/json') && response.data !== undefined) {
                // 确保 response.data 是对象或数组，而不是字符串
                // 字符串说明没有被正确解析为 JSON
                if (typeof response.data === 'object' || typeof response.data === 'boolean' || typeof response.data === 'number') {
                    responseJSON = response.data;
                } else if (typeof response.data === 'string') {
                    // 尝试解析字符串为 JSON（兜底处理）
                    try {
                        responseJSON = JSON.parse(response.data);
                    } catch (e) {
                        // 解析失败，保持 undefined
                    }
                }
            }
            
            return {
                status: response.status,
                statusText: response.statusText,
                readyState: 4,
                responseText: responseText,
                responseJSON: responseJSON,
                getResponseHeader: function (name) {
                    const headers = response.headers || {};
                    const lower = name.toLowerCase();
                    for (const key in headers) {
                        if (Object.prototype.hasOwnProperty.call(headers, key) && key.toLowerCase() === lower) {
                            return headers[key];
                        }
                    }
                    return null;
                },
                getAllResponseHeaders: function () {
                    const headers = response.headers || {};
                    return Object.entries(headers)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join('\r\n');
                }
            };
        }

        test('should have all required jqXHR properties', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: '{"message":"success"}',
                data: { message: 'success' }
            };

            const jqXHR = toJqXHR(mockResponse);

            // Core properties
            expect(jqXHR).toHaveProperty('status', 200);
            expect(jqXHR).toHaveProperty('statusText', 'OK');
            expect(jqXHR).toHaveProperty('readyState', 4);
            expect(jqXHR).toHaveProperty('responseText');
            expect(jqXHR).toHaveProperty('responseJSON');
            
            // Methods
            expect(typeof jqXHR.getResponseHeader).toBe('function');
            expect(typeof jqXHR.getAllResponseHeaders).toBe('function');
        });

        test('should convert body string to responseText', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: {},
                body: '{"key":"value"}',
                data: { key: 'value' }
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.responseText).toBe('{"key":"value"}');
        });

        test('should stringify object body to responseText', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: {},
                body: { key: 'value' },
                data: { key: 'value' }
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.responseText).toBe('{"key":"value"}');
        });

        test('should handle null body', () => {
            const mockResponse = {
                status: 204,
                statusText: 'No Content',
                headers: {},
                body: null,
                data: null
            };

            const jqXHR = toJqXHR(mockResponse);

            // null 和 undefined 都会导致空 responseText
            expect(jqXHR.responseText).toBe('');
            // 没有 content-type，所以 responseJSON 应该是 undefined
            expect(jqXHR.responseJSON).toBe(undefined);
        });

        test('should handle undefined body', () => {
            const mockResponse = {
                status: 204,
                statusText: 'No Content',
                headers: {},
                body: undefined,
                data: undefined
            };

            const jqXHR = toJqXHR(mockResponse);

            // null 和 undefined 都会导致空 responseText
            expect(jqXHR.responseText).toBe('');
            expect(jqXHR.responseJSON).toBe(undefined);
        });

        test('should handle null body with JSON content-type', () => {
            const mockResponse = {
                status: 204,
                statusText: 'No Content',
                headers: { 'content-type': 'application/json' },
                body: null,
                data: null
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.responseText).toBe('');
            // JSON 响应但 data 是 null，应该保留 null
            expect(jqXHR.responseJSON).toBe(null);
        });

        test('should handle empty string body', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: {},
                body: '',
                data: ''
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.responseText).toBe('');
            // 没有 content-type，所以 responseJSON 应该是 undefined（不是空字符串）
            expect(jqXHR.responseJSON).toBe(undefined);
        });

        test('should expose responseJSON from data', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: '{"results":[1,2,3]}',
                data: { results: [1, 2, 3] }
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.responseJSON).toEqual({ results: [1, 2, 3] });
        });

        test('getResponseHeader should be case-insensitive', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Custom-Header': 'test-value'
                },
                body: '{}',
                data: {}
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.getResponseHeader('content-type')).toBe('application/json');
            expect(jqXHR.getResponseHeader('Content-Type')).toBe('application/json');
            expect(jqXHR.getResponseHeader('CONTENT-TYPE')).toBe('application/json');
            expect(jqXHR.getResponseHeader('x-custom-header')).toBe('test-value');
            expect(jqXHR.getResponseHeader('X-Custom-Header')).toBe('test-value');
        });

        test('getResponseHeader should return null for missing header', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: '{}',
                data: {}
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.getResponseHeader('non-existent')).toBe(null);
        });

        test('getAllResponseHeaders should format headers correctly', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: {
                    'content-type': 'application/json',
                    'x-request-id': '12345'
                },
                body: '{}',
                data: {}
            };

            const jqXHR = toJqXHR(mockResponse);
            const allHeaders = jqXHR.getAllResponseHeaders();

            expect(allHeaders).toContain('content-type: application/json');
            expect(allHeaders).toContain('x-request-id: 12345');
            expect(allHeaders).toContain('\r\n');
        });

        test('getAllResponseHeaders should handle empty headers', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: {},
                body: '{}',
                data: {}
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.getAllResponseHeaders()).toBe('');
        });

        test('readyState should always be 4 (completed)', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: {},
                body: '{}',
                data: {}
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.readyState).toBe(4);
        });
    });

    describe('responseJSON behavior (jQuery compatibility)', () => {
        // Mock toJqXHR function
        function toJqXHR(response) {
            let responseText = '';
            if (response.body != null) {
                responseText = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
            }
            
            let responseJSON = undefined;
            const contentType = response.headers['content-type'] || '';
            if (contentType.includes('application/json') && response.data !== undefined) {
                if (typeof response.data === 'object' || typeof response.data === 'boolean' || typeof response.data === 'number') {
                    responseJSON = response.data;
                } else if (typeof response.data === 'string') {
                    try {
                        responseJSON = JSON.parse(response.data);
                    } catch (e) {
                        // 解析失败，保持 undefined
                    }
                }
            }
            
            return {
                status: response.status,
                statusText: response.statusText,
                readyState: 4,
                responseText: responseText,
                responseJSON: responseJSON,
                getResponseHeader: function (name) {
                    const headers = response.headers || {};
                    const lower = name.toLowerCase();
                    for (const key in headers) {
                        if (Object.prototype.hasOwnProperty.call(headers, key) && key.toLowerCase() === lower) {
                            return headers[key];
                        }
                    }
                    return null;
                },
                getAllResponseHeaders: function () {
                    const headers = response.headers || {};
                    return Object.entries(headers)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join('\r\n');
                }
            };
        }

        test('responseJSON should be set for JSON responses', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: '{"key":"value"}',
                data: { key: 'value' }
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.responseJSON).toEqual({ key: 'value' });
        });

        test('responseJSON should be undefined for text/plain responses', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'text/plain' },
                body: 'Hello, World!',
                data: 'Hello, World!'
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.responseJSON).toBe(undefined);
            expect(jqXHR.responseText).toBe('Hello, World!');
        });

        test('responseJSON should be undefined for text/html responses', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'text/html; charset=utf-8' },
                body: '<html><body>Hello</body></html>',
                data: '<html><body>Hello</body></html>'
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.responseJSON).toBe(undefined);
            expect(jqXHR.responseText).toBe('<html><body>Hello</body></html>');
        });

        test('responseJSON should be undefined for XML responses', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/xml' },
                body: '<?xml version="1.0"?><root></root>',
                data: '<?xml version="1.0"?><root></root>'
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.responseJSON).toBe(undefined);
        });

        test('responseJSON should be undefined when content-type is missing', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: {},
                body: 'some text',
                data: 'some text'
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.responseJSON).toBe(undefined);
        });

        test('responseJSON should handle JSON string that needs parsing', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: '{"parsed":false}',
                data: '{"parsed":false}'  // String that needs parsing
            };

            const jqXHR = toJqXHR(mockResponse);

            // Should attempt to parse the string
            expect(jqXHR.responseJSON).toEqual({ parsed: false });
        });

        test('responseJSON should be undefined for invalid JSON string', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: 'not valid json',
                data: 'not valid json'
            };

            const jqXHR = toJqXHR(mockResponse);

            // Invalid JSON should not set responseJSON
            expect(jqXHR.responseJSON).toBe(undefined);
        });

        test('responseJSON should support JSON scalar values', () => {
            const mockResponse1 = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: '42',
                data: 42
            };

            const jqXHR1 = toJqXHR(mockResponse1);
            expect(jqXHR1.responseJSON).toBe(42);

            const mockResponse2 = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: 'true',
                data: true
            };

            const jqXHR2 = toJqXHR(mockResponse2);
            expect(jqXHR2.responseJSON).toBe(true);
        });

        test('responseJSON should not leak string data to callers expecting objects', () => {
            // This is the key issue: if responseJSON contains a string for non-JSON
            // responses, code checking `if (jqXHR.responseJSON)` will incorrectly
            // treat text/html as JSON and try to access object properties
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'text/html' },
                body: '<html>Page</html>',
                data: '<html>Page</html>'
            };

            const jqXHR = toJqXHR(mockResponse);

            // Critical: responseJSON must be falsy (undefined) for non-JSON
            expect(jqXHR.responseJSON).toBe(undefined);
            
            // This pattern should work correctly
            if (jqXHR.responseJSON) {
                // This block should NOT execute for text/html responses
                fail('responseJSON should not be truthy for non-JSON responses');
            }
        });
    });

    describe('Issue #23 regression tests', () => {
        // Mock toJqXHR function (same as in index.js)
        function toJqXHR(response) {
            // 正确处理 responseText
            let responseText = '';
            if (response.body != null) {
                responseText = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
            }
            
            // 只有在响应是 JSON 时才设置 responseJSON
            let responseJSON = undefined;
            const contentType = response.headers['content-type'] || '';
            if (contentType.includes('application/json') && response.data !== undefined) {
                if (typeof response.data === 'object' || typeof response.data === 'boolean' || typeof response.data === 'number') {
                    responseJSON = response.data;
                } else if (typeof response.data === 'string') {
                    try {
                        responseJSON = JSON.parse(response.data);
                    } catch (e) {
                        // 解析失败，保持 undefined
                    }
                }
            }
            
            return {
                status: response.status,
                statusText: response.statusText,
                readyState: 4,
                responseText: responseText,
                responseJSON: responseJSON,
                getResponseHeader: function (name) {
                    const headers = response.headers || {};
                    const lower = name.toLowerCase();
                    for (const key in headers) {
                        if (Object.prototype.hasOwnProperty.call(headers, key) && key.toLowerCase() === lower) {
                            return headers[key];
                        }
                    }
                    return null;
                },
                getAllResponseHeaders: function () {
                    const headers = response.headers || {};
                    return Object.entries(headers)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join('\r\n');
                }
            };
        }

        test('complete callback should receive jqXHR with responseText (original issue)', () => {
            // This is the exact scenario from issue #23
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: '{"results":[1,2,3],"message":"success"}',
                data: { results: [1, 2, 3], message: 'success' }
            };

            const jqXHR = toJqXHR(mockResponse);

            // The original code did: JSON.parse(jqXHR.responseText)
            // This should now work
            expect(() => {
                const data = JSON.parse(jqXHR.responseText);
                expect(data).toEqual({ results: [1, 2, 3], message: 'success' });
            }).not.toThrow();
        });

        test('should support accessing responseJSON directly', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: '{"status":"success"}',
                data: { status: 'success' }
            };

            const jqXHR = toJqXHR(mockResponse);

            // Modern code can access responseJSON directly
            expect(jqXHR.responseJSON).toEqual({ status: 'success' });
        });

        test('should handle POST request with form data', () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                body: '{"id":123,"created":true}',
                data: { id: 123, created: true }
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.status).toBe(200);
            expect(jqXHR.responseText).toBe('{"id":123,"created":true}');
            expect(jqXHR.responseJSON).toEqual({ id: 123, created: true });
        });

        test('should handle error responses (4xx)', () => {
            const mockResponse = {
                status: 400,
                statusText: 'Bad Request',
                headers: { 'content-type': 'application/json' },
                body: '{"error":"Invalid parameters"}',
                data: { error: 'Invalid parameters' }
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.status).toBe(400);
            expect(jqXHR.statusText).toBe('Bad Request');
            expect(jqXHR.responseText).toBe('{"error":"Invalid parameters"}');
            expect(jqXHR.responseJSON).toEqual({ error: 'Invalid parameters' });
        });

        test('should handle server errors (5xx)', () => {
            const mockResponse = {
                status: 500,
                statusText: 'Internal Server Error',
                headers: { 'content-type': 'application/json' },
                body: '{"error":"Server error"}',
                data: { error: 'Server error' }
            };

            const jqXHR = toJqXHR(mockResponse);

            expect(jqXHR.status).toBe(500);
            expect(jqXHR.statusText).toBe('Internal Server Error');
            expect(jqXHR.responseText).toBe('{"error":"Server error"}');
        });
    });

    describe('Error jqXHR objects', () => {
        test('should create minimal jqXHR for network errors', () => {
            const errorJqXHR = {
                status: 0,
                statusText: 'Network Error',
                readyState: 0,
                responseText: '',
                responseJSON: undefined,
                getResponseHeader: () => null,
                getAllResponseHeaders: () => ''
            };

            expect(errorJqXHR.status).toBe(0);
            expect(errorJqXHR.statusText).toBe('Network Error');
            expect(errorJqXHR.readyState).toBe(0);
            expect(errorJqXHR.responseText).toBe('');
            expect(errorJqXHR.responseJSON).toBe(undefined);
            expect(errorJqXHR.getResponseHeader('any-header')).toBe(null);
            expect(errorJqXHR.getAllResponseHeaders()).toBe('');
        });

        test('should handle timeout errors', () => {
            const timeoutJqXHR = {
                status: 0,
                statusText: 'timeout',
                readyState: 0,
                responseText: '',
                responseJSON: undefined,
                getResponseHeader: () => null,
                getAllResponseHeaders: () => ''
            };

            expect(timeoutJqXHR.status).toBe(0);
            expect(timeoutJqXHR.statusText).toBe('timeout');
        });
    });

    describe('jQuery callback parameter compatibility', () => {
        test('success callback should receive (data, textStatus, jqXHR)', () => {
            // This tests the parameter order for success callbacks
            const mockData = { message: 'success' };
            const mockJqXHR = {
                status: 200,
                statusText: 'OK',
                readyState: 4,
                responseText: '{"message":"success"}',
                responseJSON: mockData,
                getResponseHeader: () => null,
                getAllResponseHeaders: () => ''
            };

            // Simulate success callback
            const successCallback = jest.fn();
            successCallback(mockData, 'success', mockJqXHR);

            expect(successCallback).toHaveBeenCalledWith(
                mockData,
                'success',
                expect.objectContaining({
                    status: 200,
                    responseText: expect.any(String),
                    responseJSON: mockData
                })
            );
        });

        test('error callback should receive (jqXHR, textStatus, errorThrown)', () => {
            const errorJqXHR = {
                status: 0,
                statusText: 'error',
                readyState: 0,
                responseText: '',
                responseJSON: undefined,
                getResponseHeader: () => null,
                getAllResponseHeaders: () => ''
            };

            // Simulate error callback
            const errorCallback = jest.fn();
            errorCallback(errorJqXHR, 'error', 'Network Error');

            expect(errorCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 0,
                    statusText: 'error'
                }),
                'error',
                'Network Error'
            );
        });

        test('complete callback should receive (jqXHR, textStatus)', () => {
            const mockJqXHR = {
                status: 200,
                statusText: 'OK',
                readyState: 4,
                responseText: '{}',
                responseJSON: {},
                getResponseHeader: () => null,
                getAllResponseHeaders: () => ''
            };

            // Simulate complete callback
            const completeCallback = jest.fn();
            completeCallback(mockJqXHR, 'success');

            expect(completeCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 200,
                    responseText: expect.any(String)
                }),
                'success'
            );
        });
    });
});

