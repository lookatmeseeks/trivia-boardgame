async function startTriviaChallenge(mode=document.querySelector("#challenge-mode")?.value||"random"){
 const overlay=document.querySelector("#challenge-overlay"),media=document.querySelector("#challenge-media"),answers=document.querySelector("#challenge-answers"),msg=document.querySelector("#challenge-status"),source=document.querySelector("#challenge-source"),next=document.querySelector("#challenge-next");
 overlay.style.display="flex";media.innerHTML='<div class="note">Choosing a clue image…</div>';answers.innerHTML="";msg.textContent="Choosing an image and clue type.";source.textContent="";next.style.display="none";next.textContent="Search another image";challengeBusy=true;challengeResolved=false;challengeAnswer="";lastAnimeBatch=[];
 let entry;
 try{
  if(mode==="soundtrack-clip"||mode==="opening-clip"){
   entry=await fetchRandomYoutubeMedia(mode);
  }else if(mode==="easy"||mode==="random"||["anime-cover","anime-character","anime-fanart"].includes(mode)){
   entry=await fetchRandomEasyImage(mode);
  }else if(mode==="medium"||mode==="manga-panel"){
   entry=await fetchRandomMangaPanel(typeof getMediumAuthors==="function"?getMediumAuthors():[],typeof getMediumAuthorIds==="function"?getMediumAuthorIds():[]);
  }else{
   throw new Error("This event does not have a question provider implemented yet.");
  }
  challengeAnswer=entry.title;
  if(entry.videoId){media.innerHTML='<div class="note">Loading YouTube clip…</div>'}else{
   const img=document.createElement("img");img.alt=entry.label;img.src=entry.url;
   img.onload=()=>{media.replaceChildren(img)};
   img.onerror=()=>{
    media.innerHTML='<div class="note">This image failed to load. Try another clue.</div>';
    answers.innerHTML="";msg.textContent="The selected image URL could not be loaded by the browser.";
    next.textContent="Try again";next.style.display="block";challengeBusy=false;
   };
  }
  const normalizeAnswer=value=>String(value||"").toLocaleLowerCase().replace(/[^a-z0-9]/g,"");
  const normalizedCorrect=normalizeAnswer(entry.title);
  const wrong=shuffle(allAnimeTitles().filter(title=>normalizeAnswer(title)!==normalizedCorrect)).slice(0,3);
  const options=Array.isArray(entry.options)&&entry.options.length===4?entry.options:shuffle([entry.title,...wrong]);
  if(typeof mpRoomId==="undefined"||!mpRoomId)throw new Error("Create or join an online room before starting a question.");
  challengeBusy=false;
  await mpStartSharedTrivia(entry,options);
  return;
  const typeNames={cover:"Anime cover",character:"Anime character",fanart:"Anime fan art","manga-panel":"Manga panel","soundtrack-clip":"Soundtrack clip (audio only)","opening-clip":"Opening clip (audio + video)"};
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
 document.querySelector("#challenge-title").textContent=challenge.type==="manga-panel"?"Which manga is this panel from?":challenge.type==="soundtrack-clip"?"Which anime is this soundtrack from?":challenge.type==="opening-clip"?"Which anime is this opening from?":"Which anime is this from?";
 const typeNames={cover:"Anime cover",character:"Anime character",fanart:"Anime fan art","manga-panel":"Manga panel","soundtrack-clip":"Soundtrack clip (audio only)","opening-clip":"Opening clip (audio + video)"};
 document.querySelector("#challenge-instructions").textContent=(typeNames[challenge.type]||"Anime clue")+" event";
 if(challenge.mediaType==="youtube"&&challenge.videoId){
  const mediaKey=challenge.videoId+"|"+challenge.startSeconds+"|"+challenge.clipEndsAt;
  if(media.dataset.mediaKey!==mediaKey){
   media.dataset.mediaKey=mediaKey;media.dataset.imageUrl="";media.innerHTML="";
   const wrap=document.createElement("div");wrap.className="youtube-player-wrap";
   const iframe=document.createElement("iframe");iframe.id="challenge-youtube-player";iframe.title=challenge.type==="soundtrack-clip"?"Censored soundtrack audio player":"Anime opening video";
   const start=Math.max(0,Number(challenge.startSeconds)||0),end=start+Math.max(1,Number(challenge.durationSeconds)||15);
   const params=new URLSearchParams({autoplay:"1",controls:challenge.type==="soundtrack-clip"?"0":"1",start:String(start),end:String(end),playsinline:"1",rel:"0",enablejsapi:"1",origin:window.location.origin});
   iframe.src="https://www.youtube-nocookie.com/embed/"+encodeURIComponent(challenge.videoId)+"?"+params.toString();
   iframe.allow="autoplay; encrypted-media; picture-in-picture";iframe.allowFullscreen=true;iframe.referrerPolicy="strict-origin-when-cross-origin";
   wrap.append(iframe);
   if(challenge.type==="soundtrack-clip"){
    const censor=document.createElement("div");censor.className="youtube-censor";
    const startButton=document.createElement("button");startButton.type="button";startButton.textContent="Start soundtrack";startButton.addEventListener("click",()=>{try{iframe.contentWindow.postMessage(JSON.stringify({event:"command",func:"playVideo",args:""}),"https://www.youtube-nocookie.com");startButton.textContent="Soundtrack playing";startButton.disabled=true}catch(_){}});
    censor.append(startButton);wrap.append(censor);
   }
   media.append(wrap);
  }
  const timer=document.querySelector("#challenge-media-timer");
  if(timer)timer.textContent="Clip length: 15 seconds.";
  if(!window.__animePartyMediaTimer){
   window.__animePartyMediaTimer=window.setInterval(()=>{
    const active=typeof mpChallenge!=="undefined"?mpChallenge:null;
    const timerEl=document.querySelector("#challenge-media-timer");
    if(!active||active.mediaType!=="youtube"||!active.clipEndsAt){if(timerEl)timerEl.textContent="";return}
    const left=Math.max(0,Math.ceil((active.clipEndsAt-Date.now())/1000));
    if(timerEl)timerEl.textContent=left>0?"Clip ends in "+left+" second"+(left===1?"":"s")+".":"Clip ended.";
    if(left===0){const player=document.querySelector("#challenge-youtube-player");if(player&&player.src!=="about:blank"){player.src="about:blank";const censor=document.querySelector(".youtube-censor");if(censor)censor.remove()}}
   },250);
  }
 }else if(media.dataset.imageUrl!==challenge.imageUrl){media.dataset.mediaKey="";media.dataset.imageUrl=challenge.imageUrl;media.innerHTML="";const img=document.createElement("img");img.alt=challenge.imageLabel||"Anime clue";img.src=challenge.imageUrl;img.onerror=()=>{media.textContent="The clue image could not be loaded."};media.appendChild(img)}
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
 source.textContent=(challenge.imageLabel||"Anime clue")+(challenge.sourceCredit?" · Scanlation group: "+challenge.sourceCredit:"");
 if(challenge.sourceUrl){const link=document.createElement("a");link.href=challenge.sourceUrl;link.target="_blank";link.rel="noopener";link.textContent=" View source";link.style.color="#66e3ef";source.appendChild(link)}
}
