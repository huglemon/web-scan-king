import { describe, expect, it } from 'vitest'
import {
  calculateDisplayName,
  enhancePixels,
  fitWithin,
  formatBytes,
  getRotatedSize,
  normalizeEnhanceStrength,
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

describe('enhancement helpers', () => {
  it('keeps enhancement strength inside the supported range', () => {
    expect(normalizeEnhanceStrength(-20)).toBe(0)
    expect(normalizeEnhanceStrength(47.6)).toBe(48)
    expect(normalizeEnhanceStrength(140)).toBe(100)
    expect(normalizeEnhanceStrength(Number.NaN)).toBe(62)
  })

  it('normalizes shadowed paper while preserving dark ink', () => {
    const pixels = new Uint8ClampedArray([
      90, 90, 90, 255,
      120, 120, 120, 255,
      155, 155, 155, 255,
      24, 24, 24, 255,
    ])

    const enhanced = enhancePixels(pixels, 2, 2, {
      mode: 'gray',
      strength: 80,
    })

    expect(enhanced[0]).toBeGreaterThan(pixels[0])
    expect(enhanced[4]).toBeGreaterThan(pixels[4])
    expect(enhanced[8]).toBeGreaterThan(pixels[8])
    expect(enhanced[12]).toBeLessThan(60)
    expect(enhanced[3]).toBe(255)
  })

  it('creates adaptive black and white output for document mode', () => {
    const pixels = new Uint8ClampedArray([
      235, 235, 235, 255,
      210, 210, 210, 255,
      80, 80, 80, 255,
      20, 20, 20, 255,
    ])

    const enhanced = enhancePixels(pixels, 2, 2, {
      mode: 'document',
      strength: 70,
    })

    expect(enhanced[0]).toBe(255)
    expect(enhanced[4]).toBe(255)
    expect(enhanced[8]).toBeLessThan(30)
    expect(enhanced[12]).toBeLessThan(30)
  })
})
