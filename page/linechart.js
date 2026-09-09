/* ============================================
   MyHealth — LineChart (reusable Canvas renderer)
   v3: 主题取色 + resize 重绘 + 监听器去重
   P0-8：原来硬编码 rgba(255,255,255,.04) 的网格在浅色主题下完全不可见，
         且 canvas.style.width 写死 px 与 CSS width:100% 冲突、无 resize 监听。
   ============================================ */

/* 支持 #rgb / #rrggbb / rgb() / rgba() 输入；非可解析值原样返回（带 alpha 时忽略） */
function hexToRgba(hex,alpha){
  if(!hex)return 'rgba(0,0,0,'+alpha+')';
  var s=String(hex).trim();
  if(s.charAt(0)==='#'){
    var h=s.slice(1);
    if(h.length===3)h=h.charAt(0)+h.charAt(0)+h.charAt(1)+h.charAt(1)+h.charAt(2)+h.charAt(2);
    if(h.length!==6)return s;
    var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
    if(isNaN(r)||isNaN(g)||isNaN(b))return s;
    return 'rgba('+r+','+g+','+b+','+alpha+')';
  }
  var m=s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if(m)return 'rgba('+m[1]+','+m[2]+','+m[3]+','+alpha+')';
  return s;
}

/* 允许调用方传 'var(--brand-fill)' 这类令牌，这里解析成真实色值 */
function lcVar(s,fallback){
  if(!s)return fallback;
  if(String(s).indexOf('var(')<0)return s;
  var name=String(s).slice(String(s).indexOf('var(')+4);
  name=name.slice(0,name.indexOf(')')).trim();
  var cs=window.getComputedStyle?window.getComputedStyle(document.documentElement):null;
  var out=cs?(cs.getPropertyValue(name)||''):'';
  return out.trim()?out.trim():fallback;
}

/* canvas 2D 上下文不解析 CSS 变量（fillStyle='var(--bg2)' 会被静默忽略），
   必须手动取计算后的真实色值。 */
function lcTheme(){
  var cs=window.getComputedStyle?window.getComputedStyle(document.documentElement):null;
  function v(name,fallback){
    if(!cs)return fallback;
    var s=cs.getPropertyValue(name);
    return (s&&s.trim())?s.trim():fallback;
  }
  return {
    grid:   v('--bd','#1e293b'),
    axis:   v('--text3','#94a3b8'),
    text:   v('--text','#f1f5f9'),
    surface:v('--surface','#111827'),
    brand:  v('--brand-fill','#F97316')
  };
}

/* 已注册的图表实例，用于窗口尺寸变化时统一重绘 */
var _lcCharts=[];
var _lcTimer=null;
function lcRedrawAll(){
  clearTimeout(_lcTimer);
  _lcTimer=setTimeout(function(){
    for(var i=0;i<_lcCharts.length;i++){
      var c=_lcCharts[i];
      if(!c.isConnected){_lcCharts.splice(i--,1);continue}
      if(c._lcOpts)drawLineChart(c,c._lcOpts);
    }
  },150);
}
if(typeof window!=='undefined'&&window.addEventListener){
  window.addEventListener('resize',lcRedrawAll);
  window.addEventListener('orientationchange',lcRedrawAll);
}

