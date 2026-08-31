import eslintPluginUnicorn from 'eslint-plugin-unicorn';

export default [
  eslintPluginUnicorn.configs.recommended,
  {
    rules: {
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      'unicorn/no-null': 'off',
      'unicorn/no-useless-undefined': 'off',
      quotes: 'off',
    },
  },
  {
    ignores: ['node_modules/**'],
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        clearInterval: 'readonly',
        console: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        Notification: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
];
