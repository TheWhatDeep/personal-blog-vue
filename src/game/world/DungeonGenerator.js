import { TileMap, TILE, TILE_SIZE } from './TileMap.js'
import { BIOMES, biomeForFloor, isBossFloor } from '../data/biomes.js'

/**
 * Procedural dungeon generator.
 *
 * Normal floors: scattered rectangular rooms connected in insertion order
 * with L-shaped corridors — connecting each room to the nearest existing
 * room guarantees a fully navigable connected graph. Rooms are then themed:
 * start, exit, combat, treasure, elite, shop, shrine, puzzle, plus a secret
 * room hidden behind a breakable cracked wall.
 *
 * Boss floors: one large arena with a short entry hall.
 *
 * Output is a plain description (tilemap + rooms + spawn descriptors);
 * entity instantiation happens in World so generation stays testable.
 */

export const ROOM_TYPE = {
	START: 'start',
	COMBAT: 'combat',
	TREASURE: 'treasure',
	ELITE: 'elite',
	SHOP: 'shop',
	SHRINE: 'shrine',
	PUZZLE: 'puzzle',
	SECRET: 'secret',
	EXIT: 'exit',
	BOSS: 'boss',
}

export function generateDungeon(floor, rng, endless = false) {
	if (!endless && isBossFloor(floor)) return generateBossArena(floor, rng)
	return generateNormalFloor(floor, rng, endless)
}

/**
 * Arena mode: one big open room with pillars and a couple of hazard
 * patches — a clean combat test bed for wave survival.
 */
export function generateArenaFloor(rng) {
	const W = 44
	const H = 34
	const map = new TileMap(W, H)
	const biome = rng.pick(BIOMES) // random look each run

	const room = { x: 3, y: 3, w: W - 6, h: H - 6, type: ROOM_TYPE.BOSS, discovered: true, cleared: false, index: 0 }
	room.cx = (room.x + room.w / 2) * TILE_SIZE
	room.cy = (room.y + room.h / 2) * TILE_SIZE
	carveRect(map, room.x, room.y, room.w, room.h)
	buildWalls(map)

	// corner pillars only — the middle stays open for combat flow
	for (const [px, py] of [[10, 10], [W - 13, 10], [10, H - 13], [W - 13, H - 13]]) {
		fillRect(map, px, py, 2, 2, TILE.WALL)
	}
	// hazard patches near the corners
	fillRect(map, 6, H >> 1, 2, 2, TILE.HAZARD)
	fillRect(map, W - 8, H >> 1, 2, 2, TILE.HAZARD)

	for (let i = 0; i < map.tiles.length; i++) map.variants[i] = rng.chance(0.15) ? 1 : 0

	const spawns = [
		{ kind: 'torch', x: (room.x + 2) * TILE_SIZE, y: (room.y + 2) * TILE_SIZE },
		{ kind: 'torch', x: (room.x + room.w - 2) * TILE_SIZE, y: (room.y + 2) * TILE_SIZE },
	]

	return {
		map,
		rooms: [room],
		corridors: [],
		spawns,
		biome,
		visualSeed: rng.int(0, 2147483647),
		floor: 1,
		playerStart: { x: room.cx, y: room.cy },
		isBoss: false,
		arena: room,
	}
}

