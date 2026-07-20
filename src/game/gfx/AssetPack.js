/**
 * Downloaded asset pack integration — see ../assets/CREDITS.md.
 *
 *  - Pixel Poem "2D Pixel Dungeon Asset Pack": tiles, props, pickups.
 *  - Zerie "Tiny RPG Character Asset Pack" (22 characters): every hero,
 *    most enemies and all bosses, with real idle/walk/attack/hurt/death
 *    animation strips (100x100 frames, ink-cropped with anchor offsets).
 *  - "Bold Pixels" TTF: display font for titles/headers.
 *
 * The pack art is composed ON TOP of the procedural atlas: every sprite a
 * pack covers gets its atlas region re-pointed (with optional tint /
 * hue-shift / scale variants), while anything the packs lack keeps its
 * procedural region. Engine and gameplay code are untouched — this file is
 * pure art mapping, and if the images fail to load the game silently keeps
 * its procedural look.
 */

// Vite turns these into hashed URLs at build time and bundles the files,
// so the game remains fully offline once loaded.
const ASSET_URLS = {
	...import.meta.glob('../assets/*.png', { eager: true, query: '?url', import: 'default' }),
	...import.meta.glob('../assets/rpg/*.png', { eager: true, query: '?url', import: 'default' }),
	...import.meta.glob('../assets/v5/*.png', { eager: true, query: '?url', import: 'default' }),
}
import fontUrl from '../assets/BoldPixels.ttf'

const T = 16 // pack tile size

