import { RARITIES, BASE_ITEMS, AFFIXES, GOLD_BY_TIER, SHOP_PRICES } from '../data/items.js'
import { INVENTORY_SIZE } from '../entities/Player.js'

/**
 * Loot system: rolls items (base + rarity + affixes), handles drops from
 * enemies / chests / barrels, pickups, shop inventory and equipping.
 * All tuning lives in data/items.js.
 */
export class LootSystem {
	constructor(game) {
		this.game = game
	}

	rollRarity(bonusTiers = 0) {
		// bonusTiers shifts weight toward higher rarities (elites, chests, bosses)
		let entries = RARITIES.map((r, i) => ({
			item: i,
			weight: r.weight * Math.pow(1.9, Math.max(0, bonusTiers) * (i / (RARITIES.length - 1))),
		}))
		let total = 0
		for (const e of entries) total += e.weight
		let roll = Math.random() * total
		for (const e of entries) {
			roll -= e.weight
			if (roll <= 0) return e.item
		}
		return 0
	}

	/**
	 * Generate a concrete item.
	 * opts: {rarityBonus, forceRarity, slot, classId, nameOverride}
	 */
	generateItem(floor, opts = {}) {
		const rarityIndex = opts.forceRarity ?? this.rollRarity(opts.rarityBonus ?? 0)
		const rarity = RARITIES[rarityIndex]

		let pool = BASE_ITEMS
		if (opts.slot) pool = pool.filter((b) => b.slot === opts.slot)
		// bias weapons toward the current class
		let base = pool[Math.floor(Math.random() * pool.length)]
		if (base.slot === 'weapon' && opts.classId && Math.random() < 0.6) {
			const fit = pool.filter((b) => b.slot === 'weapon' && b.classAffinity?.includes(opts.classId))
			if (fit.length) base = fit[Math.floor(Math.random() * fit.length)]
		}

		const floorScale = 1 + (floor - 1) * 0.22
		const statValue = Math.max(1, Math.round(base.base * floorScale * rarity.statMul))

		const affixes = []
		const available = [...AFFIXES]
		for (let i = 0; i < rarity.affixes && available.length; i++) {
			const idx = Math.floor(Math.random() * available.length)
			const af = available.splice(idx, 1)[0]
			const affixScale = 1 + (floor - 1) * 0.08
			const value = Math.round((af.roll[0] + Math.random() * (af.roll[1] - af.roll[0])) * affixScale)
			affixes.push({ id: af.id, apply: af.apply, value, text: af.text.replace('{v}', value), name: af.name })
		}

		const name = opts.nameOverride ??
			(affixes.length ? `${base.name} ${affixes[0].name}` : base.name)

		return {
			uid: Math.random().toString(36).slice(2, 9),
			baseId: base.id,
			name,
			icon: base.icon,
			slot: base.slot,
			stat: base.stat,
			statValue,
			rarity: rarityIndex,
			affixes,
			price: SHOP_PRICES.item(rarityIndex),
		}
	}

	// ---- drops ---------------------------------------------------------------

	dropLoot(enemy) {
		const world = this.game.world
		const tier = Math.max(0, enemy.def.lootTier)
		const bonus = enemy.elite ? 2 : 0

		// gold
		if (Math.random() < 0.55 + bonus * 0.2) {
			const range = GOLD_BY_TIER[Math.min(tier, GOLD_BY_TIER.length - 1)]
			const amount = Math.round((range[0] + Math.random() * (range[1] - range[0])) * (1 + world.floor * 0.1))
			world.dropPickup('gold', enemy.x, enemy.y, { amount })
		}
		if (Math.random() < 0.09) world.dropPickup('heart', enemy.x, enemy.y)
		if (Math.random() < 0.07) world.dropPickup('mana', enemy.x, enemy.y)
		if (Math.random() < 0.03 + bonus * 0.02) {
			world.dropPickup(Math.random() < 0.6 ? 'potion_hp' : 'potion_mp', enemy.x, enemy.y)
		}
		// equipment
		const itemChance = 0.05 + tier * 0.03 + bonus * 0.15
		if (Math.random() < itemChance) {
			const item = this.generateItem(world.floor, { rarityBonus: bonus, classId: this.game.player.classDef.id })
			world.dropPickup('item', enemy.x, enemy.y, { item })
		}
		// skill books are precious
		if (Math.random() < 0.008 + bonus * 0.01) {
			world.dropPickup('book', enemy.x, enemy.y)
		}
	}

	dropBarrelLoot(prop) {
		const world = this.game.world
		if (Math.random() < 0.6) world.dropPickup('gold', prop.x, prop.y, { amount: Math.round(2 + Math.random() * 6) })
		if (Math.random() < 0.15) world.dropPickup('heart', prop.x, prop.y)
	}

