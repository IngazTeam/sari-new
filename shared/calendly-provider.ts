const resourcePaths={user:'users',organization:'organizations',eventType:'event_types',subscription:'webhook_subscriptions',event:'scheduled_events'} as const;
export function calendlyResourceUri(value:unknown,kind:keyof typeof resourcePaths|'invitee'):string|null{
 if(typeof value!=='string'||value.length>500||/[\s\\%\u0000-\u001f\u007f]/.test(value))return null;
 try{const url=new URL(value),id='[A-Za-z0-9_-]{8,128}',pattern=kind==='invitee'?new RegExp('^/scheduled_events/'+id+'/invitees/'+id+'$'):new RegExp('^/'+resourcePaths[kind]+'/'+id+'$');
  return url.href===value&&url.origin==='https://api.calendly.com'&&!url.username&&!url.password&&!url.search&&!url.hash&&pattern.test(url.pathname)?url.href:null;
 }catch{return null;}
}
/** Only the provider's public booking destination is a navigable link. */
export function calendlyBookingUrl(value:unknown):string|null{
 if(typeof value!=='string'||value.length>2048||/[\s\\\u0000-\u001f\u007f]/.test(value))return null;
 try{const url=new URL(value);return url.protocol==='https:'&&['calendly.com','www.calendly.com'].includes(url.hostname)&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.length>1?url.href:null;}catch{return null;}
}
