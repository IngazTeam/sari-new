import {referralInvitationInput} from '@shared/referral-program';
// Carry only a validated code in the URL. No cross-account local storage or implicit application.
export function invitationCode(search:string){const raw=new URLSearchParams(search).get('ref');const p=referralInvitationInput.safeParse({code:raw});return p.success?p.data.code:null;}
export function invitationSetupHref(search:string){const code=invitationCode(search);return '/merchant/setup-wizard'+(code?'?ref='+encodeURIComponent(code):'');}
export function invitationReviewHref(search:string){const code=invitationCode(search);return code?'/merchant/referrals?ref='+encodeURIComponent(code):'/merchant/dashboard';}
