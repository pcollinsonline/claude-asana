import path from 'node:path'

import { buildPlugin } from '@packages/plugins-base/build'

await buildPlugin({
  distDir: path.resolve(import.meta.dirname, '..', '..', 'monorepo-marketplace', 'plugins-utility'),
  hookAsync: {
    'permission-request': true,
    'post-tool-use': true,
    'post-tool-use-failure': true,
    'pre-tool-use': true,
  },
  rootDir: path.resolve(import.meta.dirname, '..'),
})
