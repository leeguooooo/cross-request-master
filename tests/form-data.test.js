/**
 * Tests for FormData serialization helper (Issue #14)
 *
 * These tests import REAL production helper code.
 */

const { serializeRequestBody, buildMultipartBodyFromLegacyFiles } = require('../src/helpers/form-data.js');

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

describe('buildMultipartBodyFromLegacyFiles helper', () => {
    test('should build FormData from legacy files mapping (by element id)', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.id = 'upload-input';

        const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
        Object.defineProperty(input, 'files', {
            value: [file],
            configurable: true
        });
        document.body.appendChild(input);

        const body = buildMultipartBodyFromLegacyFiles(
            { name: 'demo' },
            { file: 'upload-input' },
            null
        );

        expect(body).toBeInstanceOf(FormData);

        const entries = Array.from(body.entries());
        expect(entries).toHaveLength(2);
        expect(entries[0]).toEqual(['name', 'demo']);
        expect(entries[1][0]).toBe('file');
        expect(entries[1][1]).toBeInstanceOf(File);
        expect(entries[1][1].name).toBe('hello.txt');
    });

    test('should build raw File body from legacy file input id', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.id = 'single-file';

        const file = new File(['x'], 'x.bin', { type: 'application/octet-stream' });
        Object.defineProperty(input, 'files', {
            value: [file],
            configurable: true
        });
        document.body.appendChild(input);

        const body = buildMultipartBodyFromLegacyFiles(null, null, 'single-file');
        expect(body).toBeInstanceOf(File);
        expect(body.name).toBe('x.bin');
    });
});
