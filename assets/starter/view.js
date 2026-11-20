'use strict';
(() => {
  const model = ATLAS;
  let session = AtlasCore.createSession(model);
  const pages = new Map(model.pages.map(p => [p.id,p]));
  const actions = new Map(model.actions.map(a => [a.id,a]));
  const reqs = new Map(model.requirements.map(r => [r.id,r]));
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const format = s => AtlasCore.format ? AtlasCore.format(s ?? '',session.state) : String(s ?? '');
  const title = id => pages.get(id)?.title || id;
  const clickBtn = (attr,value,content,cls='') => '<button class="'+cls+'" '+attr+'="'+esc(value)+'">'+content+'</button>';
  const depths = {up:1,down:1};
  let walk = null, previousSession = null, graphBounds = null, zoom = 1, panX = 0, panY = 0;
  let renderedGraphKey = '', dragging = null, dragged = false, fitPending = true;
  const ns = 'http://www.w3.org/2000/svg';
  function svg(tag,attrs,text) {
    const n = document.createElementNS(ns,tag);
    Object.entries(attrs || {}).forEach(([k,v]) => n.setAttribute(k,v));
    if (text !== undefined) n.textContent=text;
    return n;
  }
  const usable = a => session.mode === 'plan' || (!a.planned && !pages.get(a.from)?.planned && !pages.get(a.to)?.planned);
  const livePages = () => model.pages.filter(p=>session.mode==='plan'||!p.planned).map(p=>p.id);
  const activeActions = () => session.actions().map(a => typeof a === 'string' ? actions.get(a) : a).filter(Boolean);
  function dest(a, parent) {
    if (a.to === '$self') return a.from;
    if (a.to === '$back') return parent;
    return a.to;
  }
  function requirementsOf(page) {
    return [...new Set([...(page.requirements || []),...model.actions.filter(a=>usable(a) && (a.from===page.id || a.to===page.id)).flatMap(a=>a.requirements||[])])];
  }
  function safeDoc(source) {
    if (!source || typeof source !== 'string') return '';
    try {
      const parsed=new URL(source,document.baseURI);
      if(!['file:','http:','https:'].includes(parsed.protocol)) return '';
      return '<a href="'+esc(source)+'" target="_blank" rel="noopener">查看来源 ↗</a>';
    } catch { return ''; }
  }
  function showDialog(heading,html) {
    byId('dialogTitle').textContent=heading;
    byId('dialogBody').innerHTML=html;
    const dlg=byId('drawer');
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop=0;
  }
  function closeDialog(){if(byId('drawer').open)byId('drawer').close()}
  function renderPhone() {
    const page=pages.get(session.current), preview=page.preview || {};
    const available=activeActions();
    const rendered=new Set();
    const row=(action,label,meta='')=>{
      rendered.add(action.id);
      return clickBtn('data-action',action.id,'<span><b>'+esc(format(label))+'</b>'+(meta?'<small>'+esc(format(meta))+'</small>':'')+'</span><i>'+(action.planned?'<span class="future-tag">规划</span>':'')+(action.to==='$self'?'·':action.to==='$back'?'↶':'›')+'</i>','phone-row');
    };
    const items=(preview.items || []).filter(item=>!item.when||AtlasCore.matches(item.when,session.state)).map(item=>{
      const action=available.find(a=>a.id===item.actionId);
      if(action) return row(action,item.title,item.meta);
      if(item.actionId) return '';
      return '<div class="record"><b>'+esc(format(item.title))+'</b>'+(item.meta?'<small>'+esc(format(item.meta))+'</small>':'')+'</div>';
    }).join('');
    const remaining=available.filter(a=>!rendered.has(a.id)).map(a=>row(a,a.label)).join('');
    // Art belongs to the example's library landing page; other products can omit it.
    const art=preview.art==='books'?'<div class="art" aria-hidden="true"><i></i><i></i><i></i><i></i></div>':'';
    byId('phone').innerHTML='<div class="phone-top"><span>'+esc(format(preview.eyebrow || page.group))+'</span>'+(session.mode==='plan'?'<span class="pill">含规划</span>':'')+'</div>'+
      '<h3>'+esc(format(preview.title || page.title))+'</h3>'+art+
      (preview.subtitle?'<p>'+esc(format(preview.subtitle))+'</p>':'')+
      '<div class="phone-list">'+items+remaining+'</div>';
    byId('route').textContent=session.stack.map(title).join('　›　');
    byId('description').textContent=page.description||'';
    byId('refs').innerHTML=requirementsOf(page).map(id=>clickBtn('data-req',id,esc(id))).join('');
  }
  function perform(id) {
    const action=activeActions().find(a=>a.id===id);
    if(!action){
      if(walk){walk.error='当前页面或示例状态尚不满足这一步的条件。';renderPlayer()}
      return false;
    }
    if(walk) {
      if(walk.error || walk.index>=walk.c.steps.length) return false;
      if(id!==walk.c.steps[walk.index]){
        walk.error='这个动作不在当前步骤中。可以继续执行指定动作，或退出走查自由浏览。';
        renderPlayer();return false;
      }
    }
    const result=session.perform(id);
    if(result===false || result?.ok===false){
      if(walk)walk.error='此动作在当前条件下无法完成。';
      renderPlayer();return false;
    }
    if(walk){
      walk.index++;
      if(walk.index===walk.c.steps.length){
        const correctPage=!walk.c.endsAt || session.current===walk.c.endsAt;
        const correctState=!walk.c.expectState || AtlasCore.matches(walk.c.expectState,session.state);
        if(!correctPage || !correctState)walk.error='走查到达末步，但模型结果与预期不符。请核对终点和示例状态。';
      }
    }
    render();
    return true;
  }
  function navigate(id) {
    if (!pages.has(id)) return;
    if(walk){walk.error='正在走查指定路径。请回到当前步骤，或退出走查后再切换页面。';renderPlayer();return}
    session.jump(id);closeDialog();render();
  }
  function openRequirements() {
    showDialog('需求与走查','<div class="dialog-list">'+model.requirements.map(r=>clickBtn('data-req',r.id,'<span><b>'+esc(r.title)+'</b><small>　'+esc(r.id)+'</small></span><span class="pill">'+esc(r.status)+'</span>','dialog-row')).join('')+'</div>');
  }
  let report=null;
  function openReport(id) {
    const r=reqs.get(id);if(!r)return;
    const mode=model.actions.some(a=>a.planned&&(a.requirements||[]).includes(id))?'plan':session.mode;
    const data=AtlasCore.impact(model,id,mode);
    report={r,data,mode};
    const names=ids=>ids.length?ids.map(v=>'<span>'+esc(title(typeof v==='string'?v:v.id))+'</span>').join(''):'<span>无单独登记的页面</span>';
    showDialog(r.title,'<p class="dialog-sub">'+esc(r.id)+'　'+esc(r.status)+'　'+safeDoc(r.source)+'</p>'+
      '<h3>涉及页面</h3><div class="chips">'+names(data.pages)+'</div><h3>相关入口</h3><div class="chips">'+names(data.entries)+'</div><h3>走查路径</h3>'+
      data.cases.map((c,i)=>'<div class="case"><b>'+esc(c.title)+'</b><p>'+esc(c.expect)+'</p>'+clickBtn('data-case',i,'逐步走查 →')+'</div>').join(''));
  }
  function openIndex(){
    showDialog('查找页面','<input id="filterPages" type="search" aria-label="页面名称或相关动作" placeholder="输入页面名称或操作"><div id="pageResults" class="dialog-list"></div>');
    function update(term) {
      const q=term.trim().toLocaleLowerCase();
      byId('pageResults').innerHTML=[...livePages()].map(id=>pages.get(id)).filter(Boolean).filter(p=>[p.title,p.group,p.description,...model.actions.filter(a=>usable(a)&&a.from===p.id).map(a=>a.label)].join(' ').toLocaleLowerCase().includes(q))
        .map(p=>clickBtn('data-jump',p.id,'<b>'+esc(p.title)+'</b><small>'+esc(p.group)+'</small>','dialog-row')).join('')||'<span>没有找到匹配页面</span>';
    }
    update('');byId('filterPages').oninput=e=>update(e.target.value);byId('filterPages').focus();
  }
  function startWalk(index) {
    const c=report?.data.cases[index];if(!c||!c.steps.length)return;
    if(!walk)previousSession=session;
    session=AtlasCore.createSession(model);session.setMode(report.mode);
    const start=Array.isArray(c.start)?c.start.at(-1):c.start;
    if(start && start!==session.current)session.jump(start);
    walk={c,index:0,error:'',req:report.r.id,caseIndex:index,report};
    closeDialog();render();byId('player').scrollIntoView({block:'nearest'});
  }
  function leaveWalk() {
    if(!walk)return;
    const req=walk.req;
    session=previousSession;walk=null;previousSession=null;
    render();openReport(req);
  }
  function renderPlayer() {
    const player=byId('player');player.hidden=!walk;if(!walk){player.replaceChildren();return}
    const total=walk.c.steps.length, complete=walk.index===total;
    const current=actions.get(walk.c.steps[walk.index]);
    player.innerHTML='<div class="phone-top"><span>网页走查　'+(complete?(walk.error?'结果待核对':'已走完'):(walk.index+1)+' / '+total)+'</span>'+clickBtn('data-walk','exit','退出走查')+'</div><h3>'+esc(walk.c.title)+'</h3>'+
      (current?'<p>'+esc(title(current.from))+'　›　<strong>'+esc(current.label)+'</strong></p>':'')+
      '<p>预期　'+esc(walk.c.expect)+'</p>'+
      (walk.error?'<p role="alert">'+esc(walk.error)+'</p>':'')+
      '<div class="player-buttons">'+(complete?clickBtn('data-walk','again','重新走一遍'):clickBtn('data-walk',walk.error?'resume':'next',walk.error?'回到当前步骤':'执行这一步','primary'))+'</div>';
  }

  function getDiagram() {
    const center=session.current,last=session.stack.at(-2);
    const grouped=new Map();
    function add(from,to,action) {
      if(!pages.has(from)||!pages.has(to))return;
      const key=JSON.stringify([from,to]);
      if(!grouped.has(key))grouped.set(key,{from,to,actions:[]});
      const e=grouped.get(key);
      if(!e.actions.some(a=>a.id===action.id))e.actions.push(action);
    }
    for(const a of model.actions.filter(usable)){
      const index=session.stack.lastIndexOf(a.from);
      const parent=index>0?session.stack[index-1]:null;
      add(a.from,dest(a,parent),a);
    }
    const edges=[...grouped.values()],levels=new Map([[center,0]]);
    // Keep the actual source on the left when a shared detail also returns there.
    if(last&&last!==center&&depths.up>0)levels.set(last,-1);
    function expand(direction,limit) {
      let wave=[center];
      const seen=new Set(wave);
      for(let d=1;d<=limit;d++){
        const next=new Set();
        for(const from of wave)for(const edge of edges){
          const to=direction<0?(edge.to===from?edge.from:null):(edge.from===from?edge.to:null);
          if(!to||seen.has(to))continue;
          seen.add(to);next.add(to);
          if(!levels.has(to))levels.set(to,direction*d);
        }
        wave=[...next];
      }
    }
    expand(1,depths.down); expand(-1,depths.up);
    const cols=new Map();
    for(const [id,level] of levels){
      if(!cols.has(level))cols.set(level,[]);cols.get(level).push(id);
    }
    const tallest=Math.max(...[...cols.values()].map(c=>c.length));
    const positions=new Map();
    for(const [level,ids] of cols)ids.forEach((id,i)=>positions.set(id,{x:level*226,y:(i-(ids.length-1)/2)*88}));
    const min=Math.min(...levels.values()), max=Math.max(...levels.values());
    return {positions,levels,edges:edges.filter(e=>levels.has(e.from)&&levels.has(e.to)),
      bounds:{x:min*226-92,y:-(tallest-1)*44-78,w:(max-min)*226+184,h:(tallest-1)*88+133}};
  }
  function edgeDialog(edge) {
    const rows=edge.actions.map(a=>{
      const enabled=session.current===edge.from&&activeActions().some(item=>item.id===a.id);
      return '<div class="case"><b>'+esc(a.label)+'</b>　<small>'+esc(a.kind||'')+'</small><div class="chips">'+(a.requirements||[]).map(r=>clickBtn('data-req',r,esc(r))).join('')+'</div>'+
        (enabled?clickBtn('data-edge-act',a.id,'执行此操作'):'')+'</div>';
    });
    showDialog(title(edge.from)+' → '+title(edge.to),rows.join(''));
  }
  function renderGraph() {
    const diagram=getDiagram(),world=byId('world');
    world.replaceChildren();
    const key=[session.mode,session.current,depths.up,depths.down,...diagram.levels.keys()].join('|');
    const refit=fitPending||key!==renderedGraphKey;
    renderedGraphKey=key;graphBounds=diagram.bounds;
    const paintedLevels=new Set();
    for(const [id,level] of diagram.levels){
      if(paintedLevels.has(level))continue;paintedLevels.add(level);
      world.append(svg('text',{class:'column-title',x:level*226,y:diagram.bounds.y+17},level<0?'上游 · '+Math.abs(level):level>0?'下游 · '+level:'当前页面'));
    }
    for(const edge of diagram.edges){
      const a=diagram.positions.get(edge.from),b=diagram.positions.get(edge.to);
      const fwd=b.x>a.x;
      let d;
      if(edge.from===edge.to){
        d='M '+(a.x+54)+' '+(a.y-25)+' C '+(a.x+95)+' '+(a.y-68)+' '+(a.x+103)+' '+(a.y-2)+' '+(a.x+78)+' '+(a.y-3);
      }else if(a.x===b.x){
        const sign=b.y>a.y?1:-1;
        d='M '+(a.x+48)+' '+(a.y+sign*25)+' Q '+(a.x+98)+' '+((a.y+b.y)/2)+' '+(b.x+50)+' '+(b.y-sign*27);
      }else{
        const s=fwd?1:-1;
        const yshift=diagram.edges.some(e=>e.from===edge.to&&e.to===edge.from)?(fwd?-8:8):0;
        const ax=a.x+s*78,bx=b.x-s*81,ay=a.y+yshift,by=b.y+yshift;
        const bend=Math.min(110,Math.abs(bx-ax)*.48);
        d='M '+ax+' '+ay+' C '+(ax+s*bend)+' '+ay+' '+(bx-s*bend)+' '+by+' '+bx+' '+by;
      }
      const planned=edge.actions.every(a=>a.planned);
      const group=svg('g',{role:'button',tabindex:0,'aria-label':title(edge.from)+' 到 '+title(edge.to)+'，'+edge.actions.map(x=>x.label).join('、')});
      group.append(svg('title',{},edge.actions.map(e=>e.label).join(' / ')),svg('path',{d,class:'edge-line'+(planned?' future':''),'marker-end':'url(#tip-'+(planned?'plan':'normal')+')'}),svg('path',{d,stroke:'transparent','stroke-width':11,fill:'none',style:'cursor:pointer;pointer-events:stroke'}));
      group.onclick=()=>{if(!dragged)edgeDialog(edge)};group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();edgeDialog(edge)}};
      world.append(group);
    }
    const allowed=activeActions();
    for(const [id,pos] of diagram.positions){
      const p=pages.get(id),current=id===session.current,onlyFuture=!model.actions.some(a=>!a.planned&&(a.from===id||a.to===id))&&id!==model.start;
      const g=svg('g',{transform:'translate('+pos.x+' '+pos.y+')',class:'vertex'+(current?' selected':'')+(onlyFuture?' future':''),tabindex:0,role:'button','aria-current':current?'page':'false','aria-label':p.title});
      const related=diagram.edges.find(e=>e.from===session.current&&e.to===id);
      const name=p.title.length>12?p.title.slice(0,11)+'…':p.title;
      g.append(svg('title',{},p.title),svg('rect',{class:'frame',x:-78,y:-25,width:156,height:50,rx:9}),svg('text',{class:'node-name',y:-1},name),svg('text',{class:'node-subtitle',y:16},current?p.group:(related?related.actions.map(a=>a.label).join(' / '):p.group).slice(0,18)));
      function open(){
        if(dragged||current)return;
        const available=allowed.filter(a=>dest(a,session.stack.at(-2))===id);
        if(available.length===1){perform(available[0].id);return}
        if(available.length>1){edgeDialog({from:session.current,to:id,actions:available});return}
        navigate(id);
      }
      g.onclick=open;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();dragged=false;open()}};
      world.append(g);
    }
    if(refit){fitPending=false;fitGraph()}else transform();
  }
  function transform(){
    byId('world').setAttribute('transform','translate('+panX+' '+panY+') scale('+zoom+')');
    byId('scale').textContent=Math.round(zoom*100)+'%';
  }
  function fitGraph(){
    if(!graphBounds)return;
    const r=byId('network').getBoundingClientRect(),b=graphBounds;
    if(!r.width||!r.height)return;
    zoom=Math.max(.12,Math.min(1.24,(r.width-28)/b.w,(r.height-76)/b.h));
    panX=(r.width-b.w*zoom)/2-b.x*zoom;panY=(r.height-b.h*zoom)/2-b.y*zoom+3;
    transform();
  }
  function zoomAt(factor,x,y){
    const z=Math.max(.1,Math.min(3.2,zoom*factor));
    panX=x-(x-panX)*z/zoom;panY=y-(y-panY)*z/zoom;zoom=z;transform();
  }
  function render(){
    byId('liveBtn').setAttribute('aria-pressed',String(session.mode==='live'));
    byId('planBtn').setAttribute('aria-pressed',String(session.mode==='plan'));
    for(const side of ['up','down']){
      byId(side).textContent=depths[side];
      document.querySelector('[data-side="'+side+'"][data-delta="-1"]').disabled=depths[side]===0;
      document.querySelector('[data-side="'+side+'"][data-delta="1"]').disabled=depths[side]>=pages.size-1;
    }
    renderPhone();renderGraph();renderPlayer();
  }
  function changeMode(mode){
    if(walk){walk.error='请先退出走查，再切换地图范围。';renderPlayer();return}
    session.setMode(mode);render();
  }
  byId('liveBtn').onclick=()=>changeMode('live');
  byId('planBtn').onclick=()=>changeMode('plan');
  byId('openReq').onclick=openRequirements;
  byId('openIndex').onclick=openIndex;
  byId('closeDialog').onclick=closeDialog;
  byId('reset').onclick=()=>{if(walk)leaveWalk();else{session.reset();render()}};
  byId('drawer').addEventListener('click',e=>{if(e.target===byId('drawer'))closeDialog()});
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const d=b.dataset;
    if('action' in d)perform(d.action);
    if('edgeAct' in d){closeDialog();perform(d.edgeAct)}
    if('jump' in d)navigate(d.jump);
    if('req' in d)openReport(d.req);
    if('case' in d)startWalk(Number(d.case));
    if('side' in d){depths[d.side]=Math.max(0,Math.min(pages.size-1,depths[d.side]+Number(d.delta)));render()}
    if('walk' in d){
      if(d.walk==='exit')leaveWalk();
      else if(d.walk==='again'){report=walk.report;startWalk(walk.caseIndex)}
      else if(d.walk==='resume'){walk.error='';renderPlayer()}
      else if(d.walk==='next')perform(walk.c.steps[walk.index]);
    }
  });
  const network=byId('network');
  network.addEventListener('wheel',e=>{
    e.preventDefault();const r=network.getBoundingClientRect();
    zoomAt(Math.exp(-Math.max(-120,Math.min(120,e.deltaY))*.004),e.clientX-r.left,e.clientY-r.top);
  },{passive:false});
  network.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;dragged=false;dragging={id:e.pointerId,x:e.clientX,y:e.clientY,px:panX,py:panY};
  });
  network.addEventListener('pointermove',e=>{
    if(!dragging||dragging.id!==e.pointerId)return;
    const dx=e.clientX-dragging.x,dy=e.clientY-dragging.y;
    if(!dragged&&Math.hypot(dx,dy)<4)return;
    dragged=true;network.setPointerCapture(e.pointerId);panX=dragging.px+dx;panY=dragging.py+dy;transform();
  });
  ['pointerup','pointercancel'].forEach(type=>network.addEventListener(type,()=>{dragging=null}));
  byId('fit').onclick=fitGraph;
  byId('zoomIn').onclick=()=>zoomAt(1.28,network.clientWidth/2,network.clientHeight/2);
  byId('zoomOut').onclick=()=>zoomAt(1/1.28,network.clientWidth/2,network.clientHeight/2);
  network.onkeydown=e=>{
    if(e.key==='+'||e.key==='-'){e.preventDefault();zoomAt(e.key==='+'?1.28:1/1.28,network.clientWidth/2,network.clientHeight/2)}
    if(e.key.startsWith('Arrow')){e.preventDefault();const d={ArrowUp:[0,45],ArrowDown:[0,-45],ArrowLeft:[45,0],ArrowRight:[-45,0]}[e.key];if(d){panX+=d[0];panY+=d[1];transform()}}
  };
  document.title=(model.title || '应用')+' · 交互地图';
  byId('productName').textContent=model.title || '应用';
  new ResizeObserver(fitGraph).observe(byId('stage'));
  render();
})();
