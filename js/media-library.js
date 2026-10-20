const MEDIA_BUCKET = "anime-party-media";
let mediaLibraryItems = [];

function mediaLibraryCanManage() {
  return !!mpRoomId && !!mpIsHost && mpRoomStatus !== "left";
}
function mediaLibraryStatus(message) {
  const el = document.querySelector("#media-library-status");
  if (el) el.textContent = message;
}
function mediaLibraryFormatSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return "Unknown size";
  const n = Number(bytes);
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}
function mediaLibraryPublicUrl(path) {
  return mpClient.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
function mediaLibraryRender() {
  const list = document.querySelector("#media-library-list");
  const upload = document.querySelector("#media-upload");
  const file = document.querySelector("#media-file");
  const title = document.querySelector("#media-title");
  const answer = document.querySelector("#media-answer");
  if (!list) return;
  const canManage = mediaLibraryCanManage();
  [upload, file, title, answer].forEach(el => { if (el) el.disabled = !canManage; });
  list.innerHTML = "";
  if (!canManage && mpRoomId) {
    list.innerHTML = '<div class="note">The shared media library is hidden from players to prevent answer spoilers.</div>';
    return;
  }
  if (!mediaLibraryItems.length) {
    list.innerHTML = '<div class="note">No media uploaded yet.</div>';
    return;
  }
  mediaLibraryItems.forEach(item => {
    const row = document.createElement("div");
    row.style.cssText = "padding:9px;border:1px solid #424a65;border-radius:9px;background:#171c2b;display:grid;gap:5px";
    const heading = document.createElement("strong");
    heading.textContent = item.title;
    const details = document.createElement("div");
    details.className = "note";
    details.textContent = item.media_type.toUpperCase() + " · " + mediaLibraryFormatSize(item.size_bytes) + " · Answer: " + item.answer;
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;align-items:center";
    const preview = document.createElement(item.media_type === "audio" ? "audio" : "video");
    preview.controls = true;
    preview.preload = "none";
    preview.src = mediaLibraryPublicUrl(item.storage_path);
    preview.style.cssText = "width:100%;max-height:160px;min-width:0";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary";
    remove.style.cssText = "width:auto;flex-shrink:0";
    remove.textContent = "Delete";
    remove.disabled = !canManage;
    remove.addEventListener("click", () => mediaLibraryDelete(item));
    actions.append(remove);
    row.append(heading, details, preview, actions);
    list.append(row);
  });
}
async function mediaLibraryRefresh() {
  if (!mpRoomId) {
    mediaLibraryStatus("Connect to a room to access the shared media library.");
    mediaLibraryRender();
    return;
  }
  try {
    await mpEnsureClient();
    const { data, error } = await mpClient.from("media_library")
      .select("id,title,answer,media_type,storage_path,mime_type,size_bytes,duration_seconds,created_by,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    mediaLibraryItems = data || [];
    mediaLibraryStatus(mediaLibraryCanManage()
      ? "Global library · You are the room host. You can upload and delete files."
      : "Global library · Only the room host can upload or delete files.");
    mediaLibraryRender();
  } catch (error) {
    mediaLibraryStatus("Could not load media library: " + (error.message || error) + ". Run supabase/global-media-library.sql in the Supabase SQL Editor first.");
  }
}
async function mediaLibraryUpload() {
  if (!mediaLibraryCanManage()) {
    mediaLibraryStatus("Only the room host can upload media.");
    return;
  }
  const fileInput = document.querySelector("#media-file");
  const titleInput = document.querySelector("#media-title");
  const answerInput = document.querySelector("#media-answer");
  const file = fileInput.files?.[0];
  const title = titleInput.value.trim();
  const answer = answerInput.value.trim();
  if (!file || !title || !answer) {
    mediaLibraryStatus("Enter a media title, correct answer, and choose a file.");
    return;
  }
  if (!(file.type.startsWith("audio/") || file.type.startsWith("video/"))) {
    mediaLibraryStatus("Choose an audio or video file.");
    return;
  }
  if (file.size > 500 * 1024 * 1024) {
    mediaLibraryStatus("This file exceeds the 500 MB upload limit. Compress it first.");
    return;
  }
  const button = document.querySelector("#media-upload");
  button.disabled = true;
  mediaLibraryStatus("Uploading " + file.name + "…");
  const id = crypto.randomUUID();
  const extension = (file.name.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "bin";
  const path = id + "." + extension;
  const mediaType = file.type.startsWith("audio/") || /\.(mp3|wav|ogg|aac|m4a|flac)$/i.test(file.name) ? "audio" : "video";
  const mimeType = file.type || (mediaType === "audio" ? "audio/mpeg" : "video/mp4");
  try {
    await mpEnsureClient();
    const { error: uploadError } = await mpClient.storage.from(MEDIA_BUCKET).upload(path, file, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: false
    });
    if (uploadError) throw uploadError;
    const { error: rowError } = await mpClient.from("media_library").insert({
      id, title, answer, media_type: mediaType, storage_path: path,
      mime_type: mimeType, size_bytes: file.size,
      created_by: mpUserId
    });
    if (rowError) {
      await mpClient.storage.from(MEDIA_BUCKET).remove([path]);
      throw rowError;
    }
    fileInput.value = "";
    titleInput.value = "";
    answerInput.value = "";
    await mediaLibraryRefresh();
    mediaLibraryStatus("Uploaded " + title + " to the global library.");
  } catch (error) {
    mediaLibraryStatus("Upload failed: " + (error.message || error));
  } finally {
    button.disabled = !mediaLibraryCanManage();
  }
}
async function mediaLibraryDelete(item) {
  if (!mediaLibraryCanManage()) return;
  if (!confirm('Delete "' + item.title + '" from the global media library? This removes it for every room.')) return;
  mediaLibraryStatus("Deleting " + item.title + "…");
  try {
    const { error: storageError } = await mpClient.storage.from(MEDIA_BUCKET).remove([item.storage_path]);
    if (storageError) throw storageError;
    const { error: rowError } = await mpClient.from("media_library").delete().eq("id", item.id);
    if (rowError) throw rowError;
    await mediaLibraryRefresh();
    mediaLibraryStatus("Deleted " + item.title + " from the global library.");
  } catch (error) {
    mediaLibraryStatus("Delete failed: " + (error.message || error));
  }
}
document.querySelector("#media-upload")?.addEventListener("click", mediaLibraryUpload);
document.querySelector("#mp-create")?.addEventListener("click", () => setTimeout(mediaLibraryRefresh, 500));
document.querySelector("#mp-join")?.addEventListener("click", () => setTimeout(mediaLibraryRefresh, 500));
document.querySelector("#mp-start")?.addEventListener("click", () => setTimeout(mediaLibraryRefresh, 500));
document.querySelector("#mp-leave")?.addEventListener("click", () => {
  mediaLibraryItems = [];
  mediaLibraryStatus("Connect to a room to manage shared media.");
  mediaLibraryRender();
});
document.addEventListener("DOMContentLoaded", mediaLibraryRender);
