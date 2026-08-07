import { describe, expect, it } from 'vitest'
import {
  cellText,
  countMatchedFields,
  fieldText,
  headerKey,
  mapColumns,
  matchField,
  parseFilmDetails,
  unitFromHeader,
} from '../columns'
import { VERTICAL_COLUMNS } from '../parseVerticals'
import { verticalsGrid } from './fixtures'

describe('headerKey', () => {
  it('survives the whitespace the real headers carry', () => {
    // INPUT-FORMAT.md §3: `Library  number` has a double space, `Focal length ` a trailing one.
    expect(headerKey('Library  number')).toBe('library number')
    expect(headerKey('Focal length ')).toBe('focal length')
    expect(headerKey('  Sortie   number  ')).toBe('sortie number')
  })

  it('drops the punctuation and unit qualifiers that vary between templates', () => {
    expect(headerKey('Scale 1:')).toBe('scale 1')
    expect(headerKey('Film details (in inches)')).toBe('film details')
    expect(headerKey('Focal length (in inches)')).toBe('focal length')
    expect(headerKey('Map Reference (6 figure grid ref)')).toBe('map reference')
    expect(headerKey('Photo Reference (NGR and Index Number)')).toBe('photo reference')
  })

  it('is empty for a blank or non-header cell', () => {
    expect(headerKey(null)).toBe('')
    expect(headerKey('   ')).toBe('')
  })
})

describe('cellText', () => {
  it('renders numbers and blanks without inventing anything', () => {
    expect(cellText(10500)).toBe('10500')
    expect(cellText('  SK 421 849 ')).toBe('SK 421 849')
    expect(cellText(null)).toBe('')
    expect(cellText(undefined)).toBe('')
  })
})

describe('matchField', () => {
  it('matches the sample headers exactly', () => {
    expect(matchField('centre point', VERTICAL_COLUMNS)).toBe('centrePoint')
    expect(matchField('scale 1', VERTICAL_COLUMNS)).toBe('scaleDenominator')
    expect(matchField('film held by', VERTICAL_COLUMNS)).toBe('filmHeldBy')
  })

  it('does not confuse “Held” with “Film held by”', () => {
    expect(matchField('held', VERTICAL_COLUMNS)).toBe('held')
    expect(matchField('film held by', VERTICAL_COLUMNS)).toBe('filmHeldBy')
  })

  it('accepts an unambiguous prefix, so a wordier template still maps', () => {
    expect(matchField('centre point of frame', VERTICAL_COLUMNS)).toBe('centrePoint')
    expect(matchField('sortie number of the flight', VERTICAL_COLUMNS)).toBe('sortieNumber')
  })

  it('leaves an unrecognised header unmatched rather than guessing', () => {
    expect(matchField('emulsion batch', VERTICAL_COLUMNS)).toBeUndefined()
    expect(matchField('', VERTICAL_COLUMNS)).toBeUndefined()
  })
})

describe('mapColumns', () => {
  const grid = verticalsGrid()
  const headerRow = grid[12] ?? []
  const mapping = mapColumns(headerRow, VERTICAL_COLUMNS)

  it('maps every column of the sample listing past the blank spacers', () => {
    // Column letters from INPUT-FORMAT.md §3, zero-based: A is a spacer, so `Sortie number` is 1.
    expect(mapping.indexByField).toEqual({
      sortieNumber: 1,
      libraryNumber: 2,
      cameraPosition: 3,
      frameNumber: 4,
      held: 5,
      centrePoint: 6,
      run: 8,
      date: 9,
      sortieQuality: 12,
      scaleDenominator: 14,
      focalLength: 15,
      filmDetails: 16,
      filmHeldBy: 18,
    })
    expect(mapping.missingRequired).toEqual([])
    expect(mapping.unmapped).toEqual([])
  })

  it('keeps the header text as found, for the units it states', () => {
    expect(mapping.headerByField.filmDetails).toBe('Film details (in inches)')
    expect(mapping.headerByField.libraryNumber).toBe('Library number')
  })

  it('reports a missing required column instead of mapping the wrong one', () => {
    const withoutScale = mapColumns(
      ['Sortie number', 'Centre point', 'Film details', 'Held'],
      VERTICAL_COLUMNS,
    )
    expect(withoutScale.missingRequired).toEqual(['scaleDenominator'])
  })

  it('collects headers it does not recognise', () => {
    const mapped = mapColumns(['Centre point', 'Scale 1:', 'Film details', 'Emulsion batch'], VERTICAL_COLUMNS)
    expect(mapped.unmapped).toEqual(['Emulsion batch'])
  })
})

