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
]
