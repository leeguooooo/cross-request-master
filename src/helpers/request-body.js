/**
 * Request Body Helper
 *
 * Serializes request bodies without treating top-level arrays as form fields.
 */

(function (window) {
  'use strict';

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function serializeRequestBody(body, contentType = '') {
    const normalizedContentType = String(contentType || '');

    if (Array.isArray(body)) {
      return {
        body: JSON.stringify(body),
        contentType: normalizedContentType.toLowerCase().includes('application/json')
          ? normalizedContentType
          : 'application/json'
      };
    }

    if (isPlainObject(body)) {
      if (normalizedContentType.includes('application/x-www-form-urlencoded')) {
        return {
          body: new URLSearchParams(body).toString(),
          contentType: normalizedContentType
        };
      }

      return {
        body: JSON.stringify(body),
        contentType: normalizedContentType || 'application/json'
      };
    }

    return { body, contentType: normalizedContentType };
  }

  window.CrossRequestHelpers = window.CrossRequestHelpers || {};
  window.CrossRequestHelpers.serializeRequestBody = serializeRequestBody;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { serializeRequestBody };
  }
})(typeof window !== 'undefined' ? window : global);
