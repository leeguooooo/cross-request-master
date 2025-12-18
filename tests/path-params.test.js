const { extractUrlPlaceholders, applyUrlPlaceholders } = require('../src/helpers/path-params');

describe('path-params helpers', () => {
  test('extractUrlPlaceholders should return unique placeholders in order', () => {
    expect(extractUrlPlaceholders('/a/{id}/b/{name}/c/{id}')).toEqual(['id', 'name']);
  });

  test('extractUrlPlaceholders should ignore non-string input', () => {
    expect(extractUrlPlaceholders(null)).toEqual([]);
    expect(extractUrlPlaceholders(undefined)).toEqual([]);
    expect(extractUrlPlaceholders({})).toEqual([]);
  });

  test('applyUrlPlaceholders should replace known placeholders and keep unknown', () => {
    expect(applyUrlPlaceholders('/a/{id}/b/{name}', { id: 1 })).toBe('/a/1/b/{name}');
  });

  test('applyUrlPlaceholders should support encoding', () => {
    expect(applyUrlPlaceholders('/a/{id}', { id: 'a b' }, { encode: true })).toBe('/a/a%20b');
  });
});

