const nodes=[
 {id:0,x:90,y:300,label:"START",type:"start"},
 {id:1,x:170,y:300,label:"1"},{id:2,x:250,y:300,label:"2"},{id:3,x:330,y:300,label:"3"},
 {id:4,x:410,y:300,label:"4"},{id:5,x:490,y:300,label:"5",type:"junction"},
 {id:6,x:570,y:300,label:"6"},{id:7,x:650,y:300,label:"7"},{id:8,x:730,y:300,label:"8"},{id:9,x:810,y:300,label:"GOAL"},
 {id:10,x:250,y:190,label:"A"},{id:11,x:330,y:130,label:"B"},{id:12,x:420,y:145,label:"C"},{id:13,x:490,y:220,label:"13"},
 {id:14,x:650,y:190,label:"E"},{id:15,x:730,y:125,label:"F"},{id:16,x:810,y:190,label:"G"},
 {id:17,x:250,y:410,label:"H"},{id:18,x:330,y:475,label:"I"},{id:19,x:420,y:460,label:"J"},{id:20,x:490,y:380,label:"20"},
 {id:21,x:650,y:410,label:"L"},{id:22,x:730,y:480,label:"22"},{id:23,x:810,y:410,label:"N"}
];
const edges=[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],
 [2,10],[10,11],[11,12],[12,13],[13,5],[13,14],[14,15],[15,16],[16,9],
 [2,17],[17,18],[18,19],[19,20],[20,5],[20,21],[21,22],[22,23],[23,9],
 [12,14],[18,21],[15,23]];
