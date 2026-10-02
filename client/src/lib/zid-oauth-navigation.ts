export function zidAuthorizationDestination(value:string){
 const url=new URL(value);
 if(url.origin!=='https://oauth.zid.sa'||url.pathname!=='/oauth/authorize'||url.username||url.password)throw Error('Invalid authorization destination');
 return url;
}
export function navigateZidAuthorization(value:string){window.location.assign(zidAuthorizationDestination(value).href);}
export function readZidCallbackParameters(){return new URLSearchParams(window.location.search);}
export function scrubZidCallbackParameters(){window.history.replaceState(window.history.state,document.title,window.location.pathname);}
