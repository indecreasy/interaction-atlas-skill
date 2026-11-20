/* Standalone navigation for a classic script. The engine knows no project IDs or titles. */
globalThis.AtlasCore = (() => {
  const modes = new Set(['live', 'plan']);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const scalar = value => value === null || ['string','boolean','number'].includes(typeof value);
  const visible = (record, mode) => Boolean(record && (!record.planned || mode === 'plan'));
  const matches = (condition, state) =>
    Object.entries(condition || {}).every(([key,value]) => own(state,key) && state[key] === value);

  function format(text, state) {
    return String(text ?? '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g,
      (placeholder, key) => own(state,key) ? String(state[key] ?? '') : placeholder);
  }

  function applyEffects(state, effects = []) {
    const next = {...state};
    for (const effect of effects) {
      if (effect.op === 'set') next[effect.key] = effect.value;
      else if (effect.op === 'copy') next[effect.key] = next[effect.from];
      else if (effect.op === 'toggle') next[effect.key] = !next[effect.key];
      else throw new Error('Unknown effect: ' + effect.op);
    }
    return next;
  }

  function validate(model) {
    const errors = [];
    if (!model || typeof model !== 'object') return ['The model must be an object.'];
    function index(records, name) {
      const map = new Map();
      if (!Array.isArray(records)) { errors.push(name + ' must be an array.'); return map; }
      for (const rec of records) {
        if (!rec || typeof rec.id !== 'string' || !rec.id.trim()) { errors.push(name+' needs string IDs.'); continue; }
        if (map.has(rec.id)) errors.push('Duplicate '+name+' ID: '+rec.id);
        map.set(rec.id,rec);
      }
      return map;
    }
    const pages=index(model.pages,'pages'), acts=index(model.actions,'actions'), reqs=index(model.requirements,'requirements');
    const initial=model.initialState || {};
    if (typeof initial!=='object' || Array.isArray(initial) || !Object.values(initial).every(scalar)) errors.push('initialState must contain scalar values.');
    function fields(record, names) {
      for (const key of names) if (typeof record[key]!=='string' || !record[key].trim()) errors.push(record.id+' missing '+key);
    }
    function reqRefs(record) {
      if (!Array.isArray(record.requirements)) {errors.push(record.id+' needs a requirements array.');return;}
      for (const id of record.requirements) if (!reqs.has(id)) errors.push(record.id+' unknown requirement '+id);
    }
    function checkCondition(when,id) {
      if (when!=null && (typeof when!=='object' || Array.isArray(when))) {errors.push(id+' invalid when');return;}
      for (const [k,v] of Object.entries(when||{})) if (!own(initial,k)||!scalar(v)) errors.push(id+' invalid condition '+k);
    }
    function checkEffects(effects,id) {
      if (effects==null)return;
      if (!Array.isArray(effects)) {errors.push(id+' invalid effects');return;}
      for (const e of effects) {
        if (!e || !own(initial,e.key) || !['set','copy','toggle'].includes(e.op)) {errors.push(id+' invalid effect');continue;}
        if (e.op==='copy' && !own(initial,e.from)) errors.push(id+' invalid copy source '+e.from);
        if (e.op==='set' && !scalar(e.value)) errors.push(id+' invalid set value');
        if (e.op==='toggle' && typeof initial[e.key]!=='boolean') errors.push(id+' toggle requires a boolean');
      }
    }
    if (!pages.has(model.start) || pages.get(model.start)?.planned) errors.push('start must name a live page.');
    if (model.entrypoints!=null && !Array.isArray(model.entrypoints)) errors.push('entrypoints must be an array.');
    for (const id of Array.isArray(model.entrypoints)?model.entrypoints:[]) if (!pages.has(id)) errors.push('Unknown external entrypoint '+id);
    for (const p of pages.values()) {
      fields(p,['title','group','description']);reqRefs(p);checkEffects(p.enter,p.id);
      if (p.id==='$self'||p.id==='$back') errors.push('Reserved page ID '+p.id);
      if (p.preview?.items!=null && !Array.isArray(p.preview.items)) errors.push(p.id+' invalid preview items');
      for (const item of Array.isArray(p.preview?.items)?p.preview.items:[]) {
        if (!item || typeof item!=='object') {errors.push(p.id+' invalid preview item');continue;}
        if (item.actionId && acts.get(item.actionId)?.from!==p.id) errors.push(p.id+' invalid preview action '+item.actionId);
        checkCondition(item.when,p.id);
      }
    }
    for (const a of acts.values()) {
      fields(a,['label','kind','from','to']);reqRefs(a);
      if (!pages.has(a.from))errors.push(a.id+' unknown source '+a.from);
      if (!pages.has(a.to) && !['$self','$back'].includes(a.to))errors.push(a.id+' unknown destination '+a.to);
      if (!a.planned && !pages.get(a.from)?.planned && pages.get(a.to)?.planned)errors.push(a.id+' live action points to a planned page');
      checkCondition(a.when,a.id);checkEffects(a.effects,a.id);
    }
    for (const r of reqs.values()) fields(r,['title','status','source']);
    if (model.walks!=null && !Array.isArray(model.walks)) errors.push('walks must be an array.');
    for (const w of Array.isArray(model.walks)?model.walks:[]) {
      if (!w || !reqs.has(w.requirement) || !pages.has(w.start) || !Array.isArray(w.steps) || !w.steps.length) {
        errors.push('Invalid curated walk.');continue;
      }
      for (const id of w.steps) if (!acts.has(id))errors.push(w.title+' unknown walk action '+id);
      if (!w.title||!w.expect)errors.push('A walk needs a title and expected result.');
      if (w.endsAt && !pages.has(w.endsAt))errors.push(w.title+' invalid expected page');
      checkCondition(w.expectState,w.title);
    }
    return errors;
  }

  function indexModel(model) {
    const pages=new Map(model.pages.map(p=>[p.id,p]));
    const actions=new Map(model.actions.map(a=>[a.id,a]));
    const outgoing=new Map(model.pages.map(p=>[p.id,[]]));
    const incoming=new Map(model.pages.map(p=>[p.id,[]]));
    for (const a of model.actions) {
      outgoing.get(a.from).push(a);
      if (pages.has(a.to) && a.to!==a.from)incoming.get(a.to).push(a);
    }
    const roots=[...new Set([model.start,...(model.entrypoints||[])])];
    return {model,pages,actions,outgoing,incoming,roots};
  }
  function canDisplay(index,a,mode) {
    return visible(a,mode) && visible(index.pages.get(a.from),mode) &&
      (!index.pages.has(a.to) || visible(index.pages.get(a.to),mode));
  }

  // Jump is a diagram inspection operation. It reconstructs a structural breadcrumb
  // without silently performing saves, deletes or guard-changing actions on that route.
  function pathTo(index,id,mode) {
    if (!visible(index.pages.get(id),mode)) return null;
    const seen=new Set(), queue=[];
    for(const root of index.roots) if(visible(index.pages.get(root),mode)){
      seen.add(root);queue.push([root]);
    }
    for(let i=0;i<queue.length;i++){
      const path=queue[i],page=path.at(-1);
      if(page===id)return path;
      for(const a of index.outgoing.get(page)){
        if(!index.pages.has(a.to)||!canDisplay(index,a,mode)||seen.has(a.to))continue;
        seen.add(a.to);queue.push([...path,a.to]);
      }
    }
    return null;
  }
  function newSession(index) {
    let mode='live',path=[],state={};
    function reset() {
      path=[index.model.start];
      state=applyEffects(index.model.initialState,index.pages.get(index.model.start).enter);
    }
    function actions() {
      return index.outgoing.get(path.at(-1)).filter(a=>canDisplay(index,a,mode) &&
        matches(a.when,state) && (a.to!=='$back'||path.length>1));
    }
    function perform(id) {
      const a=actions().find(a=>a.id===id);
      if (!a)return false;
      let next=applyEffects(state,a.effects);
      if (a.to==='$back')path=path.slice(0,-1);
      else if(a.to!=='$self'){
        path=[...path,a.to];next=applyEffects(next,index.pages.get(a.to).enter);
      }
      state=next;return true;
    }
    function jump(id) {
      const target=pathTo(index,id,mode);
      if (!target)return false;
      path=target;state=applyEffects(state,index.pages.get(id).enter);return true;
    }
    function setMode(next) {
      if (!modes.has(next))return false;
      if (mode===next)return true;
      mode=next;
      const firstHidden=path.findIndex(id=>!visible(index.pages.get(id),mode));
      if(firstHidden>=0)path=path.slice(0,firstHidden);
      if(!path.length)path=[index.model.start];
      return true;
    }
    reset();
    return {
      get current(){return path.at(-1)}, get stack(){return [...path]}, get state(){return {...state}},
      get mode(){return mode}, actions,perform,jump,setMode,reset
    };
  }
  function createSession(model) {
    const errors=validate(model);
    if(errors.length)throw Error(errors.join('\n'));
    return newSession(indexModel(model));
  }

  function impact(model,reqId,mode='live') {
    const result={pages:[],entries:[],cases:[]};
    if(!modes.has(mode)||!model.requirements.some(r=>r.id===reqId))return result;
    const index=indexModel(model), pages=new Set(), entries=new Set(), used=new Set();
    const owns=r=>r.requirements.includes(reqId);
    for(const p of model.pages)if(visible(p,mode)&&owns(p))pages.add(p.id);
    for(const a of model.actions)if(canDisplay(index,a,mode)&&owns(a)){
      pages.add(a.from);if(index.pages.has(a.to))pages.add(a.to);
    }
    function replay(start,steps){
      const session=newSession(index);session.setMode(mode);
      return session.jump(start)&&steps.every(id=>session.perform(id))?session:null;
    }
    function add(walk) {
      const key=JSON.stringify([walk.start,walk.steps]);
      if(used.has(key))return;
      used.add(key);entries.add(walk.start);result.cases.push(walk);
    }
    for(const w of model.walks||[]){
      if(w.requirement!==reqId || !replay(w.start,w.steps))continue;
      add({...w,steps:[...w.steps],basis:'已登记的走查路径'});
    }
    for(const id of pages){
      const incoming=index.incoming.get(id).filter(a=>canDisplay(index,a,mode));
      const related=index.outgoing.get(id).filter(a=>canDisplay(index,a,mode)&&owns(a));
      // Suggest one reproducible entry per origin, with an action directly linked to
      // the requirement where possible. Guards are checked using the actual session.
      for(const a of incoming){
        const entered=replay(a.from,[a.id]);if(!entered)continue;
        const next=entered.actions().find(candidate=>owns(candidate));
        const steps=next?[a.id,next.id]:[a.id];
        if(next)entered.perform(next.id);
        add({title:index.pages.get(a.from).title+' → '+index.pages.get(id).title,
          start:a.from,steps,expect:'到达「'+index.pages.get(entered.current).title+'」。',
          basis:next?'依据入口与关联操作推导':'依据页面关联推导'});
      }
      for(const action of related){
        const checked=replay(id,[action.id]);if(!checked)continue;
        add({title:index.pages.get(id).title+' · '+action.label,start:id,steps:[action.id],
          expect:action.to==='$self'?'操作后仍在「'+index.pages.get(id).title+'」。':'到达「'+index.pages.get(checked.current).title+'」。',
          basis:'依据关联操作推导'});
      }
    }
    result.pages=[...pages];result.entries=[...entries];return result;
  }
  return Object.freeze({createSession,impact,validate,format,matches});
})();
