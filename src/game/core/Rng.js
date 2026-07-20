/**
 * Seedable pseudo random number generator (mulberry32).
 * A seeded RNG makes dungeon generation reproducible and debuggable.
 */
export class Rng {
	constructor(seed = (Math.random() * 0xffffffff) >>> 0) {
		this.seed = seed >>> 0
	}

	/** float in [0, 1) */
	next() {
		let t = (this.seed += 0x6d2b79f5)
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}

	/** float in [min, max) */
	range(min, max) {
		return min + this.next() * (max - min)
	}

	/** integer in [min, max] inclusive */
	int(min, max) {
		return Math.floor(this.range(min, max + 1))
	}

	chance(p) {
		return this.next() < p
	}

	pick(arr) {
		return arr[Math.floor(this.next() * arr.length)]
	}

	/** pick an entry from [{item, weight}] respecting weights */
	weighted(entries) {
		let total = 0
		for (const e of entries) total += e.weight
		let roll = this.next() * total
		for (const e of entries) {
			roll -= e.weight
			if (roll <= 0) return e.item
		}
		return entries[entries.length - 1].item
	}

	shuffle(arr) {
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(this.next() * (i + 1))
			;[arr[i], arr[j]] = [arr[j], arr[i]]
		}
		return arr
	}
}
