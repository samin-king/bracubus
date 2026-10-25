export default function DriverCard({item,onEdit}) {
 return <article className="rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">{item.name}</h2><p>{item.license_number} / {item.status}</p><button className="mt-3 text-blue-800" onClick={()=>onEdit(item)}>Edit driver</button></article>;
}
