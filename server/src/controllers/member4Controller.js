import {complaintService} from '../services/complaintService.js';
import {feedbackService} from '../services/feedbackService.js';
import {notificationService} from '../services/notificationService.js';
import {id} from '../utils/validation.js';
import {HttpError} from '../middleware/errors.js';
import {complaint,feedback,paging,object,text,choice,statuses,categories} from '../utils/member4Validation.js';
export function member4Controller(db) {
 const complaints=complaintService(db),ratings=feedbackService(db),notifications=notificationService(db);
 return {
  createComplaint:async(req,res)=>res.status(201).json(await complaints.create(req.userId,complaint(req.body))),
  listComplaints:async(req,res)=>{
   const [limit,offset]=paging(req.query);
   const filters={limit,offset,userId:req.management?null:req.userId};
   if(req.query.status!==undefined)filters.status=choice(req.query.status,statuses,'status');
   if(req.query.category!==undefined)filters.category=choice(req.query.category,categories,'category');
   if(req.query.search!==undefined)filters.search=text(req.query.search,'search',250);
   res.json(await complaints.list(filters));
  },
  getComplaint:async(req,res)=>res.json(await complaints.get(id(req.params.id),req.management?undefined:req.userId)),
  updateComplaint:async(req,res)=>{
   const body=object(req.body);
   const data={};
   if(body.status!==undefined)data.status=choice(body.status,statuses,'status');
   if(body.response!==undefined)data.response=text(body.response,'response');
   if(!Object.keys(data).length)throw new HttpError(400,'status or response is required');
   res.json(await complaints.update(id(req.params.id),req.userId,data));
  },
  createFeedback:async(req,res)=>res.status(201).json(await ratings.create(req.userId,feedback(req.body))),
  listFeedback:async(req,res)=>res.json(await ratings.list(req.userId,...paging(req.query))),
  listNotifications:async(req,res)=>res.json(await notifications.list(req.userId,...paging(req.query))),
  unreadCount:async(req,res)=>res.json({count:await notifications.unreadCount(req.userId)}),
  markRead:async(req,res)=>res.json(await notifications.markRead(req.userId,id(req.params.id))),
  markAllRead:async(req,res)=>res.json(await notifications.markAllRead(req.userId))
 };
}
