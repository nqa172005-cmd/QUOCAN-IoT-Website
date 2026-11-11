'use strict';
const $ = id => document.getElementById(id);
const keys = ['temperature','humidity','step_count','speed_kmh','activity_status','accel_x','accel_y','accel_z','accel_total','gyro_x','gyro_y','gyro_z','fall_candidate','fall_alert','fall_direction','fall_event_id'];
const labels = {temperature:'Nhiệt độ',humidity:'Độ ẩm',step_count:'Số bước',speed_kmh:'Vận tốc ước tính',activity_status:'Trạng thái vận động',accel_x:'Gia tốc X',accel_y:'Gia tốc Y',accel_z:'Gia tốc Z',accel_total:'Gia tốc tổng',gyro_x:'Vận tốc góc X',gyro_y:'Vận tốc góc Y',gyro_z:'Vận tốc góc Z',fall_candidate:'Nghi ngờ ngã',fall_alert:'Cảnh báo ngã',fall_direction:'Hướng nghi ngờ ngã',fall_event_id:'Mã sự kiện'};
const units = {temperature:'°C',humidity:'%',step_count:'bước',speed_kmh:'km/h',accel_x:'m/s²',accel_y:'m/s²',accel_z:'m/s²',accel_total:'m/s²',gyro_x:'rad/s',gyro_y:'rad/s',gyro_z:'rad/s'};
const activityLabels = {STILL_OR_IDLE:'Đứng yên / nghỉ',WALKING_SLOW:'Đi chậm',WALKING_FAST:'Đi nhanh',CHECKING_EVENT:'Đang kiểm tra nghi ngờ ngã',FALL_ALERT:'Cảnh báo ngã'};
const directionLabels = {FRONT:'Phía trước',FORWARD:'Phía trước',BACK:'Phía sau',BACKWARD:'Phía sau',LEFT:'Bên trái',RIGHT:'Bên phải',UNKNOWN:'Chưa xác định',NONE:'Không có sự kiện'};
const directions = {FRONT:'FRONT',FORWARD:'FRONT',BACK:'BACK',BACKWARD:'BACK',LEFT:'LEFT',RIGHT:'RIGHT'};
const categorical = new Set(['activity_status','fall_direction','fall_alert','fall_candidate']);
const isOn = value => String(value)==='1'||String(value).toLowerCase()==='true';
const formatTime = ts => Number.isFinite(Number(ts)) ? new Date(Number(ts)).toLocaleString('vi-VN') : '--';
const latest = a => Array.isArray(a)&&a.length?a.reduce((p,q)=>Number(q.ts)>Number(p.ts)?q:p):null;
function format(k,v){
 if(v===undefined||v===null||v==='')return '--';
 if(k==='activity_status')return activityLabels[v]||String(v);
 if(k==='fall_direction')return directionLabels[v]||String(v);
 if(k==='fall_alert'||k==='fall_candidate')return isOn(v)?'Có':'Không';
 const n=Number(v);if(Number.isFinite(n)&&k!=='fall_event_id'&&k!=='step_count')return n.toLocaleString('vi-VN',{maximumFractionDigits:k.startsWith('gyro')?3:2});
 return String(v);
}
function setValue(id,k,p){const el=$(id);if(!el)return;el.textContent=p?format(k,p.value)+(units[k]?' '+units[k]:''):'--';}
function row(cells){const tr=document.createElement('tr');for(const cell of cells){const td=document.createElement('td');td.textContent=String(cell);tr.append(td);}return tr;}
function setState(code,stale){document.querySelectorAll('.state-card').forEach(el=>el.classList.toggle('selected',!stale&&el.dataset.state===code));$('activityFreshness').textContent=stale?'Dữ liệu cũ hoặc thiết bị ngoại tuyến — không xác nhận trạng thái hiện tại.':'Trạng thái hiện tại: '+(activityLabels[code]||'Không xác định');}
function setDirection(code,stale){document.querySelectorAll('[data-dir]').forEach(el=>el.classList.toggle('selected',!stale&&el.dataset.dir===directions[code]));}
let loading=false;
async function refresh(){
 if(loading)return;loading=true;
 try{
  const res=await fetch('/api/telemetry',{cache:'no-store'}),data=await res.json();if(!res.ok)throw Error(data.error||'Không lấy được dữ liệu');
  const pts=Object.fromEntries(keys.map(k=>[k,latest(data[k])]));
  const ts=Math.max(0,...Object.values(pts).filter(Boolean).map(p=>Number(p.ts)||0));
  const stale=!ts||Date.now()-ts>30000||ts>Date.now()+30000;
  $('connectionStatus').textContent=stale?'Dữ liệu cũ / thiết bị ngoại tuyến':'Thiết bị đang gửi dữ liệu';
  $('connectionStatus').classList.toggle('connected',!stale);$('connectionStatus').classList.toggle('disconnected',stale);
  $('lastUpdate').textContent=ts?'Mẫu mới nhất: '+formatTime(ts):'Chưa có dữ liệu';
  $('apiMessage').textContent=stale?'Máy chủ truy xuất được ThingsBoard, nhưng chưa có telemetry mới.':'Dữ liệu từ ThingsBoard đang được cập nhật.';
  for(const k of keys)setValue('value-'+k,k,pts[k]);
  $('telemetryRows').replaceChildren(...keys.map(k=>row([labels[k],pts[k]?format(k,pts[k].value)+(units[k]?' '+units[k]:''):'--',pts[k]?formatTime(pts[k].ts):'--'])));
  const activity=pts.activity_status?.value;
  $('activityStatus').textContent=stale?'Trạng thái không còn mới':(activityLabels[activity]||'Chưa có trạng thái');
  $('activityDetail').textContent=stale?'Dữ liệu cũ':(activityLabels[activity]||'--');
  setState(activity,stale);
  const alert=pts.fall_alert&&isOn(pts.fall_alert.value),candidate=pts.fall_candidate&&isOn(pts.fall_candidate.value);
  $('fallStatus').textContent=stale?'Chưa xác nhận trạng thái mới':alert?'Đã kích hoạt cảnh báo':candidate?'Đang kiểm tra nghi ngờ ngã':'Chưa có cảnh báo';
  $('fallStatus').classList.toggle('alert-active',!stale&&!!alert);$('fallStatus').classList.toggle('alert-clear',!stale&&!alert&&!candidate);
  $('fallCandidateValue').textContent=pts.fall_candidate?format('fall_candidate',pts.fall_candidate.value):'--';
  $('fallEventValue').textContent=pts.fall_event_id?String(pts.fall_event_id.value):'--';
  $('fallTimeValue').textContent=pts.fall_alert?formatTime(pts.fall_alert.ts):'--';
  const direction=pts.fall_direction?.value||'NONE';
  $('fallDirection').textContent=stale?'Dữ liệu cũ':(directionLabels[direction]||direction);
  setDirection(direction,stale);
 }catch(e){$('connectionStatus').textContent='Lỗi truy xuất dữ liệu';$('connectionStatus').classList.add('disconnected');$('connectionStatus').classList.remove('connected');$('apiMessage').textContent=e.message;setState(null,true);setDirection(null,true);}
 finally{loading=false;}
}
$('currentTime').textContent=new Date().toLocaleString('vi-VN');setInterval(()=>$('currentTime').textContent=new Date().toLocaleString('vi-VN'),1000);
refresh();setInterval(refresh,5000);
const sidebar=$('sidebar'),scrim=$('scrim');function closeMenu(){sidebar.classList.remove('open');scrim.classList.remove('show');}
$('menuButton').addEventListener('click',()=>{sidebar.classList.add('open');scrim.classList.add('show');});$('closeMenu').addEventListener('click',closeMenu);scrim.addEventListener('click',closeMenu);
document.querySelectorAll('.nav-link').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));a.classList.add('active');closeMenu();}));
// Lịch sử: truy vấn riêng một khóa để giảm tải và tránh làm mất đỉnh do lấy AVG mặc định.
let history=null,historyLoading=false;
function points(){const k=$('historyMetric').value;return(history?.series?.[k]||[]).map(p=>({ts:Number(p.ts),value:categorical.has(k)?String(p.value):Number(p.value)})).filter(p=>Number.isFinite(p.ts)&&(categorical.has(k)||Number.isFinite(p.value))).sort((a,b)=>a.ts-b.ts);}
function drawHistory(){
 const canvas=$('historyChart'),w=Math.max(300,Math.round(canvas.getBoundingClientRect().width)),h=310,dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const pts=points(),k=$('historyMetric').value,table=$('historyRows');table.replaceChildren(...pts.slice(-250).reverse().map(p=>row([formatTime(p.ts),format(k,p.value)+(units[k]?' '+units[k]:'')])));
 if(!pts.length){ctx.fillStyle='#66788a';ctx.font='14px Arial';ctx.fillText('Không có dữ liệu trong khoảng đã chọn.',15,55);$('historySummary').textContent='Không có mẫu dữ liệu.';return;}
 const left=62,right=20,top=24,bottom=48,pw=w-left-right,ph=h-top-bottom,first=pts[0].ts,last=pts.at(-1).ts;
 const x=ts=>left+(last===first?.5:(ts-first)/(last-first))*pw;
 let vals,kind;
 if(categorical.has(k)){kind='category';const names=[...new Set(pts.map(p=>String(p.value)))];vals=pts.map(p=>names.indexOf(String(p.value)));$('historySummary').textContent=`${labels[k]}: ${pts.length} mẫu · Giá trị: ${names.map(n=>format(k,n)).join(' / ')}`;
  const y=i=>top+ph-(i+.5)/Math.max(names.length,1)*ph;
  ctx.font='11px Arial';names.forEach((n,i)=>{ctx.fillStyle='#65788d';ctx.fillText(format(k,n).slice(0,19),5,y(i)+4);});
  ctx.strokeStyle='#2476c7';ctx.lineWidth=2;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(x(p.ts),y(vals[i])):ctx.moveTo(x(p.ts),y(vals[i])));ctx.stroke();
 }else{
  kind='number';vals=pts.map(p=>p.value);let min=Math.min(...vals),max=Math.max(...vals);if(min===max){min=Math.max(0,min-1);max+=1;}else{const pad=(max-min)*.1;min=Math.max(0,min-pad);max+=pad;}
  const y=v=>top+(max-v)/(max-min)*ph;
  ctx.font='11px Arial';for(let i=0;i<=4;i++){const yy=top+i*ph/4;ctx.strokeStyle='#e5ebf2';ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(w-right,yy);ctx.stroke();ctx.fillStyle='#65788d';ctx.fillText((max-i*(max-min)/4).toFixed(2),5,yy+4);}
  ctx.strokeStyle='#2476c7';ctx.lineWidth=2;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(x(p.ts),y(p.value)):ctx.moveTo(x(p.ts),y(p.value)));ctx.stroke();
  const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
  $('historySummary').textContent=`${labels[k]} · ${pts.length} mẫu · Min: ${Math.min(...vals).toFixed(2)} · Max: ${Math.max(...vals).toFixed(2)} · TB: ${mean.toFixed(2)} ${units[k]||''}`;
 }
 ctx.font='11px Arial';ctx.fillStyle='#65788d';ctx.fillText(new Date(first).toLocaleString('vi-VN'),left,h-13);ctx.textAlign='right';ctx.fillText(new Date(last).toLocaleString('vi-VN'),w-right,h-13);ctx.textAlign='left';
}
function renderEvents(){
 const el=$('fallHistoryRows');const events=history?.events||{};
 const alerts=(events.fall_alert||[]).filter(p=>isOn(p.value)).sort((a,b)=>Number(a.ts)-Number(b.ts));
 const ids=(events.fall_event_id||[]).sort((a,b)=>Number(a.ts)-Number(b.ts));
 const dirs=(events.fall_direction||[]).sort((a,b)=>Number(a.ts)-Number(b.ts));
 // Một đợt báo liên tục được gom, không tính mỗi mẫu 3 giây là một sự kiện mới.
 const grouped=[];for(const p of alerts){const ts=Number(p.ts);if(!grouped.length||ts-grouped.at(-1).end>60000)grouped.push({start:ts,end:ts});else grouped.at(-1).end=ts;}
 const rows=grouped.reverse().slice(0,100).map(g=>{
  const nearest=arr=>arr.filter(p=>Math.abs(Number(p.ts)-g.start)<15000).sort((a,b)=>Math.abs(a.ts-g.start)-Math.abs(b.ts-g.start))[0];
  const d=nearest(dirs),id=nearest(ids);return row([formatTime(g.start),'Có mẫu cảnh báo'+(d?' · '+format('fall_direction',d.value):'')+(id?' · Mã '+id.value:'')]);
 });
 el.replaceChildren(...(rows.length?rows:[row(['--','Không có mẫu cảnh báo trong dữ liệu truy vấn'])]));
}
async function loadHistory(){if(historyLoading)return;historyLoading=true;$('historyMessage').textContent='Đang tải dữ liệu lịch sử...';
 try{const period=$('historyPeriod').value,metric=$('historyMetric').value;let mode=$('historyMode').value;if(categorical.has(metric)||metric==='fall_event_id'){mode='raw';$('historyMode').value='raw';$('historyMode').disabled=true;}else $('historyMode').disabled=false;
  const params=new URLSearchParams({period,metric,mode});const res=await fetch('/api/history?'+params,{cache:'no-store'});const data=await res.json();if(!res.ok)throw Error(data.error||'Không tải được lịch sử');history=data;
  $('historyMessage').textContent=`Đã tải ${period} · ${mode==='raw'?'Dữ liệu gốc':mode==='max'?'Giá trị cao nhất':'Giá trị trung bình'} · Giới hạn ${data.limit} mẫu/khóa. ${data.note||''}`;
  drawHistory();renderEvents();
 }catch(e){history=null;$('historyMessage').textContent='Lỗi: '+e.message;drawHistory();renderEvents();}finally{historyLoading=false;}}
function exportCSV(){const pts=points();if(!pts.length){$('historyMessage').textContent='Không có dữ liệu để xuất.';return;}const k=$('historyMetric').value;
 const csv='\uFEFFThời gian,'+labels[k]+' ('+(units[k]||'')+')\r\n'+pts.map(p=>'"'+formatTime(p.ts)+'","'+String(p.value).replaceAll('"','""')+'"').join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`QUOCAN_${k}_${$('historyPeriod').value}_${$('historyMode').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
for(const id of ['historyPeriod','historyMetric','historyMode'])$(id).addEventListener('change',loadHistory);
$('historyReload').addEventListener('click',loadHistory);$('historyExport').addEventListener('click',exportCSV);
window.addEventListener('resize',()=>{if(history)drawHistory();});loadHistory();
