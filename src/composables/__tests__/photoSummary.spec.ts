import { describe, expect, it } from 'vitest'
import { buildFootprint, buildObliquePoint } from '../../domain/footprint'
import { parseGridRef } from '../../domain/osgb'
import type { ObliqueRecord, VerticalRecord } from '../../domain/types'
import { footprintSummary, formatArea, formatPosition, pointSummary } from '../photoSummary'

/** The worked example of INPUT-FORMAT.md §4. */
const verticalRecord: VerticalRecord = {
  kind: 'vertical',
  id: 'MAL/67055 frame 23',
  ref: parseGridRef('SK 421 849'),
  film: { widthMm: 228.6, heightMm: 228.6, description: 'Black and White 9 x 9' },
  scaleDenominator: 10500,
  focalLengthMm: 152.4,
  provenance: {
    sortieNumber: 'MAL/67055',
    libraryNumber: '4777',
    cameraPosition: 'V',
    frameNumber: '23',
    run: '1',
    date: '13 JUN 1967',
    sortieQuality: 'A',
    held: 'P',
    filmHeldBy: 'NMR',
  },
}

const obliqueRecord: ObliqueRecord = {
  kind: 'oblique',
  id: 'EPW012345',
  ref: parseGridRef('SK 421 849'),
  filmType: 'Black and White 35mm',
  provenance: { photoReference: 'SK 4218/49', date: '21 MAY 1926' },
}

function valueOf(lines: readonly { label: string; value: string }[], label: string): string {
  return lines.find((line) => line.label === label)?.value ?? ''
}

describe('footprintSummary', () => {
  const summary = footprintSummary(buildFootprint(verticalRecord))

  it('leads with the frame’s identity and date', () => {
    expect(summary.title).toBe('MAL/67055 frame 23')
    expect(summary.subtitle).toBe('Vertical frame, 13 JUN 1967')
  })

  it('states the grid square’s uncertainty, not a bare position', () => {
    expect(valueOf(summary.lines, 'Centre point')).toBe('SK 421 849 (±50 m)')
  })

  it('gives the ground extent the supplier’s own guide would recognise', () => {
    // 0.2286 m × 10500 = 2400.3 m square.
    expect(valueOf(summary.lines, 'Ground extent')).toContain('2,400 × 2,400 m')
    expect(valueOf(summary.lines, 'Ground extent')).toContain('sq miles')
  })

  it('calls the scale nominal, because that is what it is', () => {
    expect(valueOf(summary.lines, 'Scale')).toBe('1:10,500 (nominal)')
  })

  it('reports the flying height above ground, in feet as well as metres', () => {
    // 0.1524 m × 10500 = 1600.2 m, the 5250 ft of INPUT-FORMAT.md §4.
    expect(valueOf(summary.lines, 'Flying height')).toBe('1,600 m above ground (5,250 ft)')
  })

  it('omits the flying height when no focal length was supplied', () => {
    const withoutFocalLength: VerticalRecord = { ...verticalRecord }
    delete withoutFocalLength.focalLengthMm
    const lines = footprintSummary(buildFootprint(withoutFocalLength)).lines
    expect(lines.some((line) => line.label === 'Flying height')).toBe(false)
  })

  it('keeps the ordering columns apart from the derived numbers', () => {
    expect(summary.lines.some((line) => line.label === 'Sortie')).toBe(false)
    expect(valueOf(summary.provenance, 'Sortie')).toBe('MAL/67055')
    expect(valueOf(summary.provenance, 'Library number')).toBe('4777')
    expect(valueOf(summary.provenance, 'Held')).toBe('P — print held')
  })

  it('carries the domain’s caveats through untouched', () => {
    expect(summary.notes).toEqual(buildFootprint(verticalRecord).notes)
    expect(summary.notes.join(' ')).toContain('nominal target')
  })
})

describe('pointSummary', () => {
  const summary = pointSummary(buildObliquePoint(obliqueRecord))

  it('is a position and an uncertainty, with no extent anywhere in it', () => {
    expect(summary.subtitle).toBe('Oblique photograph, 21 MAY 1926')
    expect(valueOf(summary.lines, 'Map reference')).toBe('SK 421 849 (±50 m)')
    expect(summary.lines.some((line) => line.label === 'Ground extent')).toBe(false)
    expect(summary.lines.some((line) => line.label === 'Scale')).toBe(false)
    expect(summary.notes.join(' ')).toContain('no ground extent can be derived')
  })

  it('leaves out fields an oblique listing does not carry', () => {
    expect(summary.provenance.some((line) => line.label === 'Sortie')).toBe(false)
    expect(valueOf(summary.provenance, 'Photo reference')).toBe('SK 4218/49')
  })
})

describe('formatting', () => {
  it('writes a position with a hemisphere rather than a minus sign', () => {
    expect(formatPosition([-1.368131, 53.359754])).toBe('53.35975° N, 1.36813° W')
    expect(formatPosition([1.5, -0.5])).toBe('0.50000° S, 1.50000° E')
  })

  it('agrees with the archive’s own scale-to-area table', () => {
    // INPUT-FORMAT.md §4: 1:2500 ≈ 0.13 sq miles, 1:10 000 ≈ 2, 1:15 000 ≈ 4.5.
    expect(formatArea(571.5 * 571.5)).toContain('0.13 sq miles')
    expect(formatArea(2286 * 2286)).toContain('2.0 sq miles')
    expect(formatArea(3429 * 3429)).toContain('4.5 sq miles')
  })
})
