/**
 * Leaflet, driven from a Vue component: map lifecycle, layer sync, fit-to-bounds, and the
 * drawing of an area of interest.
 *
 * Leaflet is used directly rather than through a Vue wrapper. We draw our own polygons, so a
 * wrapper would add a dependency that lags Vue releases in exchange for nothing (ARCHITECTURE.md
 * §3). The trade is that the map's objects live outside Vue's reactivity and have to be kept in
 * step by hand — which is all this file does.
 *
 * No arithmetic happens here. Corners arrive already converted to WGS84 by `domain/footprint`,
 * the box to fit arrives from `domain/bounds`, and every coverage figure arrives from
 * `domain/coverage`; this file only reverses the axis order, because GeoJSON says `[lng, lat]`
 * and Leaflet says `[lat, lng]`.
 *
 * Drawing is hand-rolled rather than taken from a Leaflet draw plugin, for the same reason the
 * map itself is: two shapes — a pin and an outline — do not justify a plugin, and the plugin's
 * own toolbar would be a second UI vocabulary sitting on top of this one.
 */

import * as L from 'leaflet'
import { onBeforeUnmount, onMounted, watch } from 'vue'
import type { Ref } from 'vue'
import type { LngLatBounds } from '../domain/bounds'
import type { SiteCoverage } from '../domain/coverage'
import type { AreaOfInterest, Footprint, LngLat, PlottedPoint } from '../domain/types'
import { footprintSummary, pointSummary } from './photoSummary'
import type { PhotoSummary } from './photoSummary'
import { MINIMUM_OUTLINE_VERTICES } from './useAreaOfInterest'
import type { DrawMode } from './useAreaOfInterest'

/** Great Britain, for the opening view when nothing has been loaded yet. */
const GREAT_BRITAIN: LngLatBounds = { west: -8.2, south: 49.8, east: 1.9, north: 60.9 }

/**
 * Zoom no closer than this when framing the data.
 *
 * A single six-figure grid reference is a 100 m square; fitting it exactly would slam the map to
 * the tile server's maximum zoom and imply a precision the reference does not have.
 */
const MAX_FIT_ZOOM = 16

/** How near a click has to land, in screen pixels, to count as closing the outline. */
const CLOSE_OUTLINE_PX = 14

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
/**
 * The area of interest — the same accent as the selected frame, and deliberately so.
 *
 * There is one accent in this palette and the two things that earn it are the frame you are
 * looking at and the site you are looking for. They are told apart by the dashes: the site is
 * drawn as a broken line with a wash inside it, because it is the user's own mark on the map and
 * not something read out of the supplier's file.
 */
export const AREA_COLOUR = SELECTED_COLOUR

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
  /** The site to draw, or `null` when none has been marked. */
  area: Ref<AreaOfInterest | null>
  /** What every frame does about that site, so the ones that miss can get out of the way. */
  coverage: Ref<SiteCoverage | null>
  /** What the next click means: select a frame, drop a pin, or place a corner. */
  drawMode: Ref<DrawMode>
}

export interface LeafletMapOptions {
  /** Called when the user clicks a frame, or clicks the map away from every frame. */
  onSelect?: (id: string | null) => void
  /** Called when the pointer enters or leaves a frame. */
  onHover?: (id: string | null) => void
  /** Called with a finished pin or outline. */
  onAreaDrawn?: (area: AreaOfInterest) => void
  /** Called when drawing is abandoned, from the Escape key or the prompt's own button. */
  onDrawCancelled?: () => void
  /** Called as corners go down, so the prompt can count them. */
  onVertexPlaced?: (count: number) => void
}

