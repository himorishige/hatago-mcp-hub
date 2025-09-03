import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'examples/**',
      'node_modules/**',
      '**/.wrangler/**',
      'pnpm-lock.yaml',
      'packages/test-fixtures/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx'
    ]
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // Strict type safety rules - now at error level
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            arguments: false
          }
        }
      ],

      // Strict any usage rules
      '@typescript-eslint/no-explicit-any': [
        'error',
        {
          // Allow any in specific cases where it's truly needed
          ignoreRestArgs: true,
          fixToUnknown: true
        }
      ],
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      // Additional strict rules now enabled
      '@typescript-eslint/explicit-function-return-type': 'off', // Still off - too restrictive
      '@typescript-eslint/explicit-module-boundary-types': 'off', // Still off - too restrictive
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn', // Start with warn
      '@typescript-eslint/prefer-nullish-coalescing': 'off', // Start with warn
      '@typescript-eslint/prefer-optional-chain': 'warn' // Start with warn
    }
  },

  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked
  },

  prettierConfig
);
