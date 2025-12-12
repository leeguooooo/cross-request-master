const js = require('@eslint/js');
const globals = require('globals');

const webextensionsGlobals = globals.webextensions || {};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'jquery-3.1.1.js',
      'eslint.config.js',
      'coverage/**',
      'dist/**',
      'build/**',
      'tests/**'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...webextensionsGlobals,
        chrome: 'readonly'
      }
    },
    rules: {
      indent: ['error', 2, { SwitchCase: 1 }],
      'linebreak-style': ['error', 'unix'],
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-implicit-coercion': ['error', { allow: ['!!'] }],
      'no-eq-null': 'off',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  }
];
