/**
 * Generic object pool. Avoids per-frame allocations (and the GC hitches they
 * cause) for high-churn objects: projectiles, particles, damage numbers.
 */
export class ObjectPool {
	/**
	 * @param {() => object} factory   creates a fresh object
	 * @param {(obj: object) => void} reset  prepares an object for reuse
	 * @param {number} initial  objects pre-allocated up front
	 */
	constructor(factory, reset, initial = 64) {
		this.factory = factory
		this.reset = reset
		this.free = []
		this.active = []
		for (let i = 0; i < initial; i++) this.free.push(factory())
	}

	obtain() {
		const obj = this.free.length > 0 ? this.free.pop() : this.factory()
		this.reset(obj)
		obj.__poolAlive = true
		this.active.push(obj)
		return obj
	}

	release(obj) {
		if (!obj.__poolAlive) return
		obj.__poolAlive = false
		this.free.push(obj)
	}

	/** Remove released objects from the active list. Call once per frame. */
	sweep() {
		const a = this.active
		let w = 0
		for (let i = 0; i < a.length; i++) {
			if (a[i].__poolAlive) a[w++] = a[i]
		}
		a.length = w
	}

	releaseAll() {
		for (const obj of this.active) {
			if (obj.__poolAlive) {
				obj.__poolAlive = false
				this.free.push(obj)
			}
		}
		this.active.length = 0
	}
}
