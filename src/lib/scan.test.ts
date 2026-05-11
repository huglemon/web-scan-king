import { describe, expect, it } from 'vitest'
import {
  estimateDocumentCornersByLineScan,
  isFullFrameLikeCorners,
  normalizeCornerPoints,
  orderCornerPoints,
} from './scan'

describe('scan corner helpers', () => {
  it('orders detected points into stable document corners', () => {
    expect(
      orderCornerPoints([
        { x: 820, y: 1220 },
        { x: 140, y: 160 },
        { x: 900, y: 180 },
        { x: 120, y: 1180 },
      ]),
    ).toEqual({
      topLeftCorner: { x: 140, y: 160 },
      topRightCorner: { x: 900, y: 180 },
      bottomLeftCorner: { x: 120, y: 1180 },
      bottomRightCorner: { x: 820, y: 1220 },
    })
  })

  it('rejects incomplete corner sets before automatic extraction uses them', () => {
    expect(
      normalizeCornerPoints({
        topLeftCorner: { x: 0, y: 0 },
        topRightCorner: { x: 100, y: 0 },
        bottomLeftCorner: { x: 0, y: 100 },
      }),
    ).toBeNull()
  })

  it('detects full-image frame corners so auto crop can reject them', () => {
    expect(
      isFullFrameLikeCorners(
        {
          topLeftCorner: { x: 0, y: 0 },
          topRightCorner: { x: 1000, y: 0 },
          bottomLeftCorner: { x: 0, y: 1400 },
          bottomRightCorner: { x: 1000, y: 1400 },
        },
        1000,
        1400,
      ),
    ).toBe(true)

    expect(
      isFullFrameLikeCorners(
        {
          topLeftCorner: { x: 110, y: 90 },
          topRightCorner: { x: 880, y: 110 },
          bottomLeftCorner: { x: 120, y: 1250 },
          bottomRightCorner: { x: 860, y: 1240 },
        },
        1000,
        1400,
      ),
    ).toBe(false)
  })

  it('estimates a rectangle from low-contrast document edges', () => {
    const width = 240
    const height = 320
    const data = new Uint8Array(width * height).fill(228)

    for (let y = 55; y < 270; y += 1) {
      for (let x = 38; x < 205; x += 1) {
        data[y * width + x] = 238
      }
    }

    const corners = estimateDocumentCornersByLineScan({
      cols: width,
      rows: height,
      data,
    })

    expect(corners).not.toBeNull()
    expect(corners?.topLeftCorner.x).toBeGreaterThanOrEqual(34)
    expect(corners?.topLeftCorner.x).toBeLessThanOrEqual(42)
    expect(corners?.topLeftCorner.y).toBeGreaterThanOrEqual(51)
    expect(corners?.topLeftCorner.y).toBeLessThanOrEqual(59)
    expect(corners?.bottomRightCorner.x).toBeGreaterThanOrEqual(201)
    expect(corners?.bottomRightCorner.x).toBeLessThanOrEqual(209)
    expect(corners?.bottomRightCorner.y).toBeGreaterThanOrEqual(266)
    expect(corners?.bottomRightCorner.y).toBeLessThanOrEqual(274)
  })
})
