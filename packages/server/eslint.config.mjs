import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

export default [
  ...tseslint.configs.recommended,
  eslintPluginUnicorn.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'unicorn/no-useless-undefined': 'off',
      'unicorn/no-null': 'off',
      quotes: 'off',
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', '**/node_modules/**', '**/dist/**'],
  },
];
