import drMike from 'dr-mike/eslint'

export default [
  ...(await drMike({ effect: true, turborepo: true })),
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/build-plugin.ts', 'src/build-pipeline/**/*.ts'],
    rules: {
      // Build script uses deeply nested sync fs operations that confuse type-aware linting
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
]
