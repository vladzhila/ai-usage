import { describe, expect, test } from 'bun:test'
import { THRESHOLD_WARNING, THRESHOLD_DANGER } from '../src/lib/constants.js'

describe('Constants', () => {
  test('thresholds are correct percentages', () => {
    expect(THRESHOLD_WARNING).toBe(0.5)
    expect(THRESHOLD_DANGER).toBe(0.8)
  })
})
