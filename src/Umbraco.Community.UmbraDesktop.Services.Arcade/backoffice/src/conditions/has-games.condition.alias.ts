/**
 * The has-games condition's alias, on its own so `bundle.manifests.ts` can name it without importing
 * the condition class, which the manifest loads lazily. Importing both ways made Vite warn that the
 * module was in the main chunk and a dynamic one at once.
 */
export const UMBRADESKTOP_ARCADE_HAS_GAMES_CONDITION = 'UmbraDesktop.Arcade.Condition.HasGames';
