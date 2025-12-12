/**
 * Tests for FormData serialization helper (Issue #14)
 *
 * These tests import REAL production helper code.
 */

const { serializeRequestBody } = require('../src/helpers/form-data.js');

describe('serializeRequestBody helper', () => {
    test('should serialize plain FormData with text entries', async () => {
        const fd = new FormData();
        fd.append('a', '1');
        fd.append('b', 'hello');

        const serialized = await serializeRequestBody(fd);

        expect(serialized.__isFormData).toBe(true);
        expect(serialized.entries).toEqual([
            { key: 'a', value: '1' },
            { key: 'b', value: 'hello' }
        ]);
    });

    test('should serialize FormData containing Blob as file-like', async () => {
        const fd = new FormData();
        const blob = new Blob(['hello'], { type: 'text/plain' });
        fd.append('file', blob, 'hello.txt');

        const serialized = await serializeRequestBody(fd);

        expect(serialized.__isFormData).toBe(true);
        expect(serialized.entries).toHaveLength(1);

        const entry = serialized.entries[0];
        expect(entry.key).toBe('file');
        expect(entry.value.__isFile).toBe(true);
        expect(entry.value.name).toBe('hello.txt');
        expect(entry.value.type).toBe('text/plain');

        const decoded = Buffer.from(entry.value.data, 'base64').toString('utf8');
        expect(decoded).toBe('hello');
    });
});

