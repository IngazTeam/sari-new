import type {ReactNode} from 'react';
import {Link} from 'wouter';
import {RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {WooCopy} from '@/lib/woocommerce-workspace-labels';
import '@/styles/service-catalog-workspace.css';
import '@/styles/woocommerce-workspace.css';
export type WooView='settings'|'products'|'orders'|'analytics';
export function WooWorkspaceShell({view,copy:c,locale,integrationsManage,analyticsRead,refresh,busy,children}:{view:WooView;copy:WooCopy;locale:'ar'|'en';integrationsManage:boolean;analyticsRead:boolean;refresh:()=>void;busy:boolean;children:ReactNode}){
 return <div className="service-catalog woo-workspace" data-woo-workspace={view} dir={locale==='ar'?'rtl':'ltr'}><header className="sc-header"><div><p className="sc-eyebrow">{c.eyebrow}</p><h1>{c[view]}</h1><p>{c.description}</p></div><Button variant="outline" disabled={busy} onClick={refresh}><RefreshCw aria-hidden="true"/>{c.refresh}</Button></header><nav className="sc-nav" aria-label={c.settings}><Link href="/merchant/platform-integrations">{c.back}</Link>{(['settings','products','orders','analytics'] as const).filter(v=>v!=='settings'||integrationsManage).filter(v=>v!=='analytics'||analyticsRead).map(v=><Link key={v} href={'/merchant/woocommerce/'+v} aria-current={v===view?'page':undefined}>{c[v]}</Link>)}</nav>{children}</div>;
}