	openChest(prop) {
		const game = this.game
		const world = game.world
		if (prop.opened || prop.locked) return false
		prop.opened = true
		game.audio.play('chest')
		game.particles.burst({ x: prop.x, y: prop.y - 4, count: 14, color: [0xff3ad2ff, 0xff7cf6ff], speed: 60, life: 0.6, gravity: -40 })

		const item = this.generateItem(world.floor, { rarityBonus: 1 + (prop.rarityBonus ?? 0), classId: game.player.classDef.id })
		world.dropPickup('item', prop.x, prop.y + 6, { item })
		world.dropPickup('gold', prop.x - 8, prop.y + 6, { amount: Math.round(8 + Math.random() * 14 * world.floor * 0.5) })
		if (Math.random() < 0.4) world.dropPickup(Math.random() < 0.6 ? 'potion_hp' : 'potion_mp', prop.x + 8, prop.y + 6)
		game.stats.increment('chestsOpened')
		return true
	}

	bossLoot(boss, def) {
		const world = this.game.world
		const gold = def.loot.gold
		world.dropPickup('gold', boss.x, boss.y, { amount: Math.round(gold[0] + Math.random() * (gold[1] - gold[0])) })
		// guaranteed legendary relic with a unique name
		const relic = this.generateItem(world.floor, {
			forceRarity: RARITIES.length - 1,
			slot: 'relic',
			nameOverride: def.loot.relicName,
		})
		world.dropPickup('item', boss.x + 10, boss.y, { item: relic })
		world.dropPickup('potion_hp', boss.x - 10, boss.y)
		world.dropPickup('heart', boss.x, boss.y + 10)
	}

	generateShopWares(floor) {
		const wares = [
			{ type: 'potion_hp', name: 'Health Potion', icon: 'potion_red', price: SHOP_PRICES.potion_hp, sold: false },
			{ type: 'potion_mp', name: 'Mana Potion', icon: 'potion_blue', price: SHOP_PRICES.potion_mp, sold: false },
		]
		for (let i = 0; i < 2; i++) {
			const item = this.generateItem(floor, { rarityBonus: 1, classId: this.game.player?.classDef?.id })
			wares.push({ type: 'item', name: item.name, icon: item.icon, price: item.price, item, sold: false })
		}
		if (Math.random() < 0.5) {
			wares.push({ type: 'book', name: 'Skill Book', icon: 'item_tome', price: SHOP_PRICES.skill_book, sold: false })
		}
		return wares
	}

	buyWare(ware) {
		const game = this.game
		const player = game.player
		if (ware.sold || player.gold < ware.price) {
			game.audio.play('error')
			return false
		}
		if (ware.type === 'item' && player.inventory.length >= INVENTORY_SIZE) {
			game.ui.toast('Inventory full!')
			game.audio.play('error')
			return false
		}
		player.gold -= ware.price
		ware.sold = true
		game.audio.play('buy')
		switch (ware.type) {
			case 'potion_hp': player.potions.hp++; break
			case 'potion_mp': player.potions.mp++; break
			case 'book': player.skillPoints++; game.ui.toast('+1 Skill Point!'); break
			case 'item': player.inventory.push(ware.item); break
		}
		return true
	}

	// ---- pickups -----------------------------------------------------------------

	/** Apply a touched pickup. Returns false if it couldn't be collected. */
	collectPickup(p) {
		const game = this.game
		const player = game.player
		switch (p.type) {
			case 'gold':
				player.gold += p.amount
				game.stats.increment('goldCollected', p.amount)
				game.audio.play('pickup_coin', 0.7)
				game.world.floatText(player.x, player.y - 12, `+${p.amount}g`, 0xff3ad2e8, 0.9)
				return true
			case 'heart':
				player.hp = Math.min(player.maxHp, player.hp + 15 * player.potionPower)
				game.audio.play('pickup_heart')
				return true
			case 'mana':
				player.mana = Math.min(player.maxMana, player.mana + 20)
				game.audio.play('pickup_heart')
				return true
			case 'potion_hp':
				player.potions.hp++
				game.audio.play('pickup_item')
				return true
			case 'potion_mp':
				player.potions.mp++
				game.audio.play('pickup_item')
				return true
			case 'book':
				player.skillPoints++
				game.ui.toast('Ancient knowledge! +1 Skill Point')
				game.audio.play('achievement')
				return true
			case 'item':
				if (player.inventory.length >= INVENTORY_SIZE) {
					if (!p.warnedFull) {
						p.warnedFull = true
						game.ui.toast('Inventory full!')
					}
					return false
				}
				player.inventory.push(p.item)
				game.audio.play('pickup_item')
				game.ui.toast(`${p.item.name}`, RARITIES[p.item.rarity].color)
				game.stats.increment('itemsFound')
				return true
		}
		return true
	}

	// ---- equipping -----------------------------------------------------------------

	equipFromInventory(index) {
		const game = this.game
		const player = game.player
		const item = player.inventory[index]
		if (!item) return
		const slot = item.slot
		const prev = player.equipment[slot]
		player.equipment[slot] = item
		player.inventory.splice(index, 1)
		if (prev) player.inventory.push(prev)
		player.recalcStats()
		game.audio.play('pickup_item')
	}

	sellFromInventory(index) {
		const game = this.game
		const player = game.player
		const item = player.inventory[index]
		if (!item) return
		const value = Math.max(1, Math.round(item.price * 0.3))
		player.gold += value
		player.inventory.splice(index, 1)
		game.audio.play('pickup_coin')
		game.ui.toast(`Sold for ${value}g`)
	}
}
