// 浮生 · UI 层
// 渲染开局分配 / 游戏节点 / 结局 / 属性条 / 时间轴。回调交给 main.js 编排引擎。

import { TALENTS, STAGES } from './data.js';
import { stageName } from './engine.js';

const $ = (id)=>document.getElementById(id);

// ---------------- 顶部条 ----------------
export function updateTopbar(state){
  $('topbar').hidden=false;
  const y = state.ageWeeks/52;
  $('ageTag').textContent = `${Math.floor(y)} 岁${state.ageWeeks%52?` · ${state.ageWeeks%52}周`:''}`;
  $('stageTag').textContent = stageName(state.currentStage);
}
export function hideTopbar(){ $('topbar').hidden=true; }

// ---------------- 属性面板 ----------------
const ATTR_LABEL = { charm:'颜值', intel:'智力', health:'体质', family:'家境', mood:'心境' };
export function updateAttrs(state, flashKeys){
  $('attrsPanel').hidden=false;
  const g = $('attrsGrid'); g.innerHTML='';
  for (const k of ['charm','intel','health','family','mood']){
    const v = state.attrs[k];
    const div = document.createElement('div');
    const flash = flashKeys && flashKeys.includes(k);
    div.className = 'attr'+(k==='mood'?' mood':'')+(flash?' flash':'');
    div.innerHTML = `<span class="lbl">${ATTR_LABEL[k]}</span>
      <div class="bar"><i style="width:${Math.min(100,v*10)}%"></i></div>
      <span class="val">${k==='mood' ? moodWord(v) : v}</span>`;
    g.appendChild(div);
  }
  // 心境提示
  $('moodHint').textContent = state.attrs.mood<=3 ? '最近总提不起劲。' : (state.attrs.mood>=9 ? '心里轻快。' : '');
  // 天赋
  const tr = $('talentsRow'); tr.innerHTML='';
  for (const tid of state.talents){
    const t = TALENTS.find(x=>x.id===tid); if(!t) continue;
    const s = document.createElement('span'); s.className='t'; s.textContent=t.name; tr.appendChild(s);
  }
}
function moodWord(v){ return v<=2?'阴':v<=4?'阴':v<=6?'晴':v<=8?'晴':'晴'; }

// ---------------- 属性变化浮动提示 ----------------
export function showDelta(delta){
  const t = $('deltaToast');
  if (!t) return;
  const keys = Object.keys(delta);
  if (!keys.length){ t.hidden = true; return; }
  t.innerHTML = keys.map(k=>{
    const v = delta[k];
    const cls = v>0?'up':(v<0?'down':'flat');
    return `<span class="d-item ${cls}">${ATTR_LABEL[k]} ${v>0?'+':''}${v}</span>`;
  }).join('');
  t.hidden = false;
  t.classList.remove('fade');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>{ t.classList.add('fade'); setTimeout(()=>{ t.hidden = true; t.classList.remove('fade'); }, 400); }, 2800);
}

// ---------------- 开局屏 ----------------
export function renderStart(container, cb){
  const birthYear = 2000; // 千禧一代定制
  const alloc = { charm:4, intel:4, health:4, family:4, mood:4 }; // 共20点，每项最低1
  const picked = new Set();

  container.innerHTML = `
    <div class="start">
      <h1 class="title">浮生</h1>
      <p class="sub">千禧一代 · 文字人生 · 0–75 岁</p>
      <p class="quote">“人这一辈子，说是长，其实也就那么几件事。”</p>

      <div class="alloc" id="allocWrap"></div>
      <p class="pool" id="poolTxt"></p>

      <p class="sub" style="margin-top:14px">出身于 ${birthYear} 年 · 选 3 个天赋即可投胎</p>
      <div class="talent-pick" id="talentWrap"></div>

      <div class="start-actions">
        <button class="solid-btn" id="beginBtn" disabled>投胎</button>
      </div>
      <button class="ghost-link" id="resumeBtn" hidden>读取上次一生</button>
    </div>`;

  const wrap = $('allocWrap');
  const usedPoints = ()=>Object.values(alloc).reduce((s,x)=>s+x,0);
  function bump(k, delta){
    const nv = alloc[k] + delta;
    if (nv < 1 || nv > 10) return;
    if (delta > 0 && usedPoints() >= 20) return; // 无富余点数
    alloc[k] = nv; refreshAlloc();
  }
  for (const k of Object.keys(alloc)){
    const row = document.createElement('div'); row.className='row'; row.dataset.k=k;
    row.innerHTML = `<span class="name">${ATTR_LABEL[k]}</span>
      <div class="pts"></div>
      <div class="ctrl">
        <button type="button" data-d="-1" aria-label="减少">−</button><span class="val" style="width:18px;text-align:center;font-family:var(--sans)"></span><button type="button" data-d="1" aria-label="增加">+</button>
      </div>`;
    wrap.appendChild(row);
    row.querySelectorAll('button[data-d]').forEach(btn=>{
      btn.onclick = ()=> bump(k, parseInt(btn.dataset.d,10));
    });
  }
  function refreshAlloc(){
    for (const row of wrap.querySelectorAll('.row')){
      const k=row.dataset.k; const v=alloc[k];
      const pts=row.querySelector('.pts'); pts.innerHTML='';
      for(let i=1;i<=10;i++){ const d=document.createElement('div'); d.className='pt'+(i<=v?' on':'');
        d.onclick=()=>{
          const used=usedPoints();
          if(i>alloc[k] && used + (i-alloc[k]) > 20) return;
          alloc[k]=i; refreshAlloc();
        };
        pts.appendChild(d);
      }
      row.querySelector('.val').textContent=v;
    }
    $('poolTxt').textContent = usedPoints()===20
      ? `已分配 ${usedPoints()}/20（每项 4，可用 +/- 调整分布，或直接选 3 天赋投胎）`
      : `可分配 ${20-usedPoints()}/20（每项 1–10，共 20 点）`;
  }
  refreshAlloc();

  const tw=$('talentWrap');
  for(const t of TALENTS){
    const c=document.createElement('div'); c.className='talent-card'; c.dataset.id=t.id;
    c.innerHTML=`<div class="tn">${t.name}</div><div class="td">${t.desc}</div>`;
    c.onclick=()=>{
      if(picked.has(t.id)){ picked.delete(t.id); c.classList.remove('picked'); }
      else if(picked.size<3){ picked.add(t.id); c.classList.add('picked'); }
      else return;
      $('beginBtn').disabled = picked.size!==3;
    };
    tw.appendChild(c);
  }
  $('beginBtn').onclick=()=>{ cb.onStart({ birthYear, attrs:{...alloc}, talentIds:[...picked] }); };

  if(cb.hasResume){ const b=$('resumeBtn'); b.hidden=false; b.onclick=()=>cb.onResume(); }
}

