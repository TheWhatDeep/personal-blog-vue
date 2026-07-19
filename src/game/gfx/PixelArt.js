/**
 * Procedural pixel-art definitions.
 *
 * Every sprite in the game is described here as rows of palette characters
 * ('.' = transparent) and rasterized into the texture atlas at load time.
 * New enemies/classes are usually just a `recolor()` of an existing
 * template — art is data, not code.
 */

// ---- shared colors --------------------------------------------------------
export const C = {
	skin: '#e8b796', skinDark: '#c68e63',
	steel: '#9aa5b1', steelDark: '#5f6b7a', steelLight: '#cfd8e3',
	red: '#c03434', redDark: '#7c1f1f', crimson: '#e04848',
	green: '#3f9e4d', greenDark: '#26652f', leaf: '#63c74d',
	blue: '#3b6ed6', blueDark: '#24408f', ice: '#8fd3ff', iceDark: '#4a9fd8',
	purple: '#8b4fd8', purpleDark: '#5a2e96', void: '#2a1a4a', voidGlow: '#b06cff',
	gold: '#e8b53a', goldDark: '#a87a1c',
	bone: '#e6e0cd', boneDark: '#a9a186',
	brown: '#8a5a2b', brownDark: '#5c3a18', wood: '#a8713a',
	gray: '#6b6b6b', grayDark: '#3d3d3d', grayLight: '#a5a5a5',
	black: '#1a1a1a', white: '#f4f4f4',
	poison: '#7ad24a', poisonDark: '#3f8a1e',
	fire: '#ff8a2a', fireDark: '#d84315', fireLight: '#ffd166',
	shadow: '#26262e',
}

function def(rows, pal) {
	return { rows, pal }
}

/** Clone a sprite definition with palette overrides — cheap art variants. */
export function recolor(base, overrides) {
	return { rows: base.rows, pal: { ...base.pal, ...overrides } }
}

// ---- character templates --------------------------------------------------

// 12x14 armored humanoid (heroes, melee enemies)
const HUMANOID = def([
	'....hhhh....',
	'...hhhhhh...',
	'...hffffh...',
	'...fefeff...',
	'....ffff....',
	'..cccccccc..',
	'.acccccccca.',
	'.a.cccccc.a.',
	'...cccccc...',
	'...cccccc...',
	'...cc..cc...',
	'...cc..cc...',
	'...bb..bb...',
	'..bbb..bbb..',
], { h: C.steel, f: C.skin, e: C.black, c: C.red, a: C.skinDark, b: C.brownDark })

// 12x14 hooded/robed caster
const ROBED = def([
	'....hhhh....',
	'...hhhhhh...',
	'...hffffh...',
	'...hfefeh...',
	'...hffffh...',
	'...cccccc...',
	'..cccccccc..',
	'..cacccac...',
	'..cccccccc..',
	'.cccccccccc.',
	'.cccccccccc.',
	'.cccccccccc.',
	'.cccccccccc.',
	'..cccccccc..',
], { h: C.blueDark, f: C.skin, e: C.white, c: C.blue, a: C.gold })

// 12x10 slime
const SLIME = def([
	'............',
	'....ssss....',
	'..ssssssss..',
	'.ssssssssss.',
	'.sshsshssss.',
	'ssseessee.ss',
	'ssssssssssss',
	'ssssssssssss',
	'.ssssssssss.',
	'..ssssssss..',
], { s: C.green, h: C.leaf, e: C.black })

// 12x8 bat
const BAT = def([
	'w....ww....w',
	'ww..wwww..ww',
	'www.wbbw.www',
	'wwwwbbbbwwww',
	'.wwbebbebww.',
	'..wbbbbbbw..',
	'....bffb....',
	'....b..b....',
], { w: C.purpleDark, b: C.purple, e: C.crimson, f: C.white })

