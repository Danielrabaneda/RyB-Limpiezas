import{j as e,c as It,r as S,f as je,q as Ye,t as Se,b as Ne,w as Ae}from"./index-BJz5YZJM.js";import{m as ee,w as Xe,s as le,o as oe,B as ke,A as Mt,a as _e,C as zt,D as Rt,E as Tt,F as Ft,u as Et}from"./communityService-bqOrD4jq.js";import{T as Ot,t as Wt,a as Pt,b as Ut,d as $t}from"./TransferModal-Cru7cq5z.js";import{R as Lt}from"./RescheduleModal-BjJHZFD2.js";import{c as Je,f as w,s as ie}from"./format-DNRCWA8R.js";import{e as ce}from"./endOfWeek-Bhsmb1R2.js";import{i as De}from"./isSameMonth-D9VzofQh.js";import{e as Y}from"./es-C2D6dY2Q.js";import{c as Ht,o as Bt}from"./navigation-BBXO958_.js";import{E as Gt}from"./jspdf.es.min-xVtA4_jF.js";function qt(o){return Je(o,Date.now())}function Yt(o,D){return ee(Je(o,o),qt(o))}function At(o,D,p){return Xe(o,-1,p)}function _t({month:o,services:D,selectedOpId:p,operarios:M,communities:f,allTasks:x}){const B=w(o,"MMMM yyyy",{locale:Y}),u=p!=="all",b=M.find(l=>l.uid===p),U=(b==null?void 0:b.name)||"",F=new Set([b==null?void 0:b.uid,b==null?void 0:b.legacyUid].filter(Boolean)),E=le(o),N=oe(o),z=ie(E,{weekStartsOn:1}),A=ce(N,{weekStartsOn:1}),_=ke({start:z,end:A}),G=[];for(let l=0;l<_.length;l+=7)G.push(_.slice(l,l+7));const $=l=>D.filter(h=>{var I;const O=(I=h.scheduledDate)!=null&&I.toDate?h.scheduledDate.toDate():new Date(h.scheduledDate);return ee(O,l)&&(p==="all"||F.has(h.assignedUserId))}),q=l=>{var h;return((h=f.find(O=>O.id===l))==null?void 0:h.name)||"..."};return e.jsx("div",{id:"printable-calendar-wrapper",style:{position:"fixed",left:"-9999px",top:"-9999px",width:"0px",height:"0px",overflow:"hidden",zIndex:-9999,pointerEvents:"none",opacity:0},children:e.jsxs("div",{id:"printable-calendar-root",style:{width:"1400px",height:"1200px",backgroundColor:"white",padding:"16px 20px",boxSizing:"border-box",display:"flex",flexDirection:"column",fontFamily:"Arial, Helvetica, sans-serif",color:"#000"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-end",borderBottom:"2px solid #000",paddingBottom:"4px",marginBottom:"5px"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"6px"},children:[e.jsx("div",{style:{backgroundColor:"#000",color:"#fff",padding:"2px 7px",fontWeight:"900",fontSize:"15px",lineHeight:"1"},children:"RYB"}),e.jsx("div",{style:{fontWeight:"900",fontSize:"8px",textTransform:"uppercase",letterSpacing:"0.5px"},children:"RyB Limpiezas"})]}),e.jsxs("div",{style:{textAlign:"center",flex:1},children:[e.jsx("h1",{style:{fontSize:"20px",fontWeight:"900",textTransform:"capitalize",margin:"0",lineHeight:"1"},children:B}),u&&e.jsxs("div",{style:{fontSize:"10px",fontWeight:"bold",color:"#000",marginTop:"2px"},children:["OPERARIO: ",U.toUpperCase()]})]}),e.jsxs("div",{style:{textAlign:"right"},children:[e.jsx("div",{style:{fontSize:"9px",fontWeight:"900"},children:"Daniel Rabaneda"}),e.jsx("div",{style:{fontSize:"6px",color:"#333",textTransform:"uppercase",fontWeight:"bold"},children:"Planificación Mensual"})]})]}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(5, 1.2fr) repeat(2, 0.5fr)",gridTemplateRows:`auto repeat(${G.length}, 1fr)`,border:"2px solid #000",flex:1,backgroundColor:"#fff"},children:[["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].map(l=>e.jsx("div",{style:{borderRight:"1px solid #000",borderBottom:"2px solid #000",padding:"3px 0",textAlign:"center",fontSize:"9px",fontWeight:"900",textTransform:"uppercase",backgroundColor:"#eee",letterSpacing:"0.3px"},children:l},l)),_.map((l,h)=>{const O=$(l),I=De(l,o);return e.jsxs("div",{style:{borderRight:"1px solid #999",borderBottom:"1px solid #999",padding:"1px 2px",backgroundColor:I?"#fff":"#f8f8f8",display:"flex",flexDirection:"column",overflow:"hidden"},children:[e.jsx("div",{style:{textAlign:"right",fontSize:"11px",fontWeight:"900",color:I?"#000":"#bbb",lineHeight:"1",marginBottom:"1px",flexShrink:0},children:w(l,"d")}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0px",flex:1,overflow:"hidden",alignContent:"start"},children:I&&O.map(C=>{const j=x.find(de=>de.id===C.communityTaskId),L=(j==null?void 0:j.printColor)||"#ef4444";return e.jsxs("div",{style:{fontSize:"14px",lineHeight:"1.3",display:"flex",alignItems:"center",gap:"2px",padding:"0.5px 0",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"},children:[e.jsx("span",{style:{width:"9px",height:"9px",borderRadius:"50%",backgroundColor:L,display:"inline-block",flexShrink:0,marginTop:"1px"}}),e.jsx("span",{style:{fontWeight:"700",color:"#000",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:q(C.communityId)})]},C.id)})})]},h)})]}),e.jsxs("div",{style:{marginTop:"4px",display:"flex",justifyContent:"space-between",alignItems:"center"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"10px",fontSize:"7px",fontWeight:"bold",color:"#333"},children:[e.jsxs("span",{style:{display:"flex",alignItems:"center",gap:"2px"},children:[e.jsx("span",{style:{width:"6px",height:"6px",borderRadius:"50%",backgroundColor:"#22c55e",display:"inline-block"}}),"Limp. Escalera"]}),e.jsxs("span",{style:{display:"flex",alignItems:"center",gap:"2px"},children:[e.jsx("span",{style:{width:"6px",height:"6px",borderRadius:"50%",backgroundColor:"#eab308",display:"inline-block"}}),"Repaso Portal"]}),e.jsxs("span",{style:{display:"flex",alignItems:"center",gap:"2px"},children:[e.jsx("span",{style:{width:"6px",height:"6px",borderRadius:"50%",backgroundColor:"#3b82f6",display:"inline-block"}}),"Limp. Oficina"]}),e.jsxs("span",{style:{display:"flex",alignItems:"center",gap:"2px"},children:[e.jsx("span",{style:{width:"6px",height:"6px",borderRadius:"50%",backgroundColor:"#ef4444",display:"inline-block"}}),"Otras tareas"]})]}),e.jsxs("div",{style:{fontSize:"6px",color:"#666",textAlign:"right",fontWeight:"bold"},children:["Generado: ",w(new Date,"d/MM/yyyy HH:mm")]})]})]})})}function Ve({service:o,community:D,communityName:p,isOp:M=!1,onTransfer:f,onReschedule:x,onReopen:B,actionLoading:u=!1,isAdmin:b,allTasks:U=[]}){const F=o.status==="completed",E=o.status==="in_progress"||o.status==="started",N=U.find(g=>g.id===o.communityTaskId),z=o.taskName||(N==null?void 0:N.taskName)||"Servicio de Limpieza",A=o.isUrgent||(N==null?void 0:N.isUrgent)||!1,_=F?"completed":E?"in-progress":"",G=()=>F?e.jsx("span",{className:"status-badge status-completed",children:"✅ COMPLETADO"}):E?e.jsx("span",{className:"status-badge status-in-progress",children:"⏳ EN CURSO"}):e.jsx("span",{className:"status-badge status-pending",children:"⚪ PENDIENTE"}),$=o.isGarage||(N==null?void 0:N.isGarage),X=(g=>{if(!g)return"";try{const l=g.toDate?g.toDate():new Date(g);return w(l,"dd/MM")}catch{return""}})(o.originalDate);return e.jsxs("div",{className:`service-card ${_} ${$?"garage":""}`,children:[e.jsxs("div",{className:"service-card-header",children:[e.jsx("div",{children:e.jsxs("div",{className:"service-community",style:{display:"flex",alignItems:"center",gap:"4px",flexWrap:"wrap"},children:[p,o.isTransferred&&e.jsxs("span",{style:{fontSize:"9px",background:"#fef2f2",color:"#ef4444",padding:"1px 5px",borderRadius:"12px",border:"1px solid currentColor",fontWeight:"bold",textTransform:"none",letterSpacing:"normal",display:"inline-flex",alignItems:"center",gap:"2px"},children:["↪️ Traspasado",o.transferValidated===!1?" (Pte.)":""]}),o.isRescheduled&&e.jsxs("span",{style:{fontSize:"9px",background:"#faf5ff",color:"#7c3aed",padding:"1px 5px",borderRadius:"12px",border:"1px solid currentColor",fontWeight:"bold",textTransform:"none",letterSpacing:"normal",display:"inline-flex",alignItems:"center",gap:"2px"},children:["📅 Cambiado",X?` (era ${X})`:"",o.rescheduleValidated===!1?" (Pte.)":""]})]})}),G()]}),e.jsxs("div",{className:"flex flex-wrap gap-2 mb-2",children:[(!F||b)&&e.jsx("button",{className:"btn btn-ghost btn-xs flex-1",onClick:g=>{g.stopPropagation(),f()},style:{color:"var(--color-primary)",border:"1px solid var(--color-primary)",fontSize:"10px"},children:"🔄 Traspasar"}),(!F||b)&&e.jsx("button",{className:"btn btn-ghost btn-xs flex-1",onClick:g=>{g.stopPropagation(),x&&x()},style:{color:"var(--color-primary)",border:"1px solid var(--color-primary)",fontSize:"10px"},children:"📅 Mover día"}),b&&F&&B&&e.jsx("button",{type:"button",className:"btn btn-ghost btn-xs flex-1",disabled:u,onClick:g=>{g.stopPropagation(),B()},style:{color:"#b45309",border:"1px solid #f59e0b",fontSize:"10px"},children:u?"Reabriendo…":"↩️ Reabrir"}),b&&Ht(D)&&e.jsx("button",{type:"button",className:"btn btn-ghost btn-xs flex-1",onClick:g=>{g.stopPropagation(),Bt(D)},style:{color:"#047857",border:"1px solid #10b981",fontSize:"10px",minWidth:"92px"},"aria-label":`Cómo llegar a ${(D==null?void 0:D.name)||p||"la comunidad"}`,title:"Abrir la ubicación guardada",children:"🧭 Cómo llegar"})]}),e.jsx("div",{className:"service-tasks",children:e.jsxs("span",{className:`service-task-chip flex items-center gap-1 ${A?"urgent":""}`,children:[A?"🚨":"📋"," ",z]})})]})}function rs({userId:o=null,legacyUserId:D=null,isAdmin:p=!1,operarios:M=[]}){const{companyId:f}=It(),[x,B]=S.useState(new Date),[u,b]=S.useState(new Date),[U,F]=S.useState([]),[E,N]=S.useState([]),[z,A]=S.useState([]),[_,G]=S.useState(!0),[$,q]=S.useState(!1),[X,g]=S.useState([]),[l,h]=S.useState({open:!1,type:"",date:null,serviceId:null,fromUserId:null}),[O,I]=S.useState({open:!1,serviceId:null,currentDate:null}),[C,j]=S.useState(!1),[L,de]=S.useState("all"),te=t=>new Set([t==null?void 0:t.uid,t==null?void 0:t.legacyUid].filter(Boolean));S.useEffect(()=>{f&&V()},[x,o,D,f]),S.useEffect(()=>{async function t(){console.log("Cargando referencias (comunidades y tareas)...");try{const r=(await je(Se(Ne,f,"communities"))).docs.map(a=>({id:a.id,...a.data()}));N(r),console.log(`${r.length} comunidades totales cargadas.`)}catch(s){console.error("Error cargando comunidades:",s)}try{const s=Ye(Se(Ne,f,"communityTasks"),Ae("active","==",!0)),a=(await je(s)).docs.map(i=>({id:i.id,...i.data()}));A(a),console.log(`${a.length} tareas totales cargadas.`)}catch(s){console.error("Error cargando tareas:",s)}}t()},[f]);async function V(){G(!0);try{await Mt(f);const t=le(x),s=oe(x),r=[o,D].filter(Boolean),[a,i]=await Promise.all([r.length>0?Promise.all(r.map(n=>_e(f,t,s,{userId:n}))):_e(f,t,s).then(n=>[n]),je(Ye(Se(Ne,f,"absences"),Ae("status","==","approved")))]);F(zt(a.flat())),g(i.docs.map(n=>({id:n.id,...n.data()})))}catch(t){console.error(t)}finally{G(!1)}}const Ce=(t,s)=>s?X.find(r=>{var k,R;if(r.userId!==t)return!1;const a=(k=r.startDate)!=null&&k.toDate?r.startDate.toDate():new Date(r.startDate),i=(R=r.endDate)!=null&&R.toDate?r.endDate.toDate():new Date(r.endDate),n=new Date(s).setHours(12,0,0,0),d=new Date(a).setHours(0,0,0,0),m=new Date(i).setHours(23,59,59,999);return n>=d&&n<=m}):null;async function Ke(){if(p&&confirm(`¿Generar servicios para todo el mes de ${w(x,"MMMM",{locale:Y})}?`)){q(!0);try{const t=await Tt(f,x);alert(`Se han generado ${t} nuevos servicios.`),await V()}catch(t){console.error(t),alert("Error al generar servicios")}finally{q(!1)}}}async function Qe(){if(p&&confirm(`¿Sincronizar y actualizar servicios para el mes de ${w(x,"MMMM",{locale:Y})}?
(Eliminará servicios pendientes obsoletos y creará nuevos según la configuración activa)`)){q(!0);try{const t=await Ft(f,x);t.createdCount===0&&t.deletedCount===0?alert("El calendario ya está al día. Los cambios realizados en las comunidades se sincronizan automáticamente al guardar."):alert(`Sincronización completada:
- ${t.createdCount} servicios nuevos creados.
- ${t.deletedCount} servicios obsoletos eliminados.`),await V()}catch(t){console.error(t),alert("Error al sincronizar servicios")}finally{q(!1)}}}async function Ze(t){if(t){j(!0);try{const s=p?"admin":"operario";l.type==="single"?await Wt(f,{serviceId:l.serviceId,fromUserId:l.fromUserId,toUserId:t,requesterRole:s}):l.type==="day"?await Pt(f,{date:l.date,fromUserId:l.fromUserId,toUserId:t,requesterRole:s}):l.type==="week"&&await Ut(f,{dateInWeek:l.date,fromUserId:l.fromUserId,toUserId:t,requesterRole:s}),alert(p?"Traspaso realizado con éxito.":"Solicitud de traspaso enviada al administrador."),h({open:!1,type:"",date:null,serviceId:null,fromUserId:null}),await V()}catch(s){console.error(s),alert("Error en el traspaso: "+s.message)}finally{j(!1)}}}async function et(t){if(t){j(!0);try{const s=p?"admin":"operario";await $t(f,{serviceId:O.serviceId,newDate:t,requesterRole:s,userId:o||null}),alert(p?"Fecha actualizada con éxito.":"Solicitud de cambio de fecha enviada al administrador."),I({open:!1,serviceId:null,currentDate:null}),await V()}catch(s){console.error(s),alert("Error al cambiar fecha: "+s.message)}finally{j(!1)}}}async function Ie(t){var i,n;if(!p||!(t!=null&&t.id))return;const s=(i=t.scheduledDate)!=null&&i.toDate?t.scheduledDate.toDate():new Date(t.scheduledDate),r=Number.isNaN(s.getTime())?"la fecha indicada":w(s,"dd/MM/yyyy"),a=((n=E.find(d=>d.id===t.communityId))==null?void 0:n.name)||"este servicio";if(confirm(`¿Reabrir ${a} del ${r}?
Solo esta ficha volverá a pendiente.`)){j(!0);try{await Et(f,t.id,"pending"),await V(),alert("La ficha ha vuelto a pendiente.")}catch(d){console.error(d),alert("No se pudo reabrir la ficha: "+d.message)}finally{j(!1)}}}const Me=()=>{var Le;const t=new Gt("l","mm","a4"),s=t.internal.pageSize.getWidth(),r=t.internal.pageSize.getHeight(),a=4,i=3.5,n=le(x),d=oe(x),m=ie(n,{weekStartsOn:1}),k=ce(d,{weekStartsOn:1}),R=ke({start:m,end:k}),P=[];for(let c=0;c<R.length;c+=7)P.push(R.slice(c,c+7));const ae=M.find(c=>c.uid===L),xe=te(ae),lt=U.filter(c=>L==="all"||xe.has(c.assignedUserId)),ot=c=>{var y;return((y=E.find(v=>v.id===c))==null?void 0:y.name)||"?"},it=c=>lt.filter(y=>{var T;const v=(T=y.scheduledDate)!=null&&T.toDate?y.scheduledDate.toDate():new Date(y.scheduledDate);return ee(v,c)}),Ee=c=>{const y=parseInt(c.slice(1,3),16),v=parseInt(c.slice(3,5),16),T=parseInt(c.slice(5,7),16);return[y,v,T]},me=s-2*a,H=9,Oe=5,J=5,K=(r-2*i-H-Oe-J)/P.length,ct=5*1.2+2*.5,dt=me/ct,fe=[1.2,1.2,1.2,1.2,1.2,.5,.5].map(c=>c*dt),he=[];let We=a;for(const c of fe)he.push(We),We+=c;const Pe=i+H+J;t.setFillColor(0,0,0),t.rect(a,i,11,6,"F"),t.setTextColor(255,255,255),t.setFont("helvetica","bold"),t.setFontSize(8),t.text("RYB",a+1.5,i+4.3),t.setTextColor(0,0,0),t.setFontSize(5.5),t.text("RyB Limpiezas",a+13,i+4);const Ue=w(x,"MMMM yyyy",{locale:Y});t.setFontSize(14),t.setFont("helvetica","bold"),t.text(Ue.charAt(0).toUpperCase()+Ue.slice(1),s/2,i+5.5,{align:"center"});const $e=((Le=M.find(c=>c.uid===L))==null?void 0:Le.name)||"";L!=="all"&&$e&&(t.setFontSize(7),t.text(`OPERARIO: ${$e.toUpperCase()}`,s/2,i+8.5,{align:"center"})),t.setFontSize(6),t.setFont("helvetica","bold"),t.text("Daniel Rabaneda",s-a,i+4,{align:"right"}),t.setFontSize(4.5),t.setFont("helvetica","normal"),t.text("Planificación Mensual",s-a,i+7,{align:"right"}),t.setDrawColor(0,0,0),t.setLineWidth(.4),t.line(a,i+H,s-a,i+H);const pt=["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];t.setFillColor(238,238,238),t.rect(a,i+H,me,J,"F"),t.setTextColor(0,0,0),t.setFontSize(5.5),t.setFont("helvetica","bold"),pt.forEach((c,y)=>{const v=he[y]+fe[y]/2;t.text(c.toUpperCase(),v,i+H+3.3,{align:"center"})}),t.setLineWidth(.4),t.line(a,i+H+J,s-a,i+H+J),t.setLineWidth(.2),t.setDrawColor(160,160,160),P.forEach((c,y)=>{const v=Pe+y*K;c.forEach((T,ne)=>{const Q=he[ne],re=fe[ne],Z=De(T,x);if(Z||(t.setFillColor(248,248,248),t.rect(Q,v,re,K,"F")),t.setFont("helvetica","bold"),t.setFontSize(7),t.setTextColor(Z?0:180,Z?0:180,Z?0:180),t.text(w(T,"d"),Q+re-1,v+4,{align:"right"}),Z){const mt=it(T),be=re/2,ft=5,He=3.2,ht=v+5.5,ye=.9;t.setFontSize(ft),t.setFont("helvetica","bold"),mt.forEach((Be,Ge)=>{const qe=Ge%2,ut=Math.floor(Ge/2),gt=Q+qe*be+2.5+ye*2+.5,ve=ht+ut*He,bt=Q+qe*be+2,yt=ve-.9;if(ve+He>v+K-.5)return;const we=z.find(Ct=>Ct.id===Be.communityTaskId),vt=(we==null?void 0:we.printColor)||"#ef4444",[wt,jt,St]=Ee(vt);t.setFillColor(wt,jt,St),t.circle(bt,yt,ye,"F"),t.setTextColor(0,0,0);const Nt=ot(Be.communityId),kt=be-2.5-ye*2-1,Dt=t.splitTextToSize(Nt,kt)[0];t.text(Dt,gt,ve)})}t.setDrawColor(160,160,160),t.setLineWidth(.2),t.rect(Q,v,re,K,"S")})}),t.setDrawColor(0,0,0),t.setLineWidth(.5),t.rect(a,Pe,me,K*P.length,"S");const ue=r-i-Oe+3,xt=[{color:"#22c55e",label:"Limp. Escalera"},{color:"#eab308",label:"Repaso Portal"},{color:"#3b82f6",label:"Limp. Oficina"},{color:"#ef4444",label:"Otras tareas"}];let ge=a;return t.setFontSize(5.5),t.setFont("helvetica","bold"),xt.forEach(({color:c,label:y})=>{const[v,T,ne]=Ee(c);t.setFillColor(v,T,ne),t.circle(ge+1.5,ue-1,1.5,"F"),t.setTextColor(50,50,50),t.text(y,ge+4,ue),ge+=t.getTextWidth(y)+7}),t.setFontSize(5),t.setFont("helvetica","normal"),t.setTextColor(120,120,120),t.text(`Generado: ${w(new Date,"d/MM/yyyy HH:mm")}`,s-a,ue,{align:"right"}),t},tt=async()=>{j(!0);try{Me().save(`Calendario_${w(x,"MMMM_yyyy",{locale:Y})}.pdf`)}catch(t){console.error("Error generating PDF:",t),alert("Error al generar PDF.")}finally{j(!1)}},st=async()=>{j(!0);try{const s=Me().output("blob"),r=URL.createObjectURL(s),a=window.open(r,"_blank");a&&a.addEventListener("load",()=>{a.focus(),a.print()})}catch(t){console.error("Error printing PDF:",t),alert("Error al preparar impresión.")}finally{j(!1)}},at=ke({start:ie(le(x),{weekStartsOn:1}),end:ce(oe(x),{weekStartsOn:1})}),ze=t=>U.filter(s=>{if(!s.scheduledDate)return!1;const r=s.scheduledDate.toDate?s.scheduledDate.toDate():new Date(s.scheduledDate);return isNaN(r.getTime())?!1:ee(r,t)}),W=ze(u),pe=t=>E.find(s=>s.id===t),se=t=>{var s;return((s=pe(t))==null?void 0:s.name)||"Comunidad..."},nt=t=>{if(!p||M.length===0)return e.jsx("div",{className:"cell-svc-list",children:t.map(n=>{const d=z.find(P=>P.id===n.communityTaskId),m=(d==null?void 0:d.printColor)||"#3b82f6",k=se(n.communityId),R=n.status==="completed";return e.jsxs("div",{className:`cell-svc-row ${R?"completed":""}`,title:`${k} (${R?"Completado":"Pendiente"})`,children:[e.jsx("span",{className:"cell-svc-dot",style:{backgroundColor:m}}),e.jsx("span",{className:"cell-svc-text truncate",children:k})]},n.id)})});const s=[...M].sort((n,d)=>(n.name||"").localeCompare(d.name||"","es",{sensitivity:"base"})),r=[];s.forEach(n=>{const d=te(n),m=t.filter(k=>d.has(k.assignedUserId));m.length>0&&r.push({opName:n.name,services:m})});const a=new Set;s.forEach(n=>{te(n).forEach(d=>a.add(d))});const i=t.filter(n=>!a.has(n.assignedUserId));return i.length>0&&r.push({opName:"Sin asignar",services:i}),e.jsx("div",{className:"cell-op-groups",children:r.map((n,d)=>e.jsxs("div",{className:"cell-op-group",children:[n.opName&&e.jsxs("div",{className:"cell-op-header",children:[e.jsx("span",{className:"text-[9px]",children:"👤"}),e.jsx("span",{className:"truncate",children:n.opName})]}),n.services.map(m=>{const k=z.find(xe=>xe.id===m.communityTaskId),R=(k==null?void 0:k.printColor)||"#3b82f6",P=se(m.communityId),ae=m.status==="completed";return e.jsxs("div",{className:`cell-svc-row ${ae?"completed":""}`,title:`${n.opName?n.opName+" - ":""}${P} (${ae?"Completado":"Pendiente"})`,children:[e.jsx("span",{className:"cell-svc-dot",style:{backgroundColor:R}}),e.jsx("span",{className:"cell-svc-text truncate",children:P})]},m.id)})]},d))})},Re={},Te=Rt(M);p&&Te.forEach(t=>{const s=te(t);Re[t.uid]={name:t.name,services:W.filter(r=>s.has(r.assignedUserId))}});const Fe=()=>e.jsxs("div",{style:{display:"inline-flex",alignItems:"center",gap:"10px",fontSize:"11px",fontWeight:700,color:"#475569",backgroundColor:"#ffffff",padding:"4px 10px",borderRadius:"8px",border:"1px solid #cbd5e1",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"},children:[e.jsxs("div",{style:{display:"inline-flex",alignItems:"center",gap:"4px"},children:[e.jsx("span",{style:{width:"8px",height:"8px",borderRadius:"50%",backgroundColor:"#22c55e",display:"inline-block",flexShrink:0}}),e.jsx("span",{style:{fontSize:"11px"},children:"Escalera"})]}),e.jsxs("div",{style:{display:"inline-flex",alignItems:"center",gap:"4px"},children:[e.jsx("span",{style:{width:"8px",height:"8px",borderRadius:"50%",backgroundColor:"#eab308",display:"inline-block",flexShrink:0}}),e.jsx("span",{style:{fontSize:"11px"},children:"Portal"})]}),e.jsxs("div",{style:{display:"inline-flex",alignItems:"center",gap:"4px"},children:[e.jsx("span",{style:{width:"8px",height:"8px",borderRadius:"50%",backgroundColor:"#3b82f6",display:"inline-block",flexShrink:0}}),e.jsx("span",{style:{fontSize:"11px"},children:"Oficina"})]}),e.jsxs("div",{style:{display:"inline-flex",alignItems:"center",gap:"4px"},children:[e.jsx("span",{style:{width:"8px",height:"8px",borderRadius:"50%",backgroundColor:"#ef4444",display:"inline-block",flexShrink:0}}),e.jsx("span",{style:{fontSize:"11px"},children:"Otras"})]})]});function rt(){const t=W.some(n=>n.status==="completed"||n.status==="in_progress"),s=ie(u,{weekStartsOn:1}),r=ce(u,{weekStartsOn:1}),i=U.filter(n=>{var m;const d=(m=n.scheduledDate)!=null&&m.toDate?n.scheduledDate.toDate():new Date(n.scheduledDate);return d>=s&&d<=r&&n.assignedUserId===(o||n.assignedUserId)}).some(n=>n.status==="completed"||n.status==="in_progress");return e.jsxs("div",{className:"flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar",children:[t?e.jsx("div",{className:"text-[10px] font-bold text-slate-400 border border-slate-200 px-2 py-1 rounded flex items-center gap-1 bg-white shadow-sm",children:"🚫 Día bloqueado para traspasos"}):e.jsx("button",{className:"btn btn-ghost btn-xs whitespace-nowrap",onClick:()=>h({open:!0,type:"day",date:u,fromUserId:o}),style:{border:"1px solid var(--color-warning)",color:"var(--color-warning)",fontSize:"10px"},children:"🔄 Traspasar Día"}),i?e.jsx("div",{className:"text-[10px] font-bold text-slate-400 border border-slate-200 px-2 py-1 rounded flex items-center gap-1 bg-white shadow-sm",children:"🚫 Sem bloqueada"}):e.jsx("button",{className:"btn btn-ghost btn-xs whitespace-nowrap",onClick:()=>h({open:!0,type:"week",date:u,fromUserId:o}),style:{border:"1px solid var(--color-warning)",color:"var(--color-warning)",fontSize:"10px"},children:"📅 Traspasar Sem"})]})}return e.jsxs("div",{className:"flex flex-col xl:flex-row gap-6 items-start",children:[e.jsxs("div",{className:"w-full xl:w-2/3 flex-shrink-0",children:[e.jsxs("div",{className:"flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4",children:[e.jsxs("div",{className:"flex items-center gap-2 sm:gap-4",children:[e.jsx("h3",{className:"text-lg sm:text-xl font-black capitalize text-slate-800",children:w(x,"MMMM yyyy",{locale:Y})}),e.jsxs("div",{className:"flex gap-2",children:[e.jsx("button",{className:"btn btn-ghost btn-sm bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 p-0 flex items-center justify-center transition-all",onClick:()=>B(At(x)),children:"◀"}),e.jsx("button",{className:"btn btn-ghost btn-sm bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 p-0 flex items-center justify-center transition-all",onClick:()=>B(Xe(x,1)),children:"▶"})]})]}),p&&e.jsxs("div",{className:"flex flex-wrap gap-2",children:[p&&e.jsxs("div",{className:"flex items-center gap-2 mr-2",children:[e.jsxs("select",{className:"select select-sm border-slate-200 text-xs font-bold",value:L,onChange:t=>de(t.target.value),style:{height:"32px",borderRadius:"8px"},children:[e.jsx("option",{value:"all",children:"Todos los operarios"}),M.map(t=>e.jsx("option",{value:t.uid,children:t.name},t.uid))]}),e.jsx("button",{className:"btn btn-ghost btn-sm bg-white border border-slate-200 hover:bg-slate-50 px-3 flex items-center gap-2 shadow-sm",onClick:st,disabled:C,style:{height:"32px",borderRadius:"8px"},children:C?e.jsx("span",{className:"spinner spinner-primary w-3 h-3"}):e.jsxs(e.Fragment,{children:[e.jsx("span",{children:"🖨️"})," ",e.jsx("span",{className:"hidden sm:inline",children:"Imprimir"})]})}),e.jsx("button",{className:"btn btn-ghost btn-sm bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 px-3 flex items-center gap-2 shadow-sm",onClick:tt,disabled:C,style:{height:"32px",borderRadius:"8px"},children:C?e.jsx("span",{className:"spinner spinner-primary w-3 h-3"}):e.jsxs(e.Fragment,{children:[e.jsx("span",{children:"📄"})," ",e.jsx("span",{className:"hidden sm:inline",children:"Guardar PDF"})]})})]}),e.jsx("button",{className:"btn btn-primary btn-sm flex items-center gap-2 px-4 shadow-md hover:shadow-lg transition-all",onClick:Ke,disabled:$,title:"Genera servicios faltantes sin borrar nada",children:$?e.jsx("span",{className:"spinner spinner-white"}):e.jsxs(e.Fragment,{children:[e.jsx("span",{children:"📅"})," Generar Mes"]})}),e.jsx("button",{className:"btn btn-ghost btn-sm flex items-center gap-2 px-4 border border-blue-600 text-blue-600 hover:bg-blue-50 shadow-sm transition-all",onClick:Qe,disabled:$,title:"Sincroniza: quita servicios obsoletos y añade modificaciones",children:$?e.jsx("span",{className:"spinner spinner-primary"}):e.jsxs(e.Fragment,{children:[e.jsx("span",{children:"🔄"})," Actualizar Mes"]})})]})]}),e.jsx("div",{style:{width:"100%",display:"flex",justifyContent:"flex-end",marginBottom:"8px"},children:Fe()}),e.jsx("div",{className:"planning-grid-container custom-scrollbar",children:e.jsxs("div",{className:"calendar-grid",children:[["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(t=>e.jsx("div",{className:"calendar-header-cell",children:t},t)),at.map((t,s)=>{const r=ze(t),a=ee(t,u),i=De(t,x),n=Yt(t),d=r.some(m=>Ce(m.assignedUserId,t));return e.jsxs("div",{className:`calendar-day-cell ${i?"":"outside"} ${a?"selected":""} ${n?"today":""}`,onClick:()=>b(t),style:{animationDelay:`${s*.01}s`,position:"relative"},children:[e.jsxs("div",{className:"cell-top-bar",children:[d?e.jsx("span",{className:"text-[11px]",style:{color:"#dc2626"},title:"Conflicto de Ausencia/Baja de Operario",children:"⚠️"}):e.jsx("span",{}),e.jsx("span",{className:"day-number",children:w(t,"d")})]}),r.length>0&&e.jsx("div",{className:"cell-content-scroll custom-scrollbar",children:nt(r)}),r.length>0&&e.jsxs("div",{className:"svc-indicators mobile-svc-summary",children:[e.jsx("span",{className:"svc-count",children:r.length}),e.jsx("div",{className:"svc-dots",children:r.slice(0,3).map(m=>e.jsx("div",{className:`svc-dot ${m.status==="completed"?"completed":""}`},m.id))})]})]},t instanceof Date&&!isNaN(t.getTime())?t.toISOString():s)})]})}),e.jsx("div",{style:{width:"100%",display:"flex",justifyContent:"flex-end",marginTop:"8px"},children:Fe()})]}),e.jsx("div",{className:"w-full flex-shrink-0 xl:w-1/3 xl:sticky xl:top-24",children:e.jsxs("div",{className:"card shadow-lg border-0",style:{minHeight:"520px",display:"flex",flexDirection:"column",padding:0,overflow:"hidden",background:"var(--color-bg)"},children:[e.jsxs("div",{className:"px-6 pt-6 pb-2 bg-white border-b border-slate-100",style:{borderTopLeftRadius:"var(--radius-lg)",borderTopRightRadius:"var(--radius-lg)"},children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsxs("div",{children:[e.jsx("div",{className:"text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-1",children:"Detalle del día"}),e.jsx("h4",{className:"text-xl font-black text-slate-800 capitalize",children:w(u,"EEEE, d 'de' MMMM",{locale:Y})})]}),e.jsx("div",{className:"p-2 bg-blue-50 rounded-2xl",children:e.jsx("span",{className:"text-2xl",children:"📅"})})]}),W.length>0&&e.jsxs("div",{className:"flex gap-2 mb-2",children:[e.jsxs("div",{className:"flex-1 bg-slate-50 border border-slate-100 p-2 rounded-xl text-center",children:[e.jsx("div",{className:"text-[10px] font-bold text-slate-400 uppercase tracking-wider",children:"Total"}),e.jsx("div",{className:"text-lg font-black text-slate-700",children:W.length})]}),e.jsxs("div",{className:"flex-1 bg-emerald-50 border border-emerald-100 p-2 rounded-xl text-center",children:[e.jsx("div",{className:"text-[10px] font-bold text-emerald-600 uppercase tracking-wider",children:"Listos"}),e.jsx("div",{className:"text-lg font-black text-emerald-700",children:W.filter(t=>t.status==="completed").length})]}),e.jsxs("div",{className:"flex-1 bg-rose-50 border border-rose-100 p-2 rounded-xl text-center",children:[e.jsx("div",{className:"text-[10px] font-bold text-rose-600 uppercase tracking-wider",children:"Pendientes"}),e.jsx("div",{className:"text-lg font-black text-rose-700",children:W.filter(t=>t.status!=="completed").length})]})]})]}),e.jsxs("div",{className:"flex-1 flex flex-col gap-4 px-6 pt-4",children:[p?Te.map(t=>{var r;const s=((r=Re[t.uid])==null?void 0:r.services)||[];return s.length===0?null:e.jsxs("div",{className:"op-day-group animate-slideIn",children:[e.jsxs("div",{className:"flex items-center gap-3 mb-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm",children:[e.jsx("div",{className:"w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-sm font-black text-white shadow-sm",children:t.name.charAt(0)}),e.jsxs("div",{className:"flex flex-col",style:{flex:1,minWidth:0},children:[e.jsxs("div",{className:"flex items-center gap-1 flex-wrap",children:[e.jsx("span",{className:"font-bold text-slate-800 text-sm leading-tight",children:t.name}),(()=>{const a=Ce(t.uid,u);return a?e.jsxs("span",{className:"badge badge-danger text-[9px] font-bold px-1.5 py-0.5 ml-1 animate-pulse",style:{background:"#fee2e2",color:"#dc2626",border:"1px solid #fca5a5",whiteSpace:"nowrap"},title:"Operario ausente (de baja/vacaciones) este día",children:["⚠️ Ausente (",a.type==="vacation"?"Vacaciones":a.type==="sick_leave"?"Baja":"Asuntos",")"]}):null})()]}),e.jsxs("span",{className:"text-[10px] text-slate-500 font-bold uppercase tracking-wider",children:[s.length," servicios"]})]}),e.jsxs("div",{className:"flex gap-1.5 ml-auto",children:[e.jsxs("button",{className:"btn btn-ghost btn-xs text-amber-700 bg-white hover:bg-amber-50 p-2 h-8 flex items-center gap-1.5 border border-amber-200 shadow-sm",onClick:()=>h({open:!0,type:"day",date:u,fromUserId:t.uid}),title:"Traspasar todo el día",children:[e.jsx("span",{className:"text-sm",children:"🔄"})," ",e.jsx("span",{className:"text-[10px] font-black uppercase",children:"Día"})]}),e.jsxs("button",{className:"btn btn-ghost btn-xs text-blue-700 bg-white hover:bg-blue-50 p-2 h-8 flex items-center gap-1.5 border border-blue-200 shadow-sm",onClick:()=>h({open:!0,type:"week",date:u,fromUserId:t.uid}),title:"Traspasar toda la semana",children:[e.jsx("span",{className:"text-sm",children:"📅"})," ",e.jsx("span",{className:"text-[10px] font-black uppercase",children:"Sem"})]})]})]}),e.jsx("div",{className:"flex flex-col gap-4 px-1 pb-4",children:s.map(a=>e.jsx(Ve,{service:a,community:pe(a.communityId),communityName:se(a.communityId),allTasks:z,onTransfer:()=>h({open:!0,type:"single",serviceId:a.id,date:u,fromUserId:t.uid}),onReschedule:()=>I({open:!0,serviceId:a.id,currentDate:a.scheduledDate}),onReopen:()=>Ie(a),actionLoading:C,isAdmin:p},a.id))})]},t.uid)}):e.jsxs(e.Fragment,{children:[W.length>0&&rt(),e.jsx("div",{className:"flex flex-col gap-4 px-1 pb-4",children:W.map(t=>e.jsx(Ve,{service:t,community:pe(t.communityId),communityName:se(t.communityId),allTasks:z,onTransfer:()=>h({open:!0,type:"single",serviceId:t.id,date:u,fromUserId:o}),onReschedule:()=>I({open:!0,serviceId:t.id,currentDate:t.scheduledDate}),onReopen:()=>Ie(t),actionLoading:C,isOp:!0,isAdmin:p},t.id))})]}),W.length===0&&e.jsxs("div",{className:"text-center py-16 opacity-40",children:[e.jsx("span",{className:"text-5xl mb-4 block",children:"☕"}),e.jsx("p",{className:"font-bold text-sm text-slate-600",children:"Día sin servicios"})]})]}),e.jsx(Ot,{isOpen:l.open,onClose:()=>h({open:!1,type:"",date:null,serviceId:null,fromUserId:null}),onConfirm:Ze,loading:C,excludeUserId:l.fromUserId,isAdmin:p,serviceId:l.type==="single"?l.serviceId:null,date:l.date,title:l.type==="single"?"Traspasar Servicio":l.type==="day"?`Traspasar Día ${w(l.date||new Date,"dd/MM")}`:"Traspasar Semana Completa"}),e.jsx(Lt,{isOpen:O.open,onClose:()=>I({open:!1,serviceId:null,currentDate:null}),onConfirm:et,loading:C,currentDate:O.currentDate,title:"Mover de día"})]})}),e.jsx(_t,{month:x,services:U,selectedOpId:L,operarios:M,communities:E,allTasks:z}),e.jsx("style",{children:`
        .planning-grid-container {
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 12px;
          background: var(--color-bg, #e2ebf5);
          border: 1px solid var(--color-border, #cbd5e1);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
          margin: 10px 0;
          position: relative;
        }

        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
          min-width: var(--calendar-min-width, 300px);
          width: 100%;
          margin: 0 auto;
          padding: 2px;
        }

        .calendar-header-cell {
          text-align: center;
          font-size: 0.6rem;
          font-weight: 900;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 8px 0;
        }

        .calendar-day-cell {
          min-height: 40px;
          aspect-ratio: 1;
          border-radius: 8px;
          padding: 4px;
          cursor: pointer;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          transition: all 0.2s ease;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          overflow: hidden;
        }

        .calendar-day-cell.outside {
          opacity: 0.55;
          background: #f8fafc;
          border-color: #e2e8f0;
        }

        .cell-top-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 1px 2px;
          line-height: 1;
        }

        .day-number {
          font-weight: 800;
          font-size: 0.85rem;
          color: #1e293b;
          margin-left: auto;
        }

        @media (min-width: 640px) {
          .calendar-day-cell {
            padding: 6px;
            border-width: 2px;
          }
          .calendar-header-cell {
            font-size: 0.75rem;
          }
          .day-number {
            font-size: 1.05rem;
            font-weight: 800;
            color: #0f172a;
          }
          .cell-content-scroll {
            display: block;
            height: 72px;
            max-height: 72px;
            overflow-y: hidden;
            margin-top: 2px;
            padding-right: 1px;
          }
          .calendar-day-cell:hover .cell-content-scroll {
            overflow-y: auto;
          }
          .mobile-svc-summary {
            display: none !important;
          }
        }

        @media (max-width: 639px) {
          .cell-content-scroll {
            display: none !important;
          }
          .mobile-svc-summary {
            display: flex;
            margin-top: auto;
          }
        }

        .calendar-day-cell:hover {
          background: #fff;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
          border-color: #64748b;
          z-index: 10;
        }

        .calendar-day-cell.selected {
          background: #fff;
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px #3b82f633;
        }

        .calendar-day-cell.today {
          background: #fffbeb;
          border-color: #f59e0b;
        }

        /* Grouped content inside cells */
        .cell-op-groups {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .cell-op-group {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .cell-op-header {
          font-size: 0.65rem;
          font-weight: 800;
          color: #1e293b;
          margin-top: 2px;
          line-height: 1.2;
          display: flex;
          align-items: center;
          gap: 2px;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 1px;
        }

        .cell-svc-row {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.65rem;
          line-height: 1.3;
          color: #334155;
          padding: 1px 0;
          font-weight: 600;
        }

        .cell-svc-row.completed {
          color: #94a3b8;
          font-weight: 500;
        }

        .cell-svc-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
          display: inline-block;
        }

        .cell-svc-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cell-content-scroll::-webkit-scrollbar {
          width: 3px;
        }
        .cell-content-scroll::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .cell-content-scroll {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }

        .svc-indicators {
          margin-top: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .svc-count {
          font-size: 0.65rem;
          font-weight: 900;
          color: #3b82f6;
          background: #eff6ff;
          padding: 0 4px;
          border-radius: 8px;
        }

        .svc-dots {
          display: flex;
          gap: 2px;
        }

        .svc-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #cbd5e1;
        }

        .svc-dot.completed {
          background: #10b981;
        }

        .custom-scrollbar::-webkit-scrollbar {
          height: 4px;
          width: 4px;
        }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `})]})}export{rs as P,At as s};
