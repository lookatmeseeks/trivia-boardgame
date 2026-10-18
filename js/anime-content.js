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
const starterImagePool=[
 {title:"Attack on Titan",url:"https://myanimelist.net/images/anime/10/47347.jpg",type:"cover",difficulty:1,label:"Anime cover"},
 {title:"Death Note",url:"https://myanimelist.net/images/anime/1079/138100.jpg",type:"cover",difficulty:1,label:"Anime cover"},
 {title:"Fullmetal Alchemist: Brotherhood",url:"https://myanimelist.net/images/anime/1208/94745.jpg",type:"cover",difficulty:1,label:"Anime cover"},
 {title:"One Punch Man",url:"https://myanimelist.net/images/anime/12/76049.jpg",type:"cover",difficulty:1,label:"Anime cover"},
 {title:"Demon Slayer",url:"https://myanimelist.net/images/anime/1286/99889.jpg",type:"cover",difficulty:1,label:"Anime cover"},
 {title:"Code Geass",url:"https://cdn.myanimelist.net/images/characters/8/406163.jpg",type:"character",difficulty:1,label:"Character portrait"},
 {title:"One Piece",url:"https://cdn.myanimelist.net/images/characters/9/310307.jpg",type:"character",difficulty:1,label:"Character portrait"},
 {title:"Attack on Titan",url:"https://cdn.myanimelist.net/images/characters/2/241413.jpg",type:"character",difficulty:1,label:"Character portrait"},
 {title:"Death Note",url:"https://cdn.myanimelist.net/images/characters/10/249647.jpg",type:"character",difficulty:1,label:"Character portrait"},
 {title:"One Piece",url:"https://cdn.myanimelist.net/images/characters/3/100534.jpg",type:"character",difficulty:1,label:"Character portrait"}
];
const sceneSearchTitles=[
 {title:"Naruto",tag:"naruto",type:"attack",tagHint:"battle"},
 {title:"One Piece",tag:"one_piece",type:"location",tagHint:"scenery"},
 {title:"Bleach",tag:"bleach",type:"attack",tagHint:"battle"},
 {title:"Dragon Ball Z",tag:"dragon_ball_z",type:"attack",tagHint:"battle"},
 {title:"Attack on Titan",tag:"shingeki_no_kyojin",type:"location",tagHint:"scenery"},
 {title:"Demon Slayer",tag:"kimetsu_no_yaiba",type:"attack",tagHint:"battle"},
 {title:"Jujutsu Kaisen",tag:"jujutsu_kaisen",type:"attack",tagHint:"battle"},
 {title:"My Hero Academia",tag:"boku_no_hero_academia",type:"attack",tagHint:"battle"},
 {title:"Hunter x Hunter",tag:"hunter_x_hunter",type:"attack",tagHint:"battle"},
 {title:"Neon Genesis Evangelion",tag:"neon_genesis_evangelion",type:"location",tagHint:"scenery"},
 {title:"Cowboy Bebop",tag:"cowboy_bebop",type:"location",tagHint:"scenery"},
 {title:"Made in Abyss",tag:"made_in_abyss",type:"location",tagHint:"scenery"}
];
async function findSceneImage(mode="random"){
 const candidatePool=sceneSearchTitles;
 const candidates=mode==="location"?candidatePool.filter(x=>x.type==="location"):mode==="attack"?candidatePool.filter(x=>x.type==="attack"):candidatePool;
 const candidate=candidates[Math.floor(Math.random()*candidates.length)];
 const tags=encodeURIComponent(candidate.tag+" "+candidate.tagHint+" rating:g");
 const endpoint="https://safebooru.donmai.us/posts.json?limit=100&tags="+tags;
 const response=await fetch(endpoint,{headers:{"Accept":"application/json"}});
 if(!response.ok)throw new Error("Scene image search returned HTTP "+response.status);
 const posts=await response.json();
 const usable=posts.filter(p=>p.rating==="g"&&p.file_url&&/\.(jpg|jpeg|png|webp)(\?|$)/i.test(p.file_url)&&p.image_width>=300&&p.image_height>=200);
 if(!usable.length)throw new Error("No general-rated scene images were returned");
 const post=usable[Math.floor(Math.random()*usable.length)];
 return {title:candidate.title,url:post.large_file_url||post.file_url,type:candidate.type,difficulty:3,label:candidate.type==="attack"?"Battle / attack scene":"Location / scenery",sourceUrl:"https://safebooru.donmai.us/posts/"+post.id};
}
