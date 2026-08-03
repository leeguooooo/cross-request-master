const { serializeRequestBody } = require('../src/helpers/request-body.js');

describe('serializeRequestBody', () => {
  test('serializes a top-level array as JSON', () => {
    expect(serializeRequestBody([{ a: '1' }], '')).toEqual({
      body: '[{"a":"1"}]',
      contentType: 'application/json'
    });
  });

  test('does not send a top-level array through URLSearchParams', () => {
    expect(
      serializeRequestBody(
        [{ a: '1' }],
        'application/x-www-form-urlencoded; charset=UTF-8'
      )
    ).toEqual({
      body: '[{"a":"1"}]',
      contentType: 'application/json'
    });
  });

  test('preserves form encoding for plain objects', () => {
    expect(
      serializeRequestBody(
        { a: '1', b: 'two' },
        'application/x-www-form-urlencoded'
      )
    ).toEqual({
      body: 'a=1&b=two',
      contentType: 'application/x-www-form-urlencoded'
    });
  });

  test('serializes a plain object as JSON by default', () => {
    expect(serializeRequestBody({ a: '1' }, '')).toEqual({
      body: '{"a":"1"}',
      contentType: 'application/json'
    });
  });

  test('leaves pre-serialized bodies unchanged', () => {
    expect(serializeRequestBody('raw body', 'text/plain')).toEqual({
      body: 'raw body',
      contentType: 'text/plain'
    });
  });
});
