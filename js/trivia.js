async function startTriviaChallenge(mode=document.querySelector("#challenge-mode")?.value||"random",preset=null){
 const overlay=document.querySelector("#challenge-overlay"),media=document.querySelector("#challenge-media"),answers=document.querySelector("#challenge-answers"),msg=document.querySelector("#challenge-status"),source=document.querySelector("#challenge-source"),next=document.querySelector("#challenge-next");
 overlay.style.display="flex";media.innerHTML='<div class="note">Choosing a clue image…</div>';answers.innerHTML="";msg.textContent="Choosing an image and clue type.";source.textContent="";next.style.display="none";next.textContent="Search another image";challengeBusy=true;challengeResolved=false;challengeAnswer="";lastAnimeBatch=[];
 let entry;
 try{
  if(mode==="media-library"){
   if(typeof mediaLibraryRefresh!=="function")throw new Error("The shared media library is not loaded.");
   await mediaLibraryRefresh();
   const mediaMode=preset?.mediaMode||"video";
   const wantedType=mediaMode==="audio"?"audio":"video";
   const candidates=mediaLibraryItems.filter(item=>item.media_type===wantedType);
   if(!candidates.length)throw new Error("The global library has no "+wantedType+" items. Upload one first.");
   const item=candidates[Math.floor(Math.random()*candidates.length)];
   const answers=[...new Set(mediaLibraryItems.filter(x=>x.media_type===wantedType).map(x=>x.answer).filter(Boolean))];
   const wrong=shuffle(answers.filter(answer=>answer.toLowerCase()!==item.answer.toLowerCase())).slice(0,3);
   if(wrong.length<3)throw new Error("Add at least four distinct correct answers of this media type to the global library.");
   const mediaUrl=mediaLibraryPublicUrl(item.storage_path);
   entry={title:item.answer,label:item.title,url:mediaUrl,mediaUrl,mediaType:item.media_type,mediaMode,durationSeconds:Math.max(3,Math.min(60,Number(preset?.clipDuration)||15)),type:"media-library",options:shuffle([item.answer,...wrong])};
  }else if(mode==="easy"||mode==="random"||["anime-cover","anime-character","anime-fanart"].includes(mode)){
   entry=await fetchRandomEasyImage(mode);
  }else if(mode==="medium"||mode==="manga-panel"){
   entry=await fetchRandomMangaPanel(typeof getMediumAuthors==="function"?getMediumAuthors():[],typeof getMediumAuthorIds==="function"?getMediumAuthorIds():[]);
  }else{
   throw new Error("This event does not have a question provider implemented yet.");
  }
  challengeAnswer=entry.title;
  if(entry.type==="media-library"){
   if(typeof mpRoomId==="undefined"||!mpRoomId)throw new Error("Create or join an online room before starting a question.");
   challengeBusy=false;
   await mpStartSharedTrivia(entry,entry.options);
   return;
  }
  const img=document.createElement("img");img.alt=entry.label;img.src=entry.url;
  img.onload=()=>{media.replaceChildren(img)};
  img.onerror=()=>{
   media.innerHTML='<div class="note">This image failed to load. Try another clue.</div>';
   answers.innerHTML="";msg.textContent="The selected image URL could not be loaded by the browser.";
   next.textContent="Try again";next.style.display="block";challengeBusy=false;
  };
  const wrong=shuffle(allAnimeTitles().filter(title=>title.toLowerCase()!==entry.title.toLowerCase())).slice(0,3);
  const options=Array.isArray(entry.options)&&entry.options.length===4?entry.options:shuffle([entry.title,...wrong]);
  if(typeof mpRoomId==="undefined"||!mpRoomId)throw new Error("Create or join an online room before starting a question.");
  challengeBusy=false;
  await mpStartSharedTrivia(entry,options);
  return;
  const typeNames={cover:"Anime cover",character:"Anime character",fanart:"Anime fan art","manga-panel":"Manga panel"};
  document.querySelector("#challenge-title").textContent=entry.type==="manga-panel"?"Which manga is this panel from?":"Identify this anime";
  document.querySelector("#challenge-instructions").textContent=(typeNames[entry.type]||"Anime clue")+" event";
  msg.textContent="Each player gets one answer. Pass the device to the next player when prompted.";
  source.innerHTML="Clue: "+entry.label+". Source: "+(entry.sourceUrl||"Safebooru")+(entry.sourceUrl?' · <a href="'+entry.sourceUrl+'" target="_blank" rel="noopener" style="color:#66e3ef">View source</a>':"");
  challengeBusy=false;
 }catch(error){
  challengeBusy=false;
  media.innerHTML='<div class="note">The question could not be started.</div>';
  answers.innerHTML="";
  msg.textContent="Question setup failed: "+(error.message||"Network request failed")+". If this is an image-source error, try again in a moment; if it mentions the room or answer submission, check the multiplayer connection.";
  next.textContent="Try again";next.style.display="block";
 }
}
async function resolveTriviaAnswer(selected,button){
 if(challengeBusy||challengeResolved)return;
 if(typeof mpRoomId==="undefined"||!mpRoomId){document.querySelector("#challenge-status").textContent="Create or join an online room before answering.";return}
 if(mpTriviaAnswered())return;
 challengeBusy=true;document.querySelectorAll("#challenge-answers button").forEach(b=>b.disabled=true);
 try{await mpSubmitTriviaAnswer(selected)}catch(error){document.querySelector("#challenge-status").textContent="Answer could not be submitted: "+(error.message||error);}
 finally{challengeBusy=false;if(mpChallenge&&typeof mpRenderSharedChallenge==="function")mpRenderSharedChallenge(mpChallenge);}
}
document.querySelector("#challenge-test").addEventListener("click",()=>{
 if(!mpRoomId){document.querySelector("#challenge-overlay").style.display="flex";document.querySelector("#challenge-status").textContent="Create or join an online room first.";return}
 if(!mpCanAct()){document.querySelector("#challenge-overlay").style.display="flex";document.querySelector("#challenge-status").textContent="Only the active player can start a synchronized question.";return}
 startTriviaChallenge(document.querySelector("#challenge-mode").value);
});
document.querySelector("#challenge-next").addEventListener("click",()=>{
 if(!mpRoomId||!mpChallenge||mpChallenge.status!=="resolved"||!mpCanAct())return;
 document.querySelector("#challenge-overlay").style.display="none";mpChallenge=null;challengeResolved=true;finishTurn();
});
function mpRenderSharedChallenge(challenge){
 const overlay=document.querySelector("#challenge-overlay"),media=document.querySelector("#challenge-media"),answers=document.querySelector("#challenge-answers"),msg=document.querySelector("#challenge-status"),source=document.querySelector("#challenge-source"),next=document.querySelector("#challenge-next");
 if(!challenge){overlay.style.display="none";return}
 overlay.style.display="flex";
 document.querySelector("#challenge-title").textContent=challenge.type==="media-library"?"Identify this audio or video":challenge.type==="manga-panel"?"Which manga is this panel from?":"Which anime is this from?";
 const typeNames={cover:"Anime cover",character:"Anime character",fanart:"Anime fan art","manga-panel":"Manga panel"};
 document.querySelector("#challenge-instructions").textContent=challenge.type==="media-library"?"Watch or listen to the clip, then choose the correct answer.":(typeNames[challenge.type]||"Anime clue")+" event";
 if(challenge.type==="media-library"){
  const mediaKey=challenge.mediaUrl+":"+String(challenge.startedAt||"");
  if(media.dataset.mediaKey!==mediaKey){
   media.dataset.mediaKey=mediaKey;media.dataset.mediaUrl=challenge.mediaUrl;media.dataset.imageUrl="";media.innerHTML="";
   let player;
   if(challenge.mediaMode==="still"){
    player=document.createElement("video");player.muted=true;player.playsInline=true;player.preload="auto";player.src=challenge.mediaUrl;player.controls=false;player.style.cssText="width:100%;max-height:360px;object-fit:contain";
    player.addEventListener("loadedmetadata",()=>{try{player.currentTime=Math.min(Math.max(0.5,(Number(challenge.durationSeconds)||15)/2),Math.max(0,player.duration-0.1))}catch{}},{once:true});
    player.addEventListener("seeked",()=>player.pause(),{once:true});
   }else{
    player=document.createElement(challenge.mediaMode==="audio"?"audio":"video");player.src=challenge.mediaUrl;player.controls=false;player.preload="auto";player.playsInline=true;player.style.cssText="width:100%;max-height:360px;object-fit:contain";
    player.addEventListener("canplay",()=>{
     const duration=Math.max(3,Math.min(60,Number(challenge.durationSeconds)||15));
     const elapsed=Math.max(0,(Date.now()-(Number(challenge.startedAt)||Date.now()))/1000);
     if(elapsed>=duration){msg.textContent="This clip has ended. Choose an answer.";return}
     try{player.currentTime=Math.min(elapsed,Math.max(0,player.duration-0.1))}catch{}
     player.play().catch(()=>{msg.textContent="Press play on the media player if your browser blocked autoplay."});
     setTimeout(()=>{try{player.pause();if(challenge.mediaMode==="video")player.currentTime=0}catch{}},Math.max(0,duration-elapsed)*1000);
    },{once:true});
   }
   media.appendChild(player);
  }
 }else if(media.dataset.imageUrl!==challenge.imageUrl){media.dataset.imageUrl=challenge.imageUrl;media.dataset.mediaUrl="";media.innerHTML="";const img=document.createElement("img");img.alt=challenge.imageLabel||"Anime clue";img.src=challenge.imageUrl;img.onerror=()=>{media.textContent="The clue image could not be loaded."};media.appendChild(img)}
 answers.innerHTML="";
 const alreadyAnswered=typeof mpTriviaAnswered==="function"&&mpTriviaAnswered();
 const resolved=challenge.status==="resolved";
 (challenge.options||[]).forEach(option=>{const button=document.createElement("button");button.textContent=option;button.disabled=alreadyAnswered||resolved||challengeBusy;button.onclick=()=>resolveTriviaAnswer(option,button);answers.appendChild(button)});
 if(resolved){
  const correctIds=challenge.correctUserIds||[];
  msg.textContent=challenge.winnerName
   ?challenge.winnerName+" answered correctly first and earns 2 points. Answer: "+challenge.correctAnswer+"."
   :"Nobody answered correctly. The answer was "+challenge.correctAnswer+".";
  next.textContent="Continue turn";next.style.display=mpCanAct()?"block":"none";next.disabled=!mpCanAct();
 }else{
  const count=(challenge.answeredUserIds||[]).length;
  if(alreadyAnswered)msg.textContent="Your answer is locked in. Waiting for another player. ("+count+"/"+players.length+" answered)";
  else msg.textContent="Choose one answer. The first correct answer ends the question. ("+count+"/"+players.length+" answered)";
  next.style.display="none";
 }
 source.textContent=(challenge.imageLabel||"Anime clue")+(challenge.type==="media-library"?" · "+(Number(challenge.durationSeconds)||15)+" seconds":"")+(challenge.sourceCredit?" · Scanlation group: "+challenge.sourceCredit:"");
 if(challenge.sourceUrl){const link=document.createElement("a");link.href=challenge.sourceUrl;link.target="_blank";link.rel="noopener";link.textContent=" View source";link.style.color="#66e3ef";source.appendChild(link)}
}
