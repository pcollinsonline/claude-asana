import config from '@toolchain/eslint-config/profile/node'

export default [
  { ignores: ['skills/'] },
  ...config,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]