function generateNormalFloor(floor, rng, endless) {
	const W = 72
	const H = 72
	const map = new TileMap(W, H)
	const biome = biomeForFloor(floor)
	const rooms = []
	const corridors = []
	const spawns = []

	// ---- place rooms ---------------------------------------------------------
	const targetRooms = endless ? 8 : Math.min(12, 7 + Math.floor(floor / 2))
	let guard = 400
	while (rooms.length < targetRooms && guard-- > 0) {
		const w = rng.int(7, 12)
		const h = rng.int(6, 10)
		const x = rng.int(2, W - w - 3)
		const y = rng.int(2, H - h - 3)
		if (rooms.some((r) => overlaps(r, { x, y, w, h }, 3))) continue
		const room = { x, y, w, h, type: ROOM_TYPE.COMBAT, discovered: false, cleared: false, index: rooms.length }
		room.cx = (x + w / 2) * TILE_SIZE
		room.cy = (y + h / 2) * TILE_SIZE
		rooms.push(room)
	}

	// carve rooms
	for (const r of rooms) carveRect(map, r.x, r.y, r.w, r.h)

	// ---- connect: each room to its nearest earlier room ------------------------
	for (let i = 1; i < rooms.length; i++) {
		let best = 0
		let bestD = Infinity
		for (let j = 0; j < i; j++) {
			const d = (rooms[i].cx - rooms[j].cx) ** 2 + (rooms[i].cy - rooms[j].cy) ** 2
			if (d < bestD) {
				bestD = d
				best = j
			}
		}
		corridors.push(carveCorridor(map, rooms[i], rooms[best], rng))
	}
	// a couple of extra loops so floors aren't pure trees
	for (let n = 0; n < 2 && rooms.length > 4; n++) {
		const a = rng.pick(rooms)
		const b = rng.pick(rooms)
		if (a !== b) corridors.push(carveCorridor(map, a, b, rng))
	}

	// ---- assign room types -----------------------------------------------------
	// start = first room, exit = farthest room from start
	const start = rooms[0]
	start.type = ROOM_TYPE.START
	let exit = rooms[1] || start
	let bestD = -1
	for (const r of rooms) {
		if (r === start) continue
		const d = (r.cx - start.cx) ** 2 + (r.cy - start.cy) ** 2
		if (d > bestD) {
			bestD = d
			exit = r
		}
	}
	exit.type = ROOM_TYPE.EXIT

	const middle = rooms.filter((r) => r !== start && r !== exit)
	rng.shuffle(middle)
	const wants = [ROOM_TYPE.TREASURE]
	if (floor >= 2 || endless) wants.push(ROOM_TYPE.ELITE)
	if (rng.chance(0.75)) wants.push(ROOM_TYPE.SHOP)
	if (rng.chance(0.65)) wants.push(ROOM_TYPE.SHRINE)
	if ((floor >= 2 || endless) && rng.chance(0.6)) wants.push(ROOM_TYPE.PUZZLE)
	for (let i = 0; i < middle.length && i < wants.length; i++) {
		middle[i].type = wants[i]
	}

	// ---- secret room ------------------------------------------------------------
	addSecretRoom(map, rooms, rng)

	// ---- walls around all floor ---------------------------------------------------
	buildWalls(map)

	// ---- populate ------------------------------------------------------------------
	for (const room of rooms) {
		populateRoom(room, map, rng, floor, biome, spawns, endless)
	}

	// stairs go in last so no room decoration can overwrite them
	const stairsTx = Math.floor(exit.cx / TILE_SIZE)
	const stairsTy = Math.floor(exit.cy / TILE_SIZE)
	map.set(stairsTx, stairsTy, TILE.STAIRS)

	// ---- optional locked gate on a single-entrance treasure room ---------------
	// Never on the critical path: only a dead-end treasure room qualifies, and
	// the key is validated reachable (and stairs too) with the gate closed.
	placeGateAndKey(map, rooms, spawns, rng, start, { tx: stairsTx, ty: stairsTy })

	// floor tile variants + scattered decor
	for (let i = 0; i < map.tiles.length; i++) {
		map.variants[i] = rng.chance(0.15) ? 1 : 0
	}

	return {
		map,
		rooms,
		corridors,
		spawns,
		biome,
		visualSeed: rng.int(0, 2147483647),
		floor,
		playerStart: { x: start.cx, y: start.cy },
		isBoss: false,
	}
}

