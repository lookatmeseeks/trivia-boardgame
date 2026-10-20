async function startTriviaChallenge(mode=document.querySelector("#challenge-mode")?.value||"random",preset=null){
 const overlay=document.querySelector("#challenge-overlay"),media=document.querySelector("#challenge-media"),answers=document.querySelector("#challenge-answers"),msg=document.querySelector("#challenge-status"),source=document.querySelector("#challenge-source"),next=document.querySelector("#challenge-next");
 overlay.style.display="flex";media.innerHTML='<div class="note">Choosing a clue image…</div>';answers.innerHTML="";msg.textContent="Choosing an image and clue type.";source.textContent="";next.style.display="none";next.textContent="Search another image";challengeBusy=true;challengeResolved=false;challengeAnswer="";lastAnimeBatch=[];
 let entry;
 try{
  if(mode==="media-library"){
   if(typeof mediaLibraryRefresh!=="function")throw new Error("The shared media library is not loaded.");
   await mediaLibraryRefresh();
   const mediaMode=preset?.mediaMode==="audio"?"audio":"video";
   const wantedType=mediaMode==="audio"?"audio":"video";
   const candidates=mediaLibraryItems.filter(item=>item.media_type===wantedType);
   if(!candidates.length)throw new Error("The global library has no "+wantedType+" items. Upload one first.");
   const item=candidates[Math.floor(Math.random()*candidates.length)];
   const mediaUrl=mediaLibraryPublicUrl(item.storage_path);
   entry={title:item.answer,label:item.title,url:mediaUrl,mediaUrl,mediaType:item.media_type,mediaMode,durationSeconds:Math.max(3,Math.min(60,Number(preset?.clipDuration)||15)),answerSeconds:Math.max(10,Math.min(180,Number(preset?.answerSeconds)||30)),scoringNotes:typeof preset?.scoringNotes==="string"?preset.scoringNotes:"",type:"media-library",options:[]};
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
document.querySelector("#challenge-stop").addEventListener("click",stopTriviaChallenge);
function stopTriviaChallenge(){
 if(!mpRoomId||(!mpCanAct()&&!mpIsHost))return;
 if(challengeTimerInterval){clearInterval(challengeTimerInterval);challengeTimerInterval=null}
 challengeBusy=false;challengeResolved=true;mpChallenge=null;
 document.querySelector("#challenge-overlay").style.display="none";
 finishTurn();
 if(typeof mpStateChanged==="function")mpStateChanged();
}
document.querySelector("#challenge-next").addEventListener("click",()=>{
 if(!mpRoomId||!mpChallenge||mpChallenge.status!=="resolved"||(!mpCanAct()&&!mpIsHost))return;
 if(challengeTimerInterval){clearInterval(challengeTimerInterval);challengeTimerInterval=null}
 document.querySelector("#challenge-overlay").style.display="none";mpChallenge=null;challengeResolved=true;finishTurn();if(typeof mpStateChanged==="function")mpStateChanged();
});
document.querySelector("#challenge-answer-submit").addEventListener("click",async()=>{
 const input=document.querySelector("#challenge-answer-input"),button=document.querySelector("#challenge-answer-submit"),answer=input.value.trim();
 if(!answer){document.querySelector("#challenge-status").textContent="Write an answer before submitting.";return}
 if(!mpChallenge||mpChallenge.type!=="media-library"||mpChallenge.status!=="open"||mpTriviaAnswered())return;
 button.disabled=true;input.disabled=true;
 try{await mpSubmitTriviaAnswer(answer);input.value="";document.querySelector("#challenge-status").textContent="Answer submitted. It will be revealed when the timer ends."}
 catch(error){button.disabled=false;input.disabled=false;document.querySelector("#challenge-status").textContent="Answer could not be submitted: "+(error.message||error)}
});
let challengeTimerInterval=null,challengeResolveRequested=false;
function mpRenderSharedChallenge(challenge){
 const overlay=document.querySelector("#challenge-overlay"),media=document.querySelector("#challenge-media"),answers=document.querySelector("#challenge-answers"),msg=document.querySelector("#challenge-status"),source=document.querySelector("#challenge-source"),next=document.querySelector("#challenge-next");
 if(!challenge){overlay.style.display="none";if(challengeTimerInterval){clearInterval(challengeTimerInterval);challengeTimerInterval=null}challengeResolveRequested=false;return}
 overlay.style.display="flex";
 document.querySelector("#challenge-title").textContent=challenge.type==="media-library"?"Media event":challenge.type==="manga-panel"?"Which manga is this panel from?":"Which anime is this from?";
 const typeNames={cover:"Anime cover",character:"Anime character",fanart:"Anime fan art","manga-panel":"Manga panel"};
 document.querySelector("#challenge-instructions").textContent=challenge.type==="media-library"?(challenge.scoringNotes||"Watch or listen to the clip. The host judges answers manually; no automatic answer matching."):(typeNames[challenge.type]||"Anime clue")+" event";
 if(challenge.type==="media-library"){
  const mediaKey=challenge.mediaUrl+":"+String(challenge.startedAt||"");
  if(media.dataset.mediaKey!==mediaKey){
   media.dataset.mediaKey=mediaKey;media.dataset.mediaUrl=challenge.mediaUrl;media.dataset.imageUrl="";media.innerHTML="";challengeResolveRequested=false;
   const player=document.createElement(challenge.mediaMode==="audio"?"audio":"video");
   player.src=challenge.mediaUrl;player.controls=false;player.preload="auto";player.playsInline=true;
   player.style.cssText="width:100%;max-height:360px;object-fit:contain;background:#000"+(challenge.mediaMode==="audio"?"":";visibility:hidden");
   player.addEventListener("canplay",()=>{
    const duration=Math.max(3,Math.min(60,Number(challenge.durationSeconds)||15));
    const elapsed=Math.max(0,(Date.now()-(Number(challenge.startedAt)||Date.now()))/1000);
    if(elapsed>=duration){msg.textContent="Clip ended. Submit your answer before time runs out.";return}
    // Derive the same segment offset on every client from the shared media URL and event start time.
    // This avoids needing a separate metadata lookup while keeping playback aligned across players.
    let seed=0;
    const seedText=String(challenge.mediaUrl)+":"+String(challenge.startedAt||"");
    for(let i=0;i<seedText.length;i++)seed=(Math.imul(seed,31)+seedText.charCodeAt(i))>>>0;
    const maxStart=Math.max(0,player.duration-duration);
    const segmentStart=maxStart>0?(seed/4294967295)*maxStart:0;
    const playhead=Math.min(segmentStart+elapsed,Math.max(0,player.duration-0.1));
    try{player.currentTime=playhead}catch{}
    player.play().then(()=>{player.style.visibility="visible"}).catch(()=>{msg.textContent="Your browser blocked autoplay. Use the play control to hear or watch the clip.";player.controls=true;player.style.visibility="visible"});
    setTimeout(()=>{try{player.pause();if(challenge.mediaMode==="video")player.style.visibility="hidden"}catch{}},Math.max(0,duration-elapsed)*1000);
   },{once:true});
   media.appendChild(player);
  }
 }else if(media.dataset.imageUrl!==challenge.imageUrl){media.dataset.imageUrl=challenge.imageUrl;media.dataset.mediaUrl="";media.innerHTML="";const img=document.createElement("img");img.alt=challenge.imageLabel||"Anime clue";img.src=challenge.imageUrl;img.onerror=()=>{media.textContent="The clue image could not be loaded."};media.appendChild(img)}
 answers.innerHTML="";
 const stopButton=document.querySelector("#challenge-stop");
 stopButton.style.display=(!mpRoomId||mpCanAct()||mpIsHost)?"block":"none";
 const alreadyAnswered=typeof mpTriviaAnswered==="function"&&mpTriviaAnswered();
 const resolved=challenge.status==="resolved";
 const answerEntry=document.querySelector("#challenge-answer-entry");
 const answerInput=document.querySelector("#challenge-answer-input");
 const answerSubmit=document.querySelector("#challenge-answer-submit");
 const timer=document.querySelector("#challenge-timer");
 if(challenge.type==="media-library"){
  answerEntry.style.display=resolved?"none":"block";
  timer.style.display="block";
  answerInput.disabled=alreadyAnswered||resolved;
  answerSubmit.disabled=alreadyAnswered||resolved||challengeBusy;
  if(alreadyAnswered)answerInput.value="";
  if(challengeTimerInterval){clearInterval(challengeTimerInterval);challengeTimerInterval=null}
  const updateTimer=()=>{
   const seconds=Math.max(0,Math.ceil((Number(challenge.answerDeadline||0)-Date.now())/1000));
   timer.textContent=resolved?"Answer time ended":seconds+" second"+(seconds===1?"":"s")+" remaining";
   if(seconds<=0&&!resolved&&!challengeResolveRequested){
    challengeResolveRequested=true;
    mpResolveTriviaAnswers().catch(error=>{challengeResolveRequested=false;msg.textContent="Could not reveal answers: "+(error.message||error)});
   }
  };
  updateTimer();
  if(!resolved)challengeTimerInterval=setInterval(updateTimer,250);
  if(resolved){
   answers.classList.add("revealed");
   const entries=Object.entries(challenge.answers||{});
   if(!entries.length){const empty=document.createElement("div");empty.className="note";empty.textContent="No answers were submitted.";answers.append(empty)}
   entries.forEach(([userId,answer])=>{
    const row=document.createElement("div");row.className="answer-reveal-row";
    const detail=document.createElement("div");
    const player=players.find(p=>p.userId===userId);
    const name=document.createElement("strong");name.textContent=player?.name||answer.playerName||"Player";
    const text=document.createElement("div");text.className="answer-reveal-text";text.textContent=answer.text||"(blank)";
    const awarded=Number(challenge.awardedPoints?.[userId]||0);
    const score=document.createElement("div");score.className="note";score.textContent="Points awarded: "+awarded;
    detail.append(name,text,score);row.append(detail);
    if(mpIsHost){
     const controls=document.createElement("div");controls.className="answer-award-controls";
     const select=document.createElement("select");select.setAttribute("aria-label","Points for "+name.textContent);
     for(let points=0;points<=10;points++){const option=document.createElement("option");option.value=String(points);option.textContent=String(points)+" pt"+(points===1?"":"s");select.append(option)}
     select.value=String(awarded);
     const award=document.createElement("button");award.type="button";award.className="secondary";award.style.width="auto";award.textContent="Set points";
     award.onclick=async()=>{award.disabled=true;try{await mpAwardTriviaPoints(userId,Number(select.value))}catch(error){msg.textContent="Could not update points: "+(error.message||error)}finally{award.disabled=false}};
     controls.append(select,award);row.append(controls);
    }
    answers.append(row);
   });
   const correct=document.createElement("div");correct.className="note";correct.textContent="Correct answer: "+(challenge.correctAnswer||"Unknown");answers.append(correct);
   msg.textContent="Time is up. Review the submitted answers and award points.";
   next.textContent="Continue turn";next.style.display=(mpCanAct()||mpIsHost)?"block":"none";next.disabled=!(mpCanAct()||mpIsHost);
  }else{
   answers.classList.remove("revealed");
   const count=(challenge.answeredUserIds||[]).length;
   msg.textContent=alreadyAnswered?"Your answer is submitted. Waiting for the timer. ("+count+"/"+players.length+" submitted)":"Write an answer before time runs out. ("+count+"/"+players.length+" submitted)";
   next.style.display="none";
  }
 }else{
  answerEntry.style.display="none";timer.style.display="none";
  (challenge.options||[]).forEach(option=>{const button=document.createElement("button");button.textContent=option;button.disabled=alreadyAnswered||resolved||challengeBusy;button.onclick=()=>resolveTriviaAnswer(option,button);answers.appendChild(button)});
  if(resolved){
   msg.textContent=challenge.winnerName?challenge.winnerName+" answered correctly first and earns 2 points. Answer: "+challenge.correctAnswer+".":"Nobody answered correctly. The answer was "+challenge.correctAnswer+".";
   next.textContent="Continue turn";next.style.display=(mpCanAct()||mpIsHost)?"block":"none";next.disabled=!(mpCanAct()||mpIsHost);
  }else{
   const count=(challenge.answeredUserIds||[]).length;
   msg.textContent=alreadyAnswered?"Your answer is locked in. Waiting for another player. ("+count+"/"+players.length+" answered)":"Choose one answer. The first correct answer ends the question. ("+count+"/"+players.length+" answered)";
   next.style.display="none";
  }
 }
 source.textContent=challenge.type==="media-library"?"No thumbnail is shown. The clip is played directly. "+(Number(challenge.durationSeconds)||15)+"-second clip":(challenge.imageLabel||"Anime clue")+(challenge.sourceCredit?" · Scanlation group: "+challenge.sourceCredit:"");
 if(challenge.sourceUrl&&challenge.type!=="media-library"){const link=document.createElement("a");link.href=challenge.sourceUrl;link.target="_blank";link.rel="noopener";link.textContent=" View source";link.style.color="#66e3ef";source.appendChild(link)}
}
