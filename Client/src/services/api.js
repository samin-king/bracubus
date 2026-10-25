export async function request(resource,options) {
 const res=await fetch('/api/'+resource,options);
 const data=await res.json().catch(()=>({error:'Unexpected API response'}));
 if(!res.ok) throw new Error(data.error||'Request failed');
 return data;
}
export const apiFor=resource=>({
 list:()=>request(resource),
 save:(body,id)=>request(resource+(id?'/'+id:''),{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
});
