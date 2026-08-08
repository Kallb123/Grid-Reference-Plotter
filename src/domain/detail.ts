/**
 * Scale, translated into what you would actually be able to see.
 *
 * `1:10 500` is the number the catalogue gives and it is meaningless to most people buying a
 * photograph. What they know is the question they came with — *can I see the extension on the
 * back of the house, or am I after the shape of the village?* — and the whole of the answer is
 * carried in a number they have no feel for.
 *
 * So the scales are grouped into bands, coarsest first, and each band says what a frame at that
 * scale shows and what it does not. The bands are a presentation of the catalogue's own number
 * and nothing more: no frame is re-measured here, no resolution is claimed for a print nobody
 * has seen, and a frame's band changes only if its scale does. What the descriptions rest on is
 * the geometry that is already in this codebase — the ground a 9″ frame covers at a given scale
 * (`footprint.ts`), and the sizes of the things on it.
 *
 * The band boundaries are the round scales British air surveys are actually flown at — 1:2500,
 * 1:5000, 1:10 000, 1:20 000, 1:40 000 — so a survey lands squarely inside a band rather than
 * straddling two of them. The Historic England sample runs 1:2500 to 1:12 000 (INPUT-FORMAT.md
 * §4), which is the middle three.
 *
 * The trade runs both ways, which is why each band says what it costs as well as what it buys:
 * a finer scale is a smaller picture of less ground, and the finest frames in a listing are the
 * ones most likely to miss the site altogether.
 */

export type DetailBandKey =
  | 'landscape'
  | 'town'
  | 'district'
  | 'neighbourhood'
  | 'street'
  | 'plot'

export interface DetailBand {
  key: DetailBandKey
  /** Two or three words, for the slider's current position. */
  label: string
  /** What can be made out on a frame at this scale. */
  visible: string
  /**
   * What cannot — or, at the fine end, what it costs.
   *
   * Every band has one. A slider whose descriptions only got better as it moved right would
   * read as a quality setting, and the finest frames in a listing are the likeliest to miss the
   * site entirely.
   */
  cost: string
  /**
   * The coarsest scale in the band: the largest denominator it contains, inclusive.
   *
   * `Infinity` on the first band, which has no coarse limit. A band's fine limit is the next
   * band's `coarsestDenominator`, exclusive — see `detailBandRange`.
   */
  coarsestDenominator: number
}

/**
 * The bands, coarsest first, so an index into this array *is* a position on the slider: 0 is
 * "any detail will do" and the last is "as fine as this listing gets".
 */
export const DETAIL_BANDS: readonly DetailBand[] = [
  {
    key: 'landscape',
    label: 'Landscape',
    coarsestDenominator: Infinity,
    visible:
      'A whole landscape in one frame — river valleys, moorland, a stretch of coast and the ' +
      'towns strung along it.',
    cost: 'Nothing built is separable. A town is a grey patch and a street is a faint line at best.',
  },
  {
    key: 'town',
    label: 'Town and country',
    coarsestDenominator: 40_000,
    visible:
      'A town and the farmland around it: main roads, railways, woodland, and the shape of the ' +
      'built-up edge against the fields.',
    cost: 'Houses are tiny. A terrace reads as a stripe rather than as a row of buildings.',
  },
  {
    key: 'district',
    label: 'District',
    coarsestDenominator: 20_000,
    visible:
      'A district of a town, a village and its fields, or a whole airfield. Blocks of housing, ' +
      'factory sheds, quarries and field boundaries are all distinct.',
    cost: 'A single house is a dot in a terrace — countable, but not something you can look at.',
  },
  {
    key: 'neighbourhood',
    label: 'Neighbourhood',
    coarsestDenominator: 10_000,
    visible:
      'A neighbourhood at a time. Individual buildings have shape, and hedge lines, farm tracks ' +
      'and the layout of a yard can be followed across the frame.',
    cost: 'Small structures — a shed, a garden wall, a footpath — are at the limit of the grain.',
  },
  {
    key: 'street',
    label: 'A few streets',
    coarsestDenominator: 5_000,
    visible:
      'A few streets. Houses stand clear of each other, roofs show their ridges and hips, and ' +
      'lorries and buses are visible on the road.',
    cost: 'A frame now covers well under a square mile, so a large site may take several of them.',
  },
  {
    key: 'plot',
    label: 'Houses and gardens',
    coarsestDenominator: 2_500,
    visible:
      'Individual houses and their gardens. Extensions, outbuildings, greenhouses and the line ' +
      'of a garden fence can be made out.',
    cost:
      'A frame covers about an eighth of a square mile — some 570 m across — which makes these ' +
      'the frames most likely to miss your site altogether.',
  },
]

