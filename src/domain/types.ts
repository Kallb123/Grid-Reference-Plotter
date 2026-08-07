/**
 * Core domain types. Pure data — no Vue, no DOM, no I/O.
 *
 * Units are in the name throughout: this codebase has film millimetres, ground metres and
 * screen pixels in play at once, and a bare `width` is a bug waiting to happen.
 */

/** WGS84 position as `[longitude, latitude]` in degrees — GeoJSON axis order. */
export type LngLat = [number, number]

/** A corner of a footprint, in WGS84. */
export type Corner = LngLat

/** A position on the National Grid, in metres from the false origin (OSGB36). */
export interface GridPoint {
  easting: number
  northing: number
}

/**
 * A parsed Ordnance Survey National Grid reference.
 *
 * A grid reference denotes a *square*, not a point. `easting`/`northing` are the centre of
 * that square and `precisionM` is its side, so the position is only known to ±precisionM/2.
 */
export interface GridRef {
  /** As supplied, e.g. `"SK 421 849"`. */
  text: string
  /** Metres east of the National Grid false origin (OSGB36), at the centre of the square. */
  easting: number
  /** Metres north of the National Grid false origin (OSGB36), at the centre of the square. */
  northing: number
  /** Side of the square the reference denotes: 100000, 10000, 1000, 100, 10 or 1 metres. */
  precisionM: number
}

/** Film or sensor format. Catalogues quote inches; these are millimetres. */
export interface Film {
  /** Across-track dimension. A 9″ frame is 228.6. */
  widthMm: number
  /** Along-track dimension. */
  heightMm: number
  /** Kept verbatim for display, e.g. `"Black and White 9 x 9"`. */
  description: string
}

/**
 * Provenance columns: how a customer actually places an order. Carried through untouched.
 * See INPUT-FORMAT.md §3.
 */
export interface Provenance {
  sortieNumber: string
  /** Text, not a number — `"5356A"` is a real value. */
  libraryNumber: string
  /** Where the camera sat in the aircraft. NOT a vertical/oblique flag; see INPUT-FORMAT.md §5. */
  cameraPosition: string
  frameNumber: string
  run?: string
  /** `"13 JUN 1967"` as supplied — the source stores this as text, not an Excel date. */
  date?: string
  sortieQuality?: string
  /** `"P"` = print held, `"N"` = no print. Other codes are possible. */
  held?: string
  filmHeldBy?: string
}

/** A vertical frame: scale and film format are known, so a ground footprint is derivable. */
export interface VerticalRecord {
  kind: 'vertical'
  id: string
  ref: GridRef
  film: Film
  /** Nominal *target* scale as supplied by the catalogue, never a measurement. */
  scaleDenominator: number
  /** Redundant for the footprint; it yields the flying height, which is worth displaying. */
  focalLengthMm?: number
  provenance: Provenance
}

/**
 * An oblique frame. Obliques carry no scale, focal length, height or bearing, so a footprint
 * is not derivable — see INPUT-FORMAT.md §6. They are plotted as points.
 */
export interface ObliqueRecord {
  kind: 'oblique'
  id: string
  ref: GridRef
  filmType?: string
  provenance: Partial<Provenance>
}

export type PhotoRecord = VerticalRecord | ObliqueRecord

/** Which north a supplied heading is measured from. Grid north is not true north. */
export type HeadingConvention = 'grid' | 'true'

/** A flight heading, clockwise from the stated north. No known source supplies one yet. */
export interface Heading {
  degrees: number
  convention: HeadingConvention
}

/** The ground a vertical frame covers, as an indicative extent. */
export interface Footprint {
  record: VerticalRecord
  /** Across-track ground dimension in metres. */
  groundWidthM: number
  /** Along-track ground dimension in metres. */
  groundHeightM: number
  /** Height above the ground photographed: focal length × scale denominator. */
  flyingHeightM?: number
  /** WGS84 centre. */
  centre: LngLat
  /** WGS84 corners, clockwise from the top-left of the un-rotated frame. */
  corners: [Corner, Corner, Corner, Corner]
  /** Half the grid square the centre point came from: 50 m for a six-figure reference. */
  uncertaintyM: number
  /** Heading applied as a grid bearing, in degrees clockwise from grid north. */
  headingDeg: number
  /** Caveats the UI must show, e.g. that the scale is nominal. */
  notes: string[]
}

/** An oblique plotted honestly: a point, with the grid square's uncertainty attached. */
export interface PlottedPoint {
  record: ObliqueRecord
  /** WGS84 position. */
  position: LngLat
  /** Half the grid square the centre point came from. */
  uncertaintyM: number
  notes: string[]
}

/**
 * A row that could not be parsed. One bad line must never discard the other forty-nine, so
 * failures are collected here rather than thrown away or allowed to abort the file.
 */
export interface ParseIssue {
  /** 1-based row number in the source sheet. */
  line: number
  /** Plain-English explanation the UI can show as-is. */
  reason: string
  /** Sheet the row came from, where the source has more than one. */
  sheet?: string
  /** The offending value or row, for the detail view. */
  value?: unknown
}
