export function Messages({error,notice}) {
 return <>{error&&<p role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-800">{error}</p>}{notice&&<p role="status" className="mb-4 text-blue-800">{notice}</p>}</>;
}
export function Pagination({page,setPage,count,loading}) {
 return <div className="my-4 flex items-center gap-2"><button disabled={loading||page===0} onClick={()=>setPage(page-1)}>Previous page</button><span>Page {page+1}</span><button disabled={loading||count<50} onClick={()=>setPage(page+1)}>Next page</button></div>;
}
