export const complaintOptions=[
 ['Speeding','Driver behaviour','safety'],['Rash / Reckless Driving','Driver behaviour','safety'],['Bad Behaviour','Driver behaviour','driver'],['Harassment','Driver behaviour','safety'],['Misconduct','Driver behaviour','driver'],['Driver Behaviour','Driver behaviour','driver'],['Bus Cleanliness','Bus condition','service'],['Overcrowding','Overcrowding','safety'],['Seat Issue','Seat/booking issue','service'],['Standing Issue','Seat/booking issue','service'],['Route Issue','Route problem','service'],['Bus Delay','Late bus','schedule'],['Bus Not Available','Other','service'],['Other','Other','other']
].map(([label,member2,member4])=>({label,member2,member4}));
export const legacyCategories=['Driver behaviour','Bus condition','Route problem','Overcrowding','Late bus','Seat/booking issue','Other'];
export function complaintLabel(item){const prefix=item.description?.match(/^\[([^\]]+)\]/)?.[1];return prefix|| (complaintOptions.some(o=>o.label===item.subject)?item.subject:null)||item.category;}
export function complaintDescription(option,details){return `[${option}]`+(details.trim()?'\n\n'+details.trim():'');}
