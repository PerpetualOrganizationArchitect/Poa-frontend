import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // Product copy contains many contractions; this rule creates noise without
      // improving runtime correctness or accessibility in a JSX application.
      'react/no-unescaped-entities': 'off',

      // eslint-config-next 16 enables React Compiler diagnostics. This project
      // does not enable the compiler, so keep the lint gate focused on rules
      // that describe current runtime behavior (including Rules of Hooks).
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'node_modules/**',
    'public/**',
  ]),
]);
