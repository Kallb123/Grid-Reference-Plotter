/**
 * The catalogue's dates. The parser is narrow on purpose — handing an arbitrary string to `Date`
 * gets a plausible wrong answer out of some of these — so the refusals matter as much as the
 * successes.
 */

import { describe, expect, it } from 'vitest'
import { catalogueYear, parseCatalogueDate } from '../catalogueDate'

describe('parseCatalogueDate', () => {
  it('reads the archive’s dd MMM yyyy', () => {
    expect(parseCatalogueDate('13 JUN 1967')).toBe(Date.UTC(1967, 5, 13))
    expect(parseCatalogueDate('01 JUL 2008')).toBe(Date.UTC(2008, 6, 1))
    // Case and stray whitespace are the report template's business, not the ordering's.
    expect(parseCatalogueDate(' 3 sep 1971 ')).toBe(Date.UTC(1971, 8, 3))
    expect(parseCatalogueDate('12 September 1971')).toBe(Date.UTC(1971, 8, 12))
  })

  it('refuses anything that is not a date in that form', () => {
    expect(parseCatalogueDate('')).toBeNull()
    expect(parseCatalogueDate('1967')).toBeNull()
    expect(parseCatalogueDate('13/06/1967')).toBeNull()
    expect(parseCatalogueDate('13 JUX 1967')).toBeNull()
    expect(parseCatalogueDate('31 FEB 1967')).toBeNull()
  })
})

describe('catalogueYear', () => {
  it('is the year of a date it can read', () => {
    expect(catalogueYear('13 JUN 1967')).toBe(1967)
    expect(catalogueYear('01 JUL 2008')).toBe(2008)
  })

  it('finds the year in a date it cannot otherwise read', () => {
    // Filtering by decade should not be defeated by a listing that omits the day.
    expect(catalogueYear('JUN 1967')).toBe(1967)
    expect(catalogueYear('1967')).toBe(1967)
    expect(catalogueYear('13/06/1971')).toBe(1971)
  })

  it('is null where the listing gives no year', () => {
    expect(catalogueYear(undefined)).toBeNull()
    expect(catalogueYear('')).toBeNull()
    expect(catalogueYear('undated')).toBeNull()
    // Not every four-digit number in a cell is a year; these are outside the range of aerial
    // photography and must not be read as one.
    expect(catalogueYear('5356')).toBeNull()
    expect(catalogueYear('2999')).toBeNull()
  })
})
