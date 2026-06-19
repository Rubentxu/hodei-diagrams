import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'pkg/**',
      'src/wasm/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Override base no-unused-vars to also ignore underscore-prefixed args
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="eval"]',
          message: 'eval(...) is not allowed.',
        },
        {
          selector: 'CallExpression[callee.type="Function"]',
          message: 'new Function(...) is not allowed.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./wasm/*', '../wasm/*'],
              message:
                'Only src/session.ts and src/wasm-loader.ts may import the wasm-pack output.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'innerHTML',
          message: 'innerHTML writes are restricted to src/renderer.ts.',
        },
      ],
    },
  },
];
