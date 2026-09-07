#!/usr/bin/env node
/* 第一赛季牌谱阅读器 —— 把一局对局还原成人看得懂的样子。
 *
 *   node season1/replay.js plays/<A>__<B>.ndjson.gz            # 列出这一对的 600 场
 *   node season1/replay.js plays/<A>__<B>.ndjson.gz 7          # 第 7 副牌,两场都放
 *   node season1/replay.js plays/<A>__<B>.ndjson.gz 7 --side=0 # 只看 A 坐 0/2 的那一场
 *   node season1/replay.js plays/<A>__<B>.ndjson.gz 7 --round=3 # 只看第 3 局
 *   node season1/replay.js plays/<A>__<B>.ndjson.gz 7 --hands   # 顺带把四家的手牌摊开
 *
 * 零依赖,只用 node 自带的 fs/zlib。牌谱格式见 FORMAT.md。
 *
 * 手牌是**算出来的**,不是记下来的:每家出的 25 张就是它拿到的 25 张,
 * 庄家那 25 张加上扣掉的 8 张、再去掉底牌的 8 张,就是它发到手的 25 张。
 * 一副 108 张一张不多一张不少 —— 这一条每次渲染都验一遍,对不上就报出来。
 */
'use strict';
const fs=require('fs'), zlib=require('zlib');

// ---------- 牌 id ↔ 牌面 ----------
/* 两副牌,id 0..107。低 54 张是第一副,高 54 张是第二副,同一张牌的两份
 * id 相差 54(所以 `id % 54` 相同就是同一张牌 —— 判对子靠这个)。
 * 每副里 0..51 按 ♠♥♦♣ 各 13 张、从 2 到 A 排,52 是小王,53 是大王。 */
const SUITS={S:'♠', H:'♥', D:'♦', C:'♣'};
const RANKN={11:'J', 12:'Q', 13:'K', 14:'A'};
function card(id){
  const d=id%54;
  if(d===52) return {suit:'X', rank:15, s:'小王'};
  if(d===53) return {suit:'X', rank:16, s:'大王'};
  const suit='SHDC'[Math.floor(d/13)], rank=2+(d%13);
  return {suit, rank, s:SUITS[suit]+(RANKN[rank]||rank)};
}
const show=ids=>ids.map(i=>card(i).s).join(' ');
// 分:5 算 5 分,10 和 K 各算 10 分
const pointsOf=ids=>ids.reduce((a,i)=>{const r=card(i).rank; return a+(r===5?5:(r===10||r===13)?10:0);},0);
// 手牌排序:按花色、再按点数,只为了看着顺眼
const sortIds=ids=>ids.slice().sort((x,y)=>{
  const a=card(x), b=card(y), o='SHDCX';
  return o.indexOf(a.suit)-o.indexOf(b.suit) || a.rank-b.rank || x-y;
});

// ---------- 读文件 ----------
function readMatches(f){
  const buf=fs.readFileSync(f);
  // Z_SYNC_FLUSH:文件万一被截断,也把能解的都解出来,而不是整个抛
  const txt=zlib.gunzipSync(buf,{finishFlush:zlib.constants.Z_SYNC_FLUSH}).toString('utf8');
  return txt.split('\n').filter(l=>l.trim()).map(l=>JSON.parse(l));
}

// ---------- 还原四家的手牌 ----------
/* 每一墩的领出方:第一墩是庄家,之后是上一墩的赢家(t.w)。
 * 记录里不存这个 —— 存了就是 258722 局 × 17 墩的冗余,而它一行就能算出来。 */
function leaders(r){
  const L=[]; let cur=r.declSeat;
  for(const t of r.plays){ L.push(cur); cur=t.w; }
  return L;
}

function handsOf(r){
  const hands=[[],[],[],[]], L=leaders(r);
  r.plays.forEach((t,i)=>{
    // t.p 是**按出牌顺序**排的,第一个就是领出方
    for(let k=0;k<4;k++) hands[(L[i]+k)%4].push(...t.p[k]);
  });
  // 庄家:出掉的 25 张 + 扣掉的 8 张 − 底牌的 8 张 = 发到手的 25 张
  const kitty=new Set(r.kitty);
  const dealt=[...hands[r.declSeat], ...r.buried].filter(id=>!kitty.has(id));
  hands[r.declSeat]=dealt;
  return hands;
}

