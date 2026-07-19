/**
 * Uniform spatial hash grid for broad-phase collision queries.
 * Entities are re-inserted each frame; queries only touch nearby cells,
 * keeping entity-vs-entity checks close to O(n) in dense combat.
 */
export class SpatialGrid {
	constructor(cellSize = 48) {
		this.cellSize = cellSize
		this.cells = new Map()
		this.queryId = 0
	}

	clear() {
		this.cells.clear()
	}

	_key(cx, cy) {
		return cx * 73856093 ^ cy * 19349663
	}

	insert(e) {
		const cs = this.cellSize
		const minX = Math.floor((e.x - e.r) / cs)
		const maxX = Math.floor((e.x + e.r) / cs)
		const minY = Math.floor((e.y - e.r) / cs)
		const maxY = Math.floor((e.y + e.r) / cs)
		for (let cy = minY; cy <= maxY; cy++) {
			for (let cx = minX; cx <= maxX; cx++) {
				const key = this._key(cx, cy)
				let cell = this.cells.get(key)
				if (!cell) {
					cell = []
					this.cells.set(key, cell)
				}
				cell.push(e)
			}
		}
	}

	/**
	 * Visit every entity whose cell overlaps the circle (x, y, radius).
	 * The callback may receive an entity at most once per query.
	 */
	query(x, y, radius, cb) {
		const cs = this.cellSize
		const id = ++this.queryId
		const minX = Math.floor((x - radius) / cs)
		const maxX = Math.floor((x + radius) / cs)
		const minY = Math.floor((y - radius) / cs)
		const maxY = Math.floor((y + radius) / cs)
		for (let cy = minY; cy <= maxY; cy++) {
			for (let cx = minX; cx <= maxX; cx++) {
				const cell = this.cells.get(this._key(cx, cy))
				if (!cell) continue
				for (let i = 0; i < cell.length; i++) {
					const e = cell[i]
					if (e.__queryId === id) continue
					e.__queryId = id
					cb(e)
				}
			}
		}
	}
}