// 16x16 heavy brute
const BRUTE = def([
	'.....hhhhhh.....',
	'....hhhhhhhh....',
	'....hffffffh....',
	'....feffffef....',
	'....ffffffff....',
	'..cccccccccccc..',
	'.ac.cccccccc.ca.',
	'.aa.cccccccc.aa.',
	'.aa.cccccccc.aa.',
	'.mm.cccccccc.mm.',
	'....cccccccc....',
	'....cccccccc....',
	'...ccc....ccc...',
	'...cc......cc...',
	'...bb......bb...',
	'..bbb......bbb..',
], { h: C.steelDark, f: C.skinDark, e: C.red, c: C.gray, a: C.skinDark, m: C.steel, b: C.black })

// 12x12 walking bomb
const BOMBER = def([
	'......f.....',
	'.....f......',
	'....ff......',
	'...bbbbbb...',
	'..bbbbbbbb..',
	'.bbhbbbbbbb.',
	'.bhbbeebbbb.',
	'.bbbeeeebbb.',
	'.bbbbeebbbb.',
	'..bbbbbbbb..',
	'...bbbbbb...',
	'...ll..ll...',
], { b: C.grayDark, h: C.gray, e: C.crimson, f: C.fireLight, l: C.black })

// 10x8 spiderling
const SPIDERLING = def([
	'l..l..l..l',
	'.l.l..l.l.',
	'..ssssss..',
	'.sseesess.',
	'..ssssss..',
	'.l.l..l.l.',
	'l..l..l..l',
	'..........',
], { s: C.purpleDark, e: C.crimson, l: C.grayDark })

// ---- boss templates --------------------------------------------------------

// 24x26 skeleton king
const BOSS_TYRANT = def([
	'.....g..g..g..g.........',
	'.....gggggggggg.........',
	'.....gbbbbbbbbg.........',
	'.....bbbbbbbbbb.........',
	'....bbbeebbeebbb........',
	'....bbbeebbeebbb........',
	'.....bbbbbbbbbb.........',
	'.....bbnnnnnnbb.........',
	'......bbbbbbbb..........',
	'...cccccccccccccc.......',
	'..cccccccccccccccc..w...',
	'.bb.cccccccccccc.bb.w...',
	'.bb.cccccccccccc.bb.w...',
	'.bb.cbbbbbbbbbbc.bbww...',
	'.bb.cbccccccccbc.bb.w...',
	'....cbccccccccbc....w...',
	'....cbccccccccbc...www..',
	'....cccccccccccc...www..',
	'....cccccccccccc....w...',
	'.....cccccccccc.........',
	'.....bbb....bbb.........',
	'.....bbb....bbb.........',
	'.....bb......bb.........',
	'....bbb......bbb........',
	'...bbbb......bbbb.......',
	'........................',
], { g: C.gold, b: C.bone, e: '#7cf6ff', n: C.black, c: '#4a2a5a', w: C.boneDark })

// 28x20 spider queen
const BOSS_SPIDER = def([
	'l....l..............l....l.',
	'.l...l....gggggg....l...l..',
	'..l..l...gggggggg...l..l...',
	'..l...l.ssssssssss.l...l...',
	'...l..lssssssssssssl..l....',
	'...l..sssseessees.ss..l....',
	'....llsssseessee.ssll......',
	'.....ssssssssssssss........',
	'....l.ssssnnnnss.l.........',
	'...l...ssssssss...l........',
	'..l...bbbbbbbbbb...l.......',
	'.l...bbbbbbbbbbbb...l......',
	'l...bbbbpbbbbpbbbb...l.....',
	'....bbbbbbbbbbbbbb.........',
	'....bbpbbbbbbbbpbb.........',
	'.....bbbbbbbbbbbb..........',
	'......bbbbbbbbbb...........',
	'.......bbbbbbbb............',
	'...........................',
	'...........................',
], { s: C.purpleDark, b: '#3a2450', e: C.crimson, n: C.black, l: C.grayDark, g: C.gold, p: C.voidGlow })

