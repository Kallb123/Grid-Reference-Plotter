/**
 * Synthetic supplier sheets, built from the layout recorded in INPUT-FORMAT.md §3 and §6.
 *
 * Supplier files are customer enquiry data and third-party catalogue records, so they stay out of
 * the repository — the format is documented instead and the fixtures are built from the document.
 * Everything structural about the real sample is reproduced here: twelve banner rows above the
 * header, a header continuation row carrying only `(in inches)`, blank spacer columns at A, H,
 * K–L, N, R and T–U, merged report cells, and the `Total Sorties` / `Total Frames` trailer with
 * its value two columns right of a merged label.
 */

import * as XLSX from 'xlsx'
import type { CellValue } from '../columns'

/** 1-based row number of the header row in these fixtures, matching the real sample. */
export const HEADER_LINE = 13
/** 1-based row number of the first data row: the header continuation sits between. */
export const FIRST_DATA_LINE = 15

/** Column indices, from the letters in INPUT-FORMAT.md §3. A, H, K, L, N, R, T and U are spacers. */
const COLUMN = {
  sortie: 1, // B
  library: 2, // C
  camera: 3, // D
  frame: 4, // E
  held: 5, // F
  centre: 6, // G, merged G:H
  run: 8, // I
  date: 9, // J, merged J:L
  quality: 12, // M, merged M:N
  scale: 14, // O
  focal: 15, // P
  film: 16, // Q, merged Q:R
  filmHeldBy: 18, // S, merged S:U
} as const

const WIDTH = 21 // through column U

export interface VerticalFixtureRow {
  sortie?: CellValue
  library?: CellValue
  camera?: CellValue
  frame?: CellValue
  held?: CellValue
  centre?: CellValue
  run?: CellValue
  date?: CellValue
  quality?: CellValue
  scale?: CellValue
  focal?: CellValue
  film?: CellValue
  filmHeldBy?: CellValue
}

/**
 * Rows quoted from INPUT-FORMAT.md — the first is the worked example in §4, whose derived
 * numbers (E 442150 / N 384950, a 2400.3 m square, 1600 m AGL) the tests assert against.
 * `5356A` is there because a library number is text however numeric it looks, and frame `23`
 * because Excel hands it over as a float that must display without a decimal point.
 */
export const SAMPLE_VERTICAL_ROWS: readonly VerticalFixtureRow[] = [
  {
    sortie: 'MAL/67055',
    library: '4777',
    camera: 'V',
    frame: 23,
    held: 'P',
    centre: 'SK 421 849',
    run: 1,
    date: '13 JUN 1967',
    quality: 'A',
    scale: 10500,
    focal: 6,
    film: 'Black and White 9 x 9',
    filmHeldBy: 'NMR',
  },
  {
    sortie: 'MAL/68058',
    library: '5356A',
    camera: 'V',
    frame: 160,
    held: 'P',
    centre: 'SK 430 855',
    run: 9,
    date: '19 AUG 1968',
    quality: 'A',
    scale: 10000,
    focal: 6,
    film: 'Black and White 9 x 9',
    filmHeldBy: 'NMR',
  },
  {
    sortie: 'OS/71509',
    library: '10192',
    camera: 'V',
    frame: 7,
    held: 'P',
    centre: 'SK 430 856',
    run: 2,
    date: '12 SEP 1971',
    quality: 'A',
    scale: 7000,
    focal: 12,
    film: 'Black and White 9 x 9',
    filmHeldBy: 'NMR',
  },
  {
    sortie: 'OS/08047',
    library: '24825',
    camera: 'V',
    frame: 64,
    held: 'N',
    centre: 'SK 423 851',
    run: 4,
    date: '01 JUL 2008',
    quality: 'A',
    scale: 10000,
    focal: 6,
    film: 'Colour 9 x 9',
    filmHeldBy: 'NMR',
  },
]

export interface VerticalsSheetOptions {
  /** Defaults to the row count, as a well-formed sheet's trailer does. */
  totalFrames?: number | null
  totalSorties?: number | null
}

/** A verticals sheet as a grid of raw cell values, banner and trailer included. */
export function verticalsGrid(
  rows: readonly VerticalFixtureRow[] = SAMPLE_VERTICAL_ROWS,
  options: VerticalsSheetOptions = {},
): CellValue[][] {
  const grid: CellValue[][] = [
    blank(),
    blank(),
    cells({ 7: 'HISTORIC ENGLAND' }),
    blank(),
    cells({ 7: 'Air Photographs' }),
    blank(),
    blank(),
    blank(),
    blank(),
    cells({ 0: 'Full single listing - Verticals, Standard order' }),
    cells({ 0: 'Customer enquiry reference: 134025' }),
    blank(),
    cells({
      [COLUMN.sortie]: 'Sortie number',
      // The real header has a double space here, and a trailing one on `Focal length`.
      [COLUMN.library]: 'Library  number',
      [COLUMN.camera]: 'Camera position',
      [COLUMN.frame]: 'Frame number',
      [COLUMN.held]: 'Held',
      [COLUMN.centre]: 'Centre point',
      [COLUMN.run]: 'Run',
      [COLUMN.date]: 'Date',
      [COLUMN.quality]: 'Sortie quality',
      [COLUMN.scale]: 'Scale 1:',
      [COLUMN.focal]: 'Focal length ',
      [COLUMN.film]: 'Film details (in inches)',
      [COLUMN.filmHeldBy]: 'Film held by',
    }),
    cells({ [COLUMN.focal]: '(in inches)' }),
  ]

  for (const row of rows) {
    grid.push(
      cells({
        [COLUMN.sortie]: row.sortie ?? null,
        [COLUMN.library]: row.library ?? null,
        [COLUMN.camera]: row.camera ?? null,
        [COLUMN.frame]: row.frame ?? null,
        [COLUMN.held]: row.held ?? null,
        [COLUMN.centre]: row.centre ?? null,
        [COLUMN.run]: row.run ?? null,
        [COLUMN.date]: row.date ?? null,
        [COLUMN.quality]: row.quality ?? null,
        [COLUMN.scale]: row.scale ?? null,
        [COLUMN.focal]: row.focal ?? null,
        [COLUMN.film]: row.film ?? null,
        [COLUMN.filmHeldBy]: row.filmHeldBy ?? null,
      }),
    )
  }

  // The label is merged across O:P, which puts its value in Q — hence "two columns right".
  const totalSorties = options.totalSorties === undefined ? rows.length : options.totalSorties
  const totalFrames = options.totalFrames === undefined ? rows.length : options.totalFrames
  if (totalSorties !== null) {
    grid.push(cells({ [COLUMN.scale]: 'Total Sorties ', [COLUMN.film]: totalSorties }))
  }
  if (totalFrames !== null) {
    grid.push(cells({ [COLUMN.scale]: 'Total Frames', [COLUMN.film]: totalFrames }))
  }
  grid.push(blank(), blank())

  return grid
}