describe('fieldText', () => {
  it('reads by field, not by position, and is empty for an absent column', () => {
    const mapping = mapColumns(['Centre point', 'Scale 1:'], VERTICAL_COLUMNS)
    expect(fieldText(['SK 421 849', 10500], mapping, 'centrePoint')).toBe('SK 421 849')
    expect(fieldText(['SK 421 849', 10500], mapping, 'filmHeldBy')).toBe('')
  })
})

describe('countMatchedFields', () => {
  it('scores the header row far above the banner and data rows', () => {
    const grid = verticalsGrid()
    expect(countMatchedFields(grid[12] ?? [], VERTICAL_COLUMNS)).toBe(13)
    expect(countMatchedFields(grid[2] ?? [], VERTICAL_COLUMNS)).toBe(0) // HISTORIC ENGLAND banner
    expect(countMatchedFields(grid[9] ?? [], VERTICAL_COLUMNS)).toBe(0) // report title
    expect(countMatchedFields(grid[14] ?? [], VERTICAL_COLUMNS)).toBe(0) // first data row
  })
})

describe('unitFromHeader', () => {
  it('reads the unit the header states', () => {
    expect(unitFromHeader('Focal length (in inches)')).toBe('in')
    expect(unitFromHeader('Focal length (mm)')).toBe('mm')
    expect(unitFromHeader('Film details (in millimetres)')).toBe('mm')
  })

  it('falls back to the catalogue’s inches when the header says nothing', () => {
    expect(unitFromHeader('Focal length')).toBe('in')
    expect(unitFromHeader(undefined)).toBe('in')
    expect(unitFromHeader(undefined, 'mm')).toBe('mm')
  })
})

describe('parseFilmDetails', () => {
  it('reads the sample’s 9 x 9 inch frames as 228.6 mm', () => {
    const film = parseFilmDetails('Black and White 9 x 9')
    expect(film?.widthMm).toBeCloseTo(228.6, 10)
    expect(film?.heightMm).toBeCloseTo(228.6, 10)
    expect(film?.description).toBe('Black and White 9 x 9')
  })

  it('never truncates — a 9″ frame is 228.6 mm, not 228', () => {
    expect(Number.isInteger(parseFilmDetails('Colour 9 x 9')?.widthMm)).toBe(false)
    expect(parseFilmDetails('Black and White 8.25 x 8.25')?.widthMm).toBeCloseTo(209.55, 10)
  })

  it('reads the guide’s 35mm obliques in millimetres', () => {
    // INPUT-FORMAT.md §5: an explicit unit in the value wins over the column's default.
    expect(parseFilmDetails('Black and White 35mm')?.widthMm).toBe(35)
    expect(parseFilmDetails('Digital Colour 35mm')?.heightMm).toBe(35)
  })

  it('handles the punctuation and separators a format string might use', () => {
    expect(parseFilmDetails('Black and White 9" x 9"')?.widthMm).toBeCloseTo(228.6, 10)
    expect(parseFilmDetails('9x9')?.widthMm).toBeCloseTo(228.6, 10)
    expect(parseFilmDetails('Colour 9 × 9 inches')?.widthMm).toBeCloseTo(228.6, 10)
    expect(parseFilmDetails('Colour 70 mm x 70 mm')?.widthMm).toBe(70)
  })

  it('takes the first dimension as across-track', () => {
    const film = parseFilmDetails('Black and White 9 x 18')
    expect(film?.widthMm).toBeCloseTo(228.6, 10)
    expect(film?.heightMm).toBeCloseTo(457.2, 10)
  })

  it('honours a column that quotes millimetres', () => {
    expect(parseFilmDetails('Black and White 60 x 60', 'mm')?.widthMm).toBe(60)
  })

  it('returns null rather than guess a frame size', () => {
    // A wrong frame size scales the entire footprint, so no dimension means no record.
    expect(parseFilmDetails('Black and White')).toBeNull()
    expect(parseFilmDetails('Colour 9')).toBeNull()
    expect(parseFilmDetails('')).toBeNull()
    expect(parseFilmDetails(null)).toBeNull()
    expect(parseFilmDetails('Black and White 0 x 0')).toBeNull()
  })
})
