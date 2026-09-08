module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'no-undef': 'error',
    'react/jsx-no-undef': 'error',
    // API response shapes are validated at the FastAPI/Pydantic boundary.
    // The frontend remains JavaScript during the current architecture wave;
    // TypeScript migration is tracked separately from the release gate.
    'react/prop-types': 'off',
    // French UI copy contains normal contractions and intentional nbsp spacing.
    'react/no-unescaped-entities': 'off',
    'no-irregular-whitespace': 'off',
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
}

