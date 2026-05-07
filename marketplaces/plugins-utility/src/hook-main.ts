import { parseHookInput, readStdin } from '@packages/plugins-base'
import path from 'node:path'

import { createHookLogger } from './create-hook-logger.js'

export const deriveHookName = (scriptPath: string): string =>
  path.basename(scriptPath, '.js').replaceAll('-', '_')

export const deriveLabel = (hookName: string): string => hookName.replaceAll('_', ' ')

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- process.argv[1] is always set when invoked via `node <script>`
const hookName = deriveHookName(process.argv[1]!)
const label = deriveLabel(hookName)
const logInput = createHookLogger<Record<string, unknown>>(hookName)

const main = async (): Promise<void> => {
  const result = await readStdin()
    .andThen(parseHookInput<Record<string, unknown>>)
    .andThen(logInput)

  if (result.isErr()) {
    console.error(`${label} hook error: ${result.error.message}`)
  }
  console.log(JSON.stringify({}))
}

void main()
