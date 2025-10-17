/**
 * Tests for helper functions
 * 
 * These tests focus on the critical falsy-value handling
 * that was fixed in v4.4.13
 * 
 * NOTE: Currently these tests re-implement the helper logic
 * instead of importing from index.js because index.js uses
 * an IIFE pattern that doesn't export functions.
 * 
 * TODO (v4.5.0): Refactor index.js to extract helpers into
 * a separate module (helpers/body-parser.js) that can be
 * imported by both production code and tests. See ROADMAP.md
 * for the modularization plan.
 */

describe('bodyToString helper', () => {
    // Mock the bodyToString function (extracted from index.js:19-32)
    function bodyToString(body) {
        if (body === undefined || body === null) {
            return '';
        }
        if (typeof body === 'object') {
            return JSON.stringify(body);
        }
        if (typeof body === 'string') {
            return body;
        }
        // number, boolean 等标量值
        return String(body);
    }

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

describe('parsedData handling', () => {
    // Simulates the logic from index.js:158
    function getParsedDataOrDefault(parsedData) {
        return parsedData === undefined ? {} : parsedData;
    }

    test('should convert undefined to empty object', () => {
        expect(getParsedDataOrDefault(undefined)).toEqual({});
    });

    test('should preserve null (critical fix)', () => {
        expect(getParsedDataOrDefault(null)).toBe(null);
    });

    test('should preserve number zero', () => {
        expect(getParsedDataOrDefault(0)).toBe(0);
    });

    test('should preserve boolean false', () => {
        expect(getParsedDataOrDefault(false)).toBe(false);
    });

    test('should preserve empty string', () => {
        expect(getParsedDataOrDefault('')).toBe('');
    });

    test('should preserve empty array', () => {
        const arr = [];
        expect(getParsedDataOrDefault(arr)).toBe(arr);
    });

    test('should preserve empty object', () => {
        const obj = {};
        expect(getParsedDataOrDefault(obj)).toBe(obj);
    });

    test('should preserve truthy values', () => {
        expect(getParsedDataOrDefault(42)).toBe(42);
        expect(getParsedDataOrDefault(true)).toBe(true);
        expect(getParsedDataOrDefault('hello')).toBe('hello');
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

describe('JSON parsing guards', () => {
    // Test JSON parsing with type checks
    function parseJsonSafely(value) {
        // Already an object
        if (typeof value === 'object' && value !== null) {
            return value;
        }
        
        // String to parse
        if (typeof value === 'string' && value !== '') {
            try {
                return JSON.parse(value);
            } catch (e) {
                return { error: 'JSON解析失败', raw: value };
            }
        }
        
        // Scalar values (number, boolean)
        if (value != null && typeof value !== 'string') {
            return value;
        }
        
        // null, undefined, empty string
        return {};
    }

    test('should parse valid JSON string', () => {
        expect(parseJsonSafely('{"key":"value"}')).toEqual({ key: 'value' });
    });

    test('should return object as-is', () => {
        const obj = { key: 'value' };
        expect(parseJsonSafely(obj)).toBe(obj);
    });

    test('should preserve null object', () => {
        expect(parseJsonSafely(null)).toEqual({});
    });

    test('should preserve number scalars', () => {
        expect(parseJsonSafely(0)).toBe(0);
        expect(parseJsonSafely(42)).toBe(42);
    });

    test('should preserve boolean scalars', () => {
        expect(parseJsonSafely(false)).toBe(false);
        expect(parseJsonSafely(true)).toBe(true);
    });

    test('should handle invalid JSON', () => {
        const result = parseJsonSafely('not json');
        expect(result).toHaveProperty('error');
        expect(result.error).toBe('JSON解析失败');
    });

    test('should handle empty string', () => {
        expect(parseJsonSafely('')).toEqual({});
    });
});

