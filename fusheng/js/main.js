// 浮生 · 入口与游戏循环
import * as engine from './engine.js';
import * as ui from './ui.js';
import { current as currentAI, getAIConfig, setAIConfig, isAIActive } from './ai.js';
import { MAX_AGE_WEEKS } from './data.js';

const stageEl = document.getElementById('stage');
let state = null;
let currentNode = null;

// ---------------- 启动 ----------------
boot();

function boot(){
  bindMenu();
  bindAIConfig();
  // 开局屏
  ui.renderStart(stageEl, {
    hasResume: engine.hasSave(),
    onStart: ({ birthYear, attrs, talentIds }) => {
      state = engine.newRun(birthYear, attrs, talentIds);
      engine.save(state);
      ui.updateTopbar(state); ui.updateAttrs(state);
      nextTurn();
    },
    onResume: () => {
      const s = engine.load();
      if (!s){ alert('没有可继续的一生'); return; }
      state = s; ui.updateTopbar(state); ui.updateAttrs(state);
      nextTurn();
    },
  });
}

// ---------------- 游戏循环 ----------------
async function nextTurn(){
  if (state.ageWeeks >= MAX_AGE_WEEKS || state.attrs.health<=0){
    return finish();
  }
  ui.updateTopbar(state); ui.updateAttrs(state);

  // 引擎按优先级链挑选
  let node = engine.pickNext(state);

  if (node===null){
    // 无固定事件 → AI 依据意图生成动态节点（核心：不靠固定模板）
    const ai = currentAI();
    if (isAIActive()){ ui.showThinking(true, '正在为你这一刻落笔'); }
    try { node = await ai.dynamicNode(state); }
    catch { node = await ai.ambient(state); }
    finally { ui.showThinking(false); }
    // 给 AI 节点补上时间快进与推进信息
    node = { ...node, stage: state.currentStage, kind:'dynamic', choices: node.choices||[], timeAdvanceWeeks: node.timeAdvanceWeeks ?? 2 };
  }

  // 暮年回望：到 S10 且未触发过回望节点，且本节点非回望本身
  if (state.currentStage==='S10' && !state._triggered.includes('s10_lookback') && node.id!=='s10_lookback'){
    state._triggered.push('s10_lookback');
    const ai = currentAI();
    ui.showThinking(true, '回望这一生');
    try {
      const ret = await ai.retrospective(state);
      ui.showThinking(false);
      // 先插播一段回望，再进入本节点
      await playRetrospective(ret.narration);
    } catch { ui.showThinking(false); }
  }

  currentNode = node;
  ui.renderNode(stageEl, node, state, { onChoice: handleChoice });
}

async function playRetrospective(text){
  // 把回望作为一段纯旁白节点呈现，等玩家“继续”
  return new Promise(resolve=>{
    ui.renderNode(stageEl, { id:'lookback', stage:'S10', narration:text, choices:[], timeAdvanceWeeks:2, source:'llm' },
      state, { onChoice: ()=>resolve() });
  });
}

function handleChoice(idx){
  if (idx===-1){
    // 纯旁白继续
    engine.applyAmbientAdvance(state, currentNode, currentNode.timeAdvanceWeeks||2);
    engine.save(state);
    return nextTurn();
  }
  const choice = engine.applyChoice(state, currentNode, idx);
  if (!choice){ return; } // 锁定项忽略
  // 选项内嵌的“选后旁白”
  if (choice.narration){
    ui.renderNode(stageEl, { id:currentNode.id+'_r', stage:state.currentStage, narration:choice.narration, choices:[], timeAdvanceWeeks:0, source:'rule' },
      state, { onChoice:()=>{ engine.save(state); nextTurn(); } });
    // 把这次推进放回到继续时（applyChoice 已推进时间）
    return;
  }
  // nextNode 跳转
  if (choice.nextNode){
    const jump = engine.jumpTo(state, choice.nextNode);
    if (jump){ currentNode = jump; engine.save(state); ui.renderNode(stageEl, jump, state, { onChoice: handleChoice }); return; }
  }
  engine.save(state);
  nextTurn();
}

// ---------------- 结局 ----------------
async function finish(){
  ui.showThinking(true, '翻看这一生');
  let result;
  try { result = await engine.buildEnding(state); }
  catch { result = { narrative:'寻常人寻常一生。', grade:{name:'寻常',desc:'平平一生。'}, score:0, source:'rule' }; }
  ui.showThinking(false);
  engine.clearSave();
  ui.renderEnding(stageEl, result, state);
}

// ---------------- 菜单 ----------------
function bindMenu(){
  document.getElementById('menuBtn').onclick = ()=>{ document.getElementById('menuOverlay').hidden=false; };
  document.querySelectorAll('#menuOverlay .menu-item').forEach(b=>{
    b.onclick=()=>{
      document.getElementById('menuOverlay').hidden=true;
      const a=b.dataset.act;
      if(a==='timeline'){ ui.renderTimeline(state?state.history:[]); document.getElementById('timelineOverlay').hidden=false; }
      else if(a==='attrs'){ const p=document.getElementById('attrsPanel'); p.hidden=!p.hidden; }
      else if(a==='save'){ if(state){ engine.save(state); flash('已保存'); } }
      else if(a==='restart'){ if(confirm('重新投胎？当前一生会丢失。')){ engine.clearSave(); location.reload(); } }
      else if(a==='aiConfig'){ openAIConfig(); }
    };
  });
  document.querySelector('#timelineOverlay .close').onclick=()=>{ document.getElementById('timelineOverlay').hidden=true; };
}
function flash(msg){ const s=document.getElementById('aiStatus'); if(s){ s.textContent=msg; setTimeout(()=>s.textContent='',1200);} }

// ---------------- AI 接入设置 ----------------
function bindAIConfig(){
  const o=document.getElementById('aiOverlay');
  document.querySelector('#aiOverlay .close').onclick=()=>o.hidden=true;
  document.getElementById('aiSaveBtn').onclick=()=>{
    setAIConfig({
      endpoint: document.getElementById('aiEndpoint').value.trim(),
      apiKey: document.getElementById('aiKey').value.trim(),
      model: document.getElementById('aiModel').value.trim(),
      enabled: document.getElementById('aiEnabled').checked,
    });
    const s=document.getElementById('aiStatus');
    s.textContent = isAIActive() ? '已启用 AI 内容生成。无合适固定事件、回望与结局将动态生成。' : '未启用，引擎走规则文案。';
  };
}
function openAIConfig(){
  const c=getAIConfig();
  document.getElementById('aiEndpoint').value=c.endpoint||'';
  document.getElementById('aiKey').value=c.apiKey||'';
  document.getElementById('aiModel').value=c.model||'';
  document.getElementById('aiEnabled').checked=!!c.enabled;
  document.getElementById('aiStatus').textContent = isAIActive() ? '当前：AI 已启用' : '当前：规则文案（未启用 AI）';
  document.getElementById('aiOverlay').hidden=false;
}