function generateBossArena(floor, rng) {
	const W = 44
	const H = 40
	const map = new TileMap(W, H)
	const biome = biomeForFloor(floor)

	const arena = { x: 6, y: 4, w: 32, h: 24, type: ROOM_TYPE.BOSS, discovered: false, cleared: false, index: 0 }
	arena.cx = (arena.x + arena.w / 2) * TILE_SIZE
	arena.cy = (arena.y + arena.h / 2) * TILE_SIZE
	// entry hall below the arena
	const hall = { x: 19, y: 28, w: 6, h: 8, type: ROOM_TYPE.START, discovered: false, cleared: true, index: 1 }
	hall.cx = (hall.x + hall.w / 2) * TILE_SIZE
	hall.cy = (hall.y + hall.h / 2) * TILE_SIZE

	carveRect(map, arena.x, arena.y, arena.w, arena.h)
	carveRect(map, hall.x, hall.y, hall.w, hall.h)
	buildWalls(map)

	// arena pillars for cover
	for (let i = 0; i < 4; i++) {
		const px = arena.x + 6 + (i % 2) * (arena.w - 14)
		const py = arena.y + 5 + Math.floor(i / 2) * (arena.h - 12)
		fillRect(map, px, py, 2, 2, TILE.WALL)
	}

	const spawns = [
		{ kind: 'boss', bossId: biome.boss, x: arena.cx, y: arena.cy - 40 },
		{ kind: 'torch', x: (arena.x + 2) * TILE_SIZE, y: (arena.y + 2) * TILE_SIZE },
		{ kind: 'torch', x: (arena.x + arena.w - 2) * TILE_SIZE, y: (arena.y + 2) * TILE_SIZE },
	]

	return {
		map,
		rooms: [arena, hall],
		corridors: [],
		spawns,
		biome,
		visualSeed: rng.int(0, 2147483647),
		floor,
		playerStart: { x: hall.cx, y: (hall.y + hall.h - 2) * TILE_SIZE },
		isBoss: true,
		arena,
	}
}

// ---- helpers ------------------------------------------------------------------

function overlaps(a, b, pad) {
	return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y
}

function carveRect(map, x, y, w, h) {
	for (let ty = y; ty < y + h; ty++) {
		for (let tx = x; tx < x + w; tx++) {
			map.set(tx, ty, TILE.FLOOR)
		}
	}
}

function fillRect(map, x, y, w, h, t) {
	for (let ty = y; ty < y + h; ty++) {
		for (let tx = x; tx < x + w; tx++) {
			map.set(tx, ty, t)
		}
	}
}

/** L-shaped 2-tile-wide corridor between room centers. Returns tile list for the minimap. */
function carveCorridor(map, a, b, rng) {
	const tiles = []
	let x = Math.floor(a.cx / TILE_SIZE)
	let y = Math.floor(a.cy / TILE_SIZE)
	const tx = Math.floor(b.cx / TILE_SIZE)
	const ty = Math.floor(b.cy / TILE_SIZE)
	const horizontalFirst = rng.chance(0.5)

	const carve = (cx, cy) => {
		for (let oy = 0; oy < 2; oy++) {
			for (let ox = 0; ox < 2; ox++) {
				if (map.get(cx + ox, cy + oy) !== TILE.FLOOR) {
					map.set(cx + ox, cy + oy, TILE.FLOOR)
				}
			}
		}
		tiles.push(cx, cy)
	}

	const walkX = () => {
		while (x !== tx) {
			x += Math.sign(tx - x)
			carve(x, y)
		}
	}
	const walkY = () => {
		while (y !== ty) {
			y += Math.sign(ty - y)
			carve(x, y)
		}
	}
	if (horizontalFirst) {
		walkX()
		walkY()
	} else {
		walkY()
		walkX()
	}
	return { a: a.index, b: b.index, tiles }
}

