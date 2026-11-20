// A fictional reading-list example. Replace these records with your own product's evidence.
globalThis.ATLAS = {
  title: '读书清单',
  start: 'shelf',
  initialState: {
    note: '先看目录，再读第二章。',
    draft: '',
    alternative: '留意第二章的地图。',
    favorite: false,
    includeNote: true,
    selectedExcerpt: '桥上的光先到达河面。',
    excerptSaved: false
  },
  requirements: [
    {id:'R-01',title:'从不同入口打开同一本书',status:'已实现',source:'evidence.html#r-entry'},
    {id:'R-02',title:'保存或取消阅读笔记',status:'已实现',source:'evidence.html#r-note'},
    {id:'R-03',title:'收藏书籍',status:'已实现',source:'evidence.html#r-saved'},
    {id:'R-04',title:'分享书签时选择是否附上笔记',status:'已实现',source:'evidence.html#r-share'},
    {id:'R-05',title:'把摘句加入书页',status:'待确认',source:'evidence.html#r-excerpt'}
  ],
  pages: [
    {id:'shelf',title:'书架',group:'找书',description:'从书架、搜索或收藏夹打开同一个书页。',requirements:['R-01'],preview:{
      art:'books',eyebrow:'正在读',title:'我的书架',subtitle:'1 本书',items:[{title:'河面上的桥',meta:'随笔 · 正在读',actionId:'shelf-book'}]}},
    {id:'search',title:'搜索',group:'找书',description:'示例保留关键词「河面」。查看结果并返回后仍能继续浏览。',requirements:['R-01'],preview:{
      eyebrow:'搜索结果',title:'河面',subtitle:'找到 1 本书',items:[{title:'河面上的桥',meta:'书名匹配',actionId:'search-book'}]}},
    {id:'saved',title:'收藏夹',group:'找书',description:'收藏后可从这里进入书页。移除收藏只改变收藏状态。',requirements:['R-03'],preview:{
      title:'我的收藏',items:[{title:'河面上的桥',meta:'已收藏',actionId:'saved-book',when:{favorite:true}},
        {title:'暂无收藏',meta:'可在书页中收藏',when:{favorite:false}}]}},
    {id:'book',title:'书页',group:'阅读',description:'从不同入口查看同一本书；返回时回到原来的列表。',requirements:['R-01','R-02','R-03','R-04'],preview:{
      eyebrow:'随笔',title:'河面上的桥',subtitle:'阅读笔记',items:[{title:'{{note}}',meta:'已保存',actionId:'book-note'}]}},
    {id:'note',title:'编辑笔记',group:'阅读',description:'进入时复制已保存内容，修改只作用于草稿。点击保存后替换笔记，取消会丢弃本次草稿。',requirements:['R-02'],
      enter:[{op:'copy',key:'draft',from:'note'}],preview:{eyebrow:'笔记草稿',title:'编辑笔记',subtitle:'河面上的桥',items:[{title:'{{draft}}',meta:'尚未保存'}]}},
    {id:'share',title:'书签预览',group:'分享',description:'进入时默认附上笔记。取消系统分享后保留本次选择；关闭预览后再打开恢复默认。',requirements:['R-04'],
      enter:[{op:'set',key:'includeNote',value:true}],preview:{eyebrow:'分享书签',title:'河面上的桥',items:[
        {title:'{{note}}',meta:'附带阅读笔记',when:{includeNote:true}},
        {title:'仅显示书名',meta:'已隐藏笔记',when:{includeNote:false}}]}},
    {id:'system-share',title:'系统分享',group:'分享',description:'系统面板由浏览器中的示意界面代替。取消回到刚才的书签预览。',requirements:['R-04'],preview:{
      eyebrow:'系统面板示意',title:'分享书签',subtitle:'1 张书签',items:[{title:'河面上的桥',meta:'图片'}]}},
    {id:'excerpts',title:'摘句',group:'阅读',description:'待确认的方案。在书页选择一句原文，可保存到这本书或退出。',requirements:['R-05'],planned:true,preview:{
      eyebrow:'方案预览',title:'我的摘句',subtitle:'河面上的桥',items:[{title:'{{selectedExcerpt}}',meta:'示例选段'}]}}
  ],
  actions: [
    {id:'shelf-book',from:'shelf',to:'book',label:'打开书页',kind:'open',requirements:['R-01']},
    {id:'shelf-search',from:'shelf',to:'search',label:'搜索书名',kind:'open',requirements:['R-01']},
    {id:'shelf-saved',from:'shelf',to:'saved',label:'打开收藏夹',kind:'open',requirements:['R-03']},
    {id:'search-book',from:'search',to:'book',label:'点搜索结果',kind:'open',requirements:['R-01']},
    {id:'search-back',from:'search',to:'$back',label:'返回书架',kind:'back',requirements:['R-01']},
    {id:'saved-book',from:'saved',to:'book',label:'打开收藏的书',kind:'open',requirements:['R-03','R-01'],when:{favorite:true}},
    {id:'saved-back',from:'saved',to:'$back',label:'返回书架',kind:'back',requirements:['R-03']},
    {id:'book-note',from:'book',to:'note',label:'编辑阅读笔记',kind:'open',requirements:['R-02']},
    {id:'book-save',from:'book',to:'$self',label:'加入收藏',kind:'save',requirements:['R-03'],when:{favorite:false},effects:[{op:'set',key:'favorite',value:true}]},
    {id:'book-unstar',from:'book',to:'$self',label:'移除收藏',kind:'delete',requirements:['R-03'],when:{favorite:true},effects:[{op:'set',key:'favorite',value:false}]},
    {id:'book-share',from:'book',to:'share',label:'预览分享书签',kind:'open',requirements:['R-04']},
    {id:'book-back',from:'book',to:'$back',label:'返回原列表',kind:'back',requirements:['R-01']},
    {id:'note-draft',from:'note',to:'$self',label:'换成示例笔记',kind:'change',requirements:['R-02'],effects:[{op:'copy',key:'draft',from:'alternative'}]},
    {id:'note-save',from:'note',to:'$back',label:'保存笔记',kind:'save',requirements:['R-02'],effects:[{op:'copy',key:'note',from:'draft'}]},
    {id:'note-cancel',from:'note',to:'$back',label:'取消编辑',kind:'cancel',requirements:['R-02'],effects:[{op:'copy',key:'draft',from:'note'}]},
    {id:'share-toggle',from:'share',to:'$self',label:'切换笔记显示',kind:'change',requirements:['R-04'],effects:[{op:'toggle',key:'includeNote'}]},
    {id:'share-send',from:'share',to:'system-share',label:'分享书签',kind:'share',requirements:['R-04']},
    {id:'system-cancel',from:'system-share',to:'$back',label:'取消分享',kind:'cancel',requirements:['R-04']},
    {id:'share-close',from:'share',to:'$back',label:'关闭预览',kind:'close',requirements:['R-04']},
    {id:'book-excerpts',from:'book',to:'excerpts',label:'查看摘句方案',kind:'open',requirements:['R-05'],planned:true},
    {id:'excerpt-save',from:'excerpts',to:'$back',label:'保存摘句',kind:'save',requirements:['R-05'],planned:true,effects:[{op:'set',key:'excerptSaved',value:true}]},
    {id:'excerpt-cancel',from:'excerpts',to:'$back',label:'取消摘句',kind:'cancel',requirements:['R-05'],planned:true}
  ],
  // Optional curated checks complement the paths derived from the requirement links.
  walks: [
    {requirement:'R-01',title:'从搜索打开并回到结果',start:'shelf',steps:['shelf-search','search-book','book-back'],expect:'返回搜索结果，仍显示「河面」。',endsAt:'search'},
    {requirement:'R-01',title:'从书架打开并回到书架',start:'shelf',steps:['shelf-book','book-back'],expect:'回到原书架。',endsAt:'shelf'},
    {requirement:'R-02',title:'取消编辑，原笔记保留',start:'book',steps:['book-note','note-draft','note-cancel'],expect:'回到书页，已保存的原文保持。',endsAt:'book',expectState:{note:'先看目录，再读第二章。'}},
    {requirement:'R-02',title:'保存草稿，再打开核对',start:'book',steps:['book-note','note-draft','note-save','book-note'],expect:'重新进入编辑时看到刚保存的笔记。',endsAt:'note',expectState:{note:'留意第二章的地图。',draft:'留意第二章的地图。'}},
    {requirement:'R-03',title:'收藏书籍，从收藏夹打开',start:'shelf',steps:['shelf-book','book-save','book-back','shelf-saved','saved-book','book-back'],expect:'回到收藏夹，这本书仍在其中。',endsAt:'saved',expectState:{favorite:true}},
    {requirement:'R-04',title:'取消系统分享，保留预览选择',start:'book',steps:['book-share','share-toggle','share-send','system-cancel'],expect:'仍在预览，阅读笔记保持隐藏。',endsAt:'share',expectState:{includeNote:false}},
    {requirement:'R-05',title:'试走保存摘句方案',start:'book',steps:['book-excerpts','excerpt-save'],expect:'回到原书页，示例摘句已保存。',endsAt:'book',expectState:{excerptSaved:true}}
  ]
};
