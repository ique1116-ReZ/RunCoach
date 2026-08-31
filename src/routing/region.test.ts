import { describe, expect, it } from 'vitest'
import { isInChina } from './region'

describe('isInChina', () => {
  it.each([
    [[116.4, 39.9], true],
    [[121.47, 31.23], true],
    [[110.35, 20.02], true],
    [[139.69, 35.68], false],
    [[2.35, 48.86], false],
    [[106.9, 47.9], false]
  ] as const)('%j -> %s', (coord, expected) => {
    expect(isInChina([...coord])).toBe(expected)
  })
})