/** Attach a small hidden room behind a cracked (breakable) wall segment. */
function addSecretRoom(map, rooms, rng) {
	for (let attempt = 0; attempt < 30; attempt++) {
		const host = rng.pick(rooms)
		const dir = rng.pick([
			{ dx: 1, dy: 0 },
			{ dx: -1, dy: 0 },
			{ dx: 0, dy: 1 },
			{ dx: 0, dy: -1 },
		])
		const w = 5
		const h = 5
		const x = dir.dx > 0 ? host.x + host.w + 1 : dir.dx < 0 ? host.x - w - 1 : host.x + ((host.w - w) >> 1)
		const y = dir.dy > 0 ? host.y + host.h + 1 : dir.dy < 0 ? host.y - h - 1 : host.y + ((host.h - h) >> 1)
		if (x < 2 || y < 2 || x + w > map.w - 2 || y + h > map.h - 2) continue
		if (rooms.some((r) => overlaps(r, { x, y, w, h }, 1))) continue

		// the seal path must not cross existing floor (a corridor could pass
		// through the gap — turning it to CRACK would sever the level)
		const sealPath = []
		if (dir.dx !== 0) {
			const wy = Math.floor(host.cy / TILE_SIZE)
			const from = dir.dx > 0 ? host.x + host.w : x + w
			const to = dir.dx > 0 ? x : host.x
			for (let t = from; t < to; t++) sealPath.push([t, wy])
		} else {
			const wx = x + (w >> 1)
			const from = dir.dy > 0 ? host.y + host.h : y + h
			const to = dir.dy > 0 ? y : host.y
			for (let t = from; t < to; t++) sealPath.push([wx, t])
		}
		if (sealPath.length === 0 || sealPath.some(([tx2, ty2]) => map.get(tx2, ty2) === TILE.FLOOR)) continue

		carveRect(map, x, y, w, h)
		const room = {
			x, y, w, h,
			cx: (x + w / 2) * TILE_SIZE,
			cy: (y + h / 2) * TILE_SIZE,
			type: ROOM_TYPE.SECRET,
			discovered: false,
			cleared: false,
			index: rooms.length,
		}
		rooms.push(room)
		// seal the passage with breakable CRACK tiles
		for (const [tx2, ty2] of sealPath) map.set(tx2, ty2, TILE.CRACK)
		return
	}
}

/**
 * Gate a treasure room behind a locked portcullis, with its key placed in a
 * far room that stays reachable while the gate is closed.
 *
 * Constraints (first pass, deliberately conservative):
 *  - the treasure room must have exactly ONE entrance group, on its top or
 *    bottom edge (the portcullis art faces the camera)
 *  - flood fill with the gate closed must still reach the stairs AND the key
 *  - anything else -> no gate this floor
 */
