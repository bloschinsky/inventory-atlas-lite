import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'dist-landing/**', 'node_modules/**', 'data/**']
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['client/**/*.{js,vue}'],
    languageOptions: {
      // __APP_BUILD_INFO__ and __DEMO__ are replaced at build time by the defines in vite.config.js.
      globals: { ...globals.browser, __APP_BUILD_INFO__: 'readonly', __DEMO__: 'readonly' }
    }
  },
  {
    files: ['landing/src/**/*.{js,vue}'],
    languageOptions: {
      // __LANDING_INFO__ is replaced at build time by the define in landing/vite.config.js.
      globals: { ...globals.browser, __LANDING_INFO__: 'readonly' }
    }
  },
  {
    files: ['server/**/*.{js,mjs}', 'scripts/**/*.mjs', 'landing/*.js', 'test/**/*.{js,mjs}', '*.config.js'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    // Playwright specs and the landing screenshot capture also contain callbacks that run inside the page.
    files: ['test/e2e/**/*.js', 'landing/scripts/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    }
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
    }
  }
];
