import path from 'node:path'

import { buildPlugin } from '@packages/plugins-base/build'

await buildPlugin({
  distDir: path.resolve(import.meta.dirname, '..', '..', 'monorepo-marketplace', 'plugins-claude'),
  rootDir: path.resolve(import.meta.dirname, '..'),
})
