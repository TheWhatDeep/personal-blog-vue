import { TileMap, TILE, TILE_SIZE } from './TileMap.js'
import { BIOMES } from '../data/biomes.js'

/**
 * Deterministic wall-grammar conformance map (dev-only, via the debug menu).
 *
 * Contains labeled examples of every wall configuration the resolver must
 * support: rooms (rect / L / plus / U), all convex + concave corners, 1- and
 * 2-wide corridors in both axes, a four-entrance room, T-junctions in every
 * orientation, a 4-way junction, dead-end caps, a gated doorway, adjacent
 * rooms sharing a thin wall, pillars, and one deliberately unsupported
 * pattern that must surface the magenta error tile.
 *
 * Rendered with `world.conformance = true`, which suppresses the HUD,
 * minimap and toasts so screenshots show nothing but the grammar.
 */
export function buildConformanceMap() {
	const W = 64
	const H = 46
	const map = new TileMap(W, H)
	const labels = []
	const spawns = []

	const carve = (x, y, w, h) => {
		for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) map.set(tx, ty, TILE.FLOOR)
	}
	const wall = (x, y, w = 1, h = 1) => {
		for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) map.set(tx, ty, TILE.WALL)
	}
	const label = (x, y, text) => labels.push({ x: x * TILE_SIZE, y: y * TILE_SIZE, text })

	// ---- band A: room shapes -------------------------------------------------
	label(2, 1.6, '1 RECT + PILLAR')
	carve(2, 3, 8, 6)
	wall(6, 5) // 1x1 pillar inside the room

	label(13, 1.6, '2 L-ROOM')
	carve(13, 3, 9, 4)
	carve(13, 3, 4, 9)

	label(25, 1.6, '3 PLUS (4 CONCAVE)')
	carve(25, 6, 12, 4)
	carve(29, 2, 4, 12)
	wall(30, 7, 2, 2) // 2x2 pillar at the crossing

	label(42, 1.6, '4 U-ROOM')
	carve(42, 3, 9, 7)
	for (let ty = 3; ty < 6; ty++) for (let tx = 45; tx < 48; tx++) map.set(tx, ty, TILE.VOID)

	// ---- band B: corridors + entrances ----------------------------------------
	label(2, 13.6, '5 1W HORIZ')
	carve(2, 15, 8, 1)
	label(12, 13.6, '6 1W VERT')
	carve(13, 15, 1, 8)
	label(17, 13.6, '7 2W HORIZ')
	carve(17, 15, 8, 2)
	label(27, 13.6, '8 2W VERT')
	carve(27, 15, 2, 8)

	label(32, 11.6, '9 ENTRANCE EVERY SIDE')
	carve(33, 16, 9, 7)
	carve(36, 13, 2, 3) // N
	carve(36, 23, 2, 3) // S
	carve(30, 19, 3, 2) // W
	carve(42, 19, 3, 2) // E

	label(48, 11.6, '10 GATED DOORWAY')
	carve(48, 16, 8, 6)
	carve(51, 12, 2, 3) // approach corridor from the north
	map.set(51, 15, TILE.GATE)
	map.set(52, 15, TILE.GATE)
	spawns.push({ kind: 'gate', tiles: [[51, 15], [52, 15]] })
	spawns.push({ kind: 'key', x: 52 * TILE_SIZE, y: 12.6 * TILE_SIZE })

	// ---- band C: junctions, caps, shared walls, error --------------------------
	label(2, 27.6, '11 T-DOWN')
	carve(2, 29, 10, 2)
	carve(6, 31, 2, 4)
	label(2, 37.6, '12 T-UP')
	carve(2, 41, 10, 2)
	carve(6, 37, 2, 4)
	label(14, 27.6, '13 T-RIGHT')
	carve(15, 29, 2, 10)
	carve(17, 33, 4, 2)
	label(23, 27.6, '14 T-LEFT')
	carve(27, 29, 2, 10)
	carve(23, 33, 4, 2)

	label(33, 27.6, '15 4-WAY')
	carve(31, 33, 10, 2)
	carve(35, 29, 2, 10)

	label(44, 27.6, '16 END CAPS')
	carve(44, 29, 5, 2) // E+W caps
	carve(52, 29, 2, 5) // N+S caps

	label(44, 36.6, '17 ADJACENT ROOMS')
	carve(44, 38, 6, 5)
	carve(51, 38, 6, 5)
	map.set(50, 40, TILE.FLOOR) // doorway through the shared 1-cell wall

	label(57, 27.6, '18 UNSUPPORTED')
	map.set(60, 30, TILE.FLOOR)
	map.set(58, 32, TILE.FLOOR)

	// wrap every floorish cell with wall where it borders void (same rule as
	// the generator)
	for (let ty = 0; ty < H; ty++) {
		for (let tx = 0; tx < W; tx++) {
			if (map.get(tx, ty) !== TILE.VOID) continue
			let touches = false
			for (let oy = -1; oy <= 1 && !touches; oy++) {
				for (let ox = -1; ox <= 1; ox++) {
					const t = map.get(tx + ox, ty + oy)
					if (t !== TILE.VOID && t !== TILE.WALL) { touches = true; break }
				}
			}
			if (touches) map.set(tx, ty, TILE.WALL)
		}
	}

	return {
		map,
		rooms: [],
		corridors: [],
		spawns,
		biome: BIOMES[0], // crypt: the pack's native palette
		visualSeed: 42,
		floor: 1,
		playerStart: { x: 52 * TILE_SIZE, y: 13 * TILE_SIZE },
		isBoss: false,
		conformance: true,
		labels,
	}
}