// 26x26 infernal golem
const BOSS_GOLEM = def([
	'.......rrrrrrrrrr.........',
	'......rrrrrrrrrrrr........',
	'.....rrreerrrreerrr.......',
	'.....rrreerrrreerrr.......',
	'.....rrrrrrffrrrrrr.......',
	'.....rrrrrffffrrrrr.......',
	'......rrrrrffrrrrr........',
	'...rrrrrrrrrrrrrrrrrr.....',
	'..rrrrrrrrrrrrrrrrrrrr....',
	'.rrr.rrrrffffffrrrr.rrr...',
	'.rrr.rrrffffffffrrr.rrr...',
	'.rrr.rrrff8888ffrrr.rrr...',
	'.rrr.rrrff8888ffrrr.rrr...',
	'.rrr.rrrffffffffrrr.rrr...',
	'.rrr.rrrrffffffrrrr.rrr...',
	'.fff.rrrrrrrrrrrrrr.fff...',
	'.....rrrrrrrrrrrrrr.......',
	'.....rrrrrrrrrrrrrr.......',
	'.....rrrr......rrrr.......',
	'.....rrrr......rrrr.......',
	'.....rrr........rrr.......',
	'....rrrr........rrrr......',
	'...rrrrr........rrrrr.....',
	'..........................',
	'..........................',
	'..........................',
], { r: '#5c3030', e: C.fireLight, f: C.fire, 8: C.fireLight })

// 22x28 frost lich
const BOSS_LICH = def([
	'.....i.....i.....i....',
	'......i...iii...i.....',
	'.......iiiiiiiii......',
	'......iibbbbbbbii.....',
	'......ibbbbbbbbbi.....',
	'......bbeebbbee.b.....',
	'......bbeebbbee.b.....',
	'.......bbbbbbbb.......',
	'.......bbnnnnbb.......',
	'........bbbbbb........',
	'.....cccccccccccc.....',
	'....ccccccccccccccc...',
	'...cc.ccccccccccc.cc..',
	'..icc.ccccccccccc.cci.',
	'..i...ciccccccic...i..',
	'..i...cccccccccc...i..',
	'.iii..cccccccccc..iii.',
	'..i...cccccccccc...i..',
	'......cccccccccc......',
	'......cccccccccc......',
	'.......cccccccc.......',
	'.......cccccccc.......',
	'........cccccc........',
	'........cccccc........',
	'.........cccc.........',
	'.........cccc.........',
	'..........cc..........',
	'......................',
], { i: C.ice, b: C.bone, e: '#4adfff', n: C.black, c: '#1e3a6e' })

// 26x26 void sovereign
const BOSS_VOID = def([
	'.....p..............p.....',
	'......p............p......',
	'.......vvvvvvvvvvvv.......',
	'.....vvvvvvvvvvvvvvvv.....',
	'....vvvvvvvvvvvvvvvvvv....',
	'...vvvpppvvvvvvvvpppvvv...',
	'...vvpppppvvvvvvpppppvv...',
	'...vvppeppvvvvvvppeppvv...',
	'...vvpppppvvvvvvpppppvv...',
	'...vvvpppvvvvvvvvpppvvv...',
	'....vvvvvvvvvvvvvvvvvv....',
	'..p.vvvvvvvnnnnvvvvvvv.p..',
	'.pp.vvvvvvnnnnnnvvvvvv.pp.',
	'.p..vvvvvvnneennvvvvvv..p.',
	'.p..vvvvvvnnnnnnvvvvvv..p.',
	'.pp.vvvvvvvnnnnvvvvvvv.pp.',
	'..p..vvvvvvvvvvvvvvvv..p..',
	'......vvvvvvvvvvvvvv......',
	'.......vvvvvvvvvvvv.......',
	'........vvvvvvvvvv........',
	'.........vvv..vvv.........',
	'..........vv..vv..........',
	'...........v..v...........',
	'..........................',
	'..........................',
	'..........................',
], { v: C.void, p: C.voidGlow, e: C.white, n: '#0c0618' })

// ---- projectiles / effects -------------------------------------------------

const ORB = def([
	'..oo..',
	'.oooo.',
	'oohhoo',
	'oohhoo',
	'.oooo.',
	'..oo..',
], { o: C.fire, h: C.fireLight })

