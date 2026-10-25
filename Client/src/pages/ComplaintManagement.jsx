import {useEffect,useState} from 'react';
import {member4Api as api} from '../services/member4Api';
import {Messages,Pagination} from '../components/Member4State';
import {PageHeading,Badge,EmptyState,Loading,formatTime} from '../components/Ui.jsx';
import {complaintLabel} from '../services/complaintOptions.js';
const statuses=['pending','in_review','resolved','rejected'];
export default function ComplaintManagement() {
 const [page,setPage]=useState(0),[items,setItems]=useState([]),[filters,setFilters]=useState({status:'',category:'',search:''}),[detail,setDetail]=useState(null),[status,setStatus]=useState('pending'),[response,setResponse]=useState('');
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 async function load(currentPage=page){setLoading(true);try{setItems(await api.manageComplaints({...Object.fromEntries(Object.entries(filters).filter(([,v])=>v)),limit:50,offset:currentPage*50}));setError('');}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{load();},[page]);
 async function open(id){try{const x=await api.manageComplaint(id);setDetail(x);setStatus(x.status);setResponse(x.response||'');setNotice('');}catch(e){setError(e.message);}}
 async function save(e){e.preventDefault();setBusy(true);setError('');try{const x=await api.updateComplaint(detail.id,{status,...(response.trim()?{response}: {})});setDetail(x);await load();setNotice('Complaint updated');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section><PageHeading title="Complaint management" eyebrow="TRANSPORT AUTHORITY">Review student reports, share a response and keep every case moving.</PageHeading><Messages error={error} notice={notice}/>
 <form onSubmit={e=>{e.preventDefault();setPage(0);load(0);}} className="surface-card complaint-filters">
 <label>Status filter<select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">All statuses</option>{statuses.map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label>
 <label>Category filter<select value={filters.category} onChange={e=>setFilters({...filters,category:e.target.value})}><option value="">All categories</option>{['service','driver','safety','schedule','other'].map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Search complaints<input placeholder="Search details or responses" maxLength={250} value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})}/></label><button>Filter complaints</button></form>
 {loading?<Loading>Loading complaints...</Loading>:!items.length?<EmptyState icon="message" title="No complaints found.">Try another filter, or return when new reports arrive.</EmptyState>:<div className="complaint-list management-list">{items.map(x=><article key={x.id} className="complaint-card"><div className="section-top"><span className="eyebrow">CASE #{x.id}</span><Badge status={x.status}/></div><h3>{complaintLabel(x)}</h3><dl className="case-meta"><dt>Student</dt><dd>{x.user_id||x.student_id}</dd><dt>Submitted</dt><dd>{formatTime(x.created_at)}</dd><dt>Trip / Route</dt><dd>{x.trip_id||'Not linked'} / {x.route_id||'Not linked'}</dd></dl><p className="m2-description">{x.description}</p><div className="authority-response"><strong>Authority response</strong><p>{x.response||'Awaiting response'}</p></div><button onClick={()=>open(x.id)}>Manage complaint #{x.id}</button></article>)}</div>}
 {detail&&<form onSubmit={save} className="surface-card complaint-detail"><div className="section-top"><h2>Manage complaint #{detail.id}</h2><Badge status={detail.status}/></div><p>Student: {detail.user_id}</p><h3>{complaintLabel(detail)}</h3><p className="m2-description">{detail.description}</p><p>Trip: {detail.trip_id??'None'} · Route: {detail.route_id??'None'}</p>
 <label>Complaint status<select value={status} onChange={e=>setStatus(e.target.value)}>{statuses.map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label><label>Authority response<textarea maxLength={5000} value={response} onChange={e=>setResponse(e.target.value)}/></label><div className="action-row"><button disabled={busy} className="primary-button">{busy?'Saving...':'Update complaint'}</button><button type="button" onClick={()=>setDetail(null)}>Close details</button></div></form>}
 <Pagination page={page} setPage={setPage} count={items.length} loading={loading}/></section>;
}
