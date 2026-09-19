import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'data/**']
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['client/**/*.{js,vue}'],
    languageOptions: {
      // __APP_BUILD_INFO__ is replaced at build time by the define in vite.config.js.
      globals: { ...globals.browser, __APP_BUILD_INFO__: 'readonly' }
    }
  },
  {
    files: ['server/**/*.{js,mjs}', 'scripts/**/*.mjs', 'test/**/*.{js,mjs}', '*.config.js'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
    }
  }
];
