import { describe, expect, it } from 'vitest'
import { normalizeCornerPoints, orderCornerPoints } from './scan'

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
})
