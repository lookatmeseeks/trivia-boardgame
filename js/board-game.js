let nodes=[],edges=[],adjacency={};
let boardSize=30;
function buildBoardGraph(requestedSize=boardSize){
 boardSize=Math.max(18,Math.min(72,Math.round(Number(requestedSize)||30)));
 // Each loop is a deliberately skewed hexagon. Neighboring loops share actual
 // graph vertices, so junctions are playable tiles rather than visual crossings.
 const loops=[
  [[80,245],[130,165],[245,150],[330,225],[330,300],[235,365]],
  [[330,225],[405,145],[520,165],[600,250],[530,345],[420,355]],
  [[600,250],[675,170],[790,190],[845,275],[770,365],[660,355]]
 ];
 if(boardSize>=24){
  loops.push([[420,355],[490,390],[535,465],[475,525],[375,515],[335,435]]);
 }
 const sharedKeys=new Set(["330,225","600,250"]);
 if(loops.length===4)sharedKeys.add("420,355");
 const sides=[];
 loops.forEach((points,loopIndex)=>{
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length];
   sides.push({loopIndex,sideIndex:i,a,b,length:Math.hypot(b[0]-a[0],b[1]-a[1]),segments:1});
  }
 });
 // A shared vertex occurs in two loop perimeters, so add those duplicates
 // to the subdivision budget to retain exactly the requested unique tile count.
 const sharedCount=sharedKeys.size;
 const targetOccurrences=boardSize+sharedCount;
 let segmentTotal=sides.length;
 while(segmentTotal<targetOccurrences){
  let best=sides[0];
  for(const side of sides){
   if(side.length/side.segments>best.length/best.segments)best=side;
  }
  best.segments++;
  segmentTotal++;
 }
 nodes=[];edges=[];adjacency={};
 const idByPosition=new Map(),loopNodeIds=[];
 const getNode=(x,y,loopIndex)=>{
  const key=Math.round(x*1000)+","+Math.round(y*1000);
  if(idByPosition.has(key))return idByPosition.get(key);
  const id=nodes.length;
  const roundedKey=Math.round(x)+","+Math.round(y);
  nodes.push({id,x,y,label:String(id+1),ring:loopIndex});
  idByPosition.set(key,id);
  return id;
 };
 loops.forEach((points,loopIndex)=>{
  const localIds=[];
  const loopSides=sides.filter(side=>side.loopIndex===loopIndex);
  loopSides.forEach(side=>{
   for(let step=0;step<side.segments;step++){
    const t=step/side.segments;
    localIds.push(getNode(side.a[0]+(side.b[0]-side.a[0])*t,side.a[1]+(side.b[1]-side.a[1])*t,loopIndex));
   }
  });
  for(let i=0;i<localIds.length;i++){
   const a=localIds[i],b=localIds[(i+1)%localIds.length];
   if(a!==b&&!edges.some(e=>(e[0]===a&&e[1]===b)||(e[0]===b&&e[1]===a)))edges.push([a,b]);
  }
  loopNodeIds.push(localIds);
 });
 edges.forEach(([a,b])=>{(adjacency[a]||(adjacency[a]=[])).push(b);(adjacency[b]||(adjacency[b]=[])).push(a)});
 // Place starting spaces around each loop, excluding the shared junctions.
 const starts=[];
 loopNodeIds.forEach(ids=>{
  [0.28,0.72].forEach(fraction=>{
   const target=Math.round((ids.length-1)*fraction);
   for(let offset=0;offset<ids.length;offset++){
    const candidates=[(target+offset)%ids.length,(target-offset+ids.length)%ids.length];
    const found=candidates.map(i=>ids[i]).find(id=>!sharedKeys.has(Math.round(nodes[id].x)+","+Math.round(nodes[id].y)));
    if(found!==undefined){starts.push(found);break}
   }
  });
 });
 const uniqueStarts=[...new Set(starts)];
 nodes.forEach(n=>{if(uniqueStarts.includes(n.id))n.type="start"});
 nodes.sort((a,b)=>a.id-b.id);
 if(nodes.length!==boardSize)console.warn("Board graph tile count mismatch",nodes.length,boardSize);
 return {nodes,edges,adjacency,starts:uniqueStarts};
}
buildBoardGraph(boardSize);
const colors=["#ff5da8","#66e3ef","#ffd166","#a78bfa"];
let players=[],current=0,remaining=0,moving=false,turnStarted=false,gameOver=false,challengeResolved=false,challengeBusy=false,challengeAnswer="";
const svg=document.querySelector("#board"),statusEl=document.querySelector("#status"),choicesEl=document.querySelector("#choices");
let tileTypes={},roundLimit=5,roundsCompleted=0,setupMode=true,mediumAuthors=[],mediumAuthorSelections=[];
let tilePresets=[],editingPresetId=null,presetSequence=1;
const tileEvents=[
 {id:"anime-cover",name:"Anime cover",kind:"question",implemented:true},
 {id:"anime-character",name:"Anime character",kind:"question",implemented:true},
 {id:"anime-fanart",name:"Anime fan art",kind:"question",implemented:true},
 {id:"manga-panel",name:"Manga panel",kind:"question",implemented:true},
 {id:"media-library",name:"Shared media library",kind:"question",implemented:true},
 {id:"soundtrack-clip",name:"Soundtrack clip (audio only)",kind:"question",implemented:false},
 {id:"opening-clip",name:"Opening clip (audio + video)",kind:"question",implemented:false},
 {id:"manga-character",name:"Manga character",kind:"question",implemented:false},
 {id:"anime-cosplay",name:"Anime cosplay",kind:"question",implemented:false},
 {id:"shop",name:"Shop visit",kind:"special",implemented:false},
 {id:"coop-truth-lie",name:"Co-op: Truth or Lie",kind:"special",implemented:false}
];
function getTileEventDefinition(id){return tileEvents.find(event=>event.id===id)||null}
function getTilePreset(id){return tilePresets.find(preset=>preset.id===id)||null}
function escapeHTML(value){return String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}
function allowedTileTypes(){return tilePresets.filter(preset=>preset.events.length>0).map(preset=>preset.id)}
function canEditBoard(){return setupMode&&(!mpRoomId||mpIsHost)&&(!mpRoomId||mpRoomStatus==="lobby")}
function updateSetupUI(){
 const panel=document.querySelector("#host-setup");if(!panel)return;
 const editable=!mpRoomId||mpIsHost;panel.style.display=editable?"block":"none";
 const addRoundButton=document.querySelector("#add-round");if(addRoundButton)addRoundButton.style.display="none";
 document.querySelector("#round-limit").disabled=!canEditBoard();
 const boardSizeInput=document.querySelector("#board-size");if(boardSizeInput){boardSizeInput.disabled=!canEditBoard();boardSizeInput.value=boardSize;}
 ["randomize-board","clear-board","preset-name","preset-color","preset-answer-mode","preset-media-mode","preset-clip-duration","preset-scoring-notes","preset-save","preset-cancel"].forEach(id=>{const el=document.querySelector("#"+id);if(el)el.disabled=!canEditBoard()});
 document.querySelector("#round-limit").value=roundLimit;
 const authorInput=document.querySelector("#medium-author-search"),searchButton=document.querySelector("#medium-author-search-button");if(authorInput)authorInput.disabled=!canEditBoard();if(searchButton)searchButton.disabled=!canEditBoard();renderMediumAuthorSelections();renderPresetEditor();
 document.querySelector("#setup-status").textContent=setupMode?"Create presets, choose their events, then assign presets to board tiles.":"Round "+Math.min(roundsCompleted+1,roundLimit)+" of "+roundLimit+" · "+roundsCompleted+" completed.";
}
function handleBoardNodeClick(id){if(!canEditBoard())return;const allowed=allowedTileTypes();if(!allowed.length){document.querySelector("#setup-status").textContent="Create a preset with at least one event first.";return}const currentId=tileTypes[id],index=allowed.indexOf(currentId);if(index<0)tileTypes[id]=allowed[0];else if(index===allowed.length-1)delete tileTypes[id];else tileTypes[id]=allowed[index+1];renderBoard();if(typeof mpStateChanged==="function")mpStateChanged()}
function randomizeBoard(){if(!canEditBoard())return;const allowed=allowedTileTypes();if(!allowed.length){document.querySelector("#setup-status").textContent="Create a preset with at least one event first.";return}tileTypes={};nodes.forEach(n=>{tileTypes[n.id]=allowed[Math.floor(Math.random()*allowed.length)]});renderBoard();if(typeof mpStateChanged==="function")mpStateChanged();document.querySelector("#setup-status").textContent="Presets randomly distributed. Click nodes to cycle through them."}
function clearBoardTiles(){if(!canEditBoard())return;tileTypes={};renderBoard();if(typeof mpStateChanged==="function")mpStateChanged();document.querySelector("#setup-status").textContent="All tiles cleared."}
function renderPresetEditor(){
 const list=document.querySelector("#preset-list"),eventsEl=document.querySelector("#preset-events"),save=document.querySelector("#preset-save"),nameInput=document.querySelector("#preset-name"),colorInput=document.querySelector("#preset-color");
 if(!list||!eventsEl)return;
 list.innerHTML="";
 if(!tilePresets.length)list.innerHTML='<div class="note">No presets yet. Create one below.</div>';
 tilePresets.forEach(preset=>{
  const row=document.createElement("div");row.style.cssText="display:grid;grid-template-columns:12px minmax(0,1fr) auto auto;gap:7px;align-items:center;padding:8px;border:1px solid #424a65;border-radius:9px;background:#171c2b";
  const swatch=document.createElement("span");swatch.style.cssText="width:12px;height:28px;border-radius:5px;background:"+preset.color;
  const detail=document.createElement("div");detail.style.minWidth="0";
  const title=document.createElement("strong");title.textContent=preset.name;
  const summary=document.createElement("div");summary.className="note";summary.textContent=preset.events.map(id=>getTileEventDefinition(id)?.name||id).join(", ")||"No events selected";summary.textContent+=" · "+(preset.answerMode==="manual"?"Free text + host scoring":"Multiple choice");
  detail.append(title,summary);
  const edit=document.createElement("button");edit.type="button";edit.className="secondary";edit.style.width="auto";edit.textContent="Edit";edit.disabled=!canEditBoard();edit.addEventListener("click",()=>loadPresetForEdit(preset.id));
  const remove=document.createElement("button");remove.type="button";remove.className="secondary";remove.style.width="auto";remove.textContent="×";remove.title="Delete preset";remove.disabled=!canEditBoard();remove.addEventListener("click",()=>{if(!canEditBoard())return;tilePresets=tilePresets.filter(p=>p.id!==preset.id);Object.keys(tileTypes).forEach(key=>{if(tileTypes[key]===preset.id)delete tileTypes[key]});if(editingPresetId===preset.id)clearPresetForm();renderBoard();renderPresetEditor();if(typeof mpStateChanged==="function")mpStateChanged()});
  row.append(swatch,detail,edit,remove);list.append(row);
 });
 eventsEl.innerHTML="";
 tileEvents.forEach(event=>{
  const label=document.createElement("label");label.className="setup-check";label.style.padding="3px 0";
  const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.value=event.id;checkbox.dataset.presetEvent="1";checkbox.disabled=!canEditBoard();
  const title=document.createElement("span");title.textContent=event.name+(event.implemented?"":" (not implemented yet)");
  label.append(checkbox,title);eventsEl.append(label);
 });
 if(save)save.textContent=editingPresetId?"Update preset":"Save preset";
 if(nameInput)nameInput.disabled=!canEditBoard();if(colorInput)colorInput.disabled=!canEditBoard();
}
function clearPresetForm(){editingPresetId=null;document.querySelector("#preset-name").value="";document.querySelector("#preset-color").value="#69df9b";document.querySelector("#preset-answer-mode").value="multiple-choice";document.querySelector("#preset-media-mode").value="video";document.querySelector("#preset-clip-duration").value="15";document.querySelector("#preset-answer-seconds").value="30";document.querySelector("#preset-scoring-notes").value="";document.querySelectorAll("[data-preset-event]").forEach(el=>el.checked=false);renderPresetEditor()}
function loadPresetForEdit(id){
 const preset=getTilePreset(id);if(!preset)return;editingPresetId=id;
 document.querySelector("#preset-name").value=preset.name;document.querySelector("#preset-color").value=preset.color;document.querySelector("#preset-answer-mode").value=preset.answerMode==="manual"?"manual":"multiple-choice";document.querySelector("#preset-media-mode").value=preset.mediaMode||"video";document.querySelector("#preset-clip-duration").value=String(preset.clipDuration||15);document.querySelector("#preset-answer-seconds").value=String(preset.answerSeconds||30);document.querySelector("#preset-scoring-notes").value=preset.scoringNotes||"";
 document.querySelectorAll("[data-preset-event]").forEach(el=>el.checked=preset.events.includes(el.value));
 document.querySelector("#preset-save").textContent="Update preset";
}
function savePreset(){
 if(!canEditBoard())return;
 const name=document.querySelector("#preset-name").value.trim(),color=document.querySelector("#preset-color").value;
 const answerMode=document.querySelector("#preset-answer-mode").value==="manual"?"manual":"multiple-choice";
 const mediaMode=document.querySelector("#preset-media-mode").value;
 const clipDuration=Math.max(3,Math.min(60,Number.parseInt(document.querySelector("#preset-clip-duration").value,10)||15));
 const answerSeconds=Math.max(10,Math.min(180,Number.parseInt(document.querySelector("#preset-answer-seconds").value,10)||30));
 const scoringNotes=document.querySelector("#preset-scoring-notes").value.trim();
 const events=[...document.querySelectorAll("[data-preset-event]:checked")].map(el=>el.value);
 if(!name){document.querySelector("#setup-status").textContent="Give the preset a name.";return}
 if(!events.length){document.querySelector("#setup-status").textContent="Select at least one event for this preset.";return}
 if(tilePresets.some(p=>p.name.toLowerCase()===name.toLowerCase()&&p.id!==editingPresetId)){document.querySelector("#setup-status").textContent="Preset names must be unique.";return}
 if(editingPresetId){const preset=getTilePreset(editingPresetId);if(preset)Object.assign(preset,{name,color,events,answerMode,mediaMode,clipDuration,answerSeconds,scoringNotes})}
 else tilePresets.push({id:"preset-"+(presetSequence++),name,color,events,answerMode,mediaMode,clipDuration,answerSeconds,scoringNotes});
 clearPresetForm();renderBoard();if(typeof mpStateChanged==="function")mpStateChanged();
 document.querySelector("#setup-status").textContent="Preset saved. Click a board node to assign it.";
}
document.querySelector("#preset-save").addEventListener("click",savePreset);
document.querySelector("#round-limit").addEventListener("change",()=>{if(!canEditBoard())return;roundLimit=Math.max(1,Math.min(50,Number.parseInt(document.querySelector("#round-limit").value,10)||5));document.querySelector("#round-limit").value=roundLimit;updateSetupUI();if(typeof mpStateChanged==="function")mpStateChanged()});
document.querySelector("#board-size").addEventListener("change",()=>{if(!canEditBoard())return;boardSize=Math.max(18,Math.min(72,Number.parseInt(document.querySelector("#board-size").value,10)||30));buildBoardGraph(boardSize);tileTypes={};const starts=nodes.filter(n=>n.type==="start").map(n=>n.id).sort(()=>Math.random()-0.5);players.forEach((p,i)=>{p.pos=starts[i%starts.length]??0;p.previous=null});renderBoard();updateUI();updateSetupUI();document.querySelector("#setup-status").textContent="Board size changed to "+boardSize+" tiles. Tile assignments were cleared for the new layout.";if(typeof mpStateChanged==="function")mpStateChanged()});
document.querySelector("#preset-cancel").addEventListener("click",clearPresetForm);
function node(id){return nodes.find(n=>n.id===id)}
function renderBoard(){
 let s="";
 edges.forEach(([a,b])=>{let A=node(a),B=node(b);s+='<line class="edge" x1="'+A.x+'" y1="'+A.y+'" x2="'+B.x+'" y2="'+B.y+'"/><line class="edge-highlight" x1="'+A.x+'" y1="'+A.y+'" x2="'+B.x+'" y2="'+B.y+'"/>'});
 nodes.forEach(n=>{
  const preset=getTilePreset(tileTypes[n.id]),editor=canEditBoard()&&n.id!==0&&n.id!==9;
  const label=preset?(preset.name.length>9?preset.name.slice(0,8)+"…":preset.name):n.label;
  const fill=preset?escapeHTML(preset.color):null;
  const cls=preset?"tile preset-tile":n.type==="start"?"tile start":"tile";
  s+='<g><circle class="'+cls+(editor?" editor-tile":"")+'"'+(fill?' style="fill:'+fill+';stroke:'+fill+'"':"")+' data-node-id="'+n.id+'" cx="'+n.x+'" cy="'+n.y+'" r="'+(adjacency[n.id].length>2?23:19)+'"/><text class="tile-label" data-node-id="'+n.id+'" x="'+n.x+'" y="'+(n.y+4)+'">'+escapeHTML(label)+'</text></g>';
 });
 svg.innerHTML=s;
 if(canEditBoard())svg.querySelectorAll("[data-node-id]").forEach(el=>el.addEventListener("click",()=>handleBoardNodeClick(Number(el.getAttribute("data-node-id")))));
 renderTokens();
}
function renderTokens(){
 svg.querySelectorAll(".tokens,.route-markers").forEach(e=>e.remove());
 const tokenLayer=document.createElementNS("http://www.w3.org/2000/svg","g");tokenLayer.setAttribute("class","tokens");
 const offsets=[[-9,-9],[9,-9],[-9,9],[9,9]];
 players.forEach((p,i)=>{const n=node(p.pos),o=offsets[i];const c=document.createElementNS("http://www.w3.org/2000/svg","circle");c.setAttribute("cx",n.x+o[0]);c.setAttribute("cy",n.y+o[1]);c.setAttribute("r",10);c.setAttribute("fill",colors[i]);c.setAttribute("class","player");tokenLayer.appendChild(c);const t=document.createElementNS("http://www.w3.org/2000/svg","text");t.setAttribute("x",n.x+o[0]);t.setAttribute("y",n.y+o[1]+4);t.setAttribute("text-anchor","middle");t.setAttribute("font-size","10");t.setAttribute("font-weight","900");t.setAttribute("fill","#151522");t.textContent=String(i+1);tokenLayer.appendChild(t)});
 svg.appendChild(tokenLayer);
 if(remaining>0 && !moving && adjacency[players[current].pos].length>1){
   const layer=document.createElementNS("http://www.w3.org/2000/svg","g");layer.setAttribute("class","route-markers");
   adjacency[players[current].pos].forEach(id=>{const n=node(id);const c=document.createElementNS("http://www.w3.org/2000/svg","circle");c.setAttribute("cx",n.x);c.setAttribute("cy",n.y);c.setAttribute("r",13);c.setAttribute("class","route-choice");c.addEventListener("click",()=>chooseRoute(id));layer.appendChild(c);const t=document.createElementNS("http://www.w3.org/2000/svg","text");t.setAttribute("x",n.x);t.setAttribute("y",n.y+4);t.setAttribute("class","route-label");t.textContent="→";t.addEventListener("click",()=>chooseRoute(id));layer.appendChild(t)});svg.appendChild(layer);
 }
}
function updateUI(){
 const p=players[current];
 if(!p){
  document.querySelector("#current-name").textContent="Not in a game";
  document.querySelector("#current-avatar").style.background="transparent";
  document.querySelector("#turn-note").textContent="Create or join a room";
  document.querySelector("#players").innerHTML="";
  document.querySelector("#roll").disabled=true;
  renderTokens();
  return;
 }
 document.querySelector("#current-name").textContent=p.name;document.querySelector("#current-avatar").style.background=colors[current];document.querySelector("#turn-note").textContent=remaining>0?`${remaining} step${remaining===1?"":"s"} left`:"Ready to roll";
 document.querySelector("#roll").disabled=remaining>0||moving;
 document.querySelector("#players").innerHTML=players.map((p,i)=>`<div class="player-row"><span class="avatar" style="background:${colors[i]}"></span><span class="name">${p.name}${i===current?" · turn":""}<br><small>Tile ${node(p.pos).label}</small></span><strong>${p.score} pts</strong></div>`).join("");
 renderTokens();
 if(typeof mpStateChanged==="function")mpStateChanged();
 if(typeof mpCanAct==="function"&&mpRoomId){document.querySelector("#roll").disabled=!mpCanAct()||remaining>0||moving||gameOver;document.querySelector("#reset").disabled=!mpIsHost;}
}
function setStatus(s){statusEl.textContent=s}
function startTurn(){remaining=0;moving=false;choicesEl.innerHTML="";document.querySelector("#die").textContent="—";updateUI();setStatus(`${players[current].name}, roll to begin your turn.`)}
function roll(){
 if((typeof mpCanAct==="function"&&!mpCanAct())||remaining>0||moving||gameOver)return;remaining=1+Math.floor(Math.random()*6);document.querySelector("#die").textContent=remaining;turnStarted=true;
 setStatus(`${players[current].name} rolled ${remaining}. Choose a route whenever you reach a junction.`);updateUI();advanceOptions();
}
function advanceOptions(){
 choicesEl.innerHTML="";
 if(remaining<=0){finishTurn();return}
 const p=players[current],opts=adjacency[p.pos];
 if(opts.length===1){chooseRoute(opts[0]);return}
 if(opts.length===2){const next=opts.find(id=>id!==p.previous);chooseRoute(next===undefined?opts[0]:next);return}
 moving=false;setStatus(`${players[current].name}: choose which path to take. ${remaining} move${remaining===1?"":"s"} remaining.`);
 opts.forEach(id=>{const b=document.createElement("button");b.className="choice";b.textContent=`Take path to tile ${node(id).label}`;b.onclick=()=>chooseRoute(id);choicesEl.appendChild(b)});
 document.querySelector("#roll").disabled=true;renderTokens();
}
function chooseRoute(id){
 if((typeof mpCanAct==="function"&&!mpCanAct())||remaining<=0)return;const p=players[current];if(!adjacency[p.pos].includes(id))return;
 p.previous=p.pos;p.pos=id;remaining--;moving=true;choicesEl.innerHTML="";renderTokens();updateUI();
 setStatus(`${p.name} moved to tile ${node(id).label}.`);
 setTimeout(()=>{moving=false;if(remaining>0)advanceOptions();else finishTurn()},360);
}
function finishTurn(){
 remaining=0;moving=false;choicesEl.innerHTML="";
 const p=players[current],landed=node(p.pos),preset=getTilePreset(tileTypes[p.pos]);
 if(preset&&!challengeResolved){
  const possible=preset.events.filter(id=>getTileEventDefinition(id));
  const eventId=possible[Math.floor(Math.random()*possible.length)];
  const event=getTileEventDefinition(eventId);
  if(event&&event.kind==="question"&&event.implemented){startTriviaChallenge(eventId,preset);return}
  challengeResolved=false;
  const detail=event?(event.implemented?event.name:event.name+" is selected, but its gameplay has not been implemented yet."):"This preset has no valid events.";
  setStatus(p.name+" landed on "+preset.name+": "+detail);
 }else{
  challengeResolved=false;
  setStatus(p.name+" finished their move on tile "+landed.label+".");
 }
 current=(current+1)%players.length;
 if(current===0){
  roundsCompleted++;
  if(roundsCompleted>=roundLimit){
   gameOver=true;
   const highScore=Math.max(...players.map(player=>player.score));
   const winners=players.filter(player=>player.score===highScore).map(player=>player.name);
   const result=winners.length===1?"Winner: "+winners[0]+" with "+highScore+" points.":"Tie: "+winners.join(" and ")+" with "+highScore+" points each.";
   setStatus("All "+roundLimit+" rounds are over. "+result+" Final scores: "+players.map(player=>player.name+" "+player.score).join(", ")+".");
   document.querySelector("#roll").disabled=true;updateUI();updateSetupUI();return;
  }
 }
 setStatus((statusEl.textContent||p.name+" finished their turn.")+" Next up: "+players[current].name+".");
 updateUI();updateSetupUI();document.querySelector("#turn-note").textContent="Ready to roll";
}
function resetGame(){if(typeof mpRoomId!=="undefined"&&mpRoomId&&!mpIsHost)return;document.querySelector("#challenge-overlay").style.display="none";players=(typeof mpRoomId!=="undefined"&&mpRoomId&&Array.isArray(mpPlayerRows)&&mpPlayerRows.length?mpPlayerRows.map(p=>({name:p.player_name,pos:0,previous:null,score:0,userId:p.user_id})):[{name:"Player 1",pos:0,previous:null,score:0},{name:"Player 2",pos:0,previous:null,score:0},{name:"Player 3",pos:0,previous:null,score:0},{name:"Player 4",pos:0,previous:null,score:0}]);
 const availableStarts=nodes.filter(n=>n.type==="start").map(n=>n.id);players.forEach((player,i)=>{const choices=availableStarts.filter(id=>!players.some((other,j)=>j<i&&other.pos===id));player.pos=choices.length?choices[Math.floor(Math.random()*choices.length)]:availableStarts[i%availableStarts.length];player.previous=null});current=0;remaining=0;moving=false;gameOver=false;challengeResolved=false;challengeBusy=false;roundsCompleted=0;setupMode=!mpRoomId||mpRoomStatus==="lobby";document.querySelector("#die").textContent="—";renderBoard();startTurn();updateSetupUI()}

