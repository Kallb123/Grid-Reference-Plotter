/**
 * Oblique listing rows → `ObliqueRecord[]`, plus a `ParseIssue` for every row that could not be
 * read.
 *
 * **This layout is inferred, not observed.** No oblique result set has been seen; the fields
 * come from the supplier's own guide (INPUT-FORMAT.md §6), the sheet's actual shape — column
 * order, exact header wording, spacer columns — does not. The header-driven mapping is what
 * makes that survivable: a wording we do not recognise lands in `ColumnMapping.unmapped` and,
 * if it is the grid reference column, produces one clear issue rather than a sheet of silent
 * nulls.
 *
 * No footprint is built here, and none can be. An oblique listing carries no scale, no focal
 * length, no camera height and no bearing, so the ground shape is not derivable from it — a
 * point is the honest answer, and `buildObliquePoint` in the domain layer is what draws it.
 */

import type { ObliqueRecord, ParseIssue, Provenance } from '../domain/types'
import { formatCatalogueNumber } from '../domain/units'
import type { ColumnMapping, ColumnSpec } from './columns'
import { fieldCell, fieldText, mapColumns } from './columns'
import type { SheetParse } from './parseVerticals'
import { describeFields, readGridRef, uniqueId } from './parseVerticals'
import type { SheetRow, SheetTable } from './readWorkbook'

export type ObliqueField =
  | 'photoReference'
  | 'filmAndFrameNumber'
  | 'originalNumber'
  | 'date'
  | 'filmType'
  | 'mapReference'

/**
 * The oblique listing's columns, from the guide's prose.
 *
 * `Map Reference` is the only required one — it is the six-figure centre point, and without it
 * there is nothing to plot. `Photo Reference` also embeds an NGR, but the guide names
 * `Map Reference` as the grid reference, so that is the column read rather than a guess unpicked
 * from a composite identifier.
 */
export const OBLIQUE_COLUMNS: readonly ColumnSpec<ObliqueField>[] = [
  { field: 'photoReference', aliases: ['photo reference'] },
  { field: 'filmAndFrameNumber', aliases: ['film and frame number'] },
  { field: 'originalNumber', aliases: ['original number'] },
  { field: 'date', aliases: ['date'] },
  { field: 'filmType', aliases: ['film type'] },
  { field: 'mapReference', aliases: ['map reference', 'map ref'], required: true },
]

export function parseObliques(table: SheetTable): SheetParse<ObliqueRecord> {
  const mapping = mapColumns(table.headers, OBLIQUE_COLUMNS)
  const records: ObliqueRecord[] = []
  const issues: ParseIssue[] = []

  if (mapping.missingRequired.length > 0) {
    issues.push({
      line: table.headerLine,
      sheet: table.sheetName,
      reason:
        `The oblique listing has no ${describeFields(mapping.missingRequired)} column, so its ` +
        `${table.rows.length} row${table.rows.length === 1 ? '' : 's'} could not be read.`,
      value: table.headers.filter((header) => header !== ''),
    })
    return { sheetName: table.sheetName, records, issues, rowsRead: table.rows.length }
  }

  const usedIds = new Set<string>()

  for (const row of table.rows) {
    const fail = (reason: string): void => {
      issues.push({ line: row.line, sheet: table.sheetName, reason, value: row.cells })
    }

    const ref = readGridRef(row, mapping, 'mapReference', 'Map Reference', fail)
    if (ref === null) continue

    const provenance = readObliqueProvenance(row, mapping)
    const record: ObliqueRecord = {
      kind: 'oblique',
      id: uniqueId(provenance.photoReference ?? provenance.frameNumber ?? '', row.line, usedIds),
      ref,
      provenance,
    }

    const filmType = fieldText(row.cells, mapping, 'filmType')
    if (filmType !== '') record.filmType = filmType

    records.push(record)
  }

  return { sheetName: table.sheetName, records, issues, rowsRead: table.rows.length }
}

/**
 * The oblique provenance columns.
 *
 * The mapping onto `Provenance` is deliberately narrow: `Film and Frame Number` is the frame
 * identifier, `Photo Reference` and `Original Number` are references assigned by the archive and
 * by the original source. Nothing is forced into a field that means something else — an oblique
 * listing has no sortie, camera position, quality or holding information at all.
 */
function readObliqueProvenance(row: SheetRow, mapping: ColumnMapping<ObliqueField>): Partial<Provenance> {
  const provenance: Partial<Provenance> = {}
  const keep = (key: 'photoReference' | 'originalNumber' | 'frameNumber' | 'date', value: string): void => {
    if (value !== '') provenance[key] = value
  }

  keep('photoReference', fieldText(row.cells, mapping, 'photoReference'))
  // `formatCatalogueNumber` rather than plain text: Excel hands numeric-looking references over
  // as floats, and `23.0` must read `23`.
  keep('originalNumber', formatCatalogueNumber(fieldCell(row.cells, mapping, 'originalNumber')))
  keep('frameNumber', formatCatalogueNumber(fieldCell(row.cells, mapping, 'filmAndFrameNumber')))
  keep('date', fieldText(row.cells, mapping, 'date'))

  return provenance
}
