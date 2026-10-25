import {useEffect,useState} from 'react';
export default function ManagementPage({title,api,Card,fields,initial,toForm=x=>x,toBody=x=>x,dependenciesError=''}) {
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false),[editing,setEditing]=useState(null),[form,setForm]=useState(initial);
 async function load(){setLoading(true);setError('');try{setItems(await api.list());}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{load();},[api]);
 async function submit(e){e.preventDefault();setSaving(true);setError('');setNotice('');try{await api.save(toBody(form),editing);setEditing(null);setForm(initial);setNotice(title+' saved');await load();}catch(e){setError(e.message);}finally{setSaving(false);}}
 return <section><h1 className="mb-6 text-3xl font-bold">{title}</h1>
 {(error||dependenciesError)&&<div role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-800">{error||dependenciesError}<button onClick={load}>Retry list</button></div>}
 {notice&&<p role="status" className="mb-4 text-blue-800">{notice}</p>}
 <form onSubmit={submit} className="mb-8 grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
 <h2 className="text-lg font-semibold sm:col-span-2 lg:col-span-3">{editing?'Edit record':'Add record'}</h2>
 {fields.map(f=><label key={f.name} className="text-sm font-medium">{f.label}
 {f.options?<select required value={form[f.name]??''} onChange={e=>setForm({...form,[f.name]:e.target.value})}><option value="">Select...</option>{f.options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}</select>:<input required={!f.optional} type={f.type||'text'} min={f.type==='number'?(f.min??1):undefined} maxLength={f.type==='text'||!f.type?250:undefined} value={form[f.name]??''} onChange={e=>setForm({...form,[f.name]:e.target.value})}/>}</label>)}
 <div className="flex items-end gap-2"><button disabled={saving||!!dependenciesError} className="bg-blue-800 text-white disabled:opacity-50">{saving?'Saving...':'Save'}</button>{editing&&<button type="button" onClick={()=>{setEditing(null);setForm(initial);}}>Cancel</button>}</div></form>
 {loading?<p role="status">Loading...</p>:items.length===0?<p>No {title.toLowerCase()} found.</p>:<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(item=><Card key={item.id} item={item} onEdit={x=>{setEditing(x.id);setForm(toForm(x));setNotice('');}}/>)}</div>}</section>;
}
