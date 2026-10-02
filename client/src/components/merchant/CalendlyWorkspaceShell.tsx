import {createContext,type ReactNode,type RefObject} from 'react';
import {Link} from 'wouter';
import {RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {CalendlyCopy} from '@/lib/calendly-workspace-labels';
import '@/styles/service-catalog-workspace.css';
import '@/styles/calendly-workspace.css';
export const CalendlyPageHeading=createContext<RefObject<HTMLHeadingElement|null>|null>(null);
export function CalendlyWorkspaceShell({copy:c,locale,heading,refresh,busy,children}:{copy:CalendlyCopy;locale:'ar'|'en';heading:RefObject<HTMLHeadingElement|null>;refresh:()=>void;busy:boolean;children:ReactNode}){
 return <CalendlyPageHeading.Provider value={heading}><div className="service-catalog calendly-workspace" data-calendly-workspace dir={locale==='ar'?'rtl':'ltr'}><header className="sc-header"><div><p className="sc-eyebrow">{c.eyebrow}</p><h1 ref={heading} tabIndex={-1}>{c.title}</h1><p>{c.description}</p></div><Button variant="outline" disabled={busy} onClick={refresh}><RefreshCw aria-hidden="true"/>{c.refresh}</Button></header><nav className="sc-nav" aria-label={c.back}><Link href="/merchant/platform-integrations">{c.back}</Link></nav>{children}</div></CalendlyPageHeading.Provider>;
}
