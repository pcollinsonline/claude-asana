import drMike from 'dr-mike/eslint/full'

export default [
  { ignores: ['skills/'] },
  ...drMike,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]
