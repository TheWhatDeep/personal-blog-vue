/**
 * Downloaded asset pack integration ("2D Pixel Dungeon Asset Pack" +
 * "Enemy Animations Set" by Pixel Poem — see ../assets/CREDITS.md).
 *
 * The pack's art is composed ON TOP of the procedural atlas: every sprite
 * the pack covers gets its atlas region re-pointed at pack art (with
 * optional tint / hue-shift / scale / flip variants and animation frames),
 * while anything the pack lacks keeps its procedural region. Engine and
 * gameplay code are untouched — this file is pure art mapping, and if the
 * images fail to load the game silently keeps its procedural look.
 */

// Vite turns these into hashed URLs at build time and bundles the files,
// so the game remains fully offline once loaded.
const ASSET_URLS = import.meta.glob('../assets/*.png', {
	eager: true,
	query: '?url',
	import: 'default',
})

const T = 16 // pack tile size

/** Load every pack image; resolves to {name -> HTMLImageElement}. */
export async function loadAssetPack() {
	const entries = Object.entries(ASSET_URLS).map(([path, url]) => {
		const name = path.split('/').pop().replace('.png', '')
		return new Promise((resolve, reject) => {
			const img = new Image()
			img.onload = () => resolve([name, img])
			img.onerror = () => reject(new Error(`Failed to load asset: ${path}`))
			img.src = url
		})
	})
	return Object.fromEntries(await Promise.all(entries))
}

/**
 * Draw pack art into the atlas and re-register named regions.
 * Mutates the atlas in place; call renderer.setAtlas() afterwards to
 * re-upload the texture.
 */
