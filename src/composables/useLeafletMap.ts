/**
 * Leaflet, driven from a Vue component: map lifecycle, layer sync, fit-to-bounds.
 *
 * Leaflet is used directly rather than through a Vue wrapper. We draw our own polygons, so a
 * wrapper would add a dependency that lags Vue releases in exchange for nothing (ARCHITECTURE.md
 * §3). The trade is that the map's objects live outside Vue's reactivity and have to be kept in
 * step by hand — which is all this file does.
 *
 * No arithmetic happens here. Corners arrive already converted to WGS84 by `domain/footprint`,
 * and the box to fit arrives from `domain/bounds`; this file only reverses the axis order,
 * because GeoJSON says `[lng, lat]` and Leaflet says `[lat, lng]`.
 */

import * as L from 'leaflet'
import { onBeforeUnmount, onMounted, watch } from 'vue'
import type { Ref } from 'vue'
import type { LngLatBounds } from '../domain/bounds'
import type { Footprint, LngLat, PlottedPoint } from '../domain/types'
import { footprintSummary, pointSummary } from './photoSummary'
import type { PhotoSummary } from './photoSummary'

/** Great Britain, for the opening view when nothing has been loaded yet. */
const GREAT_BRITAIN: LngLatBounds = { west: -8.2, south: 49.8, east: 1.9, north: 60.9 }

/**
 * Zoom no closer than this when framing the data.
 *
 * A single six-figure grid reference is a 100 m square; fitting it exactly would slam the map to
 * the tile server's maximum zoom and imply a precision the reference does not have.
 */
const MAX_FIT_ZOOM = 16

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/*
 * The plot's colours, from the brand palette, read off the mark: the frames are drawn in ink, and
 * the red is the ground the frame you are looking at covers. Exported because the map's legend
 * has to show the same three swatches, and a legend that drifts from the plot is worse than none.
 *
 * The palette is deliberately mono, so shape carries the vertical/oblique distinction — a
 * rectangle is an extent, a dot is a position — and the colours reinforce it rather than
 * carrying it alone.
 */

/** Vertical footprints and their centres: brand ink. */
export const VERTICAL_COLOUR = '#201e1d'
/** Obliques, a deep step of the accent — a different claim, and not to be read as an extent. */
export const OBLIQUE_COLOUR = '#7c1405'
/** The accent itself, spent on the one frame being inspected. */
export const SELECTED_COLOUR = '#ec3013'

export interface LeafletMapSources {
  footprints: Ref<readonly Footprint[]>
  points: Ref<readonly PlottedPoint[]>
  bounds: Ref<LngLatBounds | null>
  selectedId: Ref<string | null>
  /**
   * The frame under the pointer, wherever the pointer is. Hover is shared with the table rather
   * than kept inside the map, so pointing at a row lights up its polygon and vice versa.
   */
  hoveredId: Ref<string | null>
}

export interface LeafletMapOptions {
  /** Called when the user clicks a frame, or clicks the map away from every frame. */
  onSelect?: (id: string | null) => void
  /** Called when the pointer enters or leaves a frame. */
  onHover?: (id: string | null) => void
}

export interface LeafletMapHandle {
  /** Frame everything that is plotted. A no-op when nothing is. */
  fitToData: () => void
}

/**
 * How much of a frame is filled when it is neither selected nor under the pointer.
 *
 * Zero, for footprints. A result set is thirty frames over the same town — the sample's are all
 * within a couple of kilometres of each other — and thirty translucent fills stack into an opaque
 * blob with the basemap invisible underneath, which defeats the point of the tool. Outlines
 * stack legibly; a fill appears on the one frame being looked at. Leaflet still hit-tests the
 * interior of a zero-opacity fill, so frames stay clickable anywhere inside them.
 */
const SELECTED_FILL = 0.18
const HOVERED_FILL = 0.1

/** One record's drawn layers, with what to return them to when they stop being singled out. */
interface DrawnFrame {
  colour: string
  layers: DrawnLayer[]
}

interface DrawnLayer {
  layer: L.Path
  /** Fill this layer carries at rest — zero for an extent, opaque for an oblique's dot. */
  restingFillOpacity: number
}

