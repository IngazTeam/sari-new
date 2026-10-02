import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Package} from 'lucide-react';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {wooProductsInput,wooStockStates} from '@shared/woocommerce-data-workspace';
import {safePlatformUrl} from '@shared/platform-workspace';
import {scopedWooProducts,wooMoneyLabel} from '@/lib/woocommerce-workspace';
import {wooWorkspaceLabels} from '@/lib/woocommerce-workspace-labels';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
import {WooWorkspaceShell} from './WooWorkspaceShell';
import {wooFresh,useWooOperation,WooOperationPanel} from './WooOperationPanel';
import {WooPagination} from './WooHistoryPanels';
import {WooQuickSync} from './WooQuickSync';
export function WooProductsWorkspace({actorId,merchantId,integrationsManage,analyticsRead}:{actorId:number;merchantId:number;integrationsManage:boolean;analyticsRead:boolean}){
 const {t,i18n}=useTranslation(),c=wooWorkspaceLabels(t),locale=i18n.language.startsWith('ar')?'ar':'en';
 const [selection,setSelection]=useState(()=>wooProductsInput.parse({})),[search,setSearch]=useState('');
 const query=trpc.woocommerce.getProductsWorkspace.useQuery(selection,wooFresh),data=query.error?null:scopedWooProducts(query.data,actorId,merchantId,selection),o=useWooOperation(actorId,merchantId,integrationsManage);
 const date=(value:string|null)=>value?new Date(value).toLocaleString(locale):c.none;
 return <WooWorkspaceShell view="products" copy={c} locale={locale} integrationsManage={integrationsManage} analyticsRead={analyticsRead} busy={query.isFetching||o.busy} refresh={()=>{void query.refetch();if(integrationsManage)void o.recover();}}>{integrationsManage?<><WooOperationPanel operation={o} copy={c} locale={locale}/><WooQuickSync actorId={actorId} merchantId={merchantId} resource="products" copy={c} locale={locale} operation={o}/></>:<p className="wc-notice">{c.readOnly}</p>}
  <section className="wc-panel"><h2>{c.products}</h2><form className="sc-filters" onSubmit={event=>{event.preventDefault();setSelection({...selection,search:search.trim(),page:1});}}><label className="sc-search"><span>{c.searchProducts}</span><input type="search" value={search} maxLength={100} onChange={event=>setSearch(event.target.value)}/></label><label><span>{c.stock}</span><select value={selection.state} onChange={event=>setSelection(wooProductsInput.parse({...selection,state:event.target.value,page:1}))}>{(['all',...wooStockStates] as const).map(value=><option key={value} value={value}>{c[value]}</option>)}</select></label><Button type="submit" disabled={query.isFetching}>{c.apply}</Button><Button type="button" variant="outline" onClick={()=>{setSearch('');setSelection(wooProductsInput.parse({}));}}>{c.reset}</Button></form>
   {query.isLoading||query.isFetching&&!data?<WorkspaceState inline kind="loading"/>:!data?<WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={()=>void query.refetch()}/>:<><p className="sc-muted">{c.stored}: {data.summary.stored.toLocaleString(locale)} · {c.checked}: {date(data.checkedAt)}</p>{!data.currency&&<p className="wc-notice">{c.currencyUnknown}</p>}<div className="wc-groups">{data.summary.groups.map(group=><span key={group.key}>{c[group.key as keyof typeof c]}: {group.count.toLocaleString(locale)}</span>)}</div>{!data.rows.length?<div className="sc-empty"><Package aria-hidden="true"/><h3>{c.empty}</h3><p>{c.emptyHint}</p></div>:<ul className="wc-records">{data.rows.map(row=>{const image=safePlatformUrl(row.imageUrl);return <li key={row.id} data-woo-product={row.id}><header><div className="wc-product-heading">{image&&<img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" width={64} height={64}/>}<h3>{row.name||c.none}</h3></div><span>{c[row.state]}</span></header><dl className="wc-facts"><div><dt>{c.price}</dt><dd><bdi>{wooMoneyLabel(row.price,data.currency,c.none)}</bdi></dd></div><div><dt>{c.quantity}</dt><dd>{row.manageStock===false?c.stockUnmanaged:row.stockQuantity?.toLocaleString(locale)??c.none}</dd></div><div><dt>{c.sku}</dt><dd><bdi>{row.sku||c.none}</bdi></dd></div><div><dt>{c.providerId}</dt><dd><bdi>{row.providerId??c.none}</bdi></dd></div></dl>{row.invalidData&&<p className="wc-notice">{c.invalidData}</p>}<details className="wc-help"><summary>{c.productDetails}</summary><dl className="wc-facts"><div><dt>{c.regularPrice}</dt><dd><bdi>{wooMoneyLabel(row.regularPrice,data.currency,c.none)}</bdi></dd></div><div><dt>{c.salePrice}</dt><dd><bdi>{wooMoneyLabel(row.salePrice,data.currency,c.none)}</bdi></dd></div><div><dt>{c.state}</dt><dd>{c[row.syncState]}</dd></div><div><dt>{c.lastSync}</dt><dd>{date(row.lastSyncAt)}</dd></div><div><dt>{c.providerUpdated}</dt><dd>{date(row.providerUpdatedAt)}</dd></div></dl></details></li>;})}</ul>}<WooPagination {...data.pagination} copy={c} disabled={query.isFetching} change={page=>setSelection({...selection,page})}/></>}
  </section>
 </WooWorkspaceShell>;
}
