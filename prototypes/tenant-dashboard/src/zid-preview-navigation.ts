import {zidAuthorizationDestination} from '../../../client/src/lib/zid-oauth-navigation';
import {navigate} from './service-preview-router';
/** Deliberately local: the prototype never visits Zid or retains password proof. */
export function navigateZidAuthorization(value:string){
 const state=zidAuthorizationDestination(value).searchParams.get('state');
 if(!state||!/^[A-Za-z0-9_-]{43}$/.test(state))throw Error('Invalid local authorization state');
 navigate('/merchant/zid/callback?code=local-zid-code&state='+state);
}
export function readZidCallbackParameters(){return new URLSearchParams(window.location.search);}
export function scrubZidCallbackParameters(){const params=new URLSearchParams(window.location.search);for(const key of ['code','state','error'])params.delete(key);history.replaceState(history.state,document.title,location.pathname+'?'+params.toString());window.dispatchEvent(new PopStateEvent('popstate'));}
