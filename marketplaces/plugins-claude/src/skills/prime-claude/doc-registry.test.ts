import { buildEffectiveRegistry, BUILTIN_DOC_REGISTRY } from './doc-registry.js'

describe('buildEffectiveRegistry', () => {
  it('returns built-in registry with empty config', () => {
    expect.assertions(1)
    const registry = buildEffectiveRegistry({})
    expect(registry).toStrictEqual(BUILTIN_DOC_REGISTRY)
  })

  it('removes disabled entries', () => {
    expect.assertions(4)
    const registry = buildEffectiveRegistry({
      'prime-claude': { docs: { disabled: ['memory', 'sub-agents'] } },
    })

    expect(registry.has('memory')).toBeFalsy()
    expect(registry.has('sub-agents')).toBeFalsy()
    expect(registry.has('hooks')).toBeTruthy()
    expect(registry.size).toBe(BUILTIN_DOC_REGISTRY.size - 2)
  })

  it('merges additional entries', () => {
    expect.assertions(2)
    const registry = buildEffectiveRegistry({
      'prime-claude': {
        docs: {
          additional: { 'my-doc': 'https://example.com/doc.md' },
        },
      },
    })

    expect(registry.get('my-doc')).toBe('https://example.com/doc.md')
    expect(registry.size).toBe(BUILTIN_DOC_REGISTRY.size + 1)
  })

  it('overrides built-in URL with additional entry of same name', () => {
    expect.assertions(2)
    const customUrl = 'https://example.com/custom-hooks.md'
    const registry = buildEffectiveRegistry({
      'prime-claude': {
        docs: {
          additional: { hooks: customUrl },
        },
      },
    })

    expect(registry.get('hooks')).toBe(customUrl)
    expect(registry.size).toBe(BUILTIN_DOC_REGISTRY.size)
  })

  it('disabled removes built-in but additional re-adds with new URL', () => {
    expect.assertions(2)
    const customUrl = 'https://example.com/my-hooks.md'
    const registry = buildEffectiveRegistry({
      'prime-claude': {
        docs: {
          additional: { hooks: customUrl },
          disabled: ['hooks'],
        },
      },
    })

    expect(registry.get('hooks')).toBe(customUrl)
    expect(registry.size).toBe(BUILTIN_DOC_REGISTRY.size)
  })

  it('ignores disabled entries not in built-in registry', () => {
    expect.assertions(1)
    const registry = buildEffectiveRegistry({
      'prime-claude': { docs: { disabled: ['nonexistent'] } },
    })

    expect(registry.size).toBe(BUILTIN_DOC_REGISTRY.size)
  })
})