// ---------- 渲染一局 ----------
function round(r, names, opt){
  const who=s=>`座位${s}(${names[s]})`;
  const trump=r.trump ? SUITS[r.trump] : '无主';
  const out=[];
  out.push(`── 第 ${r.no} 局 ──  庄家 ${who(r.declSeat)}  主 ${trump}${r.trumpRank>=2?' '+(RANKN[r.trumpRank]||r.trumpRank):''}` +
           `  亮主强度 ${r.declStrength}${r.redeals?`  重发 ${r.redeals} 次`:''}`);
  out.push(`   发牌先手 座位${r.first}   底牌 ${show(r.kitty)}`);
  out.push(`   庄家扣底 ${show(r.buried)}${r.kittyPts?`  (底里有 ${r.kittyPts} 分)`:''}`);

  const hands=handsOf(r);
  /* 每次渲染都验一遍:四家发到手的各 25 张,**加上底牌那 8 张**,恰好一副 108 张。
   * 不能加扣牌 —— 扣的 8 张是从「手牌 + 底牌」这 33 张里挑的,本来就已经算过一遍了。 */
  const all=new Set([...hands.flat(), ...r.kitty]);
  const sizes=hands.map(h=>h.length);
  if(all.size!==108 || sizes.some(n=>n!==25))
    out.push(`   ! 牌对不上:四家 ${sizes.join('/')} 张,连底共 ${all.size} 张(应当是 25/25/25/25、108)`);

  if(opt.hands){
    out.push('   手牌');
    for(let s=0;s<4;s++) out.push(`     ${who(s)}  ${show(sortIds(hands[s]))}`);
  }

  const declTeam=r.declSeat%2, L=leaders(r);
  let got=0;
  for(let i=0;i<r.plays.length;i++){
    const t=r.plays[i];
    const pts=pointsOf(t.p.flat());
    const defWon=t.w%2!==declTeam;
    if(defWon) got+=pts;
    const cards=t.p.map((cs,k)=>`${(L[i]+k)%4}:${show(cs)}`).join('   ');
    out.push(`   墩${String(i+1).padStart(2)}  ${cards}` +
             `\n         → 座位${t.w} 赢${pts?`,${pts} 分${defWon?'(闲家收下)':'(庄家吃掉)'}`:''}`);
  }
  /* 闲家最终得分是三步来的,记录里三步的中间值都在,别把它们混成一个数:
   *   墩上分(rawTotal)→ 判罚加减并夹回 [0,200] → 末墩是闲家赢的话再加「底分 × 倍数」
   * total 是**最后**那个数,所以 total ≠ rawTotal 不一定是罚了分,多半是抠了底。 */
  const fined=r.penalty[0]||r.penalty[1];
  const kick=r.defWonLast ? r.kittyPts*r.mult : 0;
  let line=`   闲家墩上 ${r.rawTotal} 分`;
  if(fined) line+=`  →  判罚 ${r.penalty.join('/')} 后 ${r.total-kick} 分`;
  if(r.defWonLast) line+=`  →  末墩闲家赢,抠底 ${r.kittyPts} × ${r.mult} = ${kick} 分`;
  if(fined||r.defWonLast) line+=`  →  共 ${r.total} 分`;
  out.push(line);
  out.push(`   ${r.defendersWin?`闲家上台,升 ${r.defLevelsUp||0} 级`:'庄家守住'}` +
           `  级数 ${r.before.join('-')} → ${r.after.join('-')}`);
  // 记录里 got 是从每一墩加出来的,rawTotal 是引擎结算的 —— 两个数必须相等
  if(got!==r.rawTotal) out.push(`   ! 逐墩加出来是 ${got} 分,记录写的是 ${r.rawTotal} 分`);
  return out.join('\n');
}

// ---------- 渲染一场 ----------
function match(m, opt){
  // aTeam 是 a 这一场坐哪一队:0 = 座位 0/2,1 = 座位 1/3
  const names=[0,1,2,3].map(s=>s%2===m.aTeam?m.a:m.b);
  const res=m.winner===null?'平局':(m.winner==='a'?`${m.a} 胜`:`${m.b} 胜`);
  const head=`\n═══ ${m.a} vs ${m.b}  第 ${m.seed} 副  ${m.a} 坐 ${m.aTeam===0?'0/2':'1/3'} ═══\n` +
             `    ${res}   终局级数 ${m.a} ${m.levels[0]} : ${m.levels[1]} ${m.b}   共 ${m.rounds.length} 局`;
  const rs=opt.round ? m.rounds.filter(r=>r.no===opt.round) : m.rounds;
  return [head, ...rs.map(r=>round(r, names, opt))].join('\n\n');
}

// ---------- 入口 ----------
const args=process.argv.slice(2);
const flag=k=>{ const a=args.find(x=>x.startsWith(`--${k}=`)); return a?a.slice(k.length+3):null; };
const file=args.find(a=>!a.startsWith('--'));
const seed=args.filter(a=>!a.startsWith('--'))[1];
if(!file){
  console.error(fs.readFileSync(__filename,'utf8').split('\n').slice(1,12).join('\n').replace(/^ \*ceil?/gm,''));
  process.exit(1);
}
const opt={hands:args.includes('--hands'), round:flag('round')?+flag('round'):null};
const side=flag('side');
const all=readMatches(file);

if(seed===undefined){
  const a=all[0].a, b=all[0].b;
  let wa=0, wb=0, rounds=0;
  for(const m of all){ if(m.winner==='a')wa++; else if(m.winner==='b')wb++; rounds+=m.rounds.length; }
  console.log(`${a} vs ${b}:${all.length} 场 / ${rounds} 局,${a} ${wa}-${wb} ${b}`);
  console.log(`副数 ${Math.min(...all.map(m=>m.seed))}..${Math.max(...all.map(m=>m.seed))},每副两场(交换阵营)`);
  console.log(`\n看某一副:node ${process.argv[1].replace(process.cwd()+'/','')} ${file} <副数> [--side=0|1] [--round=N] [--hands]`);
  process.exit(0);
}
let sel=all.filter(m=>m.seed===+seed);
if(side!==null) sel=sel.filter(m=>m.aTeam===+side);
if(!sel.length){ console.error(`没有第 ${seed} 副${side!==null?`(--side=${side})`:''}的记录`); process.exit(1); }
console.log(sel.map(m=>match(m,opt)).join('\n'));
