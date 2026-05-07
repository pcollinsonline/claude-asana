import sharedConfig, { defineConfig, mergeConfig } from 'dr-mike/vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const packageJson = require('./package.json')

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: packageJson.name,
    },
  }),
)
