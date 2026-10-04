import {useLocation,useSearch} from 'wouter';
import {trpc} from '@/lib/trpc';
import {serviceRouteId} from '@/lib/service-editor-form';
import {catalogHref} from '@/lib/service-catalog-navigation';
import type {CollectionEntity} from '@/lib/service-collection-form';
import {ServiceCollectionList} from './ServiceCatalogList';
import {ServiceCollectionEditor} from './ServiceCollectionEditor';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
export function ServiceCollectionPage({entity}:{entity:CollectionEntity}){
 const [path]=useLocation(),search=useSearch(),raw=new URLSearchParams(search).get('edit'),id=raw===null||raw==='new'?undefined:serviceRouteId(raw);
 const user=trpc.auth.me.useQuery(undefined,{retry:false,staleTime:0,refetchOnMount:'always'});
 const merchant=trpc.merchants.workspaceIdentity.useQuery(undefined,{retry:false,staleTime:0,refetchOnMount:'always',enabled:!!user.data?.id&&!user.error&&!user.isFetching});
 const refresh=()=>{void user.refetch();void merchant.refetch();},error=user.error||merchant.error;
 if(id===null)return <WorkspaceState kind="missing"/>;
 if(error)return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh}/>;
 if(user.isLoading||user.isFetching||merchant.isLoading||merchant.isFetching)return <WorkspaceState kind="loading"/>;
 if(!user.data?.id || !merchant.data?.id || merchant.data.actorId !== user.data.id)return <WorkspaceState kind={!user.data?.id?'session':'missing'} onRetry={refresh}/>;
 const scope={actorId:user.data.id,merchantId:merchant.data.id,entity},key=`${scope.actorId}:${scope.merchantId}:${entity}:${raw??'list'}`;
 return raw===null?<ServiceCollectionList key={key} {...scope}/>:<ServiceCollectionEditor key={key} {...scope} id={id} backHref={catalogHref(path,search,{edit:null})}/>;
}
