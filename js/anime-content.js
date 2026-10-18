const popularAnime=["Naruto","One Piece","Bleach","Dragon Ball Z","Death Note","Attack on Titan","Fullmetal Alchemist: Brotherhood","Demon Slayer","Jujutsu Kaisen","My Hero Academia","Cowboy Bebop","Hunter x Hunter","Sailor Moon","Pokémon","Spy x Family","One Punch Man","Mob Psycho 100","Neon Genesis Evangelion","Sword Art Online","JoJo's Bizarre Adventure","Code Geass","Chainsaw Man","Vinland Saga","Frieren: Beyond Journey's End","Made in Abyss","Black Clover","Fairy Tail","Haikyuu!!","Tokyo Ghoul","Steins;Gate"];
function shuffle(items){return [...items].sort(()=>Math.random()-0.5)}
let lastAnimeBatch=[];
function allAnimeTitles(){return [...new Set([...popularAnime,...lastAnimeBatch.map(x=>x.title)].map(s=>s.trim()).filter(Boolean))]}
let kitsuAnimeCount=null;
async function fetchKitsuAnimeBatch(){
 const base="https://kitsu.io/api/edge/anime?page%5Blimit%5D=20&page%5Boffset%5D=";
 const request=async offset=>{
  const response=await fetch(base+offset+"&sort=id",{headers:{Accept:"application/vnd.api+json"}});
  if(!response.ok)throw new Error("Kitsu API returned HTTP "+response.status);
  return response.json();
 };
 if(!kitsuAnimeCount){
  const first=await request(0);
  kitsuAnimeCount=Number(first.meta&&first.meta.count)||0;
  if(!kitsuAnimeCount)throw new Error("Kitsu returned no anime catalogue count");
  const firstBatch=(first.data||[]).map(kitsuAnimeToEntry).filter(Boolean);
  if(kitsuAnimeCount<=20){lastAnimeBatch=firstBatch;return firstBatch;}
 }
 const maxOffset=Math.max(0,kitsuAnimeCount-20);
 const offset=Math.floor(Math.random()*(maxOffset+1));
 const payload=await request(offset);
 const batch=(payload.data||[]).map(kitsuAnimeToEntry).filter(Boolean);
 if(!batch.length)throw new Error("Kitsu returned no usable anime images");
 lastAnimeBatch=batch;
 return batch;
}
function kitsuAnimeToEntry(item){
 const a=item&&item.attributes;
 if(!a||!a.posterImage)return null;
 const title=(a.titles&&(a.titles.en||a.titles.en_jp))||a.canonicalTitle;
 const poster=a.posterImage.original||a.posterImage.large||a.posterImage.medium||a.posterImage.small;
 if(!title||!poster)return null;
 return {title,url:poster,type:"cover",difficulty:1,label:"Anime cover",sourceUrl:"https://kitsu.io/anime/"+item.id};
}
async function fetchRandomKitsuAnime(){
 const batch=await fetchKitsuAnimeBatch();
 const entry=batch[Math.floor(Math.random()*batch.length)];
 if(!entry)throw new Error("Kitsu returned no usable anime cover images");
 return entry;
}