export interface ObliqueFixtureRow {
  photoReference?: CellValue
  filmAndFrame?: CellValue
  originalNumber?: CellValue
  date?: CellValue
  filmType?: CellValue
  mapReference?: CellValue
}

/**
 * Rows for the oblique layout of INPUT-FORMAT.md §6.
 *
 * **Inferred, not observed** — no oblique result set has been seen, so this fixture reproduces
 * the field list from the supplier's guide and nothing more. It is not evidence about column
 * order or spacer columns, and the tests using it assert only what the guide states.
 */
export const SAMPLE_OBLIQUE_ROWS: readonly ObliqueFixtureRow[] = [
  {
    photoReference: 'SK 4218/49',
    filmAndFrame: 'EPW012345',
    originalNumber: '12345',
    date: '21 MAY 1926',
    filmType: 'Black and White 35mm',
    mapReference: 'SK 421 849',
  },
  {
    photoReference: 'SK 4308/12',
    filmAndFrame: 'EAW067890',
    originalNumber: '67890',
    date: '03 JUL 1953',
    filmType: 'Digital Colour 35mm',
    mapReference: 'SK 430 855',
  },
]

/** An oblique sheet as a grid, with the same banner-and-trailer report furniture. */
export function obliquesGrid(
  rows: readonly ObliqueFixtureRow[] = SAMPLE_OBLIQUE_ROWS,
): CellValue[][] {
  const grid: CellValue[][] = [
    blank(),
    cells({ 3: 'HISTORIC ENGLAND' }),
    blank(),
    cells({ 0: 'Full single listing - Obliques, Standard order' }),
    blank(),
    cells({
      1: 'Photo Reference (NGR and Index Number)',
      3: 'Film and Frame Number',
      5: 'Original Number',
      7: 'Date',
      9: 'Film type',
      11: 'Map Reference (6 figure grid ref)',
    }),
  ]

  for (const row of rows) {
    grid.push(
      cells({
        1: row.photoReference ?? null,
        3: row.filmAndFrame ?? null,
        5: row.originalNumber ?? null,
        7: row.date ?? null,
        9: row.filmType ?? null,
        11: row.mapReference ?? null,
      }),
    )
  }

  grid.push(cells({ 9: 'Total Frames', 11: rows.length }))
  return grid
}

/**
 * Write grids out as real workbook bytes, so a test can exercise the SheetJS path rather than
 * hand the reader an array it built itself.
 *
 * Merged ranges are applied to prove the mapping survives them: a merged cell holds its value in
 * the top-left cell only, so both the header and its data must be read from the leftmost column
 * of the merge.
 */
export function writeWorkbookBytes(
  sheets: readonly { name: string; grid: readonly CellValue[][]; merges?: readonly string[] }[],
  bookType: XLSX.BookType = 'xls',
): Uint8Array {
  const workbook = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.grid as CellValue[][])
    if (sheet.merges !== undefined && sheet.merges.length > 0) {
      worksheet['!merges'] = sheet.merges.map((range) => XLSX.utils.decode_range(range))
    }
    // Excel truncates sheet names to 31 characters, which is why the real sample's tab name is
    // the unusable `R2.4a - Full single listing wit`.
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31))
  }

  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType }) as ArrayBuffer)
}

/** The merged ranges the real verticals sheet carries on its header and data rows. */
export function verticalsMerges(rowCount: number): string[] {
  const merges = ['A10:T10', 'A11:S11']
  // The header row and every data row; the continuation row between them is not merged.
  const dataLines = Array.from({ length: rowCount }, (_, index) => FIRST_DATA_LINE + index)
  for (const line of [HEADER_LINE, ...dataLines]) {
    merges.push(
      `G${line}:H${line}`,
      `J${line}:L${line}`,
      `M${line}:N${line}`,
      `Q${line}:R${line}`,
      `S${line}:U${line}`,
    )
  }
  const trailerStart = FIRST_DATA_LINE + rowCount
  for (const line of [trailerStart, trailerStart + 1]) {
    merges.push(`O${line}:P${line}`, `Q${line}:R${line}`)
  }
  return merges
}

function blank(): CellValue[] {
  return new Array<CellValue>(WIDTH).fill(null)
}

function cells(values: Readonly<Record<number, CellValue>>): CellValue[] {
  const row = blank()
  for (const [index, value] of Object.entries(values)) {
    row[Number(index)] = value
  }
  return row
}