function placeGateAndKey(map, rooms, spawns, rng, start, stairs) {
	const room = rooms.find((r) => r.type === ROOM_TYPE.TREASURE)
	if (!room) return

	// entrance cells on the boundary ring just outside the room rect
	const openings = []
	for (let tx = room.x - 1; tx <= room.x + room.w; tx++) {
		if (map.get(tx, room.y - 1) === TILE.FLOOR) openings.push({ tx, ty: room.y - 1, edge: 'top' })
		if (map.get(tx, room.y + room.h) === TILE.FLOOR) openings.push({ tx, ty: room.y + room.h, edge: 'bottom' })
	}
	for (let ty = room.y; ty < room.y + room.h; ty++) {
		if (map.get(room.x - 1, ty) === TILE.FLOOR) openings.push({ tx: room.x - 1, ty, edge: 'left' })
		if (map.get(room.x + room.w, ty) === TILE.FLOOR) openings.push({ tx: room.x + room.w, ty, edge: 'right' })
	}
	if (!openings.length || openings.length > 3) return
	const edges = new Set(openings.map((o) => o.edge))
	if (edges.size !== 1) return // multiple entrances: leave it open
	const edge = openings[0].edge
	if (edge === 'left' || edge === 'right') return // side gates read poorly
	// contiguous?
	const xs = openings.map((o) => o.tx).sort((a, b) => a - b)
	for (let i = 1; i < xs.length; i++) if (xs[i] !== xs[i - 1] + 1) return

	const tiles = openings.map((o) => [o.tx, o.ty])

	// flood fill from the start with the gate treated as solid
	const startTx = Math.floor(start.cx / TILE_SIZE)
	const startTy = Math.floor(start.cy / TILE_SIZE)
	const gateSet = new Set(tiles.map(([tx, ty]) => ty * map.w + tx))
	const reach = floodFill(map, startTx, startTy, gateSet)
	if (!reach[stairs.ty * map.w + stairs.tx]) return // gate would block the exit

	// key room: the farthest reachable normal room (never the treasure room
	// itself, never the secret room — that hides behind a breakable wall)
	let keyRoom = null
	let bestD = -1
	for (const r of rooms) {
		if (r === room || r.type === ROOM_TYPE.SECRET) continue
		const ktx = Math.floor(r.cx / TILE_SIZE)
		const kty = Math.floor(r.cy / TILE_SIZE)
		if (!reach[kty * map.w + ktx]) continue
		const d = (r.cx - room.cx) ** 2 + (r.cy - room.cy) ** 2
		if (d > bestD) {
			bestD = d
			keyRoom = r
		}
	}
	if (!keyRoom) return

	for (const [tx, ty] of tiles) map.set(tx, ty, TILE.GATE)
	spawns.push({ kind: 'gate', tiles })
	spawns.push({
		kind: 'key',
		x: keyRoom.cx + rng.int(-1, 1) * TILE_SIZE,
		y: keyRoom.cy + TILE_SIZE,
	})
	// a guarded prize: gated chests roll better loot
	const chest = spawns.find((s) => s.kind === 'chest' && Math.abs(s.x - room.cx) < room.w * TILE_SIZE)
	if (chest) chest.rarityBonus = (chest.rarityBonus ?? 0) + 1
	room.gated = true
}

/** BFS over walkable tiles; `extraSolid` is a Set of blocked cell indices. */
function floodFill(map, startTx, startTy, extraSolid) {
	const reach = new Uint8Array(map.w * map.h)
	const queue = [startTy * map.w + startTx]
	reach[queue[0]] = 1
	while (queue.length) {
		const i = queue.pop()
		const tx = i % map.w
		const ty = (i / map.w) | 0
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nx = tx + dx
			const ny = ty + dy
			if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue
			const ni = ny * map.w + nx
			if (reach[ni] || extraSolid.has(ni)) continue
			const t = map.get(nx, ny)
			if (t === TILE.VOID || t === TILE.WALL || t === TILE.CRACK || t === TILE.GATE) continue
			reach[ni] = 1
			queue.push(ni)
		}
	}
	return reach
}

/** Surround every walkable tile with wall where it borders VOID. */
function buildWalls(map) {
	for (let ty = 0; ty < map.h; ty++) {
		for (let tx = 0; tx < map.w; tx++) {
			if (map.get(tx, ty) !== TILE.VOID) continue
			let touchesFloor = false
			for (let oy = -1; oy <= 1 && !touchesFloor; oy++) {
				for (let ox = -1; ox <= 1; ox++) {
					const t = map.get(tx + ox, ty + oy)
					if (t !== TILE.VOID && t !== TILE.WALL && t !== TILE.CRACK) {
						touchesFloor = true
						break
					}
				}
			}
			if (touchesFloor) map.set(tx, ty, TILE.WALL)
		}
	}
}

// v5.2 prop-sheet sprites used for dressing (see the asset-preview scene)
const DECOR = {
	crate: 'v5p_4_2', crateDark: 'v5p_7_2', crateBig: 'v5p_5_3', crateBanded: 'v5p_7_3',
	barrel2: 'v5p_4_4', sack: 'v5p_4_3', dresser: 'v5p_0_2', cabinet: 'v5p_3_2',
	bookcase: 'v5p_2_2', skull: 'v5p_2_3', bones: 'v5p_2_4', sign: 'v5p_7_4',
	trophy: 'v5p_0_1', goblet: 'v5p_10_4', scroll: 'v5p_11_3', book: 'v5p_11_2',
}

