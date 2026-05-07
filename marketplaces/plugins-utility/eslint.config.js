import drMike from 'dr-mike/eslint/full'

export default [
  ...drMike,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]
