import { describe, expect, it } from 'vitest'
import {
  feetToMetres,
  formatCatalogueNumber,
  inchesToMm,
  metresToFeet,
  mmToInches,
  parseMeasurement,
  squareMetresToSquareMiles,
} from '../units'

describe('inch conversions', () => {
  it('converts the lens and film sizes the catalogue quotes', () => {
    expect(inchesToMm(6)).toBeCloseTo(152.4, 10)
    expect(inchesToMm(8.25)).toBeCloseTo(209.55, 10)
    expect(inchesToMm(9)).toBeCloseTo(228.6, 10)
    expect(inchesToMm(12)).toBeCloseTo(304.8, 10)
  })

  it('keeps the fraction — a 6″ lens is 152.4 mm, not 152 mm', () => {
    expect(inchesToMm(6)).not.toBe(152)
    expect(Number.isInteger(inchesToMm(6))).toBe(false)
  })

  it('round-trips', () => {
    expect(mmToInches(inchesToMm(9))).toBeCloseTo(9, 10)
  })
})

describe('foot conversions', () => {
  it('converts flying heights', () => {
    expect(feetToMetres(5250)).toBeCloseTo(1600.2, 10)
    expect(metresToFeet(1600.2)).toBeCloseTo(5250, 8)
  })
})

describe('squareMetresToSquareMiles', () => {
  it('matches the supplier guide’s own scale-to-area figures', () => {
    // archive/MATHS.md §4: the guide quotes c. 0.13, c. 2 and c. 4.5 square miles.
    expect(squareMetresToSquareMiles(571.5 ** 2)).toBeCloseTo(0.126, 3)
    expect(squareMetresToSquareMiles(2286 ** 2)).toBeCloseTo(2.018, 3)
    expect(squareMetresToSquareMiles(3429 ** 2)).toBeCloseTo(4.54, 2)
  })
})

describe('parseMeasurement', () => {
  it('reads numbers and numeric strings without truncating', () => {
    expect(parseMeasurement(152.4)).toBe(152.4)
    expect(parseMeasurement('152.4')).toBe(152.4)
    expect(parseMeasurement(' 10500 ')).toBe(10500)
    expect(parseMeasurement('10,500')).toBe(10500)
    expect(parseMeasurement('23.0')).toBe(23)
    expect(parseMeasurement(0)).toBe(0)
    expect(parseMeasurement(-1.5)).toBe(-1.5)
  })

  it('refuses anything that is not wholly a number', () => {
    // parseInt would happily return 6 for "6 inches" and 5356 for "5356A".
    expect(parseMeasurement('6 inches')).toBeNull()
    expect(parseMeasurement('5356A')).toBeNull()
    expect(parseMeasurement('')).toBeNull()
    expect(parseMeasurement('   ')).toBeNull()
    expect(parseMeasurement(null)).toBeNull()
    expect(parseMeasurement(undefined)).toBeNull()
    expect(parseMeasurement(NaN)).toBeNull()
    expect(parseMeasurement(Infinity)).toBeNull()
    expect(parseMeasurement({})).toBeNull()
  })
})

describe('formatCatalogueNumber', () => {
  it('renders Excel’s floats as the integers they are', () => {
    expect(formatCatalogueNumber(23)).toBe('23')
    expect(formatCatalogueNumber('23.0')).toBe('23')
    expect(formatCatalogueNumber(84282)).toBe('84282')
  })

  it('leaves values that are not numbers alone', () => {
    expect(formatCatalogueNumber('5356A')).toBe('5356A')
    expect(formatCatalogueNumber('MAL/74049(Z)')).toBe('MAL/74049(Z)')
    expect(formatCatalogueNumber('  OS/71509 ')).toBe('OS/71509')
    expect(formatCatalogueNumber(null)).toBe('')
    expect(formatCatalogueNumber(undefined)).toBe('')
  })
})
