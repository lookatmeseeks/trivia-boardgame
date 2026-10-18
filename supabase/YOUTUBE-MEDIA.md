# YouTube media events

The `soundtrack-clip` and `opening-clip` events use the same YouTube embed and media-selection system. Both play for 15 seconds. Soundtrack rounds cover the video with a black overlay; opening rounds show the video.

## Host-approved pool

In the host setup, choose an event, search for candidate videos or paste a YouTube URL, enter the correct anime title and optional start time, then select **Add approved video**. The pool is included in multiplayer game snapshots. During play, the event prefers an approved entry (80% when a pool exists) and otherwise tries automatic discovery. If discovery fails, an approved entry is used as a fallback.

Review automatically discovered clips before adding them to the approved pool. Search result titles are not guaranteed to identify the correct anime, so the host must enter and verify the answer.

## Enable YouTube search and automatic discovery

Automatic discovery uses the YouTube Data API through a Supabase Edge Function. The API key is never put in the public GitHub Pages JavaScript.

1. In Google Cloud Console, create or select a project, enable **YouTube Data API v3**, and create an API key. Restrict the key to the YouTube Data API v3 if possible.
2. In the Supabase project used by Anime Party, add the Edge Function secret named `YOUTUBE_API_KEY` with that key. In the Supabase dashboard this is under **Edge Functions → Secrets**. Do not commit the key to GitHub.
3. Deploy the function from this repository at `supabase/functions/youtube-media/index.ts` with the function name `youtube-media`. With the Supabase CLI from the repository root, use:
   ```sh
   supabase secrets set YOUTUBE_API_KEY=YOUR_API_KEY
   supabase functions deploy youtube-media
   ```
   Alternatively, deploy the function in the Supabase dashboard and configure the same secret there.
4. Open Anime Party, create or join an online room, and test Search in the host setup. The YouTube API key is required for both manual candidate search and automatic discovery.

The function filters to videos marked embeddable and syndicated by YouTube, but a video can still become unavailable or refuse playback. The player therefore needs to be tested in the browser; approved alternatives should be added for important quiz pools.

## Playback notes

- Each round stores the selected video ID, answer, start offset, and a shared end timestamp in the existing multiplayer challenge state.
- The browser stops its local player at the shared 15-second end time.
- Browser autoplay policies may require the soundtrack player’s **Start soundtrack** button. This is a local browser permission/gesture, not a different clip selection.
- YouTube embeds must remain large enough to meet YouTube's player requirements. The black soundtrack cover sits over the embed; it does not extract or download the audio.
