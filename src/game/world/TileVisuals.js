import { TILE } from './TileMap.js'
import { ROOM_TYPE } from './DungeonGenerator.js'

/**
 * Connected-wall visual resolver for the Dungeon Tileset II (v5.2) pack.
 *
 * Collision stays authoritative: this pass derives per-cell VISUAL layers
 * (map.vis0 base, map.vis1 overlay) plus diagnostics (map.visCls
 * classification, map.visFlag fallback/error bits) from the tile grid, so
 * wall art can never disagree with physics. It runs once per floor and again
 * after geometry changes (broken secret walls).
 *
 * Perspective model — recovered by exact-pixel matching the pack's own
 * demonstration scene against the sheet (see scratchpad wall-piece catalog):
 *
 *  - Every wall tile is SELF-CONTAINED in its collision cell (cap/ledge/face
 *    baked in). Nothing is drawn into void or floor cells, with one
 *    exception: the upper cell of a wall mass >= 2 cells tall (itself solid)
 *    receives the cap-row tile above a tall face.
 *  - Wall with floor S  -> ONE row: a "north run". Family chosen per
 *    contiguous run: compact (row 0) or tall lit face (row 5 + variants).
 *  - Wall with floor N  -> ONE row: south cap tiles (row 4, face baked in).
 *  - Wall with floor E/W -> vertical band tiles facing the floor.
 *  - Ring corners (0,0)/(5,0)/(0,4)/(5,4) at diagonal-only cells and south
 *    run ends; door jambs (2,7)/(3,7) where a run meets a doorway opening.
 *  - Configurations the sheet has no piece for are FLAGGED (debug overlay /
 *    magenta error tile), never silently resolved to a straight tile.
 */

// tileset grid cells [col, row] per architectural role — data, not code
export const PIECES = {
	// walls
	capN: [[1, 0], [2, 0], [3, 0], [4, 0]], // compact north run + top of 2-tall mass
	face: [[4, 5], [6, 5]], // tall lit face, plain
	faceBlue: [[0, 5]],
	faceBanner: [[1, 5]],
	faceRed: [[2, 5]],
	faceMixed: [[3, 5]],
	faceWindow: [[5, 5]], // portcullis window (pairs with gateGlow below it)
	faceSconce: [[0, 8], [1, 8], [2, 8]],
	faceTorch: [[3, 8]],
	faceRedLamp: [[0, 9], [1, 9], [2, 9]],
	faceRune: [[3, 9]],
	capS: [[1, 4], [2, 4], [3, 4], [4, 4]], // south run (cap + short face in-cell)
	capW: [[5, 1], [5, 2], [5, 3]], // band on left edge: floor is WEST
	capE: [[0, 1], [0, 2], [0, 3]], // band on right edge: floor is EAST
	cornerTL: [[0, 0]], // ring corner pieces (see catalog for configs)
	cornerTR: [[5, 0]],
	cornerBL: [[0, 4]],
	cornerBR: [[5, 4]],
	jambL: [[2, 7]], // door jamb columns (observed at the demo corridor mouth)
	jambR: [[3, 7]],
	pillar: [[8, 7]], // free-standing 1x1 column
	error: [[9, 9]], // replaced by a magenta debug tile at atlas-compose time
	// floors (see the floor-piece catalog: the room template is a bordered
	// PANEL — border tiles are directional, only these three are borderless)
	// standalone-safe quiet base; the plain panel-center tile is listed twice
	// to weight it, keeping speck density at the reference's level
	floor: [[2, 2], [3, 2], [7, 3], [7, 3]],
	floorWear: [[8, 3]], // sparse pebbles, verified edge-clean
	floorShadowN: [[2, 1], [3, 1]], // top border: wall to the N
	floorShadowNW: [[1, 1]],
	floorShadowNE: [[4, 1]],
	floorW: [[1, 2]], // left border: wall W ((1,3) is the SW corner)
	floorE: [[4, 2]],
	floorS: [[2, 3], [3, 3]], // bottom border: wall to the S
	floorSW: [[1, 3]],
	floorSE: [[4, 3]],
	// 2x2 motif quadrants: ONLY ever placed by the atomic stamp pass below —
	// never selected as independent random variants
	motifMottled: [[6, 0], [7, 0], [6, 1], [7, 1]], // TL TR BL BR
	motifSlab: [[8, 0], [9, 0], [8, 1], [9, 1]],
	gateGlow: [[5, 6]], // blue light pool under a window/gate
}

