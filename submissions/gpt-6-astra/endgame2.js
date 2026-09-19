'use strict';
const {build}=require('./belief');
const faceKey=cs=>cs.map(c=>`${c.suit}:${c.rank}`).sort().join(',');
function actions(E,hands,seat,plays,trump){
 const hand=hands[seat],lead=plays.length?E.classify(plays[0].cards,trump):null,out=new Map();
 for(let mask=1;mask<(1<<hand.length);mask++){
  const cs=hand.filter((c,i)=>mask&(1<<i));
  if(lead){if(!E.isLegalFollow(hand,lead,cs,trump))continue;}
  else if(!E.classify(cs,trump)||!E.checkThrow(hands,seat,cs,trump).ok)continue;
  // In a known world a failed throw is equivalent to an available smaller lead.
  const key=faceKey(cs);if(!out.has(key))out.set(key,cs);
 }
 return [...out.values()];
}
function remove(hand,cards){const ids=new Set(cards.map(c=>c.id));return hand.filter(c=>!ids.has(c.id));}

// Exact double-dummy minimax for <=2 cards per seat. Returns future defender
// points INCLUDING the bottom bonus, excluding already-completed tricks.
function solve(E,{hands,plays=[],leader,declTeam,trump,kitty},maxCards=2){
 if(![2,3].includes(maxCards)||hands.length!==4||hands.some(h=>h.length>maxCards)||plays.length>4)throw new Error('endgame bound');
 const memo=new Map();let nodes=0;
 function visit(H,P,L){
  nodes++;if(nodes>100000)throw new Error('endgame2 node bound exceeded');
  const key=H.map(h=>h.map(c=>c.id).sort((a,b)=>a-b).join(',')).join('|')+';'+
   P.map(p=>`${p.seat}:${p.cards.map(c=>c.id).sort((a,b)=>a-b).join(',')}`).join('|')+';'+L;
  if(memo.has(key))return memo.get(key);
  let value;
  if(P.length===4){
   const res=E.resolveTrick(P,trump),defWon=res.winner%2!==declTeam;
   const gained=defWon?res.points:0;
   value=gained+(H.every(h=>h.length===0)?E.scoreRound(0,kitty,defWon,P[0].cards.length).total:visit(H,[],res.winner));
  }else{
   const seat=P.length?(P[0].seat+P.length)%4:L,choices=actions(E,H,seat,P,trump);
   if(!choices.length)throw new Error('endgame2 has no legal action');
   const minimize=seat%2===declTeam;value=minimize?Infinity:-Infinity;
   for(const cs of choices){const next=H.slice();next[seat]=remove(H[seat],cs);
    const v=visit(next,P.concat({seat,cards:cs}),L);value=minimize?Math.min(value,v):Math.max(value,v);}
  }
  memo.set(key,value);return value;
 }
 const value=visit(hands,plays,leader);return {value,nodes,states:memo.size};
}

function chooseFollow(view,plays,baseline,E,worlds=16,maxCards=2){
 if(view.hand.length>maxCards||!view.hand.length)return baseline;
 const H=[[],[],[],[]];H[view.seat]=view.hand;
 const possible=actions(E,H,view.seat,plays,view.trump),dedup=new Map([[faceKey(baseline),baseline]]);
 for(const cs of possible)if(!dedup.has(faceKey(cs)))dedup.set(faceKey(cs),cs);
 const choices=[...dedup.values()];if(choices.length<2)return baseline;
 const model=build(view,E);if(!model.total)throw new Error('no supported endgame world');
 let seed=2166136261;
 const mix=n=>{seed=Math.imul(seed^(n>>>0),16777619);};
 mix(view.seat);mix(view.declSeat);mix(view.trump.rank);mix((view.trump.suit||'N').charCodeAt(0));
 for(const c of view.hand)mix(c.id);
 for(const p of view.history){mix(p.seat);for(const c of p.cards)mix(c.id);}
 if(!seed)seed=1;
 const rng=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 const sums=choices.map(()=>0);
 for(let w=0;w<worlds;w++){
  const world=model.sample(rng);
  for(let j=0;j<choices.length;j++){
   const hands=world.hands.slice();hands[view.seat]=remove(hands[view.seat],choices[j]);
   sums[j]+=solve(E,{hands,plays:plays.concat({seat:view.seat,cards:choices[j]}),leader:plays[0].seat,
    declTeam:view.declSeat%2,trump:view.trump,kitty:world.kitty},maxCards).value;
  }
 }
 const sign=view.myTeam===view.declSeat%2?-1:1;let best=0;
 for(let j=1;j<choices.length;j++)if(sign*(sums[j]-sums[best])>1e-9)best=j;
 return choices[best];
}
module.exports={actions,solve,chooseFollow};
