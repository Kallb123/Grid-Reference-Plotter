/**
 * Plane geometry in National Grid metres.
 *
 * Every function here works on `GridPoint` — eastings and northings — and never on latitudes and
 * longitudes. That is the whole reason the module exists: the National Grid is a projection of
 * Great Britain onto a plane, so an area on it can be intersected, measured and offset with
 * ordinary school geometry, exactly (ARCHITECTURE.md §2.3). Doing the same work in degrees would
 * mean spherical trigonometry to get an answer that is worse, because a degree of longitude is
 * not a degree of latitude and neither is a metre.
 *
 * Nothing here knows what a photograph is. It takes rings of points and returns numbers;
 * `coverage.ts` is what gives them meaning.
 *
 * A ring is a list of vertices in order, **not** closed — the last vertex joins back to the
 * first. Winding may be either way round; the functions that care normalise it themselves.
 */

import type { GridPoint } from './types'

/** A closed polygon given as its vertices in order, without repeating the first at the end. */
export type Ring = readonly GridPoint[]

/** Straight-line distance between two points on the grid, in metres. */
export function distanceM(a: GridPoint, b: GridPoint): number {
  return Math.hypot(b.easting - a.easting, b.northing - a.northing)
}

/**
 * Twice the signed area of a ring: positive anticlockwise, negative clockwise.
 *
 * Kept separate from `polygonAreaM2` because the sign is what tells the clipper which side of an
 * edge is the inside.
 */
function twiceSignedArea(ring: Ring): number {
  let total = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index] as GridPoint
    const next = ring[(index + 1) % ring.length] as GridPoint
    total += current.easting * next.northing - next.easting * current.northing
  }
  return total
}

/**
 * Area enclosed by a ring, in square metres.
 *
 * Zero for fewer than three vertices, and zero for a ring whose vertices are collinear — both
 * are honest: a line encloses no ground.
 */
export function polygonAreaM2(ring: Ring): number {
  if (ring.length < 3) return 0
  return Math.abs(twiceSignedArea(ring)) / 2
}

/**
 * The ring's centre of area, or the mean of its vertices where it encloses none.
 *
 * The fallback matters: a user who draws a polygon by clicking twice, or three times in a line,
 * still gets a defined centre rather than a division by zero.
 */
export function polygonCentroid(ring: Ring): GridPoint {
  if (ring.length === 0) throw new RangeError('a ring needs at least one vertex')
  if (ring.length === 1) return { ...(ring[0] as GridPoint) }

  const twiceArea = twiceSignedArea(ring)
  if (ring.length < 3 || twiceArea === 0) return meanOfVertices(ring)

  let easting = 0
  let northing = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index] as GridPoint
    const next = ring[(index + 1) % ring.length] as GridPoint
    const cross = current.easting * next.northing - next.easting * current.northing
    easting += (current.easting + next.easting) * cross
    northing += (current.northing + next.northing) * cross
  }

  return { easting: easting / (3 * twiceArea), northing: northing / (3 * twiceArea) }
}

function meanOfVertices(ring: Ring): GridPoint {
  let easting = 0
  let northing = 0
  for (const vertex of ring) {
    easting += vertex.easting
    northing += vertex.northing
  }
  return { easting: easting / ring.length, northing: northing / ring.length }
}

/**
 * Is the point inside the ring?
 *
 * Ray casting, counting crossings of a ray east from the point. A point exactly on an edge is
 * decided by whichever side the arithmetic falls on — that ambiguity is a metre-scale question
 * about a position the catalogue only states to ±50 m, so nothing downstream is allowed to lean
 * on it.
 */
export function isPointInPolygon(point: GridPoint, ring: Ring): boolean {
  if (ring.length < 3) return false

  let inside = false
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index] as GridPoint
    const previous = ring[(index + ring.length - 1) % ring.length] as GridPoint

    const straddles = current.northing > point.northing !== previous.northing > point.northing
    if (!straddles) continue

    const crossingEasting =
      current.easting +
      ((point.northing - current.northing) * (previous.easting - current.easting)) /
        (previous.northing - current.northing)
    if (point.easting < crossingEasting) inside = !inside
  }

  return inside
}

/** Distance from a point to a line segment, in metres. */
export function distanceToSegmentM(point: GridPoint, a: GridPoint, b: GridPoint): number {
  const alongE = b.easting - a.easting
  const alongN = b.northing - a.northing
  const lengthSquared = alongE * alongE + alongN * alongN
  if (lengthSquared === 0) return distanceM(point, a)

  const t =
    ((point.easting - a.easting) * alongE + (point.northing - a.northing) * alongN) / lengthSquared
  const clamped = Math.min(1, Math.max(0, t))

  return distanceM(point, {
    easting: a.easting + clamped * alongE,
    northing: a.northing + clamped * alongN,
  })
}

