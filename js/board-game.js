const nodes=[
 {id:0,x:90,y:300,label:"START",type:"start"},
 {id:1,x:170,y:300,label:"1"},{id:2,x:250,y:300,label:"2"},{id:3,x:330,y:300,label:"★",type:"score"},
 {id:4,x:410,y:300,label:"4"},{id:5,x:490,y:300,label:"5",type:"junction"},
 {id:6,x:570,y:300,label:"6"},{id:7,x:650,y:300,label:"7"},{id:8,x:730,y:300,label:"!",type:"event"},{id:9,x:810,y:300,label:"GOAL"},
 {id:10,x:250,y:190,label:"A"},{id:11,x:330,y:130,label:"B"},{id:12,x:420,y:145,label:"C"},{id:13,x:490,y:220,label:"?",type:"challenge"},
 {id:14,x:650,y:190,label:"E"},{id:15,x:730,y:125,label:"F"},{id:16,x:810,y:190,label:"G"},
 {id:17,x:250,y:410,label:"H"},{id:18,x:330,y:475,label:"I"},{id:19,x:420,y:460,label:"J"},{id:20,x:490,y:380,label:"★",type:"score"},
 {id:21,x:650,y:410,label:"L"},{id:22,x:730,y:480,label:"!",type:"event"},{id:23,x:810,y:410,label:"N"}
];
const edges=[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],
 [2,10],[10,11],[11,12],[12,13],[13,5],[13,14],[14,15],[15,16],[16,9],
 [2,17],[17,18],[18,19],[19,20],[20,5],[20,21],[21,22],[22,23],[23,9],
 [12,14],[18,21],[15,23]];
const adjacency={};nodes.forEach(n=>adjacency[n.id]=[]);edges.forEach(([a,b])=>{adjacency[a].push(b);adjacency[b].push(a)});
const colors=["#ff5da8","#66e3ef","#ffd166","#a78bfa"];
let players=[],current=0,remaining=0,moving=false,turnStarted=false,gameOver=false,challengeResolved=false,challengeBusy=false,challengeAnswer="";
const svg=document.querySelector("#board"),statusEl=document.querySelector("#status"),choicesEl=document.querySelector("#choices");
function node(id){return nodes.find(n=>n.id===id)}
function renderBoard(){
 let s="";
 edges.forEach(([a,b])=>{let A=node(a),B=node(b);s+=`<line class="edge" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/><line class="edge-highlight" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`});
 nodes.forEach(n=>{const cls=n.type==="score"?"tile score-space":n.type==="event"?"tile event-space":n.type==="challenge"?"tile challenge-space":n.type==="special"?"tile special":n.type==="start"?"tile start":"tile";s+=`<g><circle class="${cls}" cx="${n.x}" cy="${n.y}" r="${adjacency[n.id].length>2?23:19}"/><text class="tile-label" x="${n.x}" y="${n.y+4}">${n.label}</text></g>`});
 svg.innerHTML=s;renderTokens();
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
 const p=players[current];document.querySelector("#current-name").textContent=p.name;document.querySelector("#current-avatar").style.background=colors[current];document.querySelector("#turn-note").textContent=remaining>0?`${remaining} step${remaining===1?"":"s"} left`:"Ready to roll";
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
 if(landed.type==="challenge" && !challengeResolved){startTriviaChallenge();return}
 challengeResolved=false;
 let result=`${p.name} finished their move on ${landed.label}.`;
 if(landed.type==="score"){p.score+=2;result+=` +2 points! Total: ${p.score}.`;}
 else if(landed.type==="event"){
   const outcomes=[{points:-1,text:"lost 1 point"},{points:1,text:"gained 1 point"},{points:2,text:"gained 2 points"}];
   const event=outcomes[Math.floor(Math.random()*outcomes.length)];p.score+=event.points;
   result+=` Random event: ${event.text}. Total: ${p.score}.`;
 } else if(landed.type==="challenge"){result+=" Trivia challenge completed.";}
 if(p.pos===9){gameOver=true;setStatus(`${p.name} reached the goal! Final scores: ${players.map(x=>`${x.name} ${x.score}`).join(", ")}. Restart to play again.`);document.querySelector("#roll").disabled=true;updateUI();return}
 current=(current+1)%players.length;
 setStatus(`${result} Next up: ${players[current].name}.`);
 updateUI();document.querySelector("#turn-note").textContent="Ready to roll";
}
function resetGame(){if(typeof mpRoomId!=="undefined"&&mpRoomId&&!mpIsHost)return;document.querySelector("#challenge-overlay").style.display="none";players=(typeof mpRoomId!=="undefined"&&mpRoomId&&Array.isArray(mpPlayerRows)&&mpPlayerRows.length?mpPlayerRows.map(p=>({name:p.player_name,pos:0,previous:null,score:0,userId:p.user_id})):[{name:"Player 1",pos:0,previous:null,score:0},{name:"Player 2",pos:0,previous:null,score:0},{name:"Player 3",pos:0,previous:null,score:0},{name:"Player 4",pos:0,previous:null,score:0}]);current=0;remaining=0;moving=false;gameOver=false;challengeResolved=false;challengeBusy=false;document.querySelector("#die").textContent="—";renderBoard();startTurn()}

document.querySelector("#roll").addEventListener("click",roll);document.querySelector("#reset").addEventListener("click",resetGame);
resetGame();
