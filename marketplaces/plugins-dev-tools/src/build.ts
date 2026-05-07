import { buildPlugin } from '@packages/plugins-base/build'
import path from 'node:path'

const distDir = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  'monorepo-marketplace',
  'plugins-dev-tools',
)
const rootDir = path.resolve(import.meta.dirname, '..')

await buildPlugin({
  distDir,
  hookMatchers: { 'pre-tool-use': 'Bash' },
  mcp: { name: 'dev-tools' },
  rootDir,
})
