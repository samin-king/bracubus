import {request} from './api';
const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const member4Api={
 complaints:page=>request('complaints?limit=50&offset='+page*50),
 complaint:id=>request('complaints/'+id),
 submitComplaint:body=>request('complaints',json('POST',body)),
 manageComplaints:filters=>request('authority/complaints?'+new URLSearchParams(filters)),
 manageComplaint:id=>request('authority/complaints/'+id),
 updateComplaint:(id,body)=>request('authority/complaints/'+id,json('PATCH',body)),
 feedback:page=>request('feedback?limit=50&offset='+page*50),
 submitFeedback:body=>request('feedback',json('POST',body)),
 notifications:page=>request('notifications?limit=50&offset='+page*50),
 unread:()=>request('notifications/unread-count'),
 markRead:id=>request('notifications/'+id+'/read',{method:'PATCH'}),
 markAllRead:()=>request('notifications/read-all',{method:'PATCH'})
};
