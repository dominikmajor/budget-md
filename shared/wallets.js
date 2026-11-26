/**
 * Tárcatípusok és csoportjaik – egy helyen, hogy a szerver és a kliens ugyanazt használja.
 *
 *   account  = bankszámla / digitális tárca
 *   cash     = készpénz zseb
 *   reserve  = tartalék (Irattartó)
 *   envelope = boríték (megtakarítási cél)
 *   vault    = széf (pl. Revolut Vault: külön zseb a bankon belül)
 *
 * Egy típus likviditása itt, a LIQUID_KINDS / SAVED_KINDS listában módosítható.
 */
export const WALLET_KINDS = ['account', 'cash', 'reserve', 'envelope', 'vault'];

/** Azonnal elkölthető pénz („Likvid”). */
export const LIQUID_KINDS = ['account', 'cash'];

/** Félretett pénz („Félretett”) – nem számít a likvid egyenlegbe. */
export const SAVED_KINDS = ['reserve', 'envelope', 'vault'];

/** Célösszeges, több elemből álló gyűjtők (borítékok, széfek): saját szekció, haladásjelző. */
export const GOAL_KINDS = ['envelope', 'vault'];

export const isLiquidKind = (kind) => LIQUID_KINDS.includes(kind);
export const isSavedKind = (kind) => SAVED_KINDS.includes(kind);
export const isGoalKind = (kind) => GOAL_KINDS.includes(kind);

export const DEFAULT_WALLET_ICON = { account: '🏦', cash: '👛', reserve: '🗂️', envelope: '✉️', vault: '🔐' };