export function useLeafletMap(
  container: Ref<HTMLElement | null>,
  sources: LeafletMapSources,
  options: LeafletMapOptions = {},
): LeafletMapHandle {
  let map: L.Map | null = null
  const frames = L.layerGroup()
  const highlight = L.layerGroup()
  /** Every drawn frame by record id, so selection restyles rather than redraws. */
  const drawnById = new Map<string, DrawnFrame>()

  function fitToData(): void {
    const box = sources.bounds.value
    if (map === null || box === null) return
    map.fitBounds(toLeafletBounds(box), { padding: [32, 32], maxZoom: MAX_FIT_ZOOM })
  }

  function draw(): void {
    frames.clearLayers()
    drawnById.clear()

    for (const footprint of sources.footprints.value) {
      const id = footprint.record.id
      const polygon = L.polygon(footprint.corners.map(toLatLng), framePathStyle(VERTICAL_COLOUR))
      register(id, VERTICAL_COLOUR, [{ layer: polygon, restingFillOpacity: 0 }], () =>
        summaryElement(footprintSummary(footprint)),
      )
    }

    for (const point of sources.points.value) {
      const id = point.record.id
      const position = toLatLng(point.position)

      // An oblique is a point *and* an uncertainty: the grid square is drawn with it so the
      // ±50 m is on the map, not only in the popup. There is deliberately no footprint —
      // obliques carry no scale, height or bearing to build one from (INPUT-FORMAT.md §6).
      const square = L.circle(position, {
        ...framePathStyle(OBLIQUE_COLOUR),
        radius: point.uncertaintyM,
      })
      const marker = L.circleMarker(position, { ...framePathStyle(OBLIQUE_COLOUR), radius: 5 })

      register(
        id,
        OBLIQUE_COLOUR,
        [
          { layer: square, restingFillOpacity: 0 },
          { layer: marker, restingFillOpacity: 0.9 },
        ],
        () => summaryElement(pointSummary(point)),
      )
    }

    applyStyles()
  }

  /** Add one record's layers to the map and wire up its popup, selection and hover. */
  function register(
    id: string,
    colour: string,
    layers: DrawnLayer[],
    popup: () => HTMLElement,
  ): void {
    for (const { layer } of layers) {
      layer.bindPopup(popup)
      layer.on('click', () => options.onSelect?.(id))
      layer.on('mouseover', () => options.onHover?.(id))
      layer.on('mouseout', () => {
        // Only if this frame is still the hovered one: leaving a polygon that overlaps another
        // fires `mouseout` after the neighbour's `mouseover`, and clearing then would drop a
        // hover that has already moved on.
        if (sources.hoveredId.value === id) options.onHover?.(null)
      })
      layer.addTo(frames)
    }
    drawnById.set(id, { colour, layers })
  }

  /**
   * Restyle every frame for the current selection and hover, and mark the selected frame's centre.
   *
   * The centre marker is the point the grid reference actually names, with its square drawn
   * round it. Showing it for every frame at once would bury the map in dots; showing it for the
   * one being inspected is where the ±50 m matters.
   */
  function applyStyles(): void {
    highlight.clearLayers()
    const selectedId = sources.selectedId.value
    const hoveredId = sources.hoveredId.value

    for (const [id, frame] of drawnById) {
      const isSelected = id === selectedId
      const isHovered = id === hoveredId

      for (const { layer, restingFillOpacity } of frame.layers) {
        layer.setStyle({
          color: isSelected ? SELECTED_COLOUR : frame.colour,
          weight: isSelected ? 3 : isHovered ? 2.5 : 1.2,
          fillOpacity: Math.max(
            restingFillOpacity,
            isSelected ? SELECTED_FILL : isHovered ? HOVERED_FILL : 0,
          ),
        })
        if (isSelected || isHovered) layer.bringToFront()
      }
    }

    const footprint = sources.footprints.value.find((candidate) => candidate.record.id === selectedId)
    if (footprint === undefined) return

    const centre = toLatLng(footprint.centre)
    L.circle(centre, {
      radius: footprint.uncertaintyM,
      color: SELECTED_COLOUR,
      weight: 1,
      dashArray: '3 3',
      fillOpacity: 0.15,
      interactive: false,
    }).addTo(highlight)
    L.circleMarker(centre, {
      radius: 3,
      color: SELECTED_COLOUR,
      weight: 2,
      fillOpacity: 1,
      interactive: false,
    }).addTo(highlight)
  }

  /**
   * Bring the selected frame into view, but only if it is not already there.
   *
   * Selecting a row in the table is worthless if its polygon is off the edge of the map, and
   * with thirty frames over one town the table is the natural way to walk the listing. The
   * "only if" matters: re-centring on every click would yank the map away from a user who has
   * deliberately panned to a corner of it, and clicking a polygon would move the thing that was
   * just clicked. Zoom is left alone — the scale the user chose is a decision, not a default.
   */
  function revealSelection(): void {
    const id = sources.selectedId.value
    if (map === null || id === null) return

    const footprint = sources.footprints.value.find((candidate) => candidate.record.id === id)
    if (footprint !== undefined) {
      const box = L.latLngBounds(footprint.corners.map(toLatLng))
      if (!map.getBounds().intersects(box)) map.panTo(box.getCenter())
      return
    }

    const point = sources.points.value.find((candidate) => candidate.record.id === id)
    if (point === undefined) return

    const position = L.latLng(toLatLng(point.position))
    if (!map.getBounds().contains(position)) map.panTo(position)
  }

  onMounted(() => {
    const element = container.value
    if (element === null) return

    map = L.map(element, { preferCanvas: true }).fitBounds(toLeafletBounds(GREAT_BRITAIN))
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map)
    L.control.scale({ metric: true, imperial: true }).addTo(map)
    frames.addTo(map)
    highlight.addTo(map)

    // Clicking the basemap clears the selection; clicking a frame is handled on the frame, and
    // Leaflet does not propagate that to the map.
    map.on('click', () => options.onSelect?.(null))

    draw()
    fitToData()
  })

  onBeforeUnmount(() => {
    map?.remove()
    map = null
    drawnById.clear()
  })

  // A new file replaces the plot and reframes the view. Reframing on every change would fight
  // the user as they pan, but a load is exactly the moment they want to be shown the results.
  watch([sources.footprints, sources.points], () => {
    draw()
    fitToData()
  })

  watch(sources.selectedId, () => {
    applyStyles()
    revealSelection()
  })

  watch(sources.hoveredId, applyStyles)

  return { fitToData }
}

