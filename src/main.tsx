import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LogIn,LogOut,PackagePlus,Clock3,CheckCircle2,AlertTriangle,CalendarDays,Building2,Boxes} from 'lucide-react';
import {createClient} from '@supabase/supabase-js';
import './style.css';

const SUPABASE_URL=import.meta.env.VITE_SUPABASE_URL||'https://ptmbtveernkglmubrtdw.supabase.co';
const SUPABASE_KEY=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_dX0pnn8--xI_WJtqweaWGA_8yh8ec5U';
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);
const dubaiNow=()=>new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Dubai'}));
const tomorrow=()=>{const d=dubaiNow();d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)};
const dayLabel=(d:string)=>new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'2-digit',month:'short',year:'numeric'}).format(new Date(d+'T12:00:00'));

type Session={token:string;username:string;division:'Pharma'|'Consumer'};
type Store={id:string;name:string;area?:string;division?:string;enabled?:boolean;schedule_days?:number[];schedule_dates?:string[]};

function App(){
 const [session,setSession]=useState<Session|null>(()=>{try{return JSON.parse(localStorage.getItem('dispatchops.department.session')||'null')}catch{return null}});
 const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); const [loginError,setLoginError]=useState(''); const [loading,setLoading]=useState(false);
 const [stores,setStores]=useState<Store[]>([]); const [form,setForm]=useState({invoice_no:'',customer_name:'',building_id:'',area:'',pallet_count:1,pallet_size:'big',invoice_date:tomorrow(),dispatch_date:tomorrow(),status:'Ready'});
 const [message,setMessage]=useState(''); const [error,setError]=useState('');
 const [clock,setClock]=useState(dubaiNow());
 useEffect(()=>{const t=window.setInterval(()=>setClock(dubaiNow()),1000);return()=>clearInterval(t)},[]);
 useEffect(()=>{if(session)loadStores(session.division)},[session]);
 const closed=clock.getHours()>16 || (clock.getHours()===16&&clock.getMinutes()>=30);
 const minDate=tomorrow();
 const availableStores=useMemo(()=>stores.filter(s=>s.enabled!==false && (!s.division||s.division===session?.division||s.division==='')), [stores,session]);
 async function loadStores(div:string){
   const {data,error}=await supabase.from('bulk_organizer_month_defaults').select('buildings').order('month_key',{ascending:false}).limit(1).maybeSingle();
   if(error){setError(error.message);return}
   const list=((data?.buildings||[]) as Store[]).filter(b=>!b.division||b.division===div||b.division===''); setStores(list);
 }
 async function login(e:React.FormEvent){e.preventDefault();setLoading(true);setLoginError('');const {data,error}=await supabase.rpc('department_portal_login',{p_username:username,p_password:password});setLoading(false);if(error){setLoginError(error.message);return}const s=data as Session;setSession(s);localStorage.setItem('dispatchops.department.session',JSON.stringify(s));}
 function logout(){setSession(null);localStorage.removeItem('dispatchops.department.session');}
 async function submit(e:React.FormEvent){e.preventDefault();setMessage('');setError('');if(!session)return;if(closed){setError('Entry is closed after 4:30 PM Dubai time.');return}if(form.dispatch_date<minDate){setError('Dispatch date must be tomorrow or a later date.');return}setLoading(true);const {error}=await supabase.rpc('department_portal_submit',{p_token:session.token,p_invoice_no:form.invoice_no,p_customer_name:form.customer_name,p_building_id:form.building_id||null,p_area:form.area||null,p_pallet_count:form.pallet_count,p_pallet_size:form.pallet_size,p_invoice_date:form.invoice_date||null,p_dispatch_date:form.dispatch_date,p_status:form.status});setLoading(false);if(error){setError(error.message);return}setMessage(`Invoice ${form.invoice_no} was submitted for ${dayLabel(form.dispatch_date)}.`);setForm(x=>({...x,invoice_no:'',customer_name:'',building_id:'',area:'',pallet_count:1,pallet_size:'big',invoice_date:tomorrow(),dispatch_date:tomorrow(),status:'Ready'}));}
 function chooseStore(id:string){const s=stores.find(x=>x.id===id);setForm(x=>({...x,building_id:id,customer_name:s?.name||x.customer_name,area:s?.area||x.area}));}
 if(!session)return <main className="shell"><section className="login-card"><div className="brand">DISPATCH<span>OPS</span></div><div className="eyebrow">DEPARTMENT ENTRY PORTAL</div><h1>Production handover</h1><p>Pharma / Medical use the Pharma workspace. Consumer uses the Consumer workspace.</p><form onSubmit={login}><label>Username<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Pharma or Consumer" autoComplete="username"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" autoComplete="current-password"/></label>{loginError&&<div className="alert error"><AlertTriangle size={15}/>{loginError}</div>}<button className="primary" disabled={loading}><LogIn size={16}/>{loading?'Signing in…':'Sign in'}</button></form></section></main>;
 return <main className="shell"><header className="topbar"><div><div className="brand">DISPATCH<span>OPS</span></div><div className="eyebrow">DEPARTMENT ENTRY · {session.division.toUpperCase()}</div></div><div className="top-actions"><span className="clock"><Clock3 size={15}/>{clock.toLocaleTimeString('en-GB')}</span><button className="ghost" onClick={logout}><LogOut size={15}/> Sign out</button></div></header>
 <section className="hero"><div><div className="eyebrow">NEXT-DAY DISPATCH</div><h1>Send tomorrow&apos;s invoices to Dispatch</h1><p>Enter production handover details before 4:30 PM. Entries are linked to the existing DispatchOPS planning data.</p></div><div className="tomorrow"><CalendarDays size={20}/><small>DISPATCH DATE</small><b>{dayLabel(minDate)}</b></div></section>
 {closed&&<div className="alert warning"><Clock3 size={17}/><div><b>Entry window closed</b><span>New entries are blocked after 4:30 PM Dubai time. The next entry date is tomorrow.</span></div></div>}
 <section className="form-card"><div className="section-head"><div><div className="eyebrow">INVOICE ENTRY</div><h2>{session.division} production</h2></div><div className="status-chip"><CheckCircle2 size={14}/> {form.status}</div></div>
 <form className="entry-grid" onSubmit={submit}>
 <label>Invoice number<input value={form.invoice_no} onChange={e=>setForm({...form,invoice_no:e.target.value})} placeholder="Invoice no." required/></label>
 <label>Customer / account<input value={form.customer_name} onChange={e=>setForm({...form,customer_name:e.target.value})} placeholder="Customer name" required/></label>
 <label>Store / location<select value={form.building_id} onChange={e=>chooseStore(e.target.value)}><option value="">Select available store</option>{availableStores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <label>Area<input value={form.area} onChange={e=>setForm({...form,area:e.target.value})} placeholder="Area"/></label>
 <label>Pallet quantity<input type="number" min={1} value={form.pallet_count} onChange={e=>setForm({...form,pallet_count:Math.max(1,Number(e.target.value))})}/></label>
 <label>Pallet size<select value={form.pallet_size} onChange={e=>setForm({...form,pallet_size:e.target.value})}><option value="big">Big pallet</option><option value="small">Small pallet</option></select></label>
 <label>Invoice date<input type="date" value={form.invoice_date} onChange={e=>setForm({...form,invoice_date:e.target.value})}/></label>
 <label>Dispatch date<input type="date" min={minDate} value={form.dispatch_date} onChange={e=>setForm({...form,dispatch_date:e.target.value})}/></label>
 <label className="wide">Handover status<div className="status-options"><button type="button" className={form.status==='Ready'?'selected':''} onClick={()=>setForm({...form,status:'Ready'})}>Ready</button><button type="button" className={form.status==='Handed over to Dispatch'?'selected':''} onClick={()=>setForm({...form,status:'Handed over to Dispatch'})}>Handed over to Dispatch</button></div></label>
 {error&&<div className="alert error wide"><AlertTriangle size={15}/>{error}</div>}{message&&<div className="alert success wide"><CheckCircle2 size={15}/>{message}</div>}
 <button className="primary wide" disabled={loading||closed}><PackagePlus size={17}/>{loading?'Sending…':'Send to Dispatch'}</button>
 </form></section>
 <footer><Boxes size={15}/> Shared with the existing DispatchOPS Bulk Organizer · Department: {session.division}</footer>
 </main>
}
createRoot(document.getElementById('root')!).render(<App/>);