// ---------------- 游戏节点 ----------------
export function renderNode(container, node, state, cb){
  container.innerHTML='';

  // 过渡旁白：衔接上一选择，作为前置衔接语（斜体灰，左侧细线）
  if(node.transition){
    const tr = document.createElement('p'); tr.className='narration transition';
    container.appendChild(tr);
    requestAnimationFrame(()=>{ tr.innerHTML = markEm(node.transition); requestAnimationFrame(()=>tr.classList.add('in')); });
  }

  const n = document.createElement('p'); n.className='narration';
  // AI 来源标记
  if(node.source==='llm'){ const m=document.createElement('span'); m.className='ai-mark'; m.textContent='AI'; }
  container.appendChild(n);

  const meta = document.createElement('div'); meta.className='meta-line';
  meta.textContent = node.source==='llm' ? '此刻 · 由 AI 依据你的处境落笔' : (node.source==='era'?'时代背景音':'');
  container.appendChild(meta);

  // 打字/淡入
  requestAnimationFrame(()=>{ n.innerHTML = markEm(node.narration); requestAnimationFrame(()=>n.classList.add('in')); });

  const choicesWrap = document.createElement('div'); choicesWrap.className='choices';
  container.appendChild(choicesWrap);

  if(node.choices && node.choices.length){
    node.choices.forEach((c,i)=>{
      const b=document.createElement('button'); b.className='choice'+(c.locked?' disabled':'');
      b.innerHTML = `${c.locked?'<span class="lock">🔒</span>':''}${escapeHtml(c.text)}` +
        (c.locked?`<span class="req">${reqText(c.requirement)}</span>`:'');
      if(!c.locked) b.onclick=()=>cb.onChoice(i);
      choicesWrap.appendChild(b);
    });
  } else {
    // 纯旁白节点：给一个“继续”按钮
    const cb2=document.createElement('button'); cb2.className='continue-btn'; cb2.textContent='… 继续';
    cb2.onclick=()=>cb.onChoice(-1);
    choicesWrap.appendChild(cb2);
  }
}
function markEm(t){ // 简单把书名号内容标红
  return escapeHtml(t).replace(/《([^》]+)》/g,'<span class="em">《$1》</span>');
}
function reqText(req){ if(!req) return ''; return Object.entries(req).map(([k,v])=>`${ATTR_LABEL[k]||k}${v}`).join('、')+' 才可选'; }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// ---------------- 结局屏 ----------------
export function renderEnding(container, result, state){
  const y=Math.floor(state.ageWeeks/52);
  const a=state.attrs;
  container.innerHTML='';
  const wrap=document.createElement('div'); wrap.className='ending';
  wrap.innerHTML=`
    <h2 class="grade">${result.grade.name}</h2>
    <p class="grade-sub">数值评级 · ${result.grade.desc}</p>
    <p class="narrative">${escapeHtml(result.narrative)}</p>
    <div class="stats">
      <b>享年</b> ${y} 岁　
      <b>五维峰值</b> 颜值${a.charm} / 智力${a.intel} / 体质${a.health} / 家境${a.family} / 心境${a.mood}<br>
      <b>一生抉择</b> ${state.history.filter(h=>h.choiceText).length} 次　
      <b>叙事来源</b> ${result.source==='llm'?'AI 生成':'规则生成'}
    </div>
    <div class="start-actions">
      <button class="solid-btn" id="againBtn">再活一次</button>
      <button class="ghost-link" id="tlBtn" style="flex:0 0 auto;border:1px solid var(--line);padding:10px 16px">回看一生</button>
    </div>`;
  container.appendChild(wrap);
  $('againBtn').onclick=()=>location.reload();
  $('tlBtn').onclick=()=>{ renderTimeline(state.history); $('timelineOverlay').hidden=false; };
  hideTopbar();
}

// ---------------- 时间轴 ----------------
export function renderTimeline(history){
  const list=$('timelineList'); list.innerHTML='';
  if(!history.length){ list.innerHTML='<p style="color:var(--ink-faint)">还没有走过任何一段。</p>'; return; }
  history.forEach(h=>{
    const y=(h.ageWeeks/52).toFixed(1);
    const it=document.createElement('div'); it.className='tl-item';
    it.innerHTML=`<div class="age">${y} 岁${h.source==='llm'?' · AI':''}</div>
      <div class="txt">${escapeHtml(h.narration)}</div>
      ${h.choiceText?`<div class="ch">→ ${escapeHtml(h.choiceText)}</div>`:''}`;
    list.appendChild(it);
  });
}

// ---------------- AI 思考提示 ----------------
export function showThinking(on, text){
  const t=$('thinking'); t.hidden=!on;
  if(on && text) $('thinkingText').textContent=text;
}