/**
 * Wall-flush decor spots along the room's top wall, as one CONTIGUOUS
 * cluster (props read as an intentional arrangement, not scatter). Never in
 * front of a doorway and never on special tiles.
 */
function wallSpots(room, map, rng, count) {
	const valid = (tx) => {
		const ty = room.y
		if (map.get(tx, ty) !== TILE.FLOOR) return false
		const above = map.get(tx, ty - 1)
		return above !== TILE.FLOOR && above !== TILE.GATE // not a doorway
	}
	// find candidate anchors that fit the whole cluster
	const anchors = []
	for (let tx = room.x + 1; tx < room.x + room.w - 1 - count; tx++) {
		let ok = true
		for (let k = 0; k < count; k++) if (!valid(tx + k)) { ok = false; break }
		if (ok) anchors.push(tx)
	}
	if (!anchors.length) return []
	const anchor = rng.pick(anchors)
	const spots = []
	for (let k = 0; k < count; k++) {
		spots.push({ tx: anchor + k, ty: room.y, x: (anchor + k) * TILE_SIZE + 8, y: room.y * TILE_SIZE + 6 })
	}
	return spots
}

/** Wall-face banner spots: wall cells above the room whose face is visible. */
function faceSpots(room, map, rng, count) {
	const cols = []
	for (let tx = room.x + 1; tx < room.x + room.w - 1; tx++) cols.push(tx)
	rng.shuffle(cols)
	const spots = []
	for (const tx of cols) {
		if (spots.length >= count) break
		const ty = room.y - 1
		if (map.get(tx, ty) !== TILE.WALL) continue
		if (spots.some((s) => Math.abs(s.tx - tx) < 3)) continue
		spots.push({ tx, ty, x: tx * TILE_SIZE + 8, y: ty * TILE_SIZE + 10 })
	}
	return spots
}

