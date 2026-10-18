# Medium manga-panel source

The browser game calls the Supabase Edge Function named `mangadex-medium`. Its implementation is in `supabase/functions/mangadex-medium/index.ts`.

## Deploy

Deploy this function to the existing Supabase project used by Anime Party. It needs no external API key.

With the Supabase CLI installed and this repository linked to the correct project:

```sh
supabase functions deploy mangadex-medium
```

If deploying through the Supabase Dashboard, create a function named `mangadex-medium` and paste in `index.ts`. Keep JWT verification enabled; the game invokes it through the signed-in Supabase client.

## Host filter

The host can enter MangaDex author or artist names, one per line, in the board setup. Names must match a MangaDex author/artist name exactly. An empty list allows all eligible manga. Chapters may be in any language, but the manga must have an English title. The function returns one page image, four manga-title choices, and the MangaDex chapter link.

The function filters to MangaDex's `safe` and `suggestive` content ratings. It credits MangaDex by linking to the source chapter; MangaDex's API acceptable-use policy also requires credit to scanlation groups and honoring their content-removal requests. This implementation is for a no-ads, non-commercial game.