export function applyAssetPack(atlas, imgs) {
	const ctx = atlas.ctx
	ctx.imageSmoothingEnabled = false

	/**
	 * Blit a source rect into a fresh atlas slot and register it.
	 * opts: {tint:'#rrggbb', hue:deg, bright:x, scale, rotate:rad, flipX}
	 */
	const put = (name, img, sx, sy, sw, sh, opts = {}) => {
		const scale = opts.scale ?? 1
		const dw = Math.round(sw * scale)
		const dh = Math.round(sh * scale)
		const rot = opts.rotate ?? 0
		const outW = rot ? Math.round(Math.abs(dw * Math.cos(rot)) + Math.abs(dh * Math.sin(rot))) : dw
		const outH = rot ? Math.round(Math.abs(dw * Math.sin(rot)) + Math.abs(dh * Math.cos(rot))) : dh

		// stage on a temp canvas so tints/filters can't bleed into the atlas
		const tmp = document.createElement('canvas')
		tmp.width = outW
		tmp.height = outH
		const tc = tmp.getContext('2d')
		tc.imageSmoothingEnabled = false
		const filters = []
		if (opts.hue) filters.push(`hue-rotate(${opts.hue}deg)`)
		if (opts.bright) filters.push(`brightness(${opts.bright})`)
		if (filters.length) tc.filter = filters.join(' ')
		tc.translate(outW / 2, outH / 2)
		if (rot) tc.rotate(rot)
		if (opts.flipX) tc.scale(-1, 1)
		tc.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh)
		tc.setTransform(1, 0, 0, 1, 0, 0)
		tc.filter = 'none'
		if (opts.clearCorners) {
			// the character sheet has tiny selection ticks baked into cell
			// corners — scrub a 3px square at each corner
			const c = 3
			tc.clearRect(0, 0, c, c)
			tc.clearRect(outW - c, 0, c, c)
			tc.clearRect(0, outH - c, c, c)
			tc.clearRect(outW - c, outH - c, c, c)
		}
		if (opts.tint) {
			// multiply floods transparent pixels, so keep a copy as alpha mask
			const mask = document.createElement('canvas')
			mask.width = outW
			mask.height = outH
			mask.getContext('2d').drawImage(tmp, 0, 0)
			tc.globalCompositeOperation = 'multiply'
			tc.fillStyle = opts.tint
			tc.fillRect(0, 0, outW, outH)
			tc.globalCompositeOperation = 'destination-in'
			tc.drawImage(mask, 0, 0)
			tc.globalCompositeOperation = 'source-over'
		}

		const slot = atlas._alloc(outW, outH)
		ctx.clearRect(slot.x, slot.y, outW, outH)
		ctx.drawImage(tmp, slot.x, slot.y)
		const region = atlas._region(slot.x, slot.y, outW, outH)
		atlas.regions[name] = region
		return region
	}

	/** Register an animation: frames from a horizontal strip image. */
	const putStrip = (name, img, frameW, frameH, count, opts = {}) => {
		const frames = []
		for (let i = 0; i < count; i++) {
			frames.push(put(i === 0 ? name : `${name}#${i}`, img, i * frameW, 0, frameW, frameH, opts))
		}
		atlas.anims[name] = frames
	}

	/** Register an animation from separate single-frame images. */
	const putFrames = (name, frameImgs, opts = {}) => {
		const frames = frameImgs.map((img, i) =>
			put(i === 0 ? name : `${name}#${i}`, img, 0, 0, img.width, img.height, opts)
		)
		atlas.anims[name] = frames
	}

	/** Tileset helper: grid coords -> pixels. */
	const tile = (name, col, row, opts = {}, w = 1, h = 1) =>
		put(name, imgs.tileset, col * T, row * T, w * T, h * T, opts)

	/** Character sheet helper: two frames (rows r and r+2 hold frame A/B). */
	const char = (name, col, row, opts = {}) => {
		const o = { clearCorners: true, ...opts }
		const a = put(name, imgs.characters, col * T, row * T, T, T, o)
		const b = put(`${name}#1`, imgs.characters, col * T, (row + 2) * T, T, T, o)
		atlas.anims[name] = [a, b]
	}

	const seq = (base, n) => Array.from({ length: n }, (_, i) => imgs[`${base}_${i + 1}`])

	// ---- tiles: one biome look, tinted per biome ------------------------------
	const BIOME_TINTS = {
		crypt: null, // the pack's native purple-brown
		caverns: { tint: '#9fe0b4', bright: 1.25 },
		forge: { tint: '#ffb08a', bright: 1.2 },
		glacier: { tint: '#9cc4ff', bright: 1.25 },
		abyss: { tint: '#b89aff', bright: 1.1 },
	}
	for (const [biome, tint] of Object.entries(BIOME_TINTS)) {
		const o = tint ?? {}
		// (2,2)/(7,1) are the pack's clean floor tiles — the row-1 floors have
		// the wall drop-shadow baked in, which tiles into ugly stripes
		tile(`floor_${biome}_0`, 2, 2, o)
		tile(`floor_${biome}_1`, 7, 1, o)
		tile(`wall_${biome}`, 1, 0, o)
		// hazard: darkened floor; the biome's glow/pulse comes from render tint
		tile(`hazard_${biome}`, 6, 1, { ...o, bright: 0.6 })
	}
	tile('crack', 3, 0) // cracked wall hides the secret room

	// ---- decor / props -----------------------------------------------------------
	tile('stairs', 6, 6, {}, 2, 1) // round wooden hatch (spans 2 tiles)
	put('spikes', imgs.peaks, 0, 0, T, T)
	put('chest', imgs.chest, 0, 0, T, T)
	put('chest_open', imgs.chest_open, 0, 0, T, T)
	put('barrel', imgs.box, 0, 0, T, T)
	putFrames('torch', seq('torch', 4))
	tile('shrine', 5, 9) // candle altar
	putFrames('shop_npc', seq('priest2', 4))

	// ---- pickups / items -----------------------------------------------------------
	putFrames('coin', seq('coin', 4))
	tile('potion_red', 9, 8)
	tile('potion_blue', 7, 8)
	tile('item_ring', 5, 7)
	// arrow art points down; bake it facing right (rot 0 = right in-engine)
	put('arrow', imgs.arrow, 0, 0, T, T, { rotate: -Math.PI / 2 })

	// ---- heroes ----------------------------------------------------------------------
	char('hero_warrior', 2, 0, { tint: '#ffb0a0' })
	char('hero_rogue', 3, 0, { tint: '#9fd6a4' })
	char('hero_ranger', 4, 0, { tint: '#c8e69a' })
	char('hero_mage', 1, 0, { tint: '#a8c4ff' })
	putFrames('hero_cleric', seq('priest1', 4), { tint: '#ffe9b0' })

	// ---- enemies ----------------------------------------------------------------------
	char('slime', 1, 1, { hue: -120 }) // blue imp -> green
	char('slime_red', 1, 1, { hue: 120 }) // blue imp -> red
	char('skeleton', 5, 0)
	char('goblin_archer', 4, 1, { hue: 60 }) // orange skeleton -> green
	putFrames('cultist', seq('priest3', 4), { tint: '#e08080' })
	putFrames('assassin', seq('vampire', 4), { tint: '#9a90b8' })
	char('brute', 6, 1, { scale: 1.3 })
	char('brute_frost', 6, 1, { scale: 1.3, tint: '#a8d8ff' })
	char('necromancer', 0, 0, { tint: '#c9a8e8' })
	putFrames('bat', seq('skull', 4), { hue: 40, bright: 0.9 }) // ghostly skull
	putFrames('bat_frost', seq('skull', 4))
	char('bomber', 0, 1, { hue: 150 }) // blue flame -> red, a living bomb
	char('spiderling', 3, 1, { scale: 0.75, bright: 0.8 })
	char('wisp', 0, 1)

	// ---- bosses: large animated monsters from the Enemy Animations Set ---------------
	putStrip('boss_tyrant', imgs.boss_skeleton1, 32, 32, 6, { tint: '#ffe08a' })
	putStrip('boss_spider', imgs.boss_vampire, 32, 32, 6, { tint: '#b4e8a0', scale: 1.1 })
	putStrip('boss_golem', imgs.boss_skeleton2, 32, 32, 6, { tint: '#ff9a70', scale: 1.15 })
	putStrip('boss_lich', imgs.boss_vampire, 32, 32, 6, { tint: '#9cd4ff' })
	putStrip('boss_void', imgs.boss_skeleton1, 32, 32, 6, { tint: '#b48aff', bright: 0.9, scale: 1.2 })

	// Everything else (orbs, slash, hearts, skill icons, item icons, portal)
	// keeps its procedural art — the pack has no equivalents.
	return atlas
}
