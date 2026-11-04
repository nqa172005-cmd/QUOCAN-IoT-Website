const timeNode = document.getElementById("currentTime");
const statusNode = document.getElementById("connectionStatus");
const lastUpdate = document.getElementById("lastUpdate");
const apiMessage = document.getElementById("apiMessage");
const fallStatus = document.getElementById("fallStatus");
const activityStatus = document.getElementById("activityStatus");
const keys = ["temperature","humidity","speed_kmh","step_count","accel_x","accel_y","accel_z","fall_alert","fall_candidate","fall_direction","activity_status"];
const labels = {temperature:"Nhiệt độ",humidity:"Độ ẩm",speed_kmh:"Vận tốc ước tính",accel_x:"Gia tốc X",accel_y:"Gia tốc Y",accel_z:"Gia tốc Z",fall_candidate:"Đang kiểm tra ngã",fall_direction:"Hướng nghi ngờ ngã",step_count:"Số bước chân",fall_alert:"Cảnh báo té ngã",activity_status:"Trạng thái hoạt động"};
const units = {temperature:"°C",humidity:"%",speed_kmh:"km/h",accel_x:"m/s²",accel_y:"m/s²",accel_z:"m/s²",step_count:"bước"};
function capNhatThoiGian(){timeNode.textContent=new Date().toLocaleString("vi-VN");}
capNhatThoiGian(); setInterval(capNhatThoiGian,1000);
function newest(series){return Array.isArray(series)&&series.length?series.reduce((a,b)=>b.ts>a.ts?b:a):null;}
function formatValue(k,v){
 if(k==="activity_status")return ({WALKING_SLOW:"Đi chậm",WALKING_FAST:"Đi nhanh",WALKING:"Đang đi",STILL_OR_IDLE:"Đứng/ngồi nghỉ",RESTING:"Đang nghỉ",FALL_ALERT:"Cảnh báo ngã",CHECKING_EVENT:"Đang kiểm tra"})[v]||String(v);
 if(k==="fall_direction")return ({FORWARD:"Phía trước",BACKWARD:"Phía sau",LEFT:"Bên trái",RIGHT:"Bên phải",NONE:"Chưa xác định",UNKNOWN:"Chưa xác định"})[v]||String(v);if(v===null||v===undefined||v==="")return "--";if(k==="fall_alert")return String(v).toLowerCase()==="true"||String(v)==="1"?"Có cảnh báo":"Không có cảnh báo";return String(v);}
let loading=false;
async function capNhatDuLieu(){
 if(loading)return; loading=true;
 try{
  const res=await fetch('/api/telemetry',{cache:'no-store'});
  const body=await res.json();
  if(!res.ok)throw new Error(body.error||'Không lấy được dữ liệu');
  let latestTs=0;
  const rows=[];
  for(const k of keys){
   const point=newest(body[k]);
   if(point)latestTs=Math.max(latestTs,point.ts);
   const value=point?formatValue(k,point.value):'--';
   const node=document.getElementById('value-'+k);
   if(node)node.innerHTML='';
   if(node){node.append(document.createTextNode(value+' '));const small=document.createElement('small');small.textContent=units[k]||'';node.append(small);}
   if(k==='fall_alert'){
    fallStatus.textContent=point?value:'Chưa có dữ liệu cảnh báo';
    fallStatus.classList.toggle('alert-active',!!point&&value==='Có cảnh báo');
    fallStatus.classList.toggle('alert-clear',!!point&&value==='Không có cảnh báo');
   }
   if(k==='activity_status'){activityStatus.textContent=point?'Hoạt động: '+value:'Chưa có thông tin hoạt động';document.getElementById('activityDetail').textContent=value;}
   if(k==='fall_direction')document.getElementById('fallDirection').textContent=value;
   const tr=document.createElement('tr');
   for(const cell of [labels[k],value+(units[k]?' '+units[k]:''),point?new Date(point.ts).toLocaleString('vi-VN'):'--']){
    const td=document.createElement('td');td.textContent=cell;tr.append(td);
   }
   rows.push(tr);
  }
  document.getElementById('telemetryRows').replaceChildren(...rows);
  const age=latestTs?Date.now()-latestTs:Infinity;
  const recent=age>=0&&age<60000;
  statusNode.textContent=recent?'Thiết bị đang gửi dữ liệu':'Chưa có dữ liệu mới';
  statusNode.classList.toggle('connected',recent);
  statusNode.classList.toggle('disconnected',!recent);
  lastUpdate.textContent=latestTs?'Dữ liệu gần nhất: '+new Date(latestTs).toLocaleString('vi-VN'):'Chưa có dữ liệu telemetry.';
  apiMessage.textContent=recent?'Đã kết nối ThingsBoard.':'Đã kết nối máy chủ; hãy kiểm tra ESP32 nếu dữ liệu chưa cập nhật.';
 }catch(err){statusNode.textContent='Lỗi kết nối';statusNode.classList.add('disconnected');statusNode.classList.remove('connected');apiMessage.textContent=err.message;}
 finally{loading=false;}
}
capNhatDuLieu();setInterval(capNhatDuLieu,5000);
const sidebar=document.getElementById('sidebar');const scrim=document.getElementById('scrim');
function dongMenu(){sidebar.classList.remove('open');scrim.classList.remove('show');}
document.getElementById('menuButton').addEventListener('click',()=>{sidebar.classList.add('open');scrim.classList.add('show');});
document.getElementById('closeMenu').addEventListener('click',dongMenu);
scrim.addEventListener('click',dongMenu);
document.querySelectorAll('.nav-link').forEach(link=>link.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach(item=>item.classList.remove('active'));link.classList.add('active');dongMenu();}));


