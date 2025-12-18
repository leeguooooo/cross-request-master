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

  function resolveFileInput(inputRef) {
    if (!inputRef) return null;
    if (typeof inputRef === 'string' && typeof document !== 'undefined') {
      return document.getElementById(inputRef);
    }
    return inputRef;
  }

  function getFirstFileFromInput(inputRef) {
    const input = resolveFileInput(inputRef);
    if (!input) return null;
    const files = input.files;
    if (!files || !files.length) return null;
    return files[0] || null;
  }

  function buildMultipartBodyFromLegacyFiles(data, files, file) {
    // Legacy interface from YMFE/cross-request PR #7:
    // - options.files: { fieldName: inputElementId }
    // - options.file:  inputElementId (single raw file body)
    if (!files && !file) return null;

    if (file) {
      return getFirstFileFromInput(file);
    }

    const fd = new FormData();

    // Append fields from data (if present)
    if (data && typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams) {
      for (const [k, v] of data.entries()) {
        fd.append(k, v);
      }
    } else if (data && typeof FormData !== 'undefined' && data instanceof FormData) {
      for (const [k, v] of data.entries()) {
        fd.append(k, v);
      }
    } else if (data && typeof data === 'object') {
      Object.keys(data).forEach((k) => {
        const v = data[k];
        if (v === undefined) return;
        fd.append(k, v == null ? '' : String(v));
      });
    }

    // Append files from input elements
    if (files && typeof files === 'object') {
      Object.keys(files).forEach((fieldName) => {
        const inputRef = files[fieldName];
        const picked = getFirstFileFromInput(inputRef);
        if (!picked) return;
        fd.append(fieldName, picked, picked.name || 'file');
      });
    }

    return fd;
  }

  window.CrossRequestHelpers = window.CrossRequestHelpers || {};
  window.CrossRequestHelpers.serializeFormData = serializeFormData;
  window.CrossRequestHelpers.serializeRequestBody = serializeRequestBody;
  window.CrossRequestHelpers.buildMultipartBodyFromLegacyFiles = buildMultipartBodyFromLegacyFiles;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      arrayBufferToBase64,
      serializeFileLike,
      serializeFormData,
      serializeRequestBody,
      isFileLike,
      buildMultipartBodyFromLegacyFiles,
      getFirstFileFromInput
    };
  }
})(typeof window !== 'undefined' ? window : global);
