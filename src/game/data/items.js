/**
 * Loot data: rarity tiers, base item templates, and the affix pool.
 * The LootSystem rolls (base item + rarity + affixes) into concrete items,
 * so build diversity comes from data combinations, not code.
 */

export const RARITIES = [
	{ id: 'common', name: 'Common', color: 0xffb8b8b8, statMul: 1.0, affixes: 0, weight: 46 },
	{ id: 'uncommon', name: 'Uncommon', color: 0xff4dc763, statMul: 1.18, affixes: 1, weight: 30 },
	{ id: 'rare', name: 'Rare', color: 0xffd6893b, statMul: 1.4, affixes: 2, weight: 15 },
	{ id: 'epic', name: 'Epic', color: 0xffd84fb0, statMul: 1.7, affixes: 3, weight: 7 },
	{ id: 'legendary', name: 'Legendary', color: 0xff3ab5e8, statMul: 2.1, affixes: 4, weight: 2 },
]

/**
 * Base items. slot: weapon | armor | ring | boots | relic.
 * Weapon damage/armor defense scale with floor level and rarity.
 */
export const BASE_ITEMS = [
	{ id: 'sword', name: 'Sword', icon: 'item_sword', slot: 'weapon', weaponKind: 'melee', stat: 'damage', base: 8, classAffinity: ['warrior', 'cleric'] },
	{ id: 'dagger', name: 'Dagger', icon: 'item_dagger', slot: 'weapon', weaponKind: 'melee', stat: 'damage', base: 5, classAffinity: ['rogue'] },
	{ id: 'bow', name: 'Bow', icon: 'item_bow', slot: 'weapon', weaponKind: 'ranged', stat: 'damage', base: 6, classAffinity: ['ranger'] },
	{ id: 'staff', name: 'Staff', icon: 'item_staff', slot: 'weapon', weaponKind: 'ranged', stat: 'damage', base: 6, classAffinity: ['mage'] },
	{ id: 'mace', name: 'Mace', icon: 'item_mace', slot: 'weapon', weaponKind: 'melee', stat: 'damage', base: 7, classAffinity: ['cleric', 'warrior'] },
	{ id: 'armor', name: 'Armor', icon: 'item_armor', slot: 'armor', stat: 'defense', base: 4 },
	{ id: 'ring', name: 'Ring', icon: 'item_ring', slot: 'ring', stat: 'power', base: 2 },
	{ id: 'boots', name: 'Boots', icon: 'item_boots', slot: 'boots', stat: 'speed', base: 4 },
	{ id: 'relic', name: 'Relic', icon: 'item_relic', slot: 'relic', stat: 'power', base: 3 },
]

/**
 * Affix pool. `roll` = [min, max] at floor 1; scales +8%/floor.
 * apply-key is interpreted by Player.recalcStats().
 */
export const AFFIXES = [
	{ id: 'str', name: 'of Might', text: '+{v} Strength', roll: [1, 3], apply: 'str' },
	{ id: 'dex', name: 'of Precision', text: '+{v} Dexterity', roll: [1, 3], apply: 'dex' },
	{ id: 'int', name: 'of Wisdom', text: '+{v} Intellect', roll: [1, 3], apply: 'int' },
	{ id: 'vit', name: 'of Vigor', text: '+{v} Vitality', roll: [1, 3], apply: 'vit' },
	{ id: 'hp', name: 'of the Bear', text: '+{v} Max Health', roll: [8, 20], apply: 'maxHp' },
	{ id: 'mana', name: 'of the Owl', text: '+{v} Max Mana', roll: [6, 15], apply: 'maxMana' },
	{ id: 'crit', name: 'of Ruin', text: '+{v}% Crit Chance', roll: [3, 8], apply: 'crit' },
	{ id: 'speed', name: 'of Haste', text: '+{v}% Move Speed', roll: [4, 9], apply: 'moveSpeed' },
	{ id: 'cdr', name: 'of Echoes', text: '-{v}% Cooldowns', roll: [4, 10], apply: 'cdr' },
	{ id: 'lifesteal', name: 'of the Leech', text: '{v}% Lifesteal', roll: [2, 5], apply: 'lifesteal' },
	{ id: 'xpgain', name: 'of Insight', text: '+{v}% Experience', roll: [5, 12], apply: 'xpGain' },
	{ id: 'thorns', name: 'of Spines', text: '{v} Thorns Damage', roll: [2, 6], apply: 'thorns' },
]

/** Non-equipment drops. */
export const CONSUMABLES = {
	potion_hp: { id: 'potion_hp', name: 'Health Potion', icon: 'potion_red', heal: 40 },
	potion_mp: { id: 'potion_mp', name: 'Mana Potion', icon: 'potion_blue', mana: 40 },
	skill_book: { id: 'skill_book', name: 'Skill Book', icon: 'item_tome' },
}

/** Gold value ranges per loot tier (enemy lootTier indexes this). */
export const GOLD_BY_TIER = [
	[1, 4],
	[3, 8],
	[6, 14],
]

export const SHOP_PRICES = {
	potion_hp: 25,
	potion_mp: 20,
	item: (rarityIndex) => 30 + rarityIndex * 45,
	skill_book: 80,
}
