/**
 * FormData Serializer Helper
 *
 * 将 FormData / File / Blob 序列化为可 JSON 传输的结构，
 * 用于 index.js 注入 DOM 时避免 JSON.stringify 丢失文件内容。
 */

(function (window) {
  'use strict';

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function isFileLike(value) {
    if (!value) return false;
    const hasFile = typeof File !== 'undefined' && value instanceof File;
    const hasBlob = typeof Blob !== 'undefined' && value instanceof Blob;
    return hasFile || hasBlob;
  }

  async function readAsArrayBuffer(value) {
    if (value && typeof value.arrayBuffer === 'function') {
      return value.arrayBuffer();
    }
    if (typeof FileReader !== 'undefined') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
        reader.readAsArrayBuffer(value);
      });
    }
    // 最后兜底：按文本读取并编码为 UTF-8
    if (value && typeof value.text === 'function') {
      const text = await value.text();
      const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
      if (encoder) {
        return encoder.encode(text).buffer;
      }
      const bytes = new Uint8Array(text.split('').map((c) => c.charCodeAt(0)));
      return bytes.buffer;
    }
    return new ArrayBuffer(0);
  }

  async function serializeFileLike(value) {
    const buffer = await readAsArrayBuffer(value);
    return {
      __isFile: true,
      name: value.name || 'blob',
      type: value.type || '',
      data: arrayBufferToBase64(buffer)
    };
  }

  async function serializeFormData(formData) {
    const entries = [];
    for (const [key, value] of formData.entries()) {
      if (isFileLike(value)) {
        entries.push({ key, value: await serializeFileLike(value) });
      } else {
        entries.push({ key, value: String(value) });
      }
    }
    return {
      __isFormData: true,
      entries
    };
  }

  async function serializeRequestBody(body) {
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      return serializeFormData(body);
    }
    if (isFileLike(body)) {
      return serializeFileLike(body);
    }
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      return body.toString();
    }
    return body;
  }

  window.CrossRequestHelpers = window.CrossRequestHelpers || {};
  window.CrossRequestHelpers.serializeFormData = serializeFormData;
  window.CrossRequestHelpers.serializeRequestBody = serializeRequestBody;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      arrayBufferToBase64,
      serializeFileLike,
      serializeFormData,
      serializeRequestBody,
      isFileLike
    };
  }
})(typeof window !== 'undefined' ? window : global);