const adjacency={};nodes.forEach(n=>adjacency[n.id]=[]);edges.forEach(([a,b])=>{adjacency[a].push(b);adjacency[b].push(a)});
const colors=["#ff5da8","#66e3ef","#ffd166","#a78bfa"];
let players=[],current=0,remaining=0,moving=false,turnStarted=false,gameOver=false,challengeResolved=false,challengeBusy=false,challengeAnswer="";
const svg=document.querySelector("#board"),statusEl=document.querySelector("#status"),choicesEl=document.querySelector("#choices");
let tileTypes={},roundLimit=5,roundsCompleted=0,setupMode=true,mediumAuthors=[];
const tileLabels={"image-easy":"EASY","image-medium":"MEDIUM","image-hard":"HARD",shop:"SHOP",coop:"CO-OP"};
function allowedTileTypes(){return [document.querySelector("#allow-image-easy")?.checked&&"image-easy",document.querySelector("#allow-image-medium")?.checked&&"image-medium",document.querySelector("#allow-image-hard")?.checked&&"image-hard",document.querySelector("#allow-shop")?.checked&&"shop",document.querySelector("#allow-coop")?.checked&&"coop"].filter(Boolean)}
function canEditBoard(){return setupMode&&(!mpRoomId||mpIsHost)&&(!mpRoomId||mpRoomStatus==="lobby")}
function updateSetupUI(){
 const panel=document.querySelector("#host-setup");if(!panel)return;
 const editable=!mpRoomId||mpIsHost;panel.style.display=editable?"block":"none";
 document.querySelector("#add-round").style.display=mpRoomId?(mpIsHost&&mpRoomStatus==="playing"?"block":"none"):(setupMode?"none":"block");
 document.querySelector("#round-limit").disabled=!canEditBoard();
 ["allow-image-easy","allow-image-medium","allow-image-hard","allow-shop","allow-coop","randomize-board","clear-board"].forEach(id=>{const el=document.querySelector("#"+id);if(el)el.disabled=!canEditBoard()});
 document.querySelector("#round-limit").value=roundLimit;
 const authorInput=document.querySelector("#medium-authors");if(authorInput){authorInput.disabled=!canEditBoard();if(document.activeElement!==authorInput)authorInput.value=mediumAuthors.join("\n");}
 document.querySelector("#setup-status").textContent=setupMode?"Edit the board, choose allowed tile types, then start the game.":"Round "+Math.min(roundsCompleted+1,roundLimit)+" of "+roundLimit+" · "+roundsCompleted+" completed.";
}
function handleBoardNodeClick(id){if(!canEditBoard()||id===0||id===9)return;const allowed=allowedTileTypes();if(!allowed.length){document.querySelector("#setup-status").textContent="Enable at least one tile type first.";return}const currentType=tileTypes[id],index=allowed.indexOf(currentType);if(index<0)tileTypes[id]=allowed[0];else if(index===allowed.length-1)delete tileTypes[id];else tileTypes[id]=allowed[index+1];renderBoard()}
function randomizeBoard(){if(!canEditBoard())return;const allowed=allowedTileTypes();if(!allowed.length){document.querySelector("#setup-status").textContent="Enable at least one tile type first.";return}tileTypes={};nodes.filter(n=>n.id!==0&&n.id!==9).forEach(n=>{tileTypes[n.id]=allowed[Math.floor(Math.random()*allowed.length)]});renderBoard();document.querySelector("#setup-status").textContent="Tiles randomly distributed. Click nodes to adjust them."}
function clearBoardTiles(){if(!canEditBoard())return;tileTypes={};renderBoard();document.querySelector("#setup-status").textContent="All tiles cleared."}
function node(id){return nodes.find(n=>n.id===id)}
function renderBoard(){
 let s="";
 edges.forEach(([a,b])=>{let A=node(a),B=node(b);s+='<line class="edge" x1="'+A.x+'" y1="'+A.y+'" x2="'+B.x+'" y2="'+B.y+'"/><line class="edge-highlight" x1="'+A.x+'" y1="'+A.y+'" x2="'+B.x+'" y2="'+B.y+'"/>'});
 nodes.forEach(n=>{
  const type=tileTypes[n.id];
  const cls=type==="image-easy"?"tile image-easy-space":type==="image-medium"?"tile image-medium-space":type==="image-hard"?"tile image-hard-space":type==="shop"?"tile shop-space":type==="coop"?"tile coop-space":n.type==="start"?"tile start":"tile";
  const label=type?(tileLabels[type]||type):n.label;
  const editor=canEditBoard()&&n.id!==0&&n.id!==9;
  s+='<g><circle class="'+cls+(editor?" editor-tile":"")+'" data-node-id="'+n.id+'" cx="'+n.x+'" cy="'+n.y+'" r="'+(adjacency[n.id].length>2?23:19)+'"/><text class="tile-label" data-node-id="'+n.id+'" x="'+n.x+'" y="'+(n.y+4)+'">'+label+'</text></g>';
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
 const p=players[current],landed=node(p.pos);
 const landedType=tileTypes[p.pos];
 if(landedType==="image-easy"&&!challengeResolved){startTriviaChallenge("easy");return}
 challengeResolved=false;
 let result=p.name+" finished their move on "+landed.label+".";
 if(landedType==="image-medium")result+=" Medium image questions are not implemented yet; this tile is skipped for now.";
 else if(landedType==="image-hard")result+=" Hard image questions are not implemented yet; this tile is skipped for now.";
 if(landedType==="shop")result+=" Shop tile: shop and item effects will be added in the next implementation phase.";
 else if(landedType==="coop")result+=" Co-op tile: team challenge rules will be added in the next implementation phase.";
 if(p.pos===9){gameOver=true;setStatus(p.name+" reached the goal! Final scores: "+players.map(x=>x.name+" "+x.score).join(", ")+". Restart to play again.");document.querySelector("#roll").disabled=true;updateUI();return}
 current=(current+1)%players.length;
 if(current===0){roundsCompleted++;if(roundsCompleted>=roundLimit){gameOver=true;setStatus("Round limit reached. Final scores: "+players.map(x=>x.name+" "+x.score).join(", ")+". The host can add a round to continue.");updateUI();return}}
 setStatus(result+" Next up: "+players[current].name+".");
 updateUI();document.querySelector("#turn-note").textContent="Ready to roll";
}
function resetGame(){if(typeof mpRoomId!=="undefined"&&mpRoomId&&!mpIsHost)return;document.querySelector("#challenge-overlay").style.display="none";players=(typeof mpRoomId!=="undefined"&&mpRoomId&&Array.isArray(mpPlayerRows)&&mpPlayerRows.length?mpPlayerRows.map(p=>({name:p.player_name,pos:0,previous:null,score:0,userId:p.user_id})):[{name:"Player 1",pos:0,previous:null,score:0},{name:"Player 2",pos:0,previous:null,score:0},{name:"Player 3",pos:0,previous:null,score:0},{name:"Player 4",pos:0,previous:null,score:0}]);current=0;remaining=0;moving=false;gameOver=false;challengeResolved=false;challengeBusy=false;roundsCompleted=0;setupMode=!mpRoomId||mpRoomStatus==="lobby";document.querySelector("#die").textContent="—";renderBoard();startTurn();updateSetupUI()}

document.querySelector("#roll").addEventListener("click",roll);document.querySelector("#reset").addEventListener("click",resetGame);
resetGame();

document.querySelector("#randomize-board").addEventListener("click",randomizeBoard);
document.querySelector("#clear-board").addEventListener("click",clearBoardTiles);
function getMediumAuthors(){return mediumAuthors.slice()}
document.querySelector("#medium-authors").addEventListener("input",event=>{mediumAuthors=event.target.value.split(/\\r?\\n/).map(name=>name.trim()).filter(Boolean).slice(0,30)});
document.querySelector("#add-round").addEventListener("click",()=>{if(mpRoomId&&!mpIsHost)return;roundLimit=Math.min(50,roundLimit+1);gameOver=false;updateSetupUI();updateUI();setStatus("The host added a round. "+roundLimit+" rounds are now available.");if(typeof mpStateChanged==="function")mpStateChanged()});
["allow-image-easy","allow-image-medium","allow-image-hard","allow-shop","allow-coop"].forEach(id=>document.querySelector("#"+id).addEventListener("change",()=>{if(!canEditBoard())return;const allowed=allowedTileTypes();Object.keys(tileTypes).forEach(key=>{if(!allowed.includes(tileTypes[key]))delete tileTypes[key]});renderBoard()}));