/** Distance from a point to the nearest edge of a ring, in metres, inside or out. */
export function distanceToRingM(point: GridPoint, ring: Ring): number {
  if (ring.length === 0) return Infinity
  if (ring.length === 1) return distanceM(point, ring[0] as GridPoint)

  let nearest = Infinity
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index] as GridPoint
    const next = ring[(index + 1) % ring.length] as GridPoint
    nearest = Math.min(nearest, distanceToSegmentM(point, current, next))
  }
  return nearest
}

/**
 * Distance from a point to a ring's interior: zero inside it, the distance to its edge outside.
 *
 * This is what "how far is my site from that frame" means when the site is a shape rather than a
 * pin — a site the frame contains is not some distance away from it.
 */
export function distanceToPolygonM(point: GridPoint, ring: Ring): number {
  if (isPointInPolygon(point, ring)) return 0
  return distanceToRingM(point, ring)
}

/**
 * The shortest distance between two rings that do not overlap, in metres.
 *
 * Checked both ways round: the nearest pair may be a vertex of either ring against an edge of the
 * other, and testing only one direction misses the case where one ring's corner points at the
 * middle of the other's side.
 */
export function ringSeparationM(a: Ring, b: Ring): number {
  let nearest = Infinity
  for (const vertex of a) nearest = Math.min(nearest, distanceToRingM(vertex, b))
  for (const vertex of b) nearest = Math.min(nearest, distanceToRingM(vertex, a))
  return nearest
}

/**
 * The part of `subject` that lies inside the **convex** ring `clip`, by Sutherland–Hodgman.
 *
 * The clip ring has to be convex — a photograph's footprint is a rectangle, so it always is.
 * The subject may be any simple polygon, which matters because the subject here is whatever
 * outline the user drew round their site.
 *
 * One known property of this algorithm is relied on. Where a concave subject is cut into
 * separate pieces, the result comes back as a single contour with zero-width seams running along
 * the clip boundary between them. That contour is not a shape you would want to draw, but its
 * area is exactly the sum of the pieces' areas — each seam is traversed once in each direction
 * and contributes nothing — and area is all `coverage.ts` asks of it.
 */
export function clipToConvex(subject: Ring, clip: Ring): GridPoint[] {
  if (subject.length < 3 || clip.length < 3) return []

  const boundary = twiceSignedArea(clip) < 0 ? [...clip].reverse() : [...clip]
  let output: GridPoint[] = [...subject]

  for (let edge = 0; edge < boundary.length && output.length > 0; edge += 1) {
    const a = boundary[edge] as GridPoint
    const b = boundary[(edge + 1) % boundary.length] as GridPoint

    const input = output
    output = []

    for (let index = 0; index < input.length; index += 1) {
      const current = input[index] as GridPoint
      const previous = input[(index + input.length - 1) % input.length] as GridPoint
      const currentInside = isLeftOf(current, a, b)
      const previousInside = isLeftOf(previous, a, b)

      if (currentInside) {
        if (!previousInside) output.push(intersection(previous, current, a, b))
        output.push(current)
      } else if (previousInside) {
        output.push(intersection(previous, current, a, b))
      }
    }
  }

  return output
}

/** Is the point on the inside of the directed edge a→b of an anticlockwise ring? */
function isLeftOf(point: GridPoint, a: GridPoint, b: GridPoint): boolean {
  return (
    (b.easting - a.easting) * (point.northing - a.northing) -
      (b.northing - a.northing) * (point.easting - a.easting) >=
    0
  )
}

/**
 * Where the segment p→q crosses the infinite line through a and b.
 *
 * Only called when p and q are known to be on opposite sides of that line, so the denominator
 * cannot be zero.
 */
function intersection(p: GridPoint, q: GridPoint, a: GridPoint, b: GridPoint): GridPoint {
  const segmentE = q.easting - p.easting
  const segmentN = q.northing - p.northing
  const edgeE = b.easting - a.easting
  const edgeN = b.northing - a.northing

  const denominator = edgeE * segmentN - edgeN * segmentE
  const t = (edgeE * (p.northing - a.northing) - edgeN * (p.easting - a.easting)) / denominator

  return { easting: p.easting - t * segmentE, northing: p.northing - t * segmentN }
}