function populateRoom(room, map, rng, floor, biome, spawns, endless) {
	const spot = (marginTiles = 1) => ({
		x: (room.x + marginTiles + rng.next() * (room.w - marginTiles * 2)) * TILE_SIZE,
		y: (room.y + marginTiles + rng.next() * (room.h - marginTiles * 2)) * TILE_SIZE,
	})
	const decor = (sprite, at, opts = {}) =>
		spawns.push({ kind: 'decor', sprite, x: at.x, y: at.y, ...opts })

	switch (room.type) {
		case ROOM_TYPE.START: {
			spawns.push({ kind: 'torch', x: room.cx - 24, y: room.cy - 24 })
			const s = wallSpots(room, map, rng, 2)
			if (s[0]) decor(DECOR.sign, s[0], { shadow: true })
			for (const f of faceSpots(room, map, rng, 1)) decor(null, f, { anim: 'v5_flag_blue' })
			room.cleared = true
			break
		}

		case ROOM_TYPE.COMBAT:
		case ROOM_TYPE.EXIT: {
			const count = Math.min(7, 2 + Math.floor(floor / 2) + rng.int(0, 2))
			for (let i = 0; i < count; i++) {
				const p = spot(2)
				spawns.push({ kind: 'enemy', id: rng.weighted(biome.enemies), x: p.x, y: p.y, room: room.index })
			}
			// occasional hazard patch
			if (rng.chance(0.35)) {
				const hx = room.x + rng.int(1, room.w - 3)
				const hy = room.y + rng.int(1, room.h - 3)
				fillRect(map, hx, hy, 2, 2, TILE.HAZARD)
				// old bloodshed near the trap
				decor(DECOR.bones, { x: (hx - 1) * TILE_SIZE + 4, y: (hy + 2) * TILE_SIZE + 4 })
			}
			if (rng.chance(0.4)) {
				const p = spot(1)
				spawns.push({ kind: 'barrel', x: p.x, y: p.y, sprite: 'v5p_4_4' })
			}
			// ~1 in 3 combat rooms doubles as storage: crates against the top wall
			if (rng.chance(0.35)) {
				const kinds = [DECOR.crate, DECOR.crateBig, DECOR.crateDark, DECOR.sack]
				for (const s of wallSpots(room, map, rng, rng.int(2, 3))) {
					decor(rng.pick(kinds), s, { shadow: true })
				}
			}
			break
		}

		case ROOM_TYPE.ELITE: {
			const id = rng.weighted(biome.enemies)
			spawns.push({ kind: 'enemy', id, x: room.cx, y: room.cy, elite: true, room: room.index })
			const minions = rng.int(1, 2)
			for (let i = 0; i < minions; i++) {
				const p = spot(2)
				spawns.push({ kind: 'enemy', id: rng.weighted(biome.enemies), x: p.x, y: p.y, room: room.index })
			}
			spawns.push({ kind: 'chest', x: room.cx, y: room.cy - 20, locked: true, room: room.index })
			// remains of previous challengers, heaped near the prize
			decor(DECOR.skull, { x: room.cx - 18, y: room.cy - 12 })
			decor(DECOR.bones, { x: room.cx - 10, y: room.cy - 4 })
			for (const f of faceSpots(room, map, rng, 2)) decor(null, f, { anim: 'v5_flag_red' })
			break
		}

		case ROOM_TYPE.TREASURE: {
			// one idea: the guarded hoard — chest flanked by its trappings
			spawns.push({ kind: 'chest', x: room.cx, y: room.cy })
			decor(DECOR.goblet, { x: room.cx + 14, y: room.cy + 2 })
			if (rng.chance(0.5)) spawns.push({ kind: 'barrel', x: room.cx - 16, y: room.cy + 4, sprite: 'v5p_4_4' })
			for (const s of wallSpots(room, map, rng, 2)) decor(DECOR.crateBanded, s, { shadow: true })
			for (const f of faceSpots(room, map, rng, 1)) decor(null, f, { anim: 'v5_flag_blue' })
			room.cleared = true
			break
		}

		case ROOM_TYPE.SHOP: {
			spawns.push({ kind: 'shop', x: room.cx, y: room.cy - 12 })
			const kinds = [DECOR.crate, DECOR.crateBig, DECOR.barrel2, DECOR.sack]
			for (const s of wallSpots(room, map, rng, 3)) decor(rng.pick(kinds), s, { shadow: true })
			room.cleared = true
			break
		}

		case ROOM_TYPE.SHRINE: {
			spawns.push({ kind: 'shrine', x: room.cx, y: room.cy })
			const s = wallSpots(room, map, rng, 2)
			if (s[0]) decor(DECOR.trophy, s[0], { shadow: true })
			if (s[1]) decor(DECOR.bookcase, s[1], { shadow: true })
			for (const f of faceSpots(room, map, rng, 2)) decor(null, f, { anim: 'v5_flag_red' })
			room.cleared = true
			break
		}

		case ROOM_TYPE.PUZZLE: {
			// stand on every plate to reveal a reward chest
			const plates = []
			for (let i = 0; i < 3; i++) {
				const tx = room.x + 1 + rng.int(0, room.w - 3)
				const ty = room.y + 1 + rng.int(0, room.h - 3)
				if (map.get(tx, ty) === TILE.FLOOR) {
					map.set(tx, ty, TILE.PLATE)
					plates.push({ tx, ty })
				}
			}
			spawns.push({ kind: 'puzzle', room: room.index, plates, x: room.cx, y: room.cy })
			room.cleared = true
			break
		}

		case ROOM_TYPE.SECRET:
			// the hidden hoard: everything huddled around the chest
			spawns.push({ kind: 'chest', x: room.cx, y: room.cy, rarityBonus: 2 })
			spawns.push({ kind: 'gold', x: room.cx - 14, y: room.cy + 8, amount: 30 })
			decor(DECOR.scroll, { x: room.cx + 13, y: room.cy + 5 })
			decor(DECOR.goblet, { x: room.cx + 15, y: room.cy - 5 })
			room.cleared = true
			break
	}
}
