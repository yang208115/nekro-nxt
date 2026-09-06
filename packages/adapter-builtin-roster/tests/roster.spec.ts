import { AdapterRegistry } from '@nekro-nxt/adapter-sdk'
import { describe, expect, it } from 'vitest'
import { BUILTIN_ADAPTER_CONTRIBUTIONS } from '../src/index.ts'

describe('first-party Adapter roster', () => {
  it('registers every V2 contribution through the generic Registry without duplicate keys', async () => {
    const registry = new AdapterRegistry()
    const handles = BUILTIN_ADAPTER_CONTRIBUTIONS.map((contribution, index) =>
      registry.register(`builtin-fixture-${index}`, contribution),
    )

    expect(registry.list()).toHaveLength(BUILTIN_ADAPTER_CONTRIBUTIONS.length)
    expect(new Set(registry.list().map(({ descriptor }) => descriptor.key)).size).toBe(
      BUILTIN_ADAPTER_CONTRIBUTIONS.length,
    )
    expect(registry.list().every(({ apiVersion }) => apiVersion === 2)).toBe(true)

    await Promise.all(handles.map((handle) => handle.dispose()))
    expect(registry.list()).toEqual([])
  })
})
