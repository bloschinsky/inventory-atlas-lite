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
      globals: globals.browser
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
