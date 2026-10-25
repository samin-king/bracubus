import {useEffect,useState} from 'react';
import {member4Api as api} from '../services/member4Api';
import {Messages,Pagination} from '../components/Member4State';
import {PageHeading,Badge,EmptyState,Loading,formatTime} from '../components/Ui.jsx';
import {complaintOptions,complaintLabel,complaintDescription} from '../services/complaintOptions.js';
const initial={category:'Speeding',description:'',trip_id:'',route_id:''};
export default function Complaints() {
 const [page,setPage]=useState(0),[items,setItems]=useState([]),[detail,setDetail]=useState(null),[form,setForm]=useState(initial);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 async function load(currentPage=page){setLoading(true);try{setItems(await api.complaints(currentPage));setError('');}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{load();},[page]);
 async function submit(e){e.preventDefault();setBusy(true);setError('');setNotice('');try{const option=complaintOptions.find(o=>o.label===form.category);await api.submitComplaint({category:option.member4,description:complaintDescription(option.label,form.description),trip_id:form.trip_id||null,route_id:form.route_id||null});setForm(initial);await load();setNotice('Complaint submitted');}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function open(id){try{setDetail(await api.complaint(id));}catch(e){setError(e.message);}}
 const field=(key,value)=>setForm({...form,[key]:value});
 return <section><PageHeading title="Complaints">Every report helps us make campus transport safer and more reliable.</PageHeading><Messages error={error} notice={notice}/><div className="support-layout"><form onSubmit={submit} className="surface-card"><h2>Submit a complaint</h2><p className="muted">Select the issue. Add details if you would like to tell us more.</p><fieldset disabled={busy}>
 <label>Complaint Category<select value={form.category} onChange={e=>field('category',e.target.value)}>{complaintOptions.map(o=><option key={o.label}>{o.label}</option>)}</select></label>
 <label>Description<textarea placeholder="Additional details (optional)" maxLength={4800} value={form.description} onChange={e=>field('description',e.target.value)}/></label>
 <div className="form-columns"><label>Trip ID (optional)<input type="number" min="1" value={form.trip_id} onChange={e=>field('trip_id',e.target.value)}/></label><label>Route ID (optional)<input type="number" min="1" value={form.route_id} onChange={e=>field('route_id',e.target.value)}/></label></div>
 <button disabled={busy} className="primary-button">{busy?'Submitting...':'Submit complaint'}</button></fieldset></form><aside className="support-note"><h3>We are here to listen.</h3><p>Choose the category that best describes your experience. Your report is linked to your authenticated student account.</p><p>Authority responses and status updates appear in your notifications.</p><div className="info-note">For immediate danger, contact campus security directly.</div></aside></div>
 <div className="section-top"><h2>My complaints</h2><button onClick={()=>load()}>Refresh complaints</button></div>
 {loading?<Loading>Loading complaints...</Loading>:!items.length?<EmptyState icon="message" title="No complaints found.">Your submitted reports and responses will appear here.</EmptyState>:<div className="complaint-list">{items.map(x=><article key={x.id} className="complaint-card"><div className="section-top"><span className="eyebrow">REPORT #{x.id}</span><Badge status={x.status}/></div><h3>{complaintLabel(x)}</h3><p className="m2-description">{x.description}</p><small>{formatTime(x.created_at)}</small><button onClick={()=>open(x.id)}>View complaint #{x.id}</button></article>)}</div>}
 {detail&&<article className="surface-card complaint-detail"><div className="section-top"><h2>Complaint #{detail.id}</h2><Badge status={detail.status}/></div><h3>{complaintLabel(detail)}</h3><p className="m2-description">{detail.description}</p><p>Trip: {detail.trip_id??'None'} · Route: {detail.route_id??'None'}</p><p>Submitted: {formatTime(detail.created_at)}</p><div className="authority-response"><strong>Authority response</strong><p>{detail.response||'Awaiting response'}</p></div><button onClick={()=>setDetail(null)}>Close details</button></article>}
 <Pagination page={page} setPage={setPage} count={items.length} loading={loading}/></section>;
}
