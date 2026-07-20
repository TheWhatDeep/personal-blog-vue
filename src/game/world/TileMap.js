export const TILE_SIZE = 16

export const TILE = {
	VOID: 0,
	FLOOR: 1,
	WALL: 2,
	STAIRS: 3,
	HAZARD: 4, // biome hazard: spikes / lava / poison / frost / void
	PLATE: 5, // puzzle pressure plate
	PLATE_DOWN: 6,
	CRACK: 7, // breakable secret wall
	GATE: 8, // locked portcullis: solid until opened with a key
}

/**
 * Tile grid for one dungeon floor. Holds collision, hazard and exploration
 * state; rendering reads tile + variant, the minimap reads `explored`.
 */
export class TileMap {
	constructor(w, h) {
		this.w = w
		this.h = h
		this.tiles = new Uint8Array(w * h)
		this.variants = new Uint8Array(w * h) // floor variant / decor randomization
		this.explored = new Uint8Array(w * h)
	}

	idx(tx, ty) {
		return ty * this.w + tx
	}

	get(tx, ty) {
		if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return TILE.VOID
		return this.tiles[ty * this.w + tx]
	}

	set(tx, ty, t) {
		if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return
		this.tiles[ty * this.w + tx] = t
	}

	isSolidTile(t) {
		return t === TILE.VOID || t === TILE.WALL || t === TILE.CRACK || t === TILE.GATE
	}

	isSolid(tx, ty) {
		return this.isSolidTile(this.get(tx, ty))
	}

	/** solid check in world coordinates */
	isSolidAt(x, y) {
		return this.isSolid(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE))
	}

	tileAt(x, y) {
		return this.get(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE))
	}

	/**
	 * Circle vs tile collision resolution. Returns the corrected position.
	 * Standard axis-separated approach: move x, resolve, move y, resolve.
	 */
	moveCircle(x, y, r, dx, dy) {
		let nx = x + dx
		if (this._circleHits(nx, y, r)) nx = x
		let ny = y + dy
		if (this._circleHits(nx, ny, r)) ny = y
		return { x: nx, y: ny, hitX: nx === x && dx !== 0, hitY: ny === y && dy !== 0 }
	}

	_circleHits(cx, cy, r) {
		const minTx = Math.floor((cx - r) / TILE_SIZE)
		const maxTx = Math.floor((cx + r) / TILE_SIZE)
		const minTy = Math.floor((cy - r) / TILE_SIZE)
		const maxTy = Math.floor((cy + r) / TILE_SIZE)
		for (let ty = minTy; ty <= maxTy; ty++) {
			for (let tx = minTx; tx <= maxTx; tx++) {
				if (!this.isSolid(tx, ty)) continue
				// closest point on tile AABB to circle center
				const x0 = tx * TILE_SIZE
				const y0 = ty * TILE_SIZE
				const px = Math.max(x0, Math.min(cx, x0 + TILE_SIZE))
				const py = Math.max(y0, Math.min(cy, y0 + TILE_SIZE))
				const ddx = cx - px
				const ddy = cy - py
				if (ddx * ddx + ddy * ddy < r * r) return true
			}
		}
		return false
	}

	/**
	 * If the circle overlaps solid tiles, find the nearest free position by
	 * spiraling outward. Safety net for anything that ends up inside a wall
	 * (bad spawn point, crowd push, teleport) — without it, moveCircle
	 * rejects every move and the entity is stuck forever.
	 */
	depenetrate(x, y, r) {
		if (!this._circleHits(x, y, r)) return { x, y, moved: false }
		for (let dist = 4; dist <= 96; dist += 4) {
			for (let i = 0; i < 12; i++) {
				const a = (i / 12) * Math.PI * 2
				const nx = x + Math.cos(a) * dist
				const ny = y + Math.sin(a) * dist
				if (!this._circleHits(nx, ny, r)) return { x: nx, y: ny, moved: true }
			}
		}
		return { x, y, moved: false }
	}

	/** line-of-sight check between two world points (for AI + ranged attacks) */
	lineOfSight(x0, y0, x1, y1) {
		const dx = x1 - x0
		const dy = y1 - y0
		const len = Math.sqrt(dx * dx + dy * dy)
		const steps = Math.ceil(len / (TILE_SIZE * 0.5))
		for (let i = 1; i < steps; i++) {
			const t = i / steps
			if (this.isSolidAt(x0 + dx * t, y0 + dy * t)) return false
		}
		return true
	}

	exploreCircle(x, y, radiusTiles) {
		const tx = Math.floor(x / TILE_SIZE)
		const ty = Math.floor(y / TILE_SIZE)
		const r2 = radiusTiles * radiusTiles
		for (let oy = -radiusTiles; oy <= radiusTiles; oy++) {
			for (let ox = -radiusTiles; ox <= radiusTiles; ox++) {
				if (ox * ox + oy * oy > r2) continue
				const px = tx + ox
				const py = ty + oy
				if (px >= 0 && py >= 0 && px < this.w && py < this.h) {
					this.explored[py * this.w + px] = 1
				}
			}
		}
	}
}
