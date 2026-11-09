import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-extension/**',
      'release-extension/**',
      'build/**',
      'coverage/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
    languageOptions: {
      globals: globals.node,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    files: ['tests/browser/**/*.mjs', 'extension/tests/browser.mjs'],
    languageOptions: {
      globals: globals.browser,
    },
  },
];
