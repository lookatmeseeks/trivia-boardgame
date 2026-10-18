async function startTriviaChallenge(mode=document.querySelector("#challenge-mode")?.value||"random"){
 const overlay=document.querySelector("#challenge-overlay"),media=document.querySelector("#challenge-media"),answers=document.querySelector("#challenge-answers"),msg=document.querySelector("#challenge-status"),source=document.querySelector("#challenge-source"),next=document.querySelector("#challenge-next");
 overlay.style.display="flex";media.innerHTML='<div class="note">Choosing a clue image…</div>';answers.innerHTML="";msg.textContent="Choosing an image and clue type.";source.textContent="";next.style.display="none";next.textContent="Search another image";challengeBusy=true;challengeResolved=false;challengeAnswer="";lastAnimeBatch=[];
 let entry;
 try{
  // Explicit tests never silently fall back to easy images: this lets the user
  // see whether the selected scene category is actually working.
  if(mode==="easy"){
   entry=await fetchRandomKitsuAnime();
  }else if(mode==="location"||mode==="attack"){
   entry=await findSceneImage(mode);
  }else{
   try{entry=Math.random()<0.5?await findSceneImage("random"):await fetchRandomKitsuAnime()}
   catch(sceneError){entry=await fetchRandomKitsuAnime();}
  }
  challengeAnswer=entry.title;
  const img=document.createElement("img");img.alt=entry.label;img.src=entry.url;
  img.onload=()=>{media.replaceChildren(img)};
  img.onerror=()=>{
   media.innerHTML='<div class="note">This image failed to load. Try another clue.</div>';
   answers.innerHTML="";msg.textContent="The selected image URL could not be loaded by the browser.";
   next.textContent="Try again";next.style.display="block";challengeBusy=false;
  };
  const wrong=shuffle(allAnimeTitles().filter(title=>title.toLowerCase()!==entry.title.toLowerCase())).slice(0,3);
  const options=shuffle([entry.title,...wrong]);
  if(typeof mpRoomId!=="undefined"&&mpRoomId){await mpStartSharedTrivia(entry,options);return;}
  answers.innerHTML="";
  options.forEach(title=>{const button=document.createElement("button");button.textContent=title;button.onclick=()=>resolveTriviaAnswer(title,button);answers.appendChild(button)});
  const typeNames={cover:"Cover",character:"Character",location:"Location / scenery",attack:"Attack / battle scene"};
  const difficultyNames={1:"Easy",2:"Medium",3:"Hard"};
  document.querySelector("#challenge-title").textContent="Which anime is this from?";
  document.querySelector("#challenge-instructions").textContent=typeNames[entry.type]+" clue · "+difficultyNames[entry.difficulty];
  msg.textContent="Identify the anime from the image.";
  source.innerHTML="Clue: "+entry.label+". Source: "+(entry.sourceUrl||"Safebooru")+(entry.sourceUrl&&entry.type!=="cover"&&entry.type!=="character"?' · <a href="'+entry.sourceUrl+'" target="_blank" rel="noopener" style="color:#66e3ef">View source post</a>':"");
  challengeBusy=false;
 }catch(error){
  media.innerHTML='<div class="note">No image loaded.</div>';msg.textContent="Image search failed: "+(error.message||"Network request failed")+". Try again.";next.textContent="Try again";next.style.display="block";challengeBusy=false;
 }
}
async function resolveTriviaAnswer(selected,button){
 if(challengeBusy||challengeResolved)return;
 if(typeof mpRoomId!=="undefined"&&mpRoomId){
  if(mpTriviaAnswered())return;
  challengeBusy=true;document.querySelectorAll("#challenge-answers button").forEach(b=>b.disabled=true);
  try{await mpSubmitTriviaAnswer(selected)}catch(error){document.querySelector("#challenge-status").textContent="Answer could not be submitted: "+(error.message||error);}
  finally{challengeBusy=false;}
  return;
 }
 if((typeof mpCanAct==="function"&&!mpCanAct()))return;
 challengeResolved=true;document.querySelectorAll("#challenge-answers button").forEach(b=>b.disabled=true);
 const msg=document.querySelector("#challenge-status"),next=document.querySelector("#challenge-next");
 if(selected===challengeAnswer){players[current].score+=2;msg.textContent="Correct! "+challengeAnswer+" · +2 points."}
 else{msg.textContent="Incorrect. The intended answer was "+challengeAnswer+". No points awarded."}
 updateUI();next.textContent="Continue turn";next.style.display="block";document.querySelector("#challenge-source").textContent+=" · Answer: "+challengeAnswer;
}
document.querySelector("#challenge-test").addEventListener("click",()=>{if(typeof mpRoomId!=="undefined"&&mpRoomId)return;startTriviaChallenge(document.querySelector("#challenge-mode").value)});
document.querySelector("#challenge-next").addEventListener("click",()=>{
 if(typeof mpRoomId!=="undefined"&&mpRoomId){
  if(!mpChallenge||mpChallenge.status!=="resolved"||!mpCanAct())return;
  document.querySelector("#challenge-overlay").style.display="none";mpChallenge=null;challengeResolved=true;finishTurn();return;
 }
 if(!challengeResolved){startTriviaChallenge();return}
 document.querySelector("#challenge-overlay").style.display="none";challengeResolved=true;finishTurn();
});
function mpRenderSharedChallenge(challenge){
 const overlay=document.querySelector("#challenge-overlay"),media=document.querySelector("#challenge-media"),answers=document.querySelector("#challenge-answers"),msg=document.querySelector("#challenge-status"),source=document.querySelector("#challenge-source"),next=document.querySelector("#challenge-next");
 if(!challenge){overlay.style.display="none";return}
 overlay.style.display="flex";
 document.querySelector("#challenge-title").textContent="Which anime is this from?";
 const typeNames={cover:"Cover",character:"Character",location:"Location / scenery",attack:"Attack / battle scene"};
 const difficultyNames={1:"Easy",2:"Medium",3:"Hard"};
 document.querySelector("#challenge-instructions").textContent=(typeNames[challenge.type]||"Anime clue")+" clue · "+(difficultyNames[challenge.difficulty]||"Unknown difficulty");
 if(media.dataset.imageUrl!==challenge.imageUrl){media.dataset.imageUrl=challenge.imageUrl;media.innerHTML="";const img=document.createElement("img");img.alt=challenge.imageLabel||"Anime clue";img.src=challenge.imageUrl;img.onerror=()=>{media.textContent="The clue image could not be loaded."};media.appendChild(img)}
 answers.innerHTML="";
 const alreadyAnswered=typeof mpTriviaAnswered==="function"&&mpTriviaAnswered();
 const resolved=challenge.status==="resolved";
 (challenge.options||[]).forEach(option=>{const button=document.createElement("button");button.textContent=option;button.disabled=alreadyAnswered||resolved||challengeBusy;button.onclick=()=>resolveTriviaAnswer(option,button);answers.appendChild(button)});
 if(resolved){
  if(challenge.winnerUserId)msg.textContent=challenge.winnerName+" answered correctly first! +2 points. Answer: "+challenge.correctAnswer;
  else msg.textContent="Nobody answered correctly. The answer was "+challenge.correctAnswer+".";
  next.textContent="Continue turn";next.style.display=mpCanAct()?"block":"none";next.disabled=!mpCanAct();
 }else{
  const count=(challenge.answeredUserIds||[]).length;
  if(alreadyAnswered)msg.textContent="Your answer is locked in. Waiting for another player to answer correctly. ("+count+"/"+players.length+" answered)";
  else msg.textContent="Choose one answer. You only get one attempt. ("+count+"/"+players.length+" answered)";
  next.style.display="none";
 }
 source.textContent=challenge.imageLabel||"Anime clue";
 if(challenge.sourceUrl){const link=document.createElement("a");link.href=challenge.sourceUrl;link.target="_blank";link.rel="noopener";link.textContent=" View source";link.style.color="#66e3ef";source.appendChild(link)}
}