const ARROW = def([
	'.........ww.',
	'ffssssssswww',
	'.........ww.',
], { f: C.leaf, s: C.brown, w: C.steelLight })

const SLASH = def([
	'.......ss.....',
	'.....ssss.....',
	'...sssss......',
	'..sssss.......',
	'..ssss........',
	'.ssss.........',
	'.ssss.........',
	'ssss..........',
	'ssss..........',
	'ssss..........',
	'.sss..........',
	'.sss..........',
	'..ss..........',
	'...s..........',
], { s: C.white })

// ---- pickups / items -------------------------------------------------------

const COIN = def([
	'..gg..',
	'.gddg.',
	'gddddg',
	'gddddg',
	'.gddg.',
	'..gg..',
], { g: C.goldDark, d: C.gold })

const HEART = def([
	'.rr..rr.',
	'rrrrrrrr',
	'rhrrrrrr',
	'rrrrrrrr',
	'.rrrrrr.',
	'..rrrr..',
	'...rr...',
	'........',
], { r: C.crimson, h: C.white })

const MANA_GEM = def([
	'...b....',
	'..bbb...',
	'.bbhbb..',
	'bbbhbbb.',
	'.bbbbb..',
	'..bbb...',
	'...b....',
	'........',
], { b: C.blue, h: C.ice })

const POTION_RED = def([
	'...cc...',
	'...cc...',
	'..gggg..',
	'.g....g.',
	'.g.rrrg.',
	'.grrrrg.',
	'.grrrrg.',
	'..gggg..',
], { c: C.brown, g: C.steelLight, r: C.crimson })

const CHEST = def([
	'..cccccccccc..',
	'.cccccccccccc.',
	'.cbbbbbbbbbbc.',
	'.cccccccccccc.',
	'.cbbbbggbbbbc.',
	'.cbbbbggbbbbc.',
	'.cbbbbbbbbbbc.',
	'.cccccccccccc.',
	'..............',
], { c: C.brownDark, b: C.wood, g: C.gold })

const CHEST_OPEN = def([
	'..cccccccccc..',
	'.c..........c.',
	'.c..........c.',
	'.cccccccccccc.',
	'.cbbbbbbbbbbc.',
	'.cbbbbbbbbbbc.',
	'.cbbbbbbbbbbc.',
	'.cccccccccccc.',
	'..............',
], { c: C.brownDark, b: '#3a2a16' })

const SWORD = def([
	'.......ss.',
	'......sss.',
	'.....sss..',
	'....sss...',
	'...sss....',
	'.g.ss.....',
	'..gg......',
	'.hgg......',
	'hh........',
	'..........',
], { s: C.steelLight, g: C.goldDark, h: C.brown })

const DAGGER = def([
	'......s.',
	'.....ss.',
	'....ss..',
	'...ss...',
	'.g.s....',
	'..g.....',
	'.h......',
	'........',
], { s: C.steelLight, g: C.goldDark, h: C.brownDark })

const BOW = def([
	'..www...',
	'.w...s..',
	'w.....s.',
	'w......s',
	'w......s',
	'w.....s.',
	'.w...s..',
	'..www...',
], { w: C.brown, s: C.steelLight })

const STAFF = def([
	'......oo',
	'.....oho',
	'......oo',
	'.....w..',
	'....w...',
	'...w....',
	'..w.....',
	'.w......',
], { o: C.purple, h: C.white, w: C.brown })

const MACE = def([
	'....sss.',
	'...sssss',
	'...shsss',
	'...sssss',
	'..w.sss.',
	'..w.....',
	'.w......',
	'w.......',
], { s: C.steelDark, h: C.steelLight, w: C.brown })

const TOME = def([
	'.bbbbbb.',
	'bbbbbbbc',
	'bbgbbbbc',
	'bbbbbbbc',
	'bbgbbbbc',
	'bbbbbbbc',
	'bbbbbbbc',
	'.bbbbbb.',
], { b: C.purpleDark, g: C.gold, c: C.bone })

