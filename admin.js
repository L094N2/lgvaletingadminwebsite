const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const cfg={url:window.LGV_SUPABASE_URL,key:window.LGV_SUPABASE_ANON_KEY};
const sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let session=null, me=null, bookings=[], profiles=[], reviews=[];
const MASTER_EMAIL = 'logancrodden2912@icloud.com';
const MASTER_PERMS = ['manageBookings','addManualBookings','manageReviews','viewCustomers','manageAdmins','viewAnalytics'];
const ADMIN_PERMS=MASTER_PERMS;
function esc(v){return String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2500)}
function isMaster(){return !!(me && !me.disabled && ((me.email||'').toLowerCase()===MASTER_EMAIL || me.role==='master'))}
function isAdmin(){return !!(me && !me.disabled && (isMaster() || ['master','admin'].includes(me.role)))}
function can(p){return isMaster() || (isAdmin() && Array.isArray(me.permissions) && me.permissions.includes(p))}
async function init(){bind(); const {data}=await sb.auth.getSession(); session=data.session; await loadAll(); sb.auth.onAuthStateChange(async(_e,s)=>{session=s; await loadAll()});}
async function loadProfile(){
  me=null; if(!session?.user) return;
  const u=session.user; const email=(u.email||'').toLowerCase(); const name=u.user_metadata?.full_name || email.split('@')[0];
  let data=null;
  const res=await sb.from('profiles').select('*').eq('id',u.id).maybeSingle();
  if(res.error) console.warn('profile read failed',res.error.message); else data=res.data;
  if(!data){
    const payload={id:u.id,email,full_name:name,role:email===MASTER_EMAIL?'master':'customer',permissions:email===MASTER_EMAIL?MASTER_PERMS:[],disabled:false};
    const ins=await sb.from('profiles').upsert(payload,{onConflict:'id'}).select('*').maybeSingle();
    if(ins.error) console.warn('profile create failed',ins.error.message); else data=ins.data;
  }
  me=data||{id:u.id,email,full_name:name,role:email===MASTER_EMAIL?'master':'customer',permissions:email===MASTER_EMAIL?MASTER_PERMS:[],disabled:false};
  if(email===MASTER_EMAIL && (me.role!=='master' || me.disabled)){
    me={...me,role:'master',permissions:MASTER_PERMS,disabled:false};
    sb.from('profiles').update({role:'master',permissions:MASTER_PERMS,disabled:false}).eq('id',u.id).then(()=>{});
  }
}
async function loadAll(){await loadProfile(); if(!session){show('login');return} if(!isAdmin()){show('not-admin');return} show('dashboard'); await Promise.all([loadBookings(),loadProfiles(),loadReviews()]); render();}
async function loadBookings(){const {data,error}=await sb.from('bookings').select('*').order('date',{ascending:true}).order('time',{ascending:true}); if(error){toast(error.message); bookings=[]} else bookings=data||[]}
async function loadProfiles(){const {data,error}=await sb.from('profiles').select('*').order('created_at',{ascending:false}); if(error){profiles=[];console.warn(error)} else profiles=data||[]}
async function loadReviews(){const {data,error}=await sb.from('reviews').select('*').order('created_at',{ascending:false}); if(error){reviews=[];console.warn(error)} else reviews=data||[]}
function show(mode){$('#loginScreen').hidden=mode!=='login';$('#notAdmin').hidden=mode!=='not-admin';$('#dashboard').hidden=mode!=='dashboard';$('#profileChip').textContent=session?(me?.full_name||me?.email||'Profile').split(' ')[0]:'Login';}
function bind(){
 $('#loginForm').onsubmit=async e=>{e.preventDefault();$('#loginMsg').textContent='Logging in...'; const email=$('#loginEmail').value.trim().toLowerCase(), password=$('#loginPassword').value; const {data,error}=await sb.auth.signInWithPassword({email,password}); if(error){$('#loginMsg').textContent=error.message;return} session=data.session; $('#loginMsg').textContent=''; await loadAll();};
 $('#logoutBtn')?.addEventListener('click',logout); $('#logoutFromNotice')?.addEventListener('click',logout); $('#profileChip').onclick=()=> session?setTab('settings'):show('login'); $('#refreshBtn').onclick=loadAll;
 $$('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
 $('#bookingFilter').onchange=renderBookings;
 $('#manualBookingForm').onsubmit=manualBooking;
 $('#promoteForm').onsubmit=promoteAdmin;
}
async function logout(){await sb.auth.signOut();session=null;me=null;show('login');toast('Signed out')}
function setTab(name){$$('.tabs [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$$('.panel').forEach(p=>p.classList.remove('active'));$('#panel-'+name)?.classList.add('active');}
function render(){ $('#adminName').textContent=me.full_name||me.email; $('#settingsEmail').textContent=me.email; $('#settingsRole').textContent=`${me.role} account`; renderStats(); renderBookings(); renderCustomers(); renderReviews(); renderAdmins(); }
function renderStats(){const pending=bookings.filter(b=>b.status==='Pending').length, confirmed=bookings.filter(b=>b.status==='Confirmed').length, completed=bookings.filter(b=>b.status==='Completed').length, revenue=bookings.filter(b=>['Confirmed','Completed'].includes(b.status)).reduce((a,b)=>a+Number(b.total||0),0); $('#statPending').textContent=pending;$('#statConfirmed').textContent=confirmed;$('#statCompleted').textContent=completed;$('#statRevenue').textContent='£'+revenue.toFixed(0)}
function renderBookings(){const f=$('#bookingFilter').value; const rows=bookings.filter(b=>f==='all'||b.status===f); $('#bookingsList').innerHTML=rows.length?rows.map(b=>`<div class="item"><div><strong>${esc(b.date)} ${esc(b.time)} · ${esc(b.name)}</strong><span>${esc(b.service)} · £${esc(b.total)} · ${esc(b.vehicle)} · ${esc(b.phone)}</span><small>${esc(b.location)} · ${esc(b.source||'Website')} · ${esc(b.status)}${b.notes?' · '+esc(b.notes):''}</small></div><div class="actions">${['Pending','Confirmed','Completed','Declined','Cancelled'].map(s=>`<button class="mini ${s==='Confirmed'||s==='Completed'?'ok':s==='Declined'||s==='Cancelled'?'danger':'warn'}" data-status="${s}" data-id="${b.id}">${s}</button>`).join('')}<button class="mini danger" data-delete-booking="${b.id}">Delete</button></div></div>`).join(''):'<p class="muted">No bookings yet.</p>'; $$('[data-status]').forEach(btn=>btn.onclick=()=>updateBooking(btn.dataset.id,{status:btn.dataset.status})); $$('[data-delete-booking]').forEach(btn=>btn.onclick=()=>deleteBooking(btn.dataset.deleteBooking));}
async function updateBooking(id,patch){if(!can('manageBookings')) return toast('No booking permission'); const {error}=await sb.from('bookings').update(patch).eq('id',id); if(error) return toast(error.message); toast('Booking updated'); await loadAll();}
async function deleteBooking(id){if(!can('manageBookings')) return toast('No booking permission'); if(!confirm('Delete this booking?')) return; const {error}=await sb.from('bookings').delete().eq('id',id); if(error) return toast(error.message); toast('Booking deleted'); await loadAll();}
async function manualBooking(e){e.preventDefault(); if(!can('addManualBookings')) return toast('No manual booking permission'); const service=$('#mService'), price=Number(service.selectedOptions[0].dataset.price||0), wax=$('#mWax').checked; const payload={name:$('#mName').value,email:$('#mEmail').value||null,phone:$('#mPhone').value,vehicle:$('#mVehicle').value,service:service.value,date:$('#mDate').value,time:$('#mTime').value,location:$('#mLocation').value,wax,total:price+(wax?5:0),status:'Confirmed',source:'Admin',notes:$('#mNotes').value||null}; const {error}=await sb.from('bookings').insert(payload); if(error) return toast(error.message); e.target.reset(); toast('Manual booking added'); setTab('bookings'); await loadAll();}
function renderCustomers(){const customers=profiles.filter(p=>(p.role||'customer')==='customer'); $('#customersList').innerHTML=can('viewCustomers')?(customers.length?customers.map(p=>`<div class="item"><div><strong>${esc(p.full_name||p.email)}</strong><span>${esc(p.email)}</span><small>${p.disabled?'Disabled':'Active'} · ${bookings.filter(b=>b.user_id===p.id||b.email===p.email).length} bookings</small></div><div class="actions"><button class="mini ok" data-promote="${p.id}">Promote</button><button class="mini danger" data-disable="${p.id}">${p.disabled?'Enable':'Disable'}</button></div></div>`).join(''):'<p class="muted">No customers yet.</p>'):'<p class="muted">No permission to view customers.</p>'; $$('[data-promote]').forEach(b=>b.onclick=()=>setAdmin(b.dataset.promote)); $$('[data-disable]').forEach(b=>b.onclick=()=>toggleDisabled(b.dataset.disable));}
async function toggleDisabled(id){if(!can('manageAdmins')) return toast('Only master/admin manager can disable accounts'); const p=profiles.find(x=>x.id===id); const {error}=await sb.from('profiles').update({disabled:!p.disabled}).eq('id',id); if(error) return toast(error.message); toast('Customer updated'); await loadAll();}
function renderReviews(){ $('#reviewsList').innerHTML=can('manageReviews')?(reviews.length?reviews.map(r=>`<div class="item"><div><strong>${'★'.repeat(Number(r.rating))}${'☆'.repeat(5-Number(r.rating))} · ${esc(r.name)}</strong><span>${esc(r.service||'LG Valeting')} · ${r.approved?'Visible':'Hidden/Pending'}</span><small>${esc(r.text)}</small></div><div class="actions"><button class="mini ok" data-review-toggle="${r.id}">${r.approved?'Hide':'Approve'}</button><button class="mini danger" data-review-delete="${r.id}">Delete</button></div></div>`).join(''):'<p class="muted">No reviews yet.</p>'):'<p class="muted">No permission to manage reviews.</p>'; $$('[data-review-toggle]').forEach(b=>b.onclick=()=>toggleReview(b.dataset.reviewToggle)); $$('[data-review-delete]').forEach(b=>b.onclick=()=>deleteReview(b.dataset.reviewDelete));}
async function toggleReview(id){const r=reviews.find(x=>x.id===id); const {error}=await sb.from('reviews').update({approved:!r.approved}).eq('id',id); if(error)return toast(error.message); toast('Review updated'); await loadAll();}
async function deleteReview(id){if(!confirm('Delete review?'))return; const {error}=await sb.from('reviews').delete().eq('id',id); if(error)return toast(error.message); toast('Review deleted'); await loadAll();}
function renderAdmins(){const admins=profiles.filter(p=>['admin','master'].includes(p.role)); $('#adminsList').innerHTML=admins.length?admins.map(p=>`<div class="item"><div><strong>${esc(p.full_name||p.email)} · ${esc(p.role)}</strong><span>${esc(p.email)}${p.disabled?' · disabled':''}</span><small>${esc(Array.isArray(p.permissions)?p.permissions.join(', '):'all permissions')}</small></div><div class="actions">${p.role!=='master'?`<button class="mini danger" data-demote="${p.id}">Demote</button>`:''}</div></div>`).join(''):'<p class="muted">No admin accounts yet.</p>'; $$('[data-demote]').forEach(b=>b.onclick=()=>demoteAdmin(b.dataset.demote));}
async function setAdmin(id){if(!can('manageAdmins'))return toast('No admin permission'); const {error}=await sb.from('profiles').update({role:'admin',permissions:ADMIN_PERMS.filter(x=>x!=='manageAdmins'),disabled:false}).eq('id',id); if(error)return toast(error.message); toast('Promoted to admin'); await loadAll();}
async function promoteAdmin(e){e.preventDefault(); const email=$('#promoteEmail').value.trim().toLowerCase(); const p=profiles.find(x=>(x.email||'').toLowerCase()===email); if(!p)return toast('They must register first.'); await setAdmin(p.id); e.target.reset();}
async function demoteAdmin(id){if(!can('manageAdmins'))return toast('No admin permission'); const {error}=await sb.from('profiles').update({role:'customer',permissions:[]}).eq('id',id); if(error)return toast(error.message); toast('Admin demoted'); await loadAll();}
init().catch(e=>{console.error(e);toast(e.message||'Admin failed to load')});