// atomic multi-cell floor motifs: quadrant order TL TR BL BR
export const MOTIFS = [
	{ name: 'motifMottled', w: 2, h: 2, weight: 0.8 },
	{ name: 'motifSlab', w: 2, h: 2, weight: 0.2 }, // hard-bordered plate: rare
]
export const MOTIF_MIN_SPACING = 4 // Chebyshev distance between anchors
export const MOTIF_MAX_COVERAGE = 0.05 // of floor cells
const MOTIF_TRY = 0.012 // per-anchor roll; spacing/coverage clamp the rest

// classification codes stored in map.visCls (drives the debug overlay)
export const CLS = {
	NONE: 0, FLOOR: 1, RUN_N: 2, RUN_S: 3, SIDE_W: 4, SIDE_E: 5,
	CORNER_CONVEX: 6, CORNER_CONCAVE: 7, JAMB: 8, PILLAR: 9,
	CAP_ABOVE: 10, DOORWAY: 11, GATE: 12, FALLBACK: 13, ERROR: 14,
}
export const CLS_NAMES = Object.fromEntries(Object.entries(CLS).map(([k, v]) => [v, k]))

// flags in map.visFlag
export const FLAG_FALLBACK = 1
export const FLAG_ERROR = 2

const PIECE_LIST = []
const PIECE_BASE = {}
for (const [name, cells] of Object.entries(PIECES)) {
	PIECE_BASE[name] = PIECE_LIST.length
	for (const c of cells) PIECE_LIST.push({ name, cell: c })
}
/** piece id (1-based) -> {name, cell} for the debug inspector */
export function pieceInfo(id) {
	return id ? PIECE_LIST[id - 1] : null
}

/** Resolve the piece list to atlas regions for one biome (cheap; per floor). */
export function buildVisualLUT(atlas, biomeId) {
	if (!atlas.regions.v5t_0_0) return null // pack missing: caller falls back
	return PIECE_LIST.map(({ name, cell: [c, r] }) => {
		if (name === 'error') return atlas.regions.v5t_error ?? atlas.regions.white
		return atlas.regions[`v5t_${c}_${r}_${biomeId}`] ?? atlas.regions[`v5t_${c}_${r}`]
	})
}

const FLOORISH = new Set([TILE.FLOOR, TILE.STAIRS, TILE.HAZARD, TILE.PLATE, TILE.PLATE_DOWN, TILE.GATE])

