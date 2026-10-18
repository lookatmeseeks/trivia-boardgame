let mpClient=null,mpUserId=null,mpRoomId=null,mpRoomCode="",mpIsHost=false,mpRoomStatus="lobby",mpChannel=null,mpApplyingState=false,mpSaveTimer=null,mpPlayerRows=[];

function mpSetStatus(message){const el=document.querySelector("#mp-status");if(el)el.textContent=message}
function mpSetActions(show){const el=document.querySelector("#mp-room-actions");if(el)el.style.display=show?"grid":"none"}
function mpCanAct(){
 if(!mpRoomId)return true;
 return mpRoomStatus==="playing" && !!mpUserId && players[current]?.userId===mpUserId;
}
async function mpEnsureClient(){
 if(mpClient&&mpUserId)return;
 if(!window.supabase?.createClient)throw new Error("Supabase client library did not load.");
 const cfg=window.ANIME_PARTY_SUPABASE;
 if(!cfg?.url||!cfg?.publishableKey)throw new Error("Supabase configuration is missing.");
 if(!mpClient)mpClient=window.supabase.createClient(cfg.url,cfg.publishableKey);
 const {data,error}=await mpClient.auth.getSession();
 if(error)throw error;
 if(data.session)mpUserId=data.session.user.id;
 else{
  const signed=await mpClient.auth.signInAnonymously();
  if(signed.error)throw signed.error;
  mpUserId=signed.data.user.id;
 }
}
function mpCurrentSnapshot(){
 return {updatedBy:mpUserId,players:players.map(p=>({name:p.name,pos:p.pos,previous:p.previous,score:p.score,userId:p.userId||null})),current,remaining,moving:false,gameOver,die:document.querySelector("#die")?.textContent||"—"};
}
function mpStateChanged(){
 if(!mpRoomId||mpApplyingState||mpRoomStatus!=="playing")return;
 clearTimeout(mpSaveTimer);
 mpSaveTimer=setTimeout(()=>mpPublishState().catch(e=>mpSetStatus("Sync error: "+(e.message||e))),180);
}
async function mpPublishState(){
 if(!mpRoomId||mpApplyingState)return;
 const snapshot=mpCurrentSnapshot();
 const {error}=await mpClient.rpc("save_game_state",{p_code:mpRoomCode,p_state:snapshot,p_status:"playing"});
 if(error)mpSetStatus("Could not sync game: "+error.message);
}
async function mpRefreshPlayers(){
 if(!mpRoomId)return;
 const {data,error}=await mpClient.from("room_players").select("user_id,player_name,player_order,score,position").eq("room_id",mpRoomId).order("player_order");
 if(error)throw error;
 mpPlayerRows=data||[];
 const count=mpPlayerRows.length;
 mpSetStatus("Room "+mpRoomCode+" · "+count+"/4 players"+(mpIsHost?" · You are host":""));
 const start=document.querySelector("#mp-start");
 if(start)start.style.display=mpIsHost&&mpRoomStatus==="lobby"?"block":"none";
}
function mpSubscribe(){
 if(mpChannel)mpClient.removeChannel(mpChannel);
 mpChannel=mpClient.channel("anime-party-room-"+mpRoomId)
 .on("postgres_changes",{event:"UPDATE",schema:"public",table:"game_rooms",filter:"id=eq."+mpRoomId},payload=>{
   const room=payload.new;
   mpRoomStatus=room.status;
   if(room.state&&Array.isArray(room.state.players)&&room.state.players.length){
    if(!mpApplyingState&&room.state.updatedBy!==mpUserId)mpApplySnapshot(room.state);
   }
   if(mpRoomStatus==="playing")mpSetActions(true);
   mpRefreshPlayers().catch(e=>mpSetStatus("Room refresh failed: "+e.message));
 })
 .on("postgres_changes",{event:"INSERT",schema:"public",table:"room_players",filter:"room_id=eq."+mpRoomId},()=>mpRefreshPlayers().catch(e=>mpSetStatus(e.message)))
 .subscribe((status)=>{if(status==="CHANNEL_ERROR")mpSetStatus("Realtime connection failed. Check the Supabase Realtime setup.")});
}
function mpApplySnapshot(state){
 if(!Array.isArray(state.players)||!state.players.length)return;
 mpApplyingState=true;
 try{
  players=state.players.map(p=>({name:p.name,pos:Number(p.pos)||0,previous:p.previous===null?null:Number(p.previous),score:Number(p.score)||0,userId:p.userId||p.user_id||null}));
  current=Math.max(0,Math.min(players.length-1,Number(state.current)||0));
  remaining=Math.max(0,Number(state.remaining)||0);
  moving=false;gameOver=!!state.gameOver;challengeResolved=false;
  document.querySelector("#die").textContent=state.die||"—";
  choicesEl.innerHTML="";
  renderBoard();updateUI();
  setStatus(gameOver?"Game finished.":(mpCanAct()?"Your turn. Roll or continue your move.":players[current].name+"'s turn. Waiting for them to move."));
  document.querySelector("#roll").disabled=!mpCanAct()||remaining>0||moving||gameOver;
  document.querySelector("#reset").disabled=!mpIsHost;
 }finally{mpApplyingState=false}
}
async function mpEnterRoom(room,code,isHost){
 mpRoomId=room.id;mpRoomCode=room.code||code;mpIsHost=isHost;mpRoomStatus=room.status;
 mpSetActions(true);
 await mpRefreshPlayers();
 mpSubscribe();
 if(room.state&&Array.isArray(room.state.players)&&room.state.players.length)mpApplySnapshot(room.state);
 else{
  choicesEl.innerHTML="";
  document.querySelector("#roll").disabled=true;
  mpSetStatus("Room "+mpRoomCode+" · waiting for the host to start ("+mpPlayerRows.length+"/4 players).");
 }
 document.querySelector("#mp-code").value=mpRoomCode;
 document.querySelector("#mp-create").disabled=true;
 document.querySelector("#mp-join").disabled=true;
 document.querySelector("#mp-name").disabled=true;
}
async function mpCreateRoom(){
 try{
  document.querySelector("#mp-create").disabled=true;mpSetStatus("Connecting…");
  await mpEnsureClient();
  const name=document.querySelector("#mp-name").value.trim();
  const {data,error}=await mpClient.rpc("create_room",{p_name:name});
  if(error)throw error;
  const {data:room,error:readError}=await mpClient.from("game_rooms").select("*").eq("code",data.code).single();
  if(readError)throw readError;
  await mpEnterRoom(room,room.code,true);
 }catch(e){mpSetStatus("Could not create room: "+(e.message||e));document.querySelector("#mp-create").disabled=false}
}
async function mpJoinRoom(){
 try{
  document.querySelector("#mp-join").disabled=true;mpSetStatus("Joining room…");
  await mpEnsureClient();
  const name=document.querySelector("#mp-name").value.trim(),code=document.querySelector("#mp-code").value.trim().toUpperCase();
  const {data,error}=await mpClient.rpc("join_room",{p_code:code,p_name:name});
  if(error)throw error;
  const {data:room,error:readError}=await mpClient.from("game_rooms").select("*").eq("id",data.room_id).single();
  if(readError)throw readError;
  await mpEnterRoom(room,code,false);
 }catch(e){mpSetStatus("Could not join room: "+(e.message||e));document.querySelector("#mp-join").disabled=false}
}
async function mpStartGame(){
 try{
  if(!mpIsHost||!mpRoomId)return;
  await mpRefreshPlayers();
  if(mpPlayerRows.length<2){mpSetStatus("At least two players must join before starting.");return}
  players=mpPlayerRows.map(p=>({name:p.player_name,pos:0,previous:null,score:0,userId:p.user_id}));
  current=0;remaining=0;moving=false;gameOver=false;challengeResolved=false;
  document.querySelector("#die").textContent="—";
  renderBoard();startTurn();mpRoomStatus="playing";
  const {error}=await mpClient.rpc("save_game_state",{p_code:mpRoomCode,p_state:mpCurrentSnapshot(),p_status:"playing"});
  if(error)throw error;
  mpSetActions(true);await mpRefreshPlayers();
 }catch(e){mpSetStatus("Could not start game: "+(e.message||e))}
}
async function mpLeaveRoom(){
 if(mpChannel&&mpClient)await mpClient.removeChannel(mpChannel);
 mpChannel=null;mpRoomId=null;mpRoomCode="";mpIsHost=false;mpRoomStatus="lobby";mpPlayerRows=[];
 document.querySelector("#mp-create").disabled=false;document.querySelector("#mp-join").disabled=false;document.querySelector("#mp-name").disabled=false;
 document.querySelector("#roll").disabled=false;document.querySelector("#reset").disabled=false;
 mpSetActions(false);mpSetStatus("Not connected to a room.");
 resetGame();
}
document.querySelector("#mp-create").addEventListener("click",mpCreateRoom);
document.querySelector("#mp-join").addEventListener("click",mpJoinRoom);
document.querySelector("#mp-start").addEventListener("click",mpStartGame);
document.querySelector("#mp-leave").addEventListener("click",mpLeaveRoom);
document.querySelector("#reset").addEventListener("click",()=>{if(mpRoomId&&!mpIsHost)return;});