const ARMOR = def([
	'.a.aa.a.',
	'aaaaaaaa',
	'aaaaaaaa',
	'aahaahaa',
	'aaaaaaaa',
	'.aaaaaa.',
	'.aaaaaa.',
	'..aaaa..',
], { a: C.steel, h: C.steelLight })

const RING = def([
	'...gg...',
	'..gddg..',
	'.g....g.',
	'.g....g.',
	'.g....g.',
	'..g..g..',
	'...gg...',
	'........',
], { g: C.gold, d: C.crimson })

const RELIC = def([
	'...pp...',
	'..phhp..',
	'.phhhhp.',
	'.phhhhp.',
	'..phhp..',
	'...pp...',
	'..g..g..',
	'.gggggg.',
], { p: C.voidGlow, h: C.white, g: C.goldDark })

const BOOTS = def([
	'.bb.....',
	'.bb.....',
	'.bb.bb..',
	'.bb.bb..',
	'.bbbbb..',
	'.bbbbbb.',
	'........',
	'........',
], { b: C.brown })

// ---- skill icons (10x10) ---------------------------------------------------

const ICON_FIREBALL = def([
	'....ff....',
	'...ffff...',
	'..ffhhff..',
	'.ffhhhhff.',
	'.ffhhhhff.',
	'.ffhhhhff.',
	'..ffhhff..',
	'...ffff...',
	'....ff....',
	'..........',
], { f: C.fire, h: C.fireLight })

const ICON_DASH = def([
	'..........',
	'.w...w....',
	'..w...w...',
	'...w...w..',
	'....w...w.',
	'...w...w..',
	'..w...w...',
	'.w...w....',
	'..........',
	'..........',
], { w: C.white })

const ICON_HEAL = def([
	'..........',
	'....gg....',
	'....gg....',
	'..gggggg..',
	'..gggggg..',
	'....gg....',
	'....gg....',
	'..........',
	'..........',
	'..........',
], { g: C.leaf })

const ICON_FROST = def([
	'....i.....',
	'.i..i..i..',
	'..i.i.i...',
	'...iii....',
	'iiiiiiiii.',
	'...iii....',
	'..i.i.i...',
	'.i..i..i..',
	'....i.....',
	'..........',
], { i: C.ice })

const ICON_POISON = def([
	'..........',
	'...pppp...',
	'..pppppp..',
	'.pppppppp.',
	'.pphpphpp.',
	'..pppppp..',
	'...p.pp...',
	'....p.....',
	'..........',
	'..........',
], { p: C.poison, h: C.poisonDark })

const ICON_BOLT = def([
	'.....yy...',
	'....yy....',
	'...yy.....',
	'..yyyyy...',
	'....yy....',
	'...yy.....',
	'..yy......',
	'.yy.......',
	'..........',
	'..........',
], { y: '#ffe94a' })

const ICON_SHIELD = def([
	'.ssssssss.',
	'.shhhhhhs.',
	'.shssssss.',
	'.shssssss.',
	'.shssssss.',
	'..shssss..',
	'...shss...',
	'....ss....',
	'..........',
	'..........',
], { s: C.steel, h: C.steelLight })

const ICON_SKULL = def([
	'..bbbbbb..',
	'.bbbbbbbb.',
	'.bebbbbeb.',
	'.bebbbbeb.',
	'.bbbbbbbb.',
	'..bnnnnb..',
	'..b.bb.b..',
	'..........',
	'..........',
	'..........',
], { b: C.bone, e: C.black, n: C.black })

const ICON_ARROWS = def([
	'..w....w..',
	'.www..www.',
	'..w....w..',
	'..w....w..',
	'..w....w..',
	'..w....w..',
	'..........',
	'..w....w..',
	'..........',
	'..........',
], { w: C.leaf })

const ICON_WHIRL = def([
	'...ssss...',
	'..s....s..',
	'.s..ss..s.',
	'.s.s..s.s.',
	'.s.s..s...',
	'.s..ss....',
	'..s.......',
	'...ssss...',
	'..........',
	'..........',
], { s: C.white })

