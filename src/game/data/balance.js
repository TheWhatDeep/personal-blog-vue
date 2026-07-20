/**
 * Global balance knobs — single place to tune game feel without hunting
 * through systems code.
 */
export const BALANCE = {
	/**
	 * All damage dealt to the player is multiplied by this. Raised so hits
	 * are FELT and dodging/telegraph-reading matters — healing (potions,
	 * hearts) intentionally doesn't scale with it.
	 */
	enemyDamageMul: 2.25,

	/** Arena (wave-mode) bosses use this fraction of their story HP. */
	arenaBossHpFrac: 0.3,
}
