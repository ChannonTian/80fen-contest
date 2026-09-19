'use strict';
// Pure JS, no host APIs. Uniform over physical-card assignments consistent
// with EXACTLY these constraints: seen cards, remaining sizes, suit voids.
// Does not yet condition on declarations, pair/tractor obligations or style.
function compile(groups,capacities){
 const caps=capacities.slice(),G=groups.map(g=>({cards:g.cards.slice(),allowed:g.allowed.slice()}));
 const cards=G.flatMap(g=>g.cards),N=cards.length,B=caps.length;
 if(B<1||B>4||N>23||caps.some(n=>!Number.isInteger(n)||n<0)||
    caps.reduce((s,n)=>s+n,0)!==N||new Set(cards.map(c=>c.id)).size!==N||
    G.some(g=>g.allowed.length!==B))throw new Error('invalid bounded belief input');
 const C=Array.from({length:N+1},()=>[]);
 for(let n=0;n<=N;n++){C[n][0]=C[n][n]=1;for(let k=1;k<n;k++)C[n][k]=C[n-1][k-1]+C[n-1][k];}
 const memo=new Map();
 function allocations(i,capacity,visit){
  const n=G[i].cards.length,a=Array(B).fill(0),allowed=G[i].allowed;
  function walk(b,left,multiplicity){
   if(b===B){if(left===0)visit(a,multiplicity);return;}
   let tail=0;for(let j=b+1;j<B;j++)if(allowed[j])tail+=capacity[j];
   const lo=Math.max(0,left-tail),hi=allowed[b]?Math.min(left,capacity[b]):0;
   for(let x=lo;x<=hi;x++){a[b]=x;walk(b+1,left-x,multiplicity*C[left][x]);}
  }
  walk(0,n,1);
 }
 function ways(i,capacity){
  if(i===G.length)return capacity.every(n=>n===0)?1:0;
  const key=`${i}|${capacity.join(',')}`;if(memo.has(key))return memo.get(key);
  let total=0;allocations(i,capacity,(a,m)=>{total+=m*ways(i+1,capacity.map((n,b)=>n-a[b]));});
  memo.set(key,total);return total;
 }
 const total=ways(0,caps);
 function sample(rng){
  if(!total)return null;
  const out=Array.from({length:B},()=>[]);let capacity=caps.slice();
  const random=()=>{const r=rng();if(!(r>=0&&r<1))throw new Error('rng outside [0,1)');return r;};
  for(let i=0;i<G.length;i++){
   let target=random()*ways(i,capacity),chosen=null,last=null;
   allocations(i,capacity,(a,m)=>{
    if(chosen)return;
    const weight=m*ways(i+1,capacity.map((n,b)=>n-a[b]));if(!weight)return;
    last=a.slice();if(target<weight)chosen=last;else target-=weight;
   });
   chosen=chosen||last;if(!chosen)throw new Error('belief branch has no support');
   const shuffled=G[i].cards.slice();
   for(let j=shuffled.length-1;j>0;j--){const k=Math.floor(random()*(j+1));[shuffled[j],shuffled[k]]=[shuffled[k],shuffled[j]];}
   let offset=0;
   for(let b=0;b<B;b++){out[b].push(...shuffled.slice(offset,offset+chosen[b]));offset+=chosen[b];}
   capacity=capacity.map((n,b)=>n-chosen[b]);
  }
  return out;
 }
 return {total,states:memo.size,sample};
}

function build(view,E){
 if(!['lead','follow'].includes(view.phase)||view.hand.length>5)throw new Error('belief supports play with at most five cards');
 if((view.history.length%4===0)!==(view.phase==='lead'))throw new Error('phase/history mismatch');
 // Public ids identify cards; they do NOT encode suit/rank (RULES S1).
 // Count visible faces against the two-copy stock. Hidden ids are local
 // negative labels and never leave the sampled search world as real moves.
 const stock=new Map();
 for(const c of E.makeDeck()){
  const key=`${c.suit}:${c.rank}`;
  if(!stock.has(key))stock.set(key,{suit:c.suit,rank:c.rank,total:0,seen:0});
  stock.get(key).total++;
 }
 const seen=new Set(),played=[0,0,0,0],voids=Array.from({length:4},()=>new Set());
 const reveal=card=>{
  const f=stock.get(`${card.suit}:${card.rank}`);
  if(!Number.isInteger(card.id)||card.id<0||card.id>107||seen.has(card.id)||!f||f.seen>=f.total)
   throw new Error('duplicate or invalid known card');
  seen.add(card.id);f.seen++;
 };
 for(let i=0;i<view.history.length;i++){
  const p=view.history[i];if(!Number.isInteger(p.seat)||p.seat<0||p.seat>3)throw new Error('invalid history seat');
  for(const c of p.cards){reveal(c);played[p.seat]++;}
  if(i%4!==0){const ledSuit=E.effSuit(view.history[i-i%4].cards[0],view.trump);
   if(p.cards.some(c=>E.effSuit(c,view.trump)!==ledSuit))voids[p.seat].add(ledSuit);}
 }
 view.hand.forEach(reveal);(view.buriedKnown||[]).forEach(reveal);
 const sizes=played.map(n=>25-n);
 if(sizes.some(n=>n<0)||sizes[view.seat]!==view.hand.length||
    (view.buriedKnown||[]).length!==(view.seat===view.declSeat?8:0))throw new Error('inconsistent hand/kitty sizes');
 if(view.hand.some(c=>voids[view.seat].has(E.effSuit(c,view.trump))))throw new Error('known hand contradicts void');
 const seats=[0,1,2,3].filter(s=>s!==view.seat).concat(4);
 const capacities=seats.map(s=>s===4?(view.seat===view.declSeat?0:8):sizes[s]);
 const unknown=[],groups=[];
 for(const f of stock.values())for(let n=f.seen;n<f.total;n++)
  unknown.push({suit:f.suit,rank:f.rank,id:-1-unknown.length});
 for(const suit of ['T',...E.SUITS]){
  const cards=unknown.filter(c=>E.effSuit(c,view.trump)===suit);if(!cards.length)continue;
  groups.push({cards,allowed:seats.map(s=>s===4||!voids[s].has(suit))});
 }
 groups.sort((a,b)=>a.allowed.filter(Boolean).length-b.allowed.filter(Boolean).length);
 const model=compile(groups,capacities);
 return {seats,capacities,voids,sizes,unknown,total:model.total,states:model.states,
  sample(rng){const buckets=model.sample(rng);if(!buckets)return null;
   const hands=Array.from({length:4},()=>[]);hands[view.seat]=view.hand.slice();
   let kitty=(view.buriedKnown||[]).slice();
   seats.forEach((s,i)=>{if(s===4){if(capacities[i])kitty=buckets[i];}else hands[s]=buckets[i];});
   return {hands,kitty};}};
}
module.exports={compile,build};
