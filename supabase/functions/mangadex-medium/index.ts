// Supabase Edge Function: MangaDex-backed Medium manga-panel questions.
// Deploy as function name "mangadex-medium". No third-party key is required.
const API = "https://api.mangadex.org";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    console.error("[mangadex-medium] MangaDex API request failed", {
      path,
      status: response.status,
      detail: detail.slice(0, 1000)
    });
    throw new Error("MangaDex API returned HTTP " + response.status + (detail ? ": " + detail.slice(0, 300) : ""));
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
  // Sample a random catalogue region when no author filter is set; filtered searches start at the first match.
  const initialOffset = authorIds.length ? 0 : Math.floor(Math.random() * 100) * 100;
  for (let page = 0; page < 4; page++) {
    const params = new URLSearchParams();
    params.set("limit", "100");
    params.set("offset", String(initialOffset + page * 100));
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
async function imageIsAvailable(url) {
  try {
    // Use GET rather than HEAD: some MangaDex@Home nodes handle HEAD differently from actual image loads.
    const response = await fetch(url, {
      headers: {
        "User-Agent": "AnimeParty/1.0 (manga trivia game)",
        "Range": "bytes=0-0"
      }
    });
    if (response.ok) {
      await response.body?.cancel();
      return true;
    }
    const status = response.status;
    await response.body?.cancel();
    console.warn("[mangadex-medium] Manga page URL is unavailable", { status, url });
    return false;
  } catch (error) {
    console.warn("[mangadex-medium] Could not verify manga page URL", {
      url,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}
async function choosePanel(manga) {
  const chapterParams = new URLSearchParams();
  chapterParams.set("limit", "100");
  chapterParams.set("order[readableAt]", "desc");
  chapterParams.append("contentRating[]", "safe");
  chapterParams.append("contentRating[]", "suggestive");
  // Intentionally no translatedLanguage filter: chapter language does not affect the English answer title.
  chapterParams.append("includes[]", "scanlation_group");
  const chapterResult = await api("/manga/" + manga.id + "/feed?" + chapterParams.toString());
  const chapters = (chapterResult.data || []).filter(ch => ch.id && ch.attributes && ch.attributes.externalUrl == null);
  if (!chapters.length) return null;
  for (const chapter of shuffle(chapters).slice(0, 8)) {
    let workingPage = null;
    let checked = 0;
    // MangaDex documents that a failed @Home server can be replaced by requesting a fresh assignment.
    for (let serverAttempt = 0; serverAttempt < 2 && !workingPage; serverAttempt++) {
      const atHome = await api("/at-home/server/" + chapter.id + (serverAttempt ? "?forcePort443=true" : ""));
      if (!atHome.baseUrl || !atHome.chapter || !atHome.chapter.hash) continue;
      const fullPages = Array.isArray(atHome.chapter.data) ? shuffle(atHome.chapter.data) : [];
      const saverPages = Array.isArray(atHome.chapter.dataSaver) ? shuffle(atHome.chapter.dataSaver) : [];
      const candidates = [];
      for (const filename of fullPages.slice(0, 4)) {
        candidates.push({
          url: atHome.baseUrl + "/data/" + atHome.chapter.hash + "/" + filename,
          filename
        });
      }
      for (const filename of saverPages.slice(0, 4)) {
        candidates.push({
          url: atHome.baseUrl + "/data-saver/" + atHome.chapter.hash + "/" + filename,
          filename
        });
      }
      for (const candidate of candidates) {
        checked++;
        if (await imageIsAvailable(candidate.url)) {
          workingPage = candidate;
          break;
        }
      }
      if (!workingPage) {
        console.warn("[mangadex-medium] MangaDex@Home assignment had no available sampled pages", {
          mangaId: manga.id,
          title: manga.title,
          chapterId: chapter.id,
          serverAttempt: serverAttempt + 1,
          checked: candidates.length,
          baseUrl: atHome.baseUrl
        });
      }
    }
    if (!workingPage) {
      console.warn("[mangadex-medium] All sampled pages were unavailable for chapter", {
        mangaId: manga.id,
        title: manga.title,
        chapterId: chapter.id,
        checked
      });
      continue;
    }
    const groupIds = (chapter.relationships || []).filter(rel => rel.type === "scanlation_group").map(rel => rel.id);
    const groups = (chapterResult.included || []).filter(item => item.type === "scanlation_group" && groupIds.includes(item.id));
    const sourceCredit = groups.map(group => group.attributes && group.attributes.name).filter(Boolean).join(", ");
    return {
      entry: {
        title: manga.title,
        url: workingPage.url,
        type: "manga-panel",
        difficulty: 2,
        label: "Manga panel",
        sourceUrl: "https://mangadex.org/chapter/" + chapter.id,
        sourceCredit
      }
    };
  }
  return null;
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
  let lastCandidateError = "";
  for (const manga of pool.slice(0, 12)) {
    try {
      const selected = await choosePanel(manga);
      if (!selected) {
        console.warn("[mangadex-medium] No usable chapter/page found for candidate", {
          mangaId: manga.id,
          title: manga.title
        });
        continue;
      }
      const wrong = answers.filter(title => normalized(title) !== normalized(selected.entry.title)).slice(0, 3);
      if (wrong.length < 3) {
        console.warn("[mangadex-medium] Not enough distinct wrong answers", {
          mangaId: manga.id,
          title: manga.title,
          answerCount: wrong.length
        });
        continue;
      }
      console.log("[mangadex-medium] Successfully selected manga panel", {
        mangaId: manga.id,
        title: manga.title
      });
      return { ...selected, options: shuffle([selected.entry.title, ...wrong]) };
    } catch (error) {
      // Keep trying other candidates, but log the reason so failures can be diagnosed.
      lastCandidateError = error instanceof Error ? error.message : String(error);
      console.error("[mangadex-medium] Candidate failed", {
        mangaId: manga.id,
        title: manga.title,
        error: lastCandidateError
      });
    }
  }
  throw new Error("Could not find a usable manga page after trying " + Math.min(pool.length, 12) +
    " candidates." + (lastCandidateError ? " Last candidate error: " + lastCandidateError : " No candidate returned usable chapter/page data."));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    // Supabase JS versions can send additional headers; explicitly allow those requested by the browser preflight.
    const requestedHeaders = request.headers.get("Access-Control-Request-Headers");
    const headers = requestedHeaders ? { ...corsHeaders, "Access-Control-Allow-Headers": requestedHeaders } : corsHeaders;
    return new Response("ok", { headers });
  }
  if (request.method !== "POST") return reply({ error: "Use POST for manga questions." }, 405);
  try {
    const body = await request.json();
    if (body.action !== "random-panel") return reply({ error: "Unknown action." }, 400);
    return reply(await randomPanel(body.authors || []));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[mangadex-medium] Request failed", {
      action: request.method === "POST" ? "POST" : request.method,
      message,
      stack: error instanceof Error ? error.stack : undefined
    });
    return reply({ error: message || "Unexpected MangaDex error." }, 502);
  }
});