/**
 * Shared style for a drawn frame; colour, weight and fill vary with kind, selection and hover.
 *
 * `fill: true` with no opacity: an unfilled Leaflet path only answers clicks on its stroke, and
 * a 2 km footprint whose only clickable part is a hairline outline is not clickable at all.
 */
function framePathStyle(colour: string): L.PathOptions {
  return { color: colour, weight: 1.2, opacity: 0.9, fill: true, fillColor: colour, fillOpacity: 0 }
}

/** GeoJSON order `[lng, lat]` → Leaflet order `[lat, lng]`. */
function toLatLng([lng, lat]: LngLat): L.LatLngTuple {
  return [lat, lng]
}

function toLeafletBounds(box: LngLatBounds): L.LatLngBoundsExpression {
  return [
    [box.south, box.west],
    [box.north, box.east],
  ]
}

/**
 * Render a summary into a popup element.
 *
 * The geometry and the caveats only — the ordering columns are shown beside the map, where they
 * can be read without covering the frames they describe.
 *
 * Built as DOM nodes with `textContent`, never as an HTML string. Every value in here came out of
 * a spreadsheet somebody was sent, and `innerHTML` would make a film description an injection
 * vector in a tool whose whole premise is that your file stays on your machine.
 */
function summaryElement(summary: PhotoSummary): HTMLElement {
  const root = document.createElement('div')
  root.className = 'photo-popup'

  root.append(
    element('h2', summary.title),
    element('p', summary.subtitle, 'photo-popup__subtitle'),
  )

  const list = document.createElement('dl')
  for (const line of summary.lines) {
    list.append(element('dt', line.label), element('dd', line.value))
  }
  root.append(list)

  if (summary.notes.length > 0) {
    const notes = document.createElement('ul')
    notes.className = 'photo-popup__notes'
    for (const note of summary.notes) notes.append(element('li', note))
    root.append(notes)
  }

  return root
}

function element(tag: string, text: string, className?: string): HTMLElement {
  const node = document.createElement(tag)
  node.textContent = text
  if (className !== undefined) node.className = className
  return node
}