/** Load every pack image + the pixel font; resolves to {name -> Image}. */
export async function loadAssetPack() {
	const entries = Object.entries(ASSET_URLS).map(([path, url]) => {
		// v5.2 pack files get a prefix: some basenames (peaks.png) collide
		// with the older pack's files in assets/ root
		const prefix = path.includes('/v5/') ? 'v5_' : ''
		const name = prefix + path.split('/').pop().replace('.png', '')
		return new Promise((resolve, reject) => {
			const img = new Image()
			img.onload = () => resolve([name, img])
			img.onerror = () => reject(new Error(`Failed to load asset: ${path}`))
			img.src = url
		})
	})

	// UI font ("Bold Pixels", itch.io). Non-fatal: text falls back to the
	// baked monospace if the face fails to load.
	const font = new FontFace('BoldPixels', `url(${fontUrl})`)
	await font.load().then(
		(f) => document.fonts.add(f),
		(e) => console.warn('Pixel font failed to load:', e)
	)

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
		if (opts.legLift) {
			// synthesized walk frame: lift one half of the feet rows by 1px.
			// Alternating halves across two frames reads as a stepping gait —
			// the 16px packs ship idle frames only.
			const half = Math.floor(outW / 2)
			const bandH = 3
			const y0 = outH - bandH
			const x0 = opts.legLift === 'L' ? 0 : half
			const bw = opts.legLift === 'L' ? half : outW - half
			const band = tc.getImageData(x0, y0, bw, bandH)
			tc.clearRect(x0, y0, bw, bandH)
			tc.putImageData(band, x0, y0 - 1)
		}
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
		if (opts.walk) {
			const a = frameImgs[0]
			const b = frameImgs[Math.min(2, frameImgs.length - 1)]
			atlas.anims[`${name}_walk`] = [
				put(`${name}_walk`, a, 0, 0, a.width, a.height, { ...opts, legLift: 'L' }),
				put(`${name}_walk#1`, b, 0, 0, b.width, b.height, { ...opts, legLift: 'R' }),
			]
		}
	}

	/** Tileset helper: grid coords -> pixels. */
	const tile = (name, col, row, opts = {}, w = 1, h = 1) =>
		put(name, imgs.tileset, col * T, row * T, w * T, h * T, opts)

	/** Character sheet helper: two idle frames (rows r and r+2 hold frame A/B). */
	const char = (name, col, row, opts = {}) => {
		const o = { clearCorners: true, ...opts }
		const a = put(name, imgs.characters, col * T, row * T, T, T, o)
		const b = put(`${name}#1`, imgs.characters, col * T, (row + 2) * T, T, T, o)
		atlas.anims[name] = [a, b]
	}

	const seq = (base, n) => Array.from({ length: n }, (_, i) => imgs[`${base}_${i + 1}`])

	// ---- Tiny RPG character pack (100x100 frame strips) -------------------------
	// Characters sit tiny (~18px) inside big frames padded for weapon swings.
	// Each strip is ink-cropped to its union bounding box and an anchor offset
	// is stored on the regions so all animations stay aligned on the entity.
	const RPG_F = 100 // frame size
	const RPG_AX = 50 // character anchor within the frame
	const RPG_AY = 48

	const rpgStrip = (name, img, opts = {}) => {
		if (!img) return
		const count = Math.floor(img.width / RPG_F)
		// union ink bbox across all frames (in frame-local coords)
		const t = document.createElement('canvas')
		t.width = img.width
		t.height = RPG_F
		const tc2 = t.getContext('2d', { willReadFrequently: true })
		tc2.drawImage(img, 0, 0)
		const d = tc2.getImageData(0, 0, img.width, RPG_F).data
		let minX = RPG_F, maxX = 0, minY = RPG_F, maxY = 0
		for (let y = 0; y < RPG_F; y++) {
			for (let x = 0; x < img.width; x++) {
				if (d[(y * img.width + x) * 4 + 3] > 10) {
					const lx = x % RPG_F
					if (lx < minX) minX = lx
					if (lx > maxX) maxX = lx
					if (y < minY) minY = y
					if (y > maxY) maxY = y
				}
			}
		}
		if (maxX < minX) return
		minX = Math.max(0, minX - 1); minY = Math.max(0, minY - 1)
		maxX = Math.min(RPG_F - 1, maxX + 1); maxY = Math.min(RPG_F - 1, maxY + 1)
		const w = maxX - minX + 1
		const h = maxY - minY + 1
		const scale = opts.scale ?? 1
		const frames = []
		for (let i = 0; i < count; i++) {
			const r = put(i === 0 ? name : `${name}#${i}`, img, i * RPG_F + minX, minY, w, h, opts)
			r.ox = ((minX + maxX) / 2 - RPG_AX) * scale
			r.oy = ((minY + maxY) / 2 - RPG_AY) * scale
			frames.push(r)
		}
		atlas.anims[name] = frames
	}

	/** Register a full character: idle/walk/attack(+2)/hurt/death strips. */
	const rpgChar = (name, key, opts = {}) => {
		const strip = (suffix, animName) => rpgStrip(animName, imgs[`rpg_${key}_${suffix}`], opts)
		if (imgs[`rpg_${key}_fly`]) {
			// flying creatures (bat): one strip serves as idle + walk
			strip('fly', name)
			strip('fly', `${name}_walk`)
		} else {
			strip('idle', name)
			strip('walk', `${name}_walk`)
		}
		strip('attack', `${name}_attack`)
		strip('attack2', `${name}_attack2`)
		strip('attack3', `${name}_attack3`)
		strip('hurt', `${name}_hurt`)
		strip('death', `${name}_death`)
	}

	// ---- tiles: one biome look, tinted per biome ------------------------------
	// gentler than the old pack's tints: the v5 tileset is already bright,
	// and hard brightness blows out its cap highlights and floor details
	const BIOME_TINTS = {
		crypt: null, // the pack's native palette
		caverns: { tint: '#9fe0b4', bright: 1.12 },
		forge: { tint: '#ffb08a', bright: 1.08 },
		glacier: { tint: '#9cc4ff', bright: 1.1 },
		abyss: { tint: '#b89aff', bright: 1.05 },
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

	// ---- pickups / items -----------------------------------------------------------
	putFrames('coin', seq('coin', 4))
	tile('potion_red', 9, 8)
	tile('potion_blue', 7, 8)
	tile('item_ring', 5, 7)
	put('arrow', imgs.rpg_arrow, 0, 0, 32, 32) // already faces right (rot 0)

	// ---- heroes (Tiny RPG pack, native scale) -------------------------------------
	rpgChar('hero_warrior', 'knight')
	rpgChar('hero_rogue', 'swordsman')
	rpgChar('hero_mage', 'wizard')
	rpgChar('hero_ranger', 'archer')
	rpgChar('hero_cleric', 'priest')

	// ---- enemies --------------------------------------------------------------------
	rpgChar('slime', 'slime')
	rpgChar('slime_red', 'slime', { hue: 120, bright: 0.95 })
	rpgChar('bomber', 'slime', { hue: 150, bright: 1.2 }) // volatile red slime
	rpgChar('spiderling', 'slime', { scale: 0.7, bright: 0.75, tint: '#d0b8f0' })
	rpgChar('skeleton', 'skeleton')
	rpgChar('goblin_archer', 'skelarcher')
	rpgChar('cultist', 'necromancer', { tint: '#ff9a9a' })
	rpgChar('assassin', 'werewolf')
	rpgChar('brute', 'armoredorc')
	rpgChar('brute_frost', 'armoredorc', { tint: '#a8d8ff' })
	rpgChar('necromancer', 'necromancer')
	rpgChar('bat', 'bat')
	rpgChar('bat_frost', 'bat', { tint: '#a8d8ff' })
	rpgChar('shop_npc', 'soldier')
	rpgChar('lancer', 'lancer')
	rpgChar('rider', 'orcrider')
	rpgChar('shield_skeleton', 'armoredskel')
	char('wisp', 0, 1) // Pixel Poem blue flame still fits the void wisp

	// ---- bosses: Tiny RPG characters at crisp 2x, tinted per biome -------------------
	rpgChar('boss_tyrant', 'greatsword', { scale: 2, tint: '#ffe08a' })
	rpgChar('boss_spider', 'werebear', { scale: 2, tint: '#b4e8a0' })
	rpgChar('boss_golem', 'eliteorc', { scale: 2, tint: '#ffb090' })
	rpgChar('boss_lich', 'necromancer', { scale: 2, tint: '#9cd4ff' })
	rpgChar('boss_void', 'templar', { scale: 2, tint: '#c0a0ff', bright: 0.9 })

	// ---- Dungeon Tileset II v5.2 (assets/v5/) -----------------------------------
	// Raw grid slices: every 16px cell of the two sheets is registered as
	// v5t_{col}_{row} (tileset) / v5p_{col}_{row} (props) so the resolver and
	// the debug asset-preview address cells by grid coordinate. Semantic
	// aliases for the wall grammar live in TileVisuals' piece table — data,
	// not code, decides which cell plays which architectural role.
	if (imgs.v5_Dungeon_Tileset_v2) {
		const ts = imgs.v5_Dungeon_Tileset_v2
		for (let row = 0; row < 10; row++) {
			for (let col = 0; col < 10; col++) {
				put(`v5t_${col}_${row}`, ts, col * T, row * T, T, T)
				// per-biome tinted copies so TileVisuals' lookup table can swap
				// the whole wall/floor grammar per biome (crypt = native palette)
				for (const [biome, tint] of Object.entries(BIOME_TINTS)) {
					if (tint) put(`v5t_${col}_${row}_${biome}`, ts, col * T, row * T, T, T, tint)
				}
			}
		}
		const pr = imgs.v5_Dungeon_item_props_v2
		for (let row = 0; row < 5; row++) {
			for (let col = 0; col < 12; col++) {
				put(`v5p_${col}_${row}`, pr, col * T, row * T, T, T)
			}
		}
		for (let i = 0; i < 4; i++) {
			put(`v5e_${i}`, imgs.v5_Dungeon_Enemy_v2, i * T, 0, T, T)
		}

		// magenta/black checker: shown when the wall resolver meets a neighbor
		// configuration the sheet has no piece for (never silently patched)
		const err = document.createElement('canvas')
		err.width = err.height = T
		const ec = err.getContext('2d')
		ec.fillStyle = '#ff00ff'
		ec.fillRect(0, 0, T, T)
		ec.fillStyle = '#000000'
		ec.fillRect(0, 0, 8, 8)
		ec.fillRect(8, 8, 8, 8)
		put('v5t_error', err, 0, 0, T, T)

		// animation strips (frame sizes verified against the sheets:
		// torch/torch_light are 16x28, the gate is 16x32 incl. its floor glow)
		const V5_STRIPS = [
			['v5_torch', 'v5_torch', 16, 28, 6],
			['v5_torch_light', 'v5_torch_light', 16, 28, 6],
			['v5_gate', 'v5_gate', 16, 32, 5],
			['v5_peaks', 'v5_peaks', 16, 16, 5],
			['v5_chest', 'v5_chest_1', 16, 16, 4],
			['v5_chest_small', 'v5_chest_2', 16, 16, 4],
			['v5_coin', 'v5_coin', 16, 16, 8],
			['v5_key_gold', 'v5_keys_g', 16, 16, 8],
			['v5_key_silver', 'v5_keys_m', 16, 16, 8],
			['v5_flag_blue', 'v5_flag_b', 16, 16, 10],
			['v5_flag_red', 'v5_flag_r', 16, 16, 10],
		]
		for (const [name, img, fw, fh, count] of V5_STRIPS) {
			if (imgs[img]) putStrip(name, imgs[img], fw, fh, count)
		}
	}

	// ---- UI font ---------------------------------------------------------------
	// Bold Pixels' native grid is 16px (at 8px its 1px counters collapse and
	// letters merge into blobs). Measured at 16px: cap height 8, ascent 10,
	// descent 2 — so it slots into the existing ~10px UI line height.
	if (document.fonts.check('16px BoldPixels')) {
		atlas.bakeFont('16px BoldPixels', 11, 10)
	}

	// Everything else (orbs, slash, hearts, skill icons, item icons, portal)
	// keeps its procedural art — the pack has no equivalents.
	return atlas
}
