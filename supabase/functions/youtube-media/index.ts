// Supabase Edge Function: YouTube candidate discovery for Anime Party.
// Deploy as "youtube-media" and configure the YOUTUBE_API_KEY secret.
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const animeTitles = [
  "Naruto", "One Piece", "Bleach", "Dragon Ball Z", "Death Note",
  "Attack on Titan", "Fullmetal Alchemist Brotherhood", "Demon Slayer",
  "Jujutsu Kaisen", "My Hero Academia", "Cowboy Bebop", "Hunter x Hunter",
  "Sailor Moon", "Pokémon", "Spy x Family", "One Punch Man", "Mob Psycho 100",
  "Neon Genesis Evangelion", "Sword Art Online", "JoJo's Bizarre Adventure",
  "Code Geass", "Chainsaw Man", "Vinland Saga", "Frieren", "Made in Abyss",
  "Black Clover", "Fairy Tail", "Haikyuu", "Tokyo Ghoul", "Steins Gate"
];
const cache = new Map();
function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function validEvent(value) {
  return value === "opening-clip" || value === "soundtrack-clip";
}
function queryForEvent(query, eventType) {
  return String(query || "").trim() + (eventType === "opening-clip" ? " anime opening" : " anime soundtrack OST");
}
async function youtubeSearch(query, eventType, maxResults = 8) {
  const key = Deno.env.get("YOUTUBE_API_KEY");
  if (!key) throw new Error("The YOUTUBE_API_KEY secret is not configured for the youtube-media Edge Function.");
  const cacheKey = query.toLocaleLowerCase() + "|" + eventType;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.videos;
  const params = new URLSearchParams({
    key,
    part: "snippet",
    q: queryForEvent(query, eventType),
    type: "video",
    maxResults: String(Math.max(1, Math.min(10, maxResults))),
    videoEmbeddable: "true",
    videoSyndicated: "true",
    safeSearch: "moderate",
    videoDuration: "short",
    order: "relevance"
  });
  const response = await fetch(YOUTUBE_API + "/search?" + params.toString());
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || ("YouTube Data API returned HTTP " + response.status);
    throw new Error(message);
  }
  const videos = (payload.items || []).filter(item => item?.id?.videoId && item?.snippet?.title).map(item => ({
    videoId: item.id.videoId,
    url: "https://www.youtube.com/watch?v=" + item.id.videoId,
    title: String(item.snippet.title),
    channelTitle: String(item.snippet.channelTitle || ""),
    publishedAt: String(item.snippet.publishedAt || ""),
    description: String(item.snippet.description || ""),
    thumbnail: String(item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || "")
  }));
  cache.set(cacheKey, { at: Date.now(), videos });
  return videos;
}
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "Use POST." }, 405);
  try {
    const body = await request.json();
    const action = String(body?.action || "");
    const eventType = String(body?.eventType || "");
    if (!validEvent(eventType)) return reply({ error: "eventType must be opening-clip or soundtrack-clip." }, 400);
    if (action === "search") {
      const query = String(body?.query || "").trim().slice(0, 160);
      if (query.length < 2) return reply({ error: "Enter at least two characters to search." }, 400);
      const videos = await youtubeSearch(query, eventType, 8);
      return reply({ videos });
    }
    if (action === "random") {
      const anime = animeTitles[Math.floor(Math.random() * animeTitles.length)];
      const videos = await youtubeSearch(anime, eventType, 10);
      const normalize = value => String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
      const wanted = normalize(anime);
      const matching = videos.filter(candidate => normalize(candidate.title + " " + candidate.description).includes(wanted));
      if (!matching.length) return reply({ error: "YouTube did not return an embeddable result whose title or description confirms the selected anime. Try again or add a host-approved video." }, 404);
      const video = shuffle(matching)[0];
      return reply({ video: { ...video, answer: anime, startSeconds: 0 } });
    }
    return reply({ error: "Unknown action. Use search or random." }, 400);
  } catch (error) {
    console.error("[youtube-media]", error);
    return reply({ error: error instanceof Error ? error.message : "YouTube discovery failed." }, 500);
  }
});