export interface LeafletMapHandle {
  /** Frame everything that is plotted. A no-op when nothing is. */
  fitToData: () => void
  /** Frame the area of interest. A no-op when none has been marked. */
  fitToArea: () => void
  /** Close the outline being drawn, if it has enough corners to be one. */
  finishDrawing: () => void
  /** Abandon whatever was being drawn. */
  cancelDrawing: () => void
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

/**
 * Stroke opacity for a frame that has been measured against the site and does not reach it.
 *
 * Faded rather than removed. Half the value of seeing that twelve of your thirty frames miss is
 * seeing *where* they went instead — a run that passed a kilometre north of the site is the shape
 * of the sortie, and hiding it would leave the user wondering whether the file had been read.
 * The table is where the misses can actually be dropped, because there a row is a line item.
 */
const MISSING_OPACITY = 0.22

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

/** An outline part-way through being drawn. */
interface Sketch {
  mode: Exclude<DrawMode, 'none'>
  vertices: L.LatLng[]
}

export function useLeafletMap(
  container: Ref<HTMLElement | null>,
  sources: LeafletMapSources,
  options: LeafletMapOptions = {},
): LeafletMapHandle {
  let map: L.Map | null = null
  const frames = L.layerGroup()
  const highlight = L.layerGroup()
  /** The committed area of interest. */
  const site = L.layerGroup()
  /** The outline being drawn, redrawn corner by corner. */
  const sketch = L.layerGroup()
  /** Every drawn frame by record id, so selection restyles rather than redraws. */
  const drawnById = new Map<string, DrawnFrame>()

  let drawing: Sketch | null = null

  function fitToData(): void {
    const box = sources.bounds.value
    if (map === null || box === null) return
    map.fitBounds(toLeafletBounds(box), { padding: [32, 32], maxZoom: MAX_FIT_ZOOM })
  }

  /**
   * Frame the site.
   *
   * A pin has no extent to fit, so it is centred at whatever zoom is already in use, or closer if
   * the map is showing the whole country. Zooming a dropped pin to the tile server's limit would
   * be the same overstatement `MAX_FIT_ZOOM` exists to avoid.
   */
  function fitToArea(): void {
    const area = sources.area.value
    if (map === null || area === null) return

    if (area.kind === 'point') {
      map.setView(toLatLng(area.position), Math.max(map.getZoom(), 14))
      return
    }
    map.fitBounds(L.latLngBounds(area.ring.map(toLatLng)), {
      padding: [48, 48],
      maxZoom: MAX_FIT_ZOOM,
    })
  }

  function draw(): void {
    frames.clearLayers()
    drawnById.clear()

    for (const footprint of sources.footprints.value) {
      const id = footprint.record.id
      const polygon = L.polygon(footprint.corners.map(toLatLng), framePathStyle(VERTICAL_COLOUR))
      register(id, VERTICAL_COLOUR, [{ layer: polygon, restingFillOpacity: 0 }], () =>
        summaryElement(footprintSummary(footprint, sources.coverage.value?.frames.get(id) ?? null)),
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
        () =>
          summaryElement(pointSummary(point, sources.coverage.value?.obliques.get(id) ?? null)),
      )
    }

    applyStyles()
  }

  /**
   * Add one record's layers to the map and wire up its popup, selection and hover.
   *
   * The popup is opened by hand rather than bound with `bindPopup`, because a bound popup opens
   * on every click including the ones that are placing a corner of an outline. A popup springing
   * open over the shape you are drawing, on each click, would make drawing over a dense listing
   * unusable.
   */
  function register(
    id: string,
    colour: string,
    layers: DrawnLayer[],
    popup: () => HTMLElement,
  ): void {
    for (const { layer } of layers) {
      layer.on('click', (event: L.LeafletMouseEvent) => {
        // Leaflet does not propagate a click on a path to the map, so a frame under the pointer
        // would otherwise swallow the corner the user was trying to place.
        if (drawing !== null) {
          placeVertex(event.latlng)
          return
        }
        options.onSelect?.(id)
        map?.openPopup(popup(), event.latlng)
      })
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
   * Restyle every frame for the current selection, hover and coverage, and mark the selected
   * frame's centre.
   *
   * The centre marker is the point the grid reference actually names, with its square drawn
   * round it. Showing it for every frame at once would bury the map in dots; showing it for the
   * one being inspected is where the ±50 m matters.
   */
  function applyStyles(): void {
    highlight.clearLayers()
    const selectedId = sources.selectedId.value
    const hoveredId = sources.hoveredId.value
    const coverage = sources.coverage.value

    for (const [id, frame] of drawnById) {
      const isSelected = id === selectedId
      const isHovered = id === hoveredId
      const verdict = coverage?.frames.get(id)?.verdict
      // Only a frame actually measured and found wanting fades. An oblique has no verdict
      // because none is derivable, and fading it would state one.
      const misses = verdict === 'none' && !isSelected && !isHovered

      for (const { layer, restingFillOpacity } of frame.layers) {
        layer.setStyle({
          color: isSelected ? SELECTED_COLOUR : frame.colour,
          weight: isSelected ? 3 : isHovered ? 2.5 : verdict === 'full' ? 2 : 1.2,
          opacity: misses ? MISSING_OPACITY : 0.9,
          fillOpacity: Math.max(
            misses ? 0 : restingFillOpacity,
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
   * Draw the committed area of interest.
   *
   * Non-interactive throughout: the site sits on top of the frames it is being compared with, and
   * a shape that answered clicks would make the frames underneath it — the ones that cover the
   * site, which is to say the interesting ones — unselectable.
   */
  function renderArea(): void {
    site.clearLayers()
    const area = sources.area.value
    if (area === null) return

    if (area.kind === 'point') {
      L.circleMarker(toLatLng(area.position), {
        radius: 6,
        color: AREA_COLOUR,
        weight: 2,
        fillColor: AREA_COLOUR,
        fillOpacity: 0.9,
        interactive: false,
      }).addTo(site)
      return
    }

    L.polygon(area.ring.map(toLatLng), {
      color: AREA_COLOUR,
      weight: 2,
      dashArray: '6 4',
      fillColor: AREA_COLOUR,
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(site)
  }

  /** Draw the corners placed so far, with the first one marked as the way to close the ring. */
  function renderSketch(): void {
    sketch.clearLayers()
    if (drawing === null || drawing.vertices.length === 0) return

    const [first, ...rest] = drawing.vertices
    if (first === undefined) return

    if (drawing.vertices.length > 1) {
      L.polyline(drawing.vertices, {
        color: AREA_COLOUR,
        weight: 2,
        dashArray: '6 4',
        interactive: false,
      }).addTo(sketch)
    }

    // The first corner is drawn hollow and larger: it is a target, not just a corner, because
    // clicking it is one of the three ways to finish.
    L.circleMarker(first, {
      radius: drawing.vertices.length >= MINIMUM_OUTLINE_VERTICES ? 7 : 4,
      color: AREA_COLOUR,
      weight: 2,
      fillOpacity: 0,
      interactive: false,
    }).addTo(sketch)

    for (const vertex of rest) {
      L.circleMarker(vertex, {
        radius: 4,
        color: AREA_COLOUR,
        weight: 2,
        fillColor: AREA_COLOUR,
        fillOpacity: 0.9,
        interactive: false,
      }).addTo(sketch)
    }
  }

  /** A click while drawing: drop the pin, close the ring, or add another corner. */
  function placeVertex(latlng: L.LatLng): void {
    if (drawing === null) return

    if (drawing.mode === 'point') {
      options.onAreaDrawn?.({ kind: 'point', position: toLngLat(latlng) })
      return
    }

    if (drawing.vertices.length >= MINIMUM_OUTLINE_VERTICES && isOnFirstVertex(latlng)) {
      finishDrawing()
      return
    }

    drawing.vertices.push(latlng)
    options.onVertexPlaced?.(drawing.vertices.length)
    renderSketch()
  }

  /** Did the click land on the outline's first corner? Measured in pixels, not in metres. */
  function isOnFirstVertex(latlng: L.LatLng): boolean {
    const first = drawing?.vertices[0]
    if (map === null || first === undefined) return false
    return map.latLngToContainerPoint(first).distanceTo(map.latLngToContainerPoint(latlng)) <=
      CLOSE_OUTLINE_PX
  }

  function finishDrawing(): void {
    if (drawing === null) return
    if (drawing.vertices.length < MINIMUM_OUTLINE_VERTICES) {
      cancelDrawing()
      return
    }
    options.onAreaDrawn?.({ kind: 'polygon', ring: drawing.vertices.map(toLngLat) })
  }

  function cancelDrawing(): void {
    if (drawing === null) return
    options.onDrawCancelled?.()
  }

  /** Leave drawing mode, whatever ended it. The mode itself is owned outside this file. */
  function stopSketching(): void {
    drawing = null
    sketch.clearLayers()
    container.value?.classList.remove('map__canvas--drawing')
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (drawing === null) return
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelDrawing()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      finishDrawing()
    }
  }

  onMounted(() => {
    const element = container.value
    if (element === null) return

    map = L.map(element, { preferCanvas: true }).fitBounds(toLeafletBounds(GREAT_BRITAIN))
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map)
    L.control.scale({ metric: true, imperial: true }).addTo(map)
    frames.addTo(map)
    highlight.addTo(map)
    site.addTo(map)
    sketch.addTo(map)

    // Clicking the basemap clears the selection — unless a shape is being drawn, when it is
    // placing a corner instead. Clicks on a frame are handled on the frame, and Leaflet does not
    // propagate those to the map.
    map.on('click', (event: L.LeafletMouseEvent) => {
      if (drawing !== null) {
        placeVertex(event.latlng)
        return
      }
      options.onSelect?.(null)
    })

    document.addEventListener('keydown', onKeyDown)

    draw()
    renderArea()
    fitToData()
  })

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeyDown)
    map?.remove()
    map = null
    drawing = null
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

  // A site changes what the frames mean, not what they are: restyle rather than redraw. Popups
  // read their coverage at the moment they are opened, so an open one is now out of date — it is
  // closed rather than patched, because the frame behind it has just changed what it is worth.
  watch(sources.area, () => {
    map?.closePopup()
    renderArea()
    applyStyles()
  })

  watch(sources.drawMode, (mode) => {
    if (mode === 'none') {
      stopSketching()
      return
    }
    drawing = { mode, vertices: [] }
    sketch.clearLayers()
    container.value?.classList.add('map__canvas--drawing')
    // Drawing starts from a clean map: a popup left open over the site would be in the way of
    // the first corner.
    map?.closePopup()
  })

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

  return { fitToData, fitToArea, finishDrawing, cancelDrawing }
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

/** Leaflet's `LatLng` back to the `[lng, lat]` the domain and GeoJSON both use. */
function toLngLat(latlng: L.LatLng): LngLat {
  return [latlng.lng, latlng.lat]
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
