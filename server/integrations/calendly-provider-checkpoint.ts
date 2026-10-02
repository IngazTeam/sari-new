import {AsyncLocalStorage} from 'node:async_hooks';
const current=new AsyncLocalStorage<()=>Promise<void>>();
export class CalendlyProviderCheckpointError extends Error{constructor(){super('Calendly provider checkpoint unavailable');}}
export function withCalendlyProviderCheckpoint<T>(check:()=>Promise<void>,work:()=>Promise<T>){return current.run(check,work);}
export async function assertCalendlyProviderCheckpoint(){const check=current.getStore();if(check)try{await check();}catch{throw new CalendlyProviderCheckpointError();}}