function drawLineChart(canvas,opts){
  if(!canvas)return;
  canvas._lcOpts=opts;

  var labels=opts.labels||[],values=opts.values||[],suffix=opts.suffix||'';
  var T=lcTheme();
  var color=lcVar(opts.color,T.brand);
  var dpr=Math.min(window.devicePixelRatio||1,2);

  // 尺寸取自 CSS 布局后的真实盒子（原来写死 canvas.style.width 会盖掉 width:100%，
  // 且旋转屏幕后永不重绘）。宽度完全交给 CSS，这里只设像素缓冲区。
  var rect=canvas.getBoundingClientRect();
  var W=Math.round(rect.width||0),H=Math.round(rect.height||0);
  if(W<1)W=Math.min(540,canvas.parentElement?(canvas.parentElement.clientWidth||280):280);
  if(H<1)H=180;

  canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
  var ctx=canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);

  var pad=44;

  if(values.length<2){
    ctx.fillStyle=T.axis;ctx.font='12px sans-serif';ctx.textAlign='center';
    ctx.fillText(opts.emptyMsg||'至少需要 2 条记录才能显示趋势',W/2,H/2);
    return;
  }

  var min=Math.floor(Math.min.apply(null,values)-1),max=Math.ceil(Math.max.apply(null,values)+1);
  if(min===max){min--;max++}
  var range=Math.max(1,max-min),n=values.length;
  var xs=values.map(function(_,i){return pad+i*(W-pad*2)/(n-1)});
  var yv=function(v){return H-24-(v-min)/range*(H-44)};

  // Subtle grid（跟随主题，浅色下同样可见）
  ctx.strokeStyle=hexToRgba(T.grid,.6);ctx.lineWidth=.5;
  for(var v=min;v<=max;v++){if(v===min||v===max)continue;var y=yv(v);ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(W-pad,y);ctx.stroke()}

  // Base line
  ctx.strokeStyle=hexToRgba(T.grid,.9);ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(pad,yv(min));ctx.lineTo(W-pad,yv(min));ctx.stroke()

  // X-axis labels（12px 起步，移动端可读）
  ctx.fillStyle=T.axis;ctx.font='12px sans-serif';ctx.textAlign='center';
  var step=Math.max(1,Math.floor(n/6));
  for(var i=0;i<n;i+=step){ctx.fillText(labels[i]||'',xs[i],H-6)}
  if(n>1){ctx.fillText(labels[0]||'',xs[0],H-6);ctx.fillText(labels[n-1]||'',xs[n-1],H-6)}

  // Y-axis labels
  ctx.textAlign='right';ctx.font='12px sans-serif';
  ctx.fillText(min,W-4,yv(min)+4);ctx.fillText(max,W-4,yv(max)+4);

  // Gradient area fill
  var grd=ctx.createLinearGradient(0,yv(max),0,yv(min));
  grd.addColorStop(0,hexToRgba(color,0));grd.addColorStop(1,hexToRgba(color,.12));
  ctx.beginPath();ctx.moveTo(xs[0],yv(min));
  for(var i=0;i<n-1;i++){
    var xc=(xs[i]+xs[i+1])/2,y0=yv(values[i]),y1=yv(values[i+1]);
    ctx.bezierCurveTo(xc,y0,xc,y1,xs[i+1],y1);
  }
  ctx.lineTo(xs[n-1],yv(min));ctx.lineTo(xs[0],yv(min));ctx.closePath();
  ctx.fillStyle=grd;ctx.fill();

  // Smooth line
  ctx.beginPath();ctx.moveTo(xs[0],yv(values[0]));
  for(var i=0;i<n-1;i++){
    var xc=(xs[i]+xs[i+1])/2,y0=yv(values[i]),y1=yv(values[i+1]);
    ctx.bezierCurveTo(xc,y0,xc,y1,xs[i+1],y1);
  }
  ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();

  // Dots —— 空心效果靠底色挖孔，必须用真实色值（原来写 var(--bg2) 是静默失效的）
  for(var i=0;i<n;i++){
    var xx=xs[i],yy=yv(values[i]);
    ctx.beginPath();ctx.arc(xx,yy,4,0,Math.PI*2);ctx.fillStyle=T.surface;ctx.fill();
    ctx.beginPath();ctx.arc(xx,yy,3.5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
  }

  // Latest value label
  var last=values[n-1];
  ctx.fillStyle=color;ctx.font='bold 12px sans-serif';ctx.textAlign='center';
  ctx.fillText(last+suffix,xs[n-1],yv(last)-12);

  /* ========== TOOLTIP (tap/touch/click) ========== */
  // 复用同一个 tip 节点、监听器只绑一次（原来每次绘制都新建 + 重复绑定，会堆积孤儿节点）
  var tip=canvas._lcTip;
  if(!tip){
    tip=document.createElement('div');
    tip.setAttribute('role','status');
    tip.style='position:absolute;pointer-events:none;background:var(--surface);border:1px solid var(--bd-l);border-radius:8px;padding:4px 10px;font-size:var(--fs-xs);color:var(--text);font-weight:600;white-space:nowrap;z-index:var(--z-content);box-shadow:var(--sh-2);display:none;transform:translate(-50%,-120%)';
    canvas._lcTip=tip;
  }
  if(tip.parentNode!==canvas.parentElement&&canvas.parentElement)canvas.parentElement.appendChild(tip);
  if(canvas.parentElement){
    var ppos=canvas.parentElement.style.position;
    if(ppos!=='absolute'&&ppos!=='relative')canvas.parentElement.style.position='relative';
  }

  function showTip(idx){
    if(idx<0||idx>=n)return;
    tip.textContent=labels[idx]+' · '+values[idx]+suffix;
    tip.style.left=xs[idx]+'px';tip.style.top=yv(values[idx])+'px';
    tip.style.display='block';
    drawDot(idx);
  }
  function hideTip(){tip.style.display='none'}
  function drawDot(idx){
    var c=document.createElement('canvas');
    c.style='position:absolute;left:0;top:0;pointer-events:none;z-index:var(--z-content)';
    c.width=canvas.width;c.height=canvas.height;
    var c2=c.getContext('2d');c2.setTransform(dpr,0,0,dpr,0,0);
    c2.beginPath();c2.arc(xs[idx],yv(values[idx]),6,0,Math.PI*2);
    c2.fillStyle=hexToRgba(color,.25);c2.fill();
    c2.beginPath();c2.arc(xs[idx],yv(values[idx]),4,0,Math.PI*2);
    c2.fillStyle=color;c2.fill();
    if(canvas.parentElement)canvas.parentElement.appendChild(c);
    setTimeout(function(){if(c.parentNode)c.remove()},50);
  }
  function hitTest(px,py){
    var best=-1,bd=1e9;
    for(var i=0;i<n;i++){
      var dx=px-xs[i],dy=py-yv(values[i]);
      var d=Math.sqrt(dx*dx+dy*dy);
      if(d<bd){bd=d;best=i}
    }
    return bd<30?best:-1;
  }

  if(!canvas._lcBound){
    canvas._lcBound=true;
    _lcCharts.push(canvas);
    canvas.addEventListener('click',function(e){
      var r=canvas.getBoundingClientRect();
      var idx=hitTest(e.clientX-r.left,e.clientY-r.top);
      if(idx>=0)showTip(idx);
    });
    canvas.addEventListener('touchstart',function(e){
      var t=e.touches[0],r=canvas.getBoundingClientRect();
      var idx=hitTest(t.clientX-r.left,t.clientY-r.top);
      if(idx>=0){showTip(idx);e.preventDefault()}
    },{passive:false});
    canvas.addEventListener('touchend',function(){setTimeout(hideTip,1800)});
  }
}
