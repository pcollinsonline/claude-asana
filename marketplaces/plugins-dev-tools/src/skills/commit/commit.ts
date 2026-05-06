import { execSync } from 'node:child_process'

export const normalizeHeader = (msg: string): string => {
  const newlineIdx = msg.indexOf('\n')
  if (newlineIdx === -1) return msg.toLowerCase()
  return msg.slice(0, newlineIdx).toLowerCase() + msg.slice(newlineIdx)
}

export const assembleMessage = (header: string, body?: string, coAuthor?: string): string => {
  const parts = [header]
  if (body) parts.push(body)
  if (coAuthor) parts.push(`Co-Authored-By: ${coAuthor} <noreply@anthropic.com>`)
  return parts.join('\n\n')
}

export const commit = (
  header: string,
  body?: string,
  coAuthor?: string,
  captureOutput = false,
): string => {
  const message = assembleMessage(header, body, coAuthor)
  const result = execSync('git commit -F -', {
    encoding: 'utf8',
    input: normalizeHeader(message),
    stdio: captureOutput ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
  })
  return result ?? ''
}