// These are anime/copyright tags used by Safebooru, not answer text from the image host.
const easyAnimeTags=[
 {title:"Naruto",tag:"naruto"},
 {title:"One Piece",tag:"one_piece"},
 {title:"Bleach",tag:"bleach"},
 {title:"Dragon Ball Z",tag:"dragon_ball_z"},
 {title:"Death Note",tag:"death_note"},
 {title:"Attack on Titan",tag:"shingeki_no_kyojin"},
 {title:"Fullmetal Alchemist: Brotherhood",tag:"fullmetal_alchemist"},
 {title:"Demon Slayer",tag:"kimetsu_no_yaiba"},
 {title:"Jujutsu Kaisen",tag:"jujutsu_kaisen"},
 {title:"My Hero Academia",tag:"boku_no_hero_academia"},
 {title:"Hunter x Hunter",tag:"hunter_x_hunter"},
 {title:"Neon Genesis Evangelion",tag:"neon_genesis_evangelion"}
];
async function fetchRandomSafebooruEasyImage(kind){
 const candidates=shuffle(easyAnimeTags);
 for(const candidate of candidates){
  const tags=[candidate.tag,"rating:g",kind==="character"?"solo":""]; 
  const endpoint="https://safebooru.donmai.us/posts.json?limit=100&tags="+encodeURIComponent(tags.filter(Boolean).join(" "));
  const response=await fetch(endpoint,{headers:{Accept:"application/json"}});
  if(!response.ok)continue;
  const posts=await response.json();
  const usable=(Array.isArray(posts)?posts:[]).filter(post=>{
   if(post.rating!=="g"||!post.file_url||! /\.(jpg|jpeg|png|webp)(\?|$)/i.test(post.file_url))return false;
   if((post.image_width||0)<250||(post.image_height||0)<250)return false;
   // Character questions require a tagged character; fan-art images require an artist tag. The fanart search tag is intentionally omitted because it excludes otherwise valid fan-made images.
   if(kind==="character"&&(Number(post.tag_count_character)||0)<1)return false;
   if(kind==="fanart"&&(Number(post.tag_count_artist)||0)<1)return false;
   return true;
  });
  if(!usable.length)continue;
  const post=usable[Math.floor(Math.random()*usable.length)];
  return {title:candidate.title,url:post.large_file_url||post.file_url,type:kind,difficulty:1,label:kind==="character"?"Anime character":"Anime fan art",sourceUrl:"https://safebooru.donmai.us/posts/"+post.id};
 }
 throw new Error("Safebooru did not return a suitable general-rated "+(kind==="character"?"character image":"fan-art image")+". Try another clue.");
}
async function fetchRandomEasyImage(eventId="random"){
 const eventKinds={"anime-cover":"cover","anime-character":"character","anime-fanart":"fanart"};
 const kind=eventKinds[eventId]||(["cover","character","fanart"][Math.floor(Math.random()*3)]);
 if(kind==="cover")return fetchRandomKitsuAnime();
 return fetchRandomSafebooruEasyImage(kind);
}


async function invokeMangaFunction(body){
 if(typeof mpClient==="undefined"||!mpClient)throw new Error("Connect to an online room before requesting MangaDex data.");
 const {data,error}=await mpClient.functions.invoke(
  (window.ANIME_PARTY_SUPABASE&&window.ANIME_PARTY_SUPABASE.mangaFunction)||"mangadex-medium",
  {body}
 );
 if(error){
  let detail=error.message||String(error);
  try{
   const context=error.context;
   if(context&&typeof context.clone==="function"){
    const response=context.clone();let payload=null;
    try{payload=await response.json()}catch(_){}
    if(payload&&payload.error)detail=payload.error;
    else if(payload&&payload.message)detail=payload.message;
    else if(payload&&payload.msg)detail=payload.msg;
    else if(response.status)detail+=" (HTTP "+response.status+")";
   }
  }catch(_){}
  throw new Error(detail);
 }
 if(!data||data.error)throw new Error(data&&data.error?data.error:"MangaDex returned an empty response.");
 return data;
}
async function searchMangaDexAuthors(query){
 const data=await invokeMangaFunction({action:"search-authors",query:String(query||"").trim()});
 return Array.isArray(data.authors)?data.authors.filter(a=>a&&a.id&&a.name):[];
}
async function fetchRandomMangaPanel(authorNames=[],authorIds=[]){
 const data=await invokeMangaFunction({
  action:"random-panel",
  authors:Array.isArray(authorNames)?authorNames:[],
  authorIds:Array.isArray(authorIds)?authorIds:[]
 });
 if(!data.entry||!data.entry.url||!data.entry.title||!Array.isArray(data.options)||data.options.length!==4){
  throw new Error("Manga source returned incomplete question data.");
 }
 return {...data.entry,options:data.options};
}
