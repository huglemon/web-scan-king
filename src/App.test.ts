import { describe, expect, it } from 'vitest'
import { mapClientPointToImagePoint } from './lib/frame'

describe('manual frame coordinate mapping', () => {
  it('maps pointer positions against the displayed image rectangle', () => {
    expect(
      mapClientPointToImagePoint(
        150,
        220,
        { left: 100, top: 200, width: 250, height: 400 },
        1000,
        1600,
      ),
    ).toEqual({ x: 200, y: 80 })
  })

  it('clamps dragged corners inside the original image bounds', () => {
    expect(
      mapClientPointToImagePoint(
        20,
        900,
        { left: 100, top: 200, width: 250, height: 400 },
        1000,
        1600,
      ),
    ).toEqual({ x: 0, y: 1600 })
  })
})
