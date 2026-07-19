/**
 * Minimal pub/sub event bus used to decouple game systems.
 * Systems communicate through events ("enemy:died", "player:levelup", ...)
 * instead of holding direct references to each other.
 */
export class EventBus {
	constructor() {
		this.listeners = new Map()
	}

	on(type, fn) {
		if (!this.listeners.has(type)) this.listeners.set(type, [])
		this.listeners.get(type).push(fn)
		return () => this.off(type, fn)
	}

	off(type, fn) {
		const arr = this.listeners.get(type)
		if (!arr) return
		const i = arr.indexOf(fn)
		if (i >= 0) arr.splice(i, 1)
	}

	emit(type, payload) {
		const arr = this.listeners.get(type)
		if (!arr) return
		// copy so handlers can subscribe/unsubscribe during dispatch
		for (const fn of arr.slice()) fn(payload)
	}

	clear() {
		this.listeners.clear()
	}
}