const ICON_SMITE = def([
	'....gg....',
	'....gg....',
	'....gg....',
	'..gggggg..',
	'...gggg...',
	'....gg....',
	'....gg....',
	'....hh....',
	'....hh....',
	'..........',
], { g: C.gold, h: C.fireLight })

const ICON_SHADOW = def([
	'..........',
	'..vvvvvv..',
	'.vvvvvvvv.',
	'.vvpvvpvv.',
	'.vvvvvvvv.',
	'..vvvvvv..',
	'...v..v...',
	'..........',
	'..........',
	'..........',
], { v: C.shadow, p: C.voidGlow })

// ---- world decor -----------------------------------------------------------

const STAIRS = def([
	'wwwwwwwwwwwwwwww',
	'w..............w',
	'w.dddddddddddd.w',
	'w.d..........d.w',
	'w.d.dddddddd.d.w',
	'w.d.d......d.d.w',
	'w.d.d.dddd.d.d.w',
	'w.d.d.dnnd.d.d.w',
	'w.d.d.dnnd.d.d.w',
	'w.d.d.dddd.d.d.w',
	'w.d.d......d.d.w',
	'w.d.dddddddd.d.w',
	'w.d..........d.w',
	'w.dddddddddddd.w',
	'w..............w',
	'wwwwwwwwwwwwwwww',
], { w: C.grayDark, d: C.gray, n: C.black })

const SPIKES = def([
	'................',
	'..s....s....s...',
	'..ss..sss..ss...',
	'.sss..sss..sss..',
	'.sss.sssss.sss..',
	'................',
	'....s....s......',
	'...sss..sss.....',
	'...sss..sss.....',
	'..sssss.ssss....',
	'................',
	'..s....s....s...',
	'..ss..sss..ss...',
	'.sss..sss..sss..',
	'.sss.sssss.sss..',
	'................',
], { s: C.steelLight })

const SHRINE = def([
	'.....hhhh.....',
	'....hhhhhh....',
	'....hhhhhh....',
	'.....hhhh.....',
	'......gg......',
	'.....gggg.....',
	'.....gggg.....',
	'....gggggg....',
	'...gggggggg...',
	'..gggggggggg..',
	'.gggggggggggg.',
	'.gggggggggggg.',
], { h: '#7cf6ff', g: C.grayLight })

const SHOP_NPC = def([
	'....hhhh....',
	'...hhhhhh...',
	'...hffffh...',
	'...hfefeh...',
	'....ffff....',
	'...gggggg...',
	'..gggggggg..',
	'..g.gggg.g..',
	'..gggggggg..',
	'.gggggggggg.',
	'.gggggggggg.',
	'..gggggggg..',
	'...gg..gg...',
	'..ggg..ggg..',
], { h: C.brownDark, f: C.skin, e: C.black, g: '#6a4a8a' })

const TORCH = def([
	'...ff...',
	'..ffff..',
	'..fhhf..',
	'...ff...',
	'...ww...',
	'...ww...',
	'...ww...',
	'...ww...',
], { f: C.fire, h: C.fireLight, w: C.brownDark })

const BARREL = def([
	'..bbbbbb..',
	'.bwwwwwwb.',
	'.bwwwwwwb.',
	'.bbbbbbbb.',
	'.bwwwwwwb.',
	'.bwwwwwwb.',
	'.bbbbbbbb.',
	'.bwwwwwwb.',
	'..bbbbbb..',
	'..........',
], { b: C.brownDark, w: C.wood })

const PORTAL = def([
	'....pppppppp....',
	'..pp........pp..',
	'.p....vvvv....p.',
	'.p..vvvvvvvv..p.',
	'p..vvhhhhhhvv..p',
	'p..vhhhhhhhhv..p',
	'p..vhhhhhhhhv..p',
	'p..vhhhhhhhhv..p',
	'p..vhhhhhhhhv..p',
	'p..vvhhhhhhvv..p',
	'.p..vvvvvvvv..p.',
	'.p....vvvv....p.',
	'..pp........pp..',
	'....pppppppp....',
	'................',
	'................',
], { p: C.voidGlow, v: C.purple, h: C.white })

// ---- registry --------------------------------------------------------------