// ===== LỊCH SỬ DỮ LIỆU =====
const historyPeriodNode = document.getElementById('historyPeriod');
const historyMetricNode = document.getElementById('historyMetric');
const historyMessageNode = document.getElementById('historyMessage');
let historyPayload = null;
const historyLabels = {temperature:'Nhiệt độ',humidity:'Độ ẩm',speed_kmh:'Vận tốc ước tính',accel_x:'Gia tốc X',accel_y:'Gia tốc Y',accel_z:'Gia tốc Z',step_count:'Số bước chân'};
const historyUnits = {temperature:'°C',humidity:'%',speed_kmh:'km/h',accel_x:'m/s²',accel_y:'m/s²',accel_z:'m/s²',step_count:'bước'};
const vnTime = ts => new Date(Number(ts)).toLocaleString('vi-VN');
function historyPoints(){
 const k=historyMetricNode.value;
 return (historyPayload?.series?.[k]||[]).map(p=>({ts:Number(p.ts),value:Number(p.value)}))
  .filter(p=>Number.isFinite(p.ts)&&Number.isFinite(p.value))
  .sort((a,b)=>a.ts-b.ts);
}
function drawHistory(){
 const canvas=document.getElementById('historyChart');
 const width=Math.max(300,Math.round(canvas.getBoundingClientRect().width));
 const height=canvas.getBoundingClientRect().height||310;
 const dpr=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
 const points=historyPoints();
 const rows=document.getElementById('historyRows');rows.replaceChildren();
 const unit=historyUnits[historyMetricNode.value];
 if(!points.length){ctx.fillStyle='#71849a';ctx.font='13px Segoe UI,Arial';ctx.fillText('Không có dữ liệu lịch sử trong khoảng này.',18,55);document.getElementById('historySummary').textContent='Chưa có dữ liệu cho thông số đã chọn.';const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=2;td.textContent='Không có dữ liệu';tr.append(td);rows.append(tr);return;}
 const vals=points.map(p=>p.value);let min=Math.min(...vals),max=Math.max(...vals);
 if(min===max){min-=1;max+=1;}else{const pad=(max-min)*.12;min-=pad;max+=pad;}
 const l=58,r=18,t=18,b=43,plotW=width-l-r,plotH=height-t-b;
 const first=points[0].ts,last=points[points.length-1].ts;
 const x=ts=>l+(last===first?.5:(ts-first)/(last-first))*plotW;
 const y=v=>t+(max-v)/(max-min)*plotH;
 ctx.font='11px Segoe UI,Arial';ctx.lineWidth=1;
 for(let i=0;i<=4;i++){const yy=t+i*plotH/4;ctx.strokeStyle='#e8eff7';ctx.beginPath();ctx.moveTo(l,yy);ctx.lineTo(width-r,yy);ctx.stroke();ctx.fillStyle='#7a8fa3';ctx.fillText((max-i*(max-min)/4).toFixed(1),6,yy+4);}
 ctx.fillStyle='#7a8fa3';ctx.fillText(new Date(first).toLocaleDateString('vi-VN'),l,height-14);ctx.textAlign='right';ctx.fillText(new Date(last).toLocaleDateString('vi-VN'),width-r,height-14);ctx.textAlign='left';
 ctx.strokeStyle='#2476c7';ctx.lineWidth=2;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(p.ts),y(p.value)):ctx.moveTo(x(p.ts),y(p.value)));ctx.stroke();
 if(points.length<=60){ctx.fillStyle='#2476c7';points.forEach(p=>{ctx.beginPath();ctx.arc(x(p.ts),y(p.value),2.4,0,Math.PI*2);ctx.fill();});}
 const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
 document.getElementById('historySummary').textContent=`${historyLabels[historyMetricNode.value]} · ${points.length} mốc · Thấp nhất: ${Math.min(...vals).toFixed(1)} ${unit} · Cao nhất: ${Math.max(...vals).toFixed(1)} ${unit} · Trung bình: ${avg.toFixed(1)} ${unit}`;
 for(const p of [...points].reverse().slice(0,200)){const tr=document.createElement('tr');for(const cell of [vnTime(p.ts),p.value.toFixed(2)+' '+unit]){const td=document.createElement('td');td.textContent=cell;tr.append(td);}rows.append(tr);}
}
function renderFalls(){
 const tbody=document.getElementById('fallHistoryRows');tbody.replaceChildren();
 const samples=(historyPayload?.fallSamples||[]).filter(p=>String(p.value)==='1'||String(p.value).toLowerCase()==='true').sort((a,b)=>Number(b.ts)-Number(a.ts));
 if(!samples.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=2;td.textContent='Không tìm thấy mẫu cảnh báo đã lưu trong khoảng này.';tr.append(td);tbody.append(tr);return;}
 // Gom các mẫu cảnh báo liên tiếp thành một đợt, không coi từng mẫu là một lần ngã.
 const grouped=[];for(const p of [...samples].reverse()){const ts=Number(p.ts);if(!grouped.length||ts-grouped[grouped.length-1].last>60000)grouped.push({first:ts,last:ts});else grouped[grouped.length-1].last=ts;}
 for(const event of grouped.reverse().slice(0,100)){const tr=document.createElement('tr');for(const cell of [vnTime(event.first),'Có mẫu cảnh báo']){const td=document.createElement('td');td.textContent=cell;tr.append(td);}tbody.append(tr);}
}
async function loadHistory(){
 historyMessageNode.textContent='Đang lấy dữ liệu lịch sử từ ThingsBoard...';
 try{const response=await fetch('/api/history?period='+encodeURIComponent(historyPeriodNode.value),{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Không lấy được lịch sử');historyPayload=data;historyMessageNode.textContent='Đã tải lịch sử. Biểu đồ sử dụng dữ liệu trung bình theo khoảng thời gian; bảng cảnh báo sử dụng mẫu đã lưu.';drawHistory();renderFalls();}
 catch(error){historyPayload=null;historyMessageNode.textContent='Lỗi: '+error.message;drawHistory();renderFalls();}
}
function exportHistoryCSV(){const points=historyPoints();if(!points.length){historyMessageNode.textContent='Không có dữ liệu để xuất.';return;}const k=historyMetricNode.value;const csv='\uFEFFThời gian,'+historyLabels[k]+' ('+historyUnits[k]+')\r\n'+points.map(p=>'"'+vnTime(p.ts)+'",'+p.value).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='QUOCAN_IoT_'+k+'_'+historyPeriodNode.value+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
historyPeriodNode.addEventListener('change',loadHistory);
historyMetricNode.addEventListener('change',drawHistory);
document.getElementById('historyReload').addEventListener('click',loadHistory);
document.getElementById('historyExport').addEventListener('click',exportHistoryCSV);
window.addEventListener('resize',()=>{if(historyPayload)drawHistory();});
loadHistory();