/** The finest band there is; the far end of the slider. */
export const FINEST_DETAIL_INDEX = DETAIL_BANDS.length - 1

/**
 * Which band a scale falls in, as an index into `DETAIL_BANDS`.
 *
 * Boundaries belong to the finer band: a survey flown at exactly 1:2500 is a 1:2500 survey and
 * should read as the finest band, not as the coarser one that ends there.
 *
 * Throws on a denominator that is not a positive finite number. The parser refuses those rows
 * outright (`io/parseVerticals.ts`), so reaching here with one means something upstream has
 * stopped validating, and quietly assigning it a band would hide that.
 */
export function detailBandIndex(scaleDenominator: number): number {
  if (!Number.isFinite(scaleDenominator) || scaleDenominator <= 0) {
    throw new RangeError(`scale denominator ${scaleDenominator} is not a positive number`)
  }

  // Fine to coarse: the first band that reaches this scale is the finest one containing it.
  for (let index = FINEST_DETAIL_INDEX; index > 0; index -= 1) {
    const band = DETAIL_BANDS[index]
    if (band !== undefined && scaleDenominator <= band.coarsestDenominator) return index
  }
  return 0
}

/** The band a scale falls in. */
export function detailBand(scaleDenominator: number): DetailBand {
  const band = DETAIL_BANDS[detailBandIndex(scaleDenominator)]
  // Unreachable: `detailBandIndex` only ever returns an index it read out of the same array.
  if (band === undefined) throw new RangeError('no detail band for scale')
  return band
}

/**
 * The span of scales a band covers, as denominators.
 *
 * `coarsest` is inclusive and `finest` is exclusive, which is the same convention
 * `detailBandIndex` applies: the boundary scale belongs to the finer band. `finest` is `0` on
 * the finest band, which has no lower limit — there is no such thing as a scale too fine to buy.
 */
export function detailBandRange(index: number): { coarsest: number; finest: number } {
  const band = DETAIL_BANDS[index]
  if (band === undefined) throw new RangeError(`no detail band at index ${index}`)
  return { coarsest: band.coarsestDenominator, finest: DETAIL_BANDS[index + 1]?.coarsestDenominator ?? 0 }
}

/**
 * The band's scale span in words: `"1:20,000 to 1:10,000"`, or an open end where it has one.
 *
 * The open ends are not an omission. The coarse band has no upper limit because a listing could
 * always contain something coarser than anything seen so far, and the fine band has no lower
 * one for the same reason; stating a bound either way would be inventing a limit the data does
 * not have.
 */
export function detailBandScaleText(index: number): string {
  const { coarsest, finest } = detailBandRange(index)
  if (!Number.isFinite(coarsest)) return `${formatScale(finest)} and coarser`
  if (finest === 0) return `${formatScale(coarsest)} and finer`
  return `${formatScale(coarsest)} to ${formatScale(finest)}`
}

/**
 * What choosing this position on the slider asks for, in words.
 *
 * The slider is a *floor*, not a selection: it asks for frames at least this detailed, because
 * a customer who needs to see a garden fence is not turning down a finer frame that also shows
 * it. Position 0 asks for nothing, and says so.
 */
export function detailThresholdText(index: number): string {
  if (index <= 0) return 'Any scale'
  const { coarsest } = detailBandRange(index)
  return `${formatScale(coarsest)} or finer`
}

/** `2500` → `"1:2,500"`. */
export function formatScale(denominator: number): string {
  return `1:${Math.round(denominator).toLocaleString('en-GB')}`
}