export const SPRITES = {
	// heroes
	hero_warrior: recolor(HUMANOID, { h: C.steel, c: C.red, b: C.brownDark }),
	hero_rogue: recolor(HUMANOID, { h: C.grayDark, c: '#3a5a3a', b: C.black }),
	hero_mage: recolor(ROBED, { h: C.blueDark, c: C.blue, a: C.gold }),
	hero_ranger: recolor(HUMANOID, { h: '#3f6e2f', c: C.brown, b: C.greenDark }),
	hero_cleric: recolor(ROBED, { h: C.gold, c: C.white, a: C.gold, e: C.blue }),

	// enemies
	slime: SLIME,
	slime_red: recolor(SLIME, { s: C.red, h: C.crimson }),
	skeleton: recolor(HUMANOID, { h: C.bone, f: C.bone, c: C.boneDark, a: C.bone, b: C.boneDark, e: C.black }),
	goblin_archer: recolor(HUMANOID, { h: C.brownDark, f: C.leaf, c: C.brown, a: C.leaf, b: C.brownDark }),
	cultist: recolor(ROBED, { h: C.redDark, c: '#802838', a: C.gold, f: C.shadow, e: C.crimson }),
	assassin: recolor(ROBED, { h: C.shadow, c: C.grayDark, a: C.crimson, f: C.shadow, e: C.crimson }),
	brute: BRUTE,
	brute_frost: recolor(BRUTE, { c: C.iceDark, h: C.ice, e: C.ice }),
	necromancer: recolor(ROBED, { h: C.purpleDark, c: C.purple, a: C.bone, f: C.bone, e: C.poison }),
	bat: BAT,
	bat_frost: recolor(BAT, { w: C.iceDark, b: C.ice, e: C.blue }),
	bomber: BOMBER,
	spiderling: SPIDERLING,
	wisp: recolor(ORB, { o: C.voidGlow, h: C.white }),

	// bosses
	boss_tyrant: BOSS_TYRANT,
	boss_spider: BOSS_SPIDER,
	boss_golem: BOSS_GOLEM,
	boss_lich: BOSS_LICH,
	boss_void: BOSS_VOID,

	// projectiles
	orb_fire: ORB,
	orb_frost: recolor(ORB, { o: C.iceDark, h: C.ice }),
	orb_poison: recolor(ORB, { o: C.poisonDark, h: C.poison }),
	orb_void: recolor(ORB, { o: C.purpleDark, h: C.voidGlow }),
	orb_holy: recolor(ORB, { o: C.goldDark, h: C.fireLight }),
	orb_bone: recolor(ORB, { o: C.boneDark, h: C.bone }),
	arrow: ARROW,
	slash: SLASH,

	// pickups + items
	coin: COIN,
	heart: HEART,
	mana_gem: MANA_GEM,
	potion_red: POTION_RED,
	potion_blue: recolor(POTION_RED, { r: C.blue }),
	chest: CHEST,
	chest_open: CHEST_OPEN,
	item_sword: SWORD,
	item_dagger: DAGGER,
	item_bow: BOW,
	item_staff: STAFF,
	item_mace: MACE,
	item_tome: TOME,
	item_armor: ARMOR,
	item_ring: RING,
	item_relic: RELIC,
	item_boots: BOOTS,

	// skill icons
	icon_fireball: ICON_FIREBALL,
	icon_dash: ICON_DASH,
	icon_heal: ICON_HEAL,
	icon_frost: ICON_FROST,
	icon_poison: ICON_POISON,
	icon_bolt: ICON_BOLT,
	icon_shield: ICON_SHIELD,
	icon_skull: ICON_SKULL,
	icon_arrows: ICON_ARROWS,
	icon_whirl: ICON_WHIRL,
	icon_smite: ICON_SMITE,
	icon_shadow: ICON_SHADOW,

	// decor
	stairs: STAIRS,
	spikes: SPIKES,
	shrine: SHRINE,
	shop_npc: SHOP_NPC,
	torch: TORCH,
	barrel: BARREL,
	portal: PORTAL,
}