/** Deterministic per-cell hash so visuals are stable for a given seed. */
function hash(x, y, seed) {
	let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0
	h = Math.imul(h ^ (h >>> 13), 1274126177)
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function pick(name, x, y, seed) {
	return PIECE_BASE[name] + Math.floor(hash(x, y, seed) * PIECES[name].length) + 1
}

/** Tall-face decor tables per room type (sparse; most tiles stay plain). */
const ROOM_FACE_DECOR = {
	[ROOM_TYPE.TREASURE]: { pieces: ['faceBanner', 'faceBlue'], chance: 0.3 },
	[ROOM_TYPE.SHOP]: { pieces: ['faceSconce'], chance: 0.35 },
	[ROOM_TYPE.SHRINE]: { pieces: ['faceRune', 'faceRedLamp'], chance: 0.3 },
	[ROOM_TYPE.ELITE]: { pieces: ['faceRedLamp', 'faceRed'], chance: 0.3 },
	[ROOM_TYPE.START]: { pieces: ['faceTorch', 'faceBanner'], chance: 0.25 },
	[ROOM_TYPE.EXIT]: { pieces: ['faceMixed', 'faceSconce'], chance: 0.2 },
	[ROOM_TYPE.BOSS]: { pieces: ['faceRedLamp', 'faceRune'], chance: 0.3 },
}

export function computeTileVisuals(map, rooms = [], seed = 1234) {
	const w = map.w
	const h = map.h
	map.vis0 = new Uint16Array(w * h)
	map.vis1 = new Uint16Array(w * h)
	map.visCls = new Uint8Array(w * h)
	map.visFlag = new Uint8Array(w * h)

	// room lookup grid (floor interiors) for face decoration
	const roomAt = new Int16Array(w * h).fill(-1)
	for (const r of rooms) {
		for (let ty = r.y; ty < r.y + r.h; ty++) {
			for (let tx = r.x; tx < r.x + r.w; tx++) {
				if (tx >= 0 && ty >= 0 && tx < w && ty < h) roomAt[ty * w + tx] = r.index
			}
		}
	}

	const floorish = (tx, ty) => FLOORISH.has(map.get(tx, ty))
	const solidWall = (tx, ty) => {
		const t = map.get(tx, ty)
		return t === TILE.WALL || t === TILE.CRACK
	}

	// ---- wall islands ---------------------------------------------------------
	// A wall component that never touches void is a free-standing block
	// (pillars). Blocks compose cap-top + face-bottom rows; boundary walls
	// (which always back onto void) use the run/corner/jamb grammar instead.
	const island = new Uint8Array(w * h)
	{
		const seen = new Uint8Array(w * h)
		for (let ty = 0; ty < h; ty++) {
			for (let tx = 0; tx < w; tx++) {
				const start = ty * w + tx
				if (seen[start] || !solidWall(tx, ty)) continue
				const comp = []
				const stack = [start]
				seen[start] = 1
				let touchesVoid = false
				while (stack.length) {
					const i = stack.pop()
					comp.push(i)
					const cx = i % w
					const cy = (i / w) | 0
					for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
						const nx = cx + dx
						const ny = cy + dy
						if (nx < 0 || ny < 0 || nx >= w || ny >= h) { touchesVoid = true; continue }
						const t = map.get(nx, ny)
						if (t === TILE.VOID) touchesVoid = true
						else if (solidWall(nx, ny) && !seen[ny * w + nx]) {
							seen[ny * w + nx] = 1
							stack.push(ny * w + nx)
						}
					}
				}
				if (!touchesVoid) for (const i of comp) island[i] = 1
			}
		}
	}

	// ---- atomic multi-cell floor motifs ----------------------------------------
	// Every multi-cell design is stamped whole or not at all: an anchor is
	// accepted only when every covered cell is strict interior FLOOR (no solid
	// orthogonal neighbor — which also keeps motifs out of doorways and narrow
	// corridors), away from gates, special-room centers, other motifs, and
	// within the coverage budget. Quadrants are never placed independently.
	const motifAt = new Uint16Array(w * h)
	map.visMotifs = []
	{
		let floorCells = 0
		for (let ii = 0; ii < w * h; ii++) if (map.tiles[ii] === TILE.FLOOR) floorCells++
		const budget = Math.floor(MOTIF_MAX_COVERAGE * floorCells)
		const anchors = []
		const interiorFloor = (cx, cy) =>
			map.get(cx, cy) === TILE.FLOOR &&
			floorish(cx, cy - 1) && floorish(cx, cy + 1) && floorish(cx - 1, cy) && floorish(cx + 1, cy) &&
			map.get(cx, cy - 1) !== TILE.GATE && map.get(cx, cy + 1) !== TILE.GATE &&
			map.get(cx - 1, cy) !== TILE.GATE && map.get(cx + 1, cy) !== TILE.GATE
		const nearSpecialCenter = (cx, cy) => {
			const ri = roomAt[cy * w + cx]
			if (ri < 0) return false
			const room = rooms[ri]
			if (!room || room.type === ROOM_TYPE.COMBAT) return false
			const ctx = Math.floor(room.cx / 16)
			const cty = Math.floor(room.cy / 16)
			return Math.abs(cx - ctx) <= 1 && Math.abs(cy - cty) <= 1
		}
		for (let ty = 1; ty < h - 2 && map.visMotifs.length * 4 < budget; ty++) {
			for (let tx = 1; tx < w - 2; tx++) {
				if (hash(tx, ty, seed ^ 0x40f1) >= MOTIF_TRY) continue
				if (anchors.some((a) => Math.abs(a.tx - tx) < MOTIF_MIN_SPACING && Math.abs(a.ty - ty) < MOTIF_MIN_SPACING)) continue
				const roll = hash(tx, ty, seed ^ 0x77aa)
				let acc = 0
				const motif = MOTIFS.find((m) => (acc += m.weight) >= roll * MOTIFS.reduce((s, x) => s + x.weight, 0)) ?? MOTIFS[0]
				let ok = true
				for (let qy = 0; qy < motif.h && ok; qy++) {
					for (let qx = 0; qx < motif.w; qx++) {
						const cx = tx + qx
						const cy = ty + qy
						if (!interiorFloor(cx, cy) || motifAt[cy * w + cx] || nearSpecialCenter(cx, cy)) { ok = false; break }
					}
				}
				if (!ok) continue
				for (let qy = 0; qy < motif.h; qy++) {
					for (let qx = 0; qx < motif.w; qx++) {
						motifAt[(ty + qy) * w + tx + qx] = PIECE_BASE[motif.name] + qy * motif.w + qx + 1
					}
				}
				anchors.push({ tx, ty })
				map.visMotifs.push({ tx, ty, name: motif.name, w: motif.w, h: motif.h })
				if (map.visMotifs.length * 4 >= budget) break
			}
		}
	}

	// ---- pass 1: north-run detection with per-run family ---------------------
	// A "run" is a maximal horizontal strip of wall cells that all have floor
	// to the south. The whole run renders in ONE family (compact or tall) so
	// wall segments read as continuous architecture, not per-cell noise.
	const runStyle = new Map() // runStartIndex -> 'compact' | 'tall'
	const runStart = (tx, ty) => {
		let x = tx
		while (x - 1 >= 0 && solidWall(x - 1, ty) && floorish(x - 1, ty + 1)) x--
		return ty * w + x
	}
	const styleOf = (tx, ty) => {
		const startIdx = runStart(tx, ty)
		if (!runStyle.has(startIdx)) {
			// bias tall (decorated) runs toward typed rooms below the run
			const belowRoom = roomAt[startIdx + w] // start cell's south neighbor
			const room = belowRoom >= 0 ? rooms[belowRoom] : null
			const special = room && room.type !== ROOM_TYPE.COMBAT && room.type !== ROOM_TYPE.SECRET
			const roll = hash(startIdx % w, (startIdx / w) | 0, seed ^ 0x7a11)
			runStyle.set(startIdx, roll < (special ? 0.75 : 0.35) ? 'tall' : 'compact')
		}
		return runStyle.get(startIdx)
	}

	for (let ty = 0; ty < h; ty++) {
		for (let tx = 0; tx < w; tx++) {
			const i = ty * w + tx
			const t = map.get(tx, ty)

			// ---------------- floors -------------------------------------------------
			if (FLOORISH.has(t)) {
				map.visCls[i] = t === TILE.GATE ? CLS.GATE : CLS.FLOOR
				const nS = !floorish(tx, ty - 1)
				const wS = !floorish(tx - 1, ty)
				const eS = !floorish(tx + 1, ty)
				// light pool under a portcullis window / gate above (the wall
				// row above is already resolved: rows are processed top-down)
				const aboveInfo = ty > 0 ? pieceInfo(map.vis0[i - w]) : null
				if (map.get(tx, ty - 1) === TILE.GATE || (aboveInfo && aboveInfo.name === 'faceWindow')) {
					map.vis0[i] = pick('gateGlow', tx, ty, seed)
					continue
				}
				// atomic motif quadrant (stamped whole in the pre-pass)
				if (motifAt[i]) {
					map.vis0[i] = motifAt[i]
					continue
				}
				const sS = !floorish(tx, ty + 1)
				if (nS && wS && eS) {
					// doorway slot in a horizontal wall (corridor mouth): plain floor
					map.vis0[i] = pick('floor', tx, ty, seed)
					map.visCls[i] = CLS.DOORWAY
				} else if (nS) {
					// the room reads as one bordered panel: directional border
					// pieces on every wall-adjacent cell (see floor catalog)
					map.vis0[i] = wS ? pick('floorShadowNW', tx, ty, seed)
						: eS ? pick('floorShadowNE', tx, ty, seed)
						: pick('floorShadowN', tx, ty, seed)
				} else if (sS) {
					map.vis0[i] = wS ? pick('floorSW', tx, ty, seed)
						: eS ? pick('floorSE', tx, ty, seed)
						: pick('floorS', tx, ty, seed)
				} else if (wS) {
					map.vis0[i] = pick('floorW', tx, ty, seed)
				} else if (eS) {
					map.vis0[i] = pick('floorE', tx, ty, seed)
				} else {
					const roll = hash(tx, ty, seed ^ 0x9e37)
					map.vis0[i] = roll < 0.06 ? pick('floorWear', tx, ty, seed)
						: pick('floor', tx, ty, seed)
				}
				continue
			}

			if (t !== TILE.WALL && t !== TILE.CRACK) continue // void handled by pass 2

			// ---------------- walls --------------------------------------------------
			const fN = floorish(tx, ty - 1)
			const fS = floorish(tx, ty + 1)
			const fW = floorish(tx - 1, ty)
			const fE = floorish(tx + 1, ty)
			const orthCount = fN + fS + fW + fE

			if (orthCount >= 3) {
				// 1x1 pillar surrounded by floor
				map.vis0[i] = pick('pillar', tx, ty, seed)
				map.visCls[i] = CLS.PILLAR
			} else if (island[i]) {
				// free-standing wall block: the sheet has no dedicated block
				// tiles (see catalog), but its column pieces are drawn to stand
				// on open floor — the artist's own demo uses them that way. A
				// block renders as a cluster of columns matching its collision.
				map.visCls[i] = CLS.PILLAR
				if (fN || fS || fE || fW) {
					map.vis0[i] = pick('pillar', tx, ty, seed)
				} else {
					map.visCls[i] = CLS.NONE // block interior
				}
			} else if (fN && fS) {
				// 1-cell horizontal wall, floor both sides — no dedicated tile
				map.vis0[i] = pick('capS', tx, ty, seed)
				map.visCls[i] = CLS.FALLBACK
				map.visFlag[i] = FLAG_FALLBACK
			} else if (fW && fE) {
				// 1-cell vertical wall, floor both sides — layered bands
				map.vis0[i] = pick('capE', tx, ty, seed)
				map.vis1[i] = pick('capW', tx, ty, seed)
				map.visCls[i] = CLS.FALLBACK
				map.visFlag[i] = FLAG_FALLBACK
			} else if (fS) {
				// north run cell (doorway edges get jamb columns)
				if (fE) {
					map.vis0[i] = pick('jambL', tx, ty, seed) // opening to the east
					map.visCls[i] = CLS.JAMB
				} else if (fW) {
					map.vis0[i] = pick('jambR', tx, ty, seed)
					map.visCls[i] = CLS.JAMB
				} else {
					map.visCls[i] = CLS.RUN_N
					if (styleOf(tx, ty) === 'compact') {
						map.vis0[i] = pick('capN', tx, ty, seed)
					} else {
						map.vis0[i] = facePiece(tx, ty, seed, roomAt, rooms, w, h)
					}
				}
			} else if (fN) {
				// south run cell; concave turns use the jamb columns (the
				// artist's own pattern at the demo corridor mouth)
				if (fE) {
					map.vis0[i] = pick('jambL', tx, ty, seed)
					map.visCls[i] = CLS.CORNER_CONCAVE
				} else if (fW) {
					map.vis0[i] = pick('jambR', tx, ty, seed)
					map.visCls[i] = CLS.CORNER_CONCAVE
				} else {
					// mid-run cap; where the run meets a perpendicular wall
					// mass heading south, the corner pieces mark the junction
					// (the artist's pattern beside the demo corridor mouth)
					const wallS = solidWall(tx, ty + 1)
					map.visCls[i] = CLS.RUN_S
					map.vis0[i] = wallS && solidWall(tx + 1, ty) && !solidWall(tx + 1, ty + 1) ? PIECE_BASE.cornerBR + 1
						: wallS && solidWall(tx - 1, ty) && !solidWall(tx - 1, ty + 1) ? PIECE_BASE.cornerBL + 1
						: pick('capS', tx, ty, seed)
				}
			} else if (fE) {
				map.vis0[i] = pick('capE', tx, ty, seed)
				map.visCls[i] = CLS.SIDE_W // wall is west of the floor
			} else if (fW) {
				map.vis0[i] = pick('capW', tx, ty, seed)
				map.visCls[i] = CLS.SIDE_E
			} else {
				// no orthogonal floor: ring corner by single diagonal
				const dSE = floorish(tx + 1, ty + 1)
				const dSW = floorish(tx - 1, ty + 1)
				const dNE = floorish(tx + 1, ty - 1)
				const dNW = floorish(tx - 1, ty - 1)
				const count = dSE + dSW + dNE + dNW
				if (count === 0) {
					map.visCls[i] = CLS.NONE // interior of a wall mass (pass 2 may cap it)
				} else if (dSE && dSW) {
					// wall cell between two doorways/floors below-diagonals: cap run
					map.vis0[i] = pick('capN', tx, ty, seed)
					map.visCls[i] = CLS.FALLBACK
					map.visFlag[i] = FLAG_FALLBACK
				} else if (dNE && dNW) {
					map.vis0[i] = pick('capS', tx, ty, seed)
					map.visCls[i] = CLS.FALLBACK
					map.visFlag[i] = FLAG_FALLBACK
				} else if (count > 1) {
					map.vis0[i] = PIECE_BASE.error + 1
					map.visCls[i] = CLS.ERROR
					map.visFlag[i] = FLAG_ERROR
				} else {
					map.visCls[i] = CLS.CORNER_CONVEX
					map.vis0[i] = dSE ? PIECE_BASE.cornerTL + 1
						: dSW ? PIECE_BASE.cornerTR + 1
						: dNE ? PIECE_BASE.cornerBL + 1
						: PIECE_BASE.cornerBR + 1
				}
			}
		}
	}

	// ---- pass 2: cap the upper cell of 2-tall wall masses ---------------------
	// Only solid wall cells (never void/floor) whose south neighbor renders a
	// tall face and which got no piece of their own.
	for (let ty = 0; ty < h - 1; ty++) {
		for (let tx = 0; tx < w; tx++) {
			const i = ty * w + tx
			if (!solidWall(tx, ty) || map.vis0[i]) continue
			const below = i + w
			const belowInfo = pieceInfo(map.vis0[below])
			if (belowInfo && belowInfo.name.startsWith('face')) {
				map.vis0[i] = pick('capN', tx, ty, seed)
				map.visCls[i] = CLS.CAP_ABOVE
			}
		}
	}

	return map
}

/** Tall face piece for a north-run cell, with sparse room-typed decor. */
function facePiece(tx, ty, seed, roomAt, rooms, w, h) {
	const belowIdx = (ty + 1) * w + tx
	const roomIdx = belowIdx < w * h ? roomAt[belowIdx] : -1
	const room = roomIdx >= 0 ? rooms[roomIdx] : null
	const decor = room ? ROOM_FACE_DECOR[room.type] : null
	if (decor && hash(tx, ty, seed ^ 0x51ed) < decor.chance) {
		const name = decor.pieces[Math.floor(hash(tx, ty, seed ^ 0x2b) * decor.pieces.length)]
		return pick(name, tx, ty, seed)
	}
	return pick('face', tx, ty, seed)
}
