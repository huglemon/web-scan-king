import { describe, expect, it } from 'vitest'
import {
  calculateDisplayName,
  fitWithin,
  formatBytes,
  getRotatedSize,
  normalizeRotation,
} from './testable'

describe('image sizing helpers', () => {
  it('keeps images inside a maximum box without upscaling', () => {
    expect(fitWithin(4000, 2000, 1000, 1000)).toEqual({
      width: 1000,
      height: 500,
      scale: 0.25,
    })

    expect(fitWithin(600, 400, 1000, 1000)).toEqual({
      width: 600,
      height: 400,
      scale: 1,
    })
  })

  it('normalizes rotation and swaps dimensions for right angles', () => {
    expect(normalizeRotation(-90)).toBe(270)
    expect(getRotatedSize(800, 1200, 90)).toEqual({
      width: 1200,
      height: 800,
    })
    expect(getRotatedSize(800, 1200, 180)).toEqual({
      width: 800,
      height: 1200,
    })
  })
})

describe('display helpers', () => {
  it('formats file sizes for compact UI labels', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB')
  })

  it('uses file names when present and falls back to page numbers', () => {
    expect(calculateDisplayName(0, 'invoice.png')).toBe('invoice')
    expect(calculateDisplayName(1)).toBe('扫描页 2')
  })
})
