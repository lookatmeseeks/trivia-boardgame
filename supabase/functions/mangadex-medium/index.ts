// Supabase Edge Function: MangaDex-backed Medium manga-panel questions.
// Deploy as function name "mangadex-medium". No third-party key is required.
const API = "https://api.mangadex.org";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

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
async function api(path) {
  const response = await fetch(API + path, {
    headers: { "Accept": "application/json", "User-Agent": "AnimeParty/1.0 (manga trivia game)" }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("MangaDex API returned HTTP " + response.status + (detail ? ": " + detail.slice(0, 180) : ""));
  }
  return response.json();
}
function englishTitle(manga) {
  const attributes = manga && manga.attributes;
  if (!attributes) return "";
  if (attributes.title && typeof attributes.title.en === "string" && attributes.title.en.trim()) {
    return attributes.title.en.trim();
  }
  for (const alternate of attributes.altTitles || []) {
    if (alternate && typeof alternate.en === "string" && alternate.en.trim()) return alternate.en.trim();
  }
  return "";
}
function normalized(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
}
async function resolveAuthors(names) {
  const ids = new Set();
  const unresolved = [];
  for (const rawName of names) {
    const name = String(rawName || "").trim();
    if (!name) continue;
    const query = new URLSearchParams({ name, limit: "10" });
    const result = await api("/author?" + query.toString());
    const exact = (result.data || []).filter(author => normalized(author.attributes && author.attributes.name) === normalized(name));
    if (!exact.length) unresolved.push(name);
    else exact.forEach(author => ids.add(author.id));
  }
  if (unresolved.length) {
    throw new Error("Could not find these exact author/artist names on MangaDex: " + unresolved.join(", ") + ". Check spelling and use the name shown on MangaDex.");
  }
  return [...ids];
}
async function mangaCandidates(authorIds) {
  const candidates = new Map();
  // Search a few pages so the result is not restricted to only the most popular manga.
  for (let page = 0; page < 4; page++) {
    const params = new URLSearchParams();
    params.set("limit", "100");
    params.set("offset", String(page * 100));
    params.set("hasAvailableChapters", "true");
    params.append("contentRating[]", "safe");
    params.append("contentRating[]", "suggestive");
    params.append("includes[]", "author");
    params.append("includes[]", "artist");
    params.set("order[followedCount]", "desc");
    authorIds.forEach(id => params.append("authorsOrArtists[]", id));
    const result = await api("/manga?" + params.toString());
    for (const manga of result.data || []) {
      const title = englishTitle(manga);
      if (title) candidates.set(manga.id, { id: manga.id, title });
    }
    if ((result.data || []).length < 100) break;
  }
  return [...candidates.values()];
}
async function choosePanel(manga) {
  const chapterParams = new URLSearchParams();
  chapterParams.set("limit", "100");
  chapterParams.set("order[readableAt]", "desc");
  chapterParams.append("contentRating[]", "safe");
  chapterParams.append("contentRating[]", "suggestive");
  // Intentionally no translatedLanguage filter: chapter language does not affect the English answer title.
  chapterParams.append("manga[]", manga.id);
  const chapterResult = await api("/manga/" + manga.id + "/feed?" + chapterParams.toString());
  const chapters = (chapterResult.data || []).filter(ch => ch.id && ch.attributes && ch.attributes.externalUrl == null);
  if (!chapters.length) return null;
  const chapter = shuffle(chapters)[0];
  const atHome = await api("/at-home/server/" + chapter.id);
  const pageNames = atHome.chapter && atHome.chapter.data;
  if (!atHome.baseUrl || !atHome.chapter || !atHome.chapter.hash || !Array.isArray(pageNames) || !pageNames.length) return null;
  const filename = shuffle(pageNames)[0];
  return {
    entry: {
      title: manga.title,
      url: atHome.baseUrl + "/data/" + atHome.chapter.hash + "/" + filename,
      type: "manga-panel",
      difficulty: 2,
      label: "Manga panel",
      sourceUrl: "https://mangadex.org/chapter/" + chapter.id
    }
  };
}
async function randomPanel(authorNames) {
  const names = [...new Set((Array.isArray(authorNames) ? authorNames : [])
    .map(name => String(name || "").trim()).filter(Boolean))].slice(0, 30);
  const authorIds = names.length ? await resolveAuthors(names) : [];
  const candidates = await mangaCandidates(authorIds);
  if (candidates.length < 4) {
    throw new Error("MangaDex returned fewer than four manga with English titles and available chapters for this author filter. Add more authors or leave the list blank.");
  }
  const pool = shuffle(candidates);
  const answers = shuffle(pool.map(m => m.title).filter((title, index, all) => all.findIndex(x => normalized(x) === normalized(title)) === index));
  if (answers.length < 4) throw new Error("MangaDex did not return four distinct English manga titles.");
  for (const manga of pool.slice(0, 12)) {
    try {
      const selected = await choosePanel(manga);
      if (!selected) continue;
      const wrong = answers.filter(title => normalized(title) !== normalized(selected.entry.title)).slice(0, 3);
      if (wrong.length < 3) continue;
      return { ...selected, options: shuffle([selected.entry.title, ...wrong]) };
    } catch (error) {
      // Skip titles with no readable chapter or temporarily unavailable page data.
      continue;
    }
  }
  throw new Error("Could not find a usable manga page right now. Try again, or broaden the author filter.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "Use POST for manga questions." }, 405);
  try {
    const body = await request.json();
    if (body.action !== "random-panel") return reply({ error: "Unknown action." }, 400);
    return reply(await randomPanel(body.authors || []));
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Unexpected MangaDex error." }, 502);
  }
});
