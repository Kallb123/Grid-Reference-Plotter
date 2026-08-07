/**
 * The wiring from a dropped file to what the map draws.
 *
 * The geometry itself is tested in `src/domain/`; what is asserted here is that a real workbook's
 * bytes come out the other end as footprints, points and issues, and that the numbers reaching
 * the map are the ones INPUT-FORMAT.md §4 works through by hand.
 */

import { describe, expect, it } from 'vitest'
import {
  HEADER_LINE,
  SAMPLE_VERTICAL_ROWS,
  obliquesGrid,
  verticalsGrid,
  verticalsMerges,
  writeWorkbookBytes,
} from '../../io/__tests__/fixtures'
import { usePhotoSet } from '../usePhotoSet'

function workbookFile(name = 'enquiry_Verticals.xls', bytes = verticalsWorkbook()): File {
  return new File([bytes as BlobPart], name)
}

function verticalsWorkbook(rows = SAMPLE_VERTICAL_ROWS): Uint8Array {
  return writeWorkbookBytes([
    {
      name: 'R2.4a - Full single listing wit',
      grid: verticalsGrid(rows),
      merges: verticalsMerges(rows.length),
    },
  ])
}

describe('usePhotoSet', () => {
  it('starts empty', () => {
    const photos = usePhotoSet()

    expect(photos.status.value).toBe('empty')
    expect(photos.isEmpty.value).toBe(true)
    expect(photos.bounds.value).toBeNull()
    expect(photos.selected.value).toBeNull()
  })

  it('turns a supplier workbook into footprints', async () => {
    const photos = usePhotoSet()
    await photos.loadFile(workbookFile())

    expect(photos.status.value).toBe('loaded')
    expect(photos.fileName.value).toBe('enquiry_Verticals.xls')
    expect(photos.footprints.value).toHaveLength(SAMPLE_VERTICAL_ROWS.length)
    expect(photos.errors.value).toHaveLength(0)

    // The worked example of INPUT-FORMAT.md §4: SK 421 849 at 1:10500 on a 9″ frame.
    const [first] = photos.footprints.value
    expect(first?.record.id).toBe('MAL/67055 frame 23')
    expect(first?.groundWidthM).toBeCloseTo(2400.3, 1)
    expect(first?.flyingHeightM).toBeCloseTo(1600.2, 1)

    // WGS84, not OSGB36. Plotting the untransformed latitude would put this 107 m out.
    const [lng, lat] = first?.centre ?? [0, 0]
    expect(lat).toBeCloseTo(53.359754, 4)
    expect(lng).toBeCloseTo(-1.368131, 4)
  })

  it('plots obliques as points and never as footprints', async () => {
    const photos = usePhotoSet()
    const bytes = writeWorkbookBytes([{ name: 'Obliques', grid: obliquesGrid() }])
    await photos.loadFile(workbookFile('enquiry_Obliques.xls', bytes))

    expect(photos.footprints.value).toHaveLength(0)
    expect(photos.points.value).toHaveLength(2)
    expect(photos.points.value[0]?.uncertaintyM).toBe(50)
    expect(photos.points.value[0]?.notes.join(' ')).toContain('no ground extent can be derived')
  })

  it('gives the map a box covering everything plotted', async () => {
    const photos = usePhotoSet()
    await photos.loadFile(workbookFile())

    const bounds = photos.bounds.value
    expect(bounds).not.toBeNull()
    for (const footprint of photos.footprints.value) {
      for (const [lng, lat] of footprint.corners) {
        expect(lng).toBeGreaterThanOrEqual(bounds!.west)
        expect(lng).toBeLessThanOrEqual(bounds!.east)
        expect(lat).toBeGreaterThanOrEqual(bounds!.south)
        expect(lat).toBeLessThanOrEqual(bounds!.north)
      }
    }
  })

  it('keeps the good rows when one is malformed, and says which failed', async () => {
    const rows = [
      ...SAMPLE_VERTICAL_ROWS,
      { ...SAMPLE_VERTICAL_ROWS[0], sortie: 'MAL/67055', frame: 99, centre: 'ZZ 999 999' },
    ]
    const photos = usePhotoSet()
    await photos.loadFile(workbookFile('mixed.xls', verticalsWorkbook(rows)))

    expect(photos.footprints.value).toHaveLength(SAMPLE_VERTICAL_ROWS.length)
    expect(photos.errors.value).toHaveLength(1)
    expect(photos.errors.value[0]?.line).toBe(HEADER_LINE + 1 + rows.length)
    expect(photos.errors.value[0]?.reason).toContain('ZZ 999 999')
  })

  it('separates warnings from rows that were dropped', async () => {
    const rows = [{ ...SAMPLE_VERTICAL_ROWS[0], focal: 'not a number' }]
    const photos = usePhotoSet()
    await photos.loadFile(workbookFile('warn.xls', verticalsWorkbook(rows)))

    // The frame is kept — focal length only yields the flying height — but the loss is reported.
    expect(photos.footprints.value).toHaveLength(1)
    expect(photos.footprints.value[0]?.flyingHeightM).toBeUndefined()
    expect(photos.errors.value).toHaveLength(0)
    expect(photos.warnings.value).toHaveLength(1)
    expect(photos.warnings.value[0]?.reason).toContain('Focal length')
  })

  it('reports a file that is not a spreadsheet at all', async () => {
    const photos = usePhotoSet()
    await photos.loadFile(workbookFile())
    expect(photos.footprints.value.length).toBeGreaterThan(0)

    // A `.zip` header with nothing behind it: the reader itself throws rather than returning a
    // sheet, which is the one failure that is about the file rather than about a row.
    const notAWorkbook = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0])
    await photos.loadFile(new File([notAWorkbook], 'holiday-snaps.zip'))

    expect(photos.status.value).toBe('failed')
    expect(photos.loadError.value).toContain('holiday-snaps.zip')
    // The previous file's frames must not be left on the map under the new file's name.
    expect(photos.footprints.value).toHaveLength(0)
    expect(photos.isEmpty.value).toBe(true)
  })

  it('reports a readable file that carries no listing, rather than an empty map', async () => {
    const photos = usePhotoSet()
    await photos.loadFile(new File([new TextEncoder().encode('name,total\nwidget,4\n')], 'sales.csv'))

    expect(photos.status.value).toBe('loaded')
    expect(photos.isEmpty.value).toBe(true)
    // Nothing plotted, but the reason is on screen rather than an unexplained blank map.
    expect(photos.issues.value.map((issue) => issue.reason).join(' ')).toContain(
      'No header row was found',
    )
  })

  it('selects a frame by id and resolves it to what was plotted', async () => {
    const photos = usePhotoSet()
    await photos.loadFile(workbookFile())

    photos.select('MAL/67055 frame 23')
    expect(photos.selected.value).toEqual({ kind: 'vertical', footprint: photos.footprints.value[0] })

    photos.select('a frame that is not in this listing')
    expect(photos.selected.value).toBeNull()

    photos.select(null)
    expect(photos.selected.value).toBeNull()
  })

  it('drops the selection when a new file is loaded', async () => {
    const photos = usePhotoSet()
    await photos.loadFile(workbookFile())
    photos.select('MAL/67055 frame 23')

    await photos.loadFile(workbookFile('again.xls'))
    expect(photos.selectedId.value).toBeNull()
  })

  it('clears back to the empty state', async () => {
    const photos = usePhotoSet()
    await photos.loadFile(workbookFile())
    photos.clear()

    expect(photos.status.value).toBe('empty')
    expect(photos.fileName.value).toBeNull()
    expect(photos.footprints.value).toHaveLength(0)
    expect(photos.issues.value).toHaveLength(0)
    expect(photos.bounds.value).toBeNull()
  })

  it('ignores a slow load that has been superseded', async () => {
    const photos = usePhotoSet()
    const superseded = photos.loadFile(workbookFile('first.xls'))
    const winner = photos.loadFile(workbookFile('second.xls', verticalsWorkbook([])))

    await Promise.all([superseded, winner])

    // The second load finished last and it is the one the user asked for; the first must not
    // overwrite it with its own results just because it resolved late.
    expect(photos.fileName.value).toBe('second.xls')
    expect(photos.footprints.value).toHaveLength(0)
  })
})
