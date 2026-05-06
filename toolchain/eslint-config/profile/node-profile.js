import { includeIgnoreFile } from '@eslint/compat'
import globals from 'globals'
import { fileURLToPath } from 'node:url'
import { config } from 'typescript-eslint'

import baseConfig from '../configs/base.js'
import globalIgnoresConfig from '../configs/global-ignores.js'
import javascriptConfig from '../configs/javascript.js'
import prettierConfig from '../configs/prettier.js'
import typescriptConfig from '../configs/typescript.js'
import vitestConfig from '../configs/vitest.js'

const { nodeBuiltin } = globals

const rootGitignorePath = fileURLToPath(new URL('../../../.gitignore', import.meta.url))

export default config(
  includeIgnoreFile(rootGitignorePath),
  javascriptConfig,
  typescriptConfig,
  vitestConfig,
  baseConfig,
  prettierConfig,
  globalIgnoresConfig,
  {
    name: 'eslint-config:profile:node',

    languageOptions: {
      globals: {
        ...nodeBuiltin,
      },
    },
  },
)
