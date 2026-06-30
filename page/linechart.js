/* ============================================
   MyHealth — LineChart (reusable Canvas renderer)
   ============================================ */

function hexToRgba(hex,alpha){
  var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return'rgba('+r+','+g+','+b+','+alpha+')';
}

function drawLineChart(canvas,opts){
  var labels=opts.labels||[],values=opts.values||[],color=opts.color||'#F97316',suffix=opts.suffix||'';
  if(values.length<2){
    var ctx=canvas.getContext('2d');canvas.width=280*2;canvas.height=180*2;canvas.style.width='280px';canvas.style.height='180px';ctx.scale(2,2);
    ctx.fillStyle='#94a3b8';ctx.font='12px sans-serif';ctx.textAlign='center';
    ctx.fillText(opts.emptyMsg||'至少需要 2 条记录才能显示趋势',140,90);return;
  }
  var rect=canvas.parentElement.getBoundingClientRect();
  var W=Math.max(280,rect.width||0),H=190,pad=44;
  if(!rect.width){
    var parent=canvas.parentElement;
    W=Math.max(280,parent.clientWidth||parent.offsetWidth||280);
  }
  canvas.width=W*2;canvas.height=H*2;canvas.style.width=W+'px';canvas.style.height=H+'px';
  var ctx=canvas.getContext('2d');ctx.scale(2,2);

  var min=Math.floor(Math.min.apply(null,values)-1),max=Math.ceil(Math.max.apply(null,values)+1);
  var range=Math.max(1,max-min),n=values.length;
  var xs=values.map(function(_,i){return pad+i*(W-pad*2)/(n-1)});
  var yv=function(v){return H-24-(v-min)/range*(H-44)};

  // Subtle grid
  ctx.strokeStyle='rgba(255,255,255,.04)';ctx.lineWidth=.5;
  for(var v=min;v<=max;v++){if(v===min||v===max)continue;var y=yv(v);ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(W-pad,y);ctx.stroke()}

  // Base line
  ctx.strokeStyle='rgba(255,255,255,.06)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(pad,yv(min));ctx.lineTo(W-pad,yv(min));ctx.stroke()

  // X-axis labels
  ctx.fillStyle='#94a3b8';ctx.font='10px sans-serif';ctx.textAlign='center';
  var step=Math.max(1,Math.floor(n/6));
  for(var i=0;i<n;i+=step){ctx.fillText(labels[i]||'',xs[i],H-6)}
  // First and last always
  if(n>1){ctx.fillText(labels[0]||'',xs[0],H-6);ctx.fillText(labels[n-1]||'',xs[n-1],H-6)}

  // Y-axis labels
  ctx.textAlign='right';ctx.font='9px sans-serif';
  ctx.fillText(min,W-4,yv(min)+3);ctx.fillText(max,W-4,yv(max)+3);

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

  // Dots
  for(var i=0;i<n;i++){
    var xx=xs[i],yy=yv(values[i]);
    ctx.beginPath();ctx.arc(xx,yy,4,0,Math.PI*2);ctx.fillStyle='var(--bg2)';ctx.fill();
    ctx.beginPath();ctx.arc(xx,yy,3.5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
  }

  // Latest value label
  var last=values[n-1];
  ctx.fillStyle=color;ctx.font='bold 11px sans-serif';ctx.textAlign='center';
  ctx.fillText(last+suffix,xs[n-1],yv(last)-12);
}
