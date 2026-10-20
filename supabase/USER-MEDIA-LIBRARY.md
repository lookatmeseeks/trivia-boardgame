# User-provided media library

Anime Party's soundtrack and opening events use files supplied by the host. The game stores catalogue metadata in the room snapshot; the audio/video files themselves live in Supabase Storage.

## Storage setup

1. Use the Supabase project already configured in `js/supabase-config.js`.
2. On a plan with enough storage, open **Storage** and create a bucket named `anime-media`. Set it to **Public** so players can fetch clips without signed URLs.
3. Upload files in bulk through the Supabase dashboard. Organize them into folders such as `openings/` and `soundtracks/`. MP4/H.264 video and MP3/AAC audio are broadly browser-compatible.
4. Copy each file's public URL into the catalogue, or prepare a JSON catalogue and import it in host setup. Do not expose a Supabase service-role key in the website.

The game intentionally does not provide anonymous browser uploads. Room players use anonymous sign-in, so an open upload policy would let any visitor upload arbitrary files into your storage bucket.

## Catalogue JSON format

Use a top-level `items` array. `mediaUrl` must be the full public URL of the uploaded file. `eventType` must be `opening-clip` for video or `soundtrack-clip` for audio.

```json
{
  "version": 1,
  "items": [
    {
      "eventType": "opening-clip",
      "mediaUrl": "https://YOUR_PROJECT.supabase.co/storage/v1/object/public/anime-media/openings/example.mp4",
      "answer": "Cowboy Bebop",
      "startSeconds": 0
    },
    {
      "eventType": "soundtrack-clip",
      "mediaUrl": "https://YOUR_PROJECT.supabase.co/storage/v1/object/public/anime-media/soundtracks/example.mp3",
      "answer": "Cowboy Bebop",
      "startSeconds": 15
    }
  ]
}
```

Import JSON using **Import catalogue JSON**. Use **Export catalogue JSON** to save the current catalogue for reuse. The host can also add entries one at a time. Catalogue metadata is shared with players in the room snapshot; every player needs network access to the public media URLs.

## Clip behavior

Both event types play for 15 seconds. Opening events show the video. Soundtrack events play audio only, with a black display and a **Start soundtrack** button to comply with browser autoplay restrictions. The start offset is measured in seconds from the beginning of the source file.

## Storage cost note

The Supabase Free plan includes 1 GB of storage and a 50 MB maximum file size. A 2–10 GB library requires a paid plan or another object-storage provider. Check the current Supabase pricing page before upgrading.
