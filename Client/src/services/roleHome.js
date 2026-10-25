export function roleHome(user){
 if(user?.role==='driver')return '/driver';
 if(['authority','admin'].includes(user?.role))return '/transport';
 return '/';
}
