import {trpc} from '@/lib/trpc';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
import {scopedWooAccess} from '@/lib/woocommerce-workspace';
import {wooFresh} from './WooOperationPanel';
import {WooSettingsWorkspace} from './WooSettingsWorkspace';
import {WooProductsWorkspace} from './WooProductsWorkspace';
import {WooAnalyticsWorkspace} from './WooAnalyticsWorkspace';
import {WooOrdersWorkspace} from './WooOrdersWorkspace';
export function WooWorkspacePage({view='settings'}:{view?:'settings'|'products'|'orders'|'analytics'}){
 const user=trpc.auth.me.useQuery(undefined,wooFresh),merchant=trpc.merchants.getCurrent.useQuery(undefined,{...wooFresh,enabled:!!user.data?.id&&!user.error&&!user.isFetching});
 const accessQuery=trpc.woocommerce.getAccess.useQuery(undefined,{...wooFresh,enabled:!!user.data?.id&&!!merchant.data?.id&&!user.error&&!merchant.error});
 const refresh=()=>{void user.refetch();void merchant.refetch();void accessQuery.refetch();},error=user.error||merchant.error||accessQuery.error;
 if(error)return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh}/>;
 if(user.isLoading||!!user.data?.id&&merchant.isLoading||!!user.data?.id&&!!merchant.data?.id&&accessQuery.isLoading)return <WorkspaceState kind="loading"/>;
 if(!user.data?.id||!merchant.data?.id)return <WorkspaceState kind={!user.data?.id?'session':'missing'} onRetry={refresh}/>;
 const access=scopedWooAccess(accessQuery.data,user.data.id,merchant.data.id);if(!access)return <WorkspaceState kind="error" onRetry={refresh}/>;
 if(view==='settings'&&!access.integrationsManage||view==='analytics'&&!access.analyticsRead)return <WorkspaceState kind="forbidden" onRetry={refresh}/>;
 if(view==='products')return <WooProductsWorkspace key={access.actorId+':'+access.merchantId} {...access}/>;
 if(view==='orders')return <WooOrdersWorkspace key={access.actorId+':'+access.merchantId} {...access}/>;
 if(view==='analytics')return <WooAnalyticsWorkspace key={access.actorId+':'+access.merchantId} {...access}/>;
 return <WooSettingsWorkspace key={access.actorId+':'+access.merchantId} actorId={access.actorId} merchantId={access.merchantId} analyticsRead={access.analyticsRead}/>;
}