document.querySelector("#roll").addEventListener("click",roll);document.querySelector("#reset").addEventListener("click",resetGame);
resetGame();

document.querySelector("#randomize-board").addEventListener("click",randomizeBoard);
document.querySelector("#clear-board").addEventListener("click",clearBoardTiles);
function getMediumAuthors(){return mediumAuthors.slice()}
function getMediumAuthorIds(){return mediumAuthorSelections.map(author=>author.id).filter(Boolean)}
function renderMediumAuthorSelections(){
 const selected=document.querySelector("#medium-author-selected");if(!selected)return;
 selected.innerHTML="";
 if(!mediumAuthors.length){selected.innerHTML='<span class="note">All creators allowed.</span>';return}
 mediumAuthors.forEach((name,index)=>{
  const row=document.createElement("div");row.style.cssText="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border:1px solid #424a65;border-radius:8px;background:#171c2b";
  const label=document.createElement("span");label.textContent=name;label.style.cssText="overflow-wrap:anywhere";
  const remove=document.createElement("button");remove.className="secondary";remove.type="button";remove.textContent="Remove";remove.disabled=!canEditBoard();remove.addEventListener("click",()=>{if(!canEditBoard())return;mediumAuthors.splice(index,1);mediumAuthorSelections.splice(index,1);document.querySelector("#medium-author-results").innerHTML="";renderMediumAuthorSelections();if(typeof mpStateChanged==="function")mpStateChanged()});
  row.append(label,remove);selected.append(row);
 });
}
async function searchMediumAuthors(){
 const query=document.querySelector("#medium-author-search").value.trim(),status=document.querySelector("#medium-author-status"),results=document.querySelector("#medium-author-results");
 if(!canEditBoard())return;
 if(!query){status.textContent="Enter part of a creator name first.";results.innerHTML="";return}
 status.textContent="Searching MangaDex…";results.innerHTML="";
 try{
  const authors=await searchMangaDexAuthors(query);
  if(!authors.length){status.textContent="No MangaDex creators found. Try a shorter or alternate spelling.";return}
  status.textContent="Select the exact creator entry you want to allow.";
  authors.forEach(author=>{
   const row=document.createElement("div");row.style.cssText="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border:1px solid #424a65;border-radius:8px;background:#171c2b";
   const label=document.createElement("span");label.textContent=author.name;label.style.cssText="overflow-wrap:anywhere";
   const add=document.createElement("button");add.className="secondary";add.type="button";add.textContent=mediumAuthorSelections.some(a=>a.id===author.id)?"Added":"Add";add.disabled=!canEditBoard()||mediumAuthorSelections.some(a=>a.id===author.id);
   add.addEventListener("click",()=>{if(!canEditBoard()||mediumAuthorSelections.some(a=>a.id===author.id))return;if(mediumAuthorSelections.length>=30){status.textContent="You can select up to 30 creators.";return}mediumAuthorSelections.push({id:author.id,name:author.name});mediumAuthors=mediumAuthorSelections.map(a=>a.name);renderMediumAuthorSelections();add.textContent="Added";add.disabled=true;if(typeof mpStateChanged==="function")mpStateChanged()});
   row.append(label,add);results.append(row);
  });
 }catch(error){status.textContent="MangaDex creator search failed: "+(error.message||error)}
}
document.querySelector("#medium-author-search-button").addEventListener("click",searchMediumAuthors);
document.querySelector("#medium-author-search").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();searchMediumAuthors()}});


renderPresetEditor();

