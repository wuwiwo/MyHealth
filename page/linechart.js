/* ============================================
   MyHealth — LineChart (reusable Canvas renderer)
   ============================================ */

function hexToRgba(hex,alpha){
  var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return'rgba('+r+','+g+','+b+','+alpha+')';
}

/**
 * Render a line chart onto a canvas element.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @param {string[]} opts.labels     Short labels for x-axis
 * @param {number[]} opts.values     Y-axis values
 * @param {string}   [opts.color]    Line color hex (default #F97316)
 * @param {string}   [opts.suffix]   Unit suffix on latest value (default '')
 * @param {string}   [opts.emptyMsg] Message when < 2 data points
 */
function drawLineChart(canvas,opts){
  var labels=opts.labels||[],values=opts.values||[],color=opts.color||'#F97316',suffix=opts.suffix||'';
  if(values.length<2){
    var ctx=canvas.getContext('2d');canvas.width=280*2;canvas.height=180*2;canvas.style.width='280px';canvas.style.height='180px';ctx.scale(2,2);
    ctx.fillStyle='var(--text3)';ctx.font='12px sans-serif';ctx.textAlign='center';
    ctx.fillText(opts.emptyMsg||'至少需要 2 条记录才能显示趋势',140,90);return;
  }
  var rect=canvas.parentElement.getBoundingClientRect();
  canvas.width=rect.width*2;canvas.height=180*2;canvas.style.width=rect.width+'px';canvas.style.height='180px';
  var ctx=canvas.getContext('2d');ctx.scale(2,2);
  var W=rect.width,H=180,pad=40;
  var min=Math.floor(Math.min.apply(null,values)-1),max=Math.ceil(Math.max.apply(null,values)+1);
  var range=Math.max(1,max-min),xs=values.map(function(_,i){return pad+i*(W-pad*2)/(values.length-1)});
  var yv=function(v){return H-20-(v-min)/range*(H-40)};
  ctx.strokeStyle='rgba(100,116,139,.15)';ctx.lineWidth=.5;
  for(var v=min;v<=max;v++){var y=yv(v);ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(W-pad,y);ctx.stroke()}
  ctx.fillStyle='var(--text3)';ctx.font='9px sans-serif';ctx.textAlign='center';
  values.forEach(function(_,i){ctx.fillText(labels[i]||'',xs[i],H-5)});
  ctx.textAlign='right';ctx.fillText(min,W-3,yv(min)+3);ctx.fillText(max,W-3,yv(max)+3);
  ctx.beginPath();values.forEach(function(v,i){var x=xs[i],y=yv(v);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)});
  ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke();
  var grd=ctx.createLinearGradient(0,yv(min),0,yv(max));
  grd.addColorStop(0,hexToRgba(color,.15));grd.addColorStop(1,hexToRgba(color,0));
  ctx.beginPath();ctx.moveTo(xs[0],yv(values[0]));values.forEach(function(v,i){ctx.lineTo(xs[i],yv(v))});
  ctx.lineTo(xs[xs.length-1],yv(min));ctx.lineTo(xs[0],yv(min));ctx.closePath();
  ctx.fillStyle=grd;ctx.fill();
  values.forEach(function(v,i){ctx.beginPath();ctx.arc(xs[i],yv(v),3.5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
    ctx.beginPath();ctx.arc(xs[i],yv(v),5,0,Math.PI*2);ctx.fillStyle=hexToRgba(color,.2);ctx.fill()});
  var last=values[values.length-1];ctx.fillStyle=color;ctx.font='bold 12px sans-serif';ctx.textAlign='center';
  ctx.fillText(last+suffix,xs[xs.length-1],yv(last)-10);
}
