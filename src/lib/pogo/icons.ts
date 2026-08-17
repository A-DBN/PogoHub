/** Construction des URLs de sprites Pokémon GO (assets PokeMiners). */

/**
 * Source amont, appelée **côté serveur uniquement** par `/api/sprite`.
 * `raw.githubusercontent.com` n'est pas un CDN : sollicité depuis le navigateur
 * il renvoie des HTTP 429 dès qu'une page demande beaucoup d'images, et les
 * icônes disparaissent. On passe donc par notre propre route, qui met en cache.
 */
export const ICON_SOURCE =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon%20-%20256x256/Addressable%20Assets/';

/** Ce que voit le navigateur. */
export const ICON_BASE = '/api/sprite/';

export function iconUrl(file: string | null | undefined): string | null {
  return file ? `${ICON_BASE}${encodeURIComponent(file)}` : null;
}

/** Version chromatique : pm38.fALOLA.icon.png → pm38.fALOLA.s.icon.png */
export function shinyFileOf(file: string): string {
  return file.replace(/\.icon\.png$/, '.s.icon.png');
}

export function spriteUrl(file: string | null | undefined, shiny = false): string | null {
  if (!file) return null;
  return iconUrl(shiny ? shinyFileOf(file) : file);
}
