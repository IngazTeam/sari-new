import {describe,it,expect} from 'vitest';
import {collectionDraftFromRecord,newCollectionDraft,parseCollectionDraft} from '../client/src/lib/service-collection-form';
const draft={...newCollectionDraft,name:'Ready',serviceIds:[1],originalPrice:'100',packagePrice:'80'};
describe('category and package draft contracts',()=>{
 it('clears optional category fields explicitly and keeps zero order',()=>{expect(parseCollectionDraft('category',draft).result).toEqual({entity:'category',value:{name:'Ready',nameEn:null,description:null,icon:null,color:null,displayOrder:0,isActive:true}});});
 it('preserves complex emoji and all category properties',()=>{expect(parseCollectionDraft('category',{...draft,nameEn:'Name',description:'Text',icon:'🧑‍💻',color:'#aabbccdd',displayOrder:'٠',isActive:false}).result?.value).toMatchObject({nameEn:'Name',description:'Text',icon:'🧑‍💻',color:'#aabbccdd',displayOrder:0,isActive:false});});
 it.each(['1e2','1.5','-1','','2147483648'])('rejects invalid category order %s',value=>{expect(parseCollectionDraft('category',{...draft,displayOrder:value}).errors.displayOrder).toBeTruthy();});
 it.each(['red','url(x)','#abcd','#12345'])('rejects invalid category color %s',color=>{expect(parseCollectionDraft('category',{...draft,color}).errors.color).toBeTruthy();});
 it('preserves free packages without dividing by zero',()=>{expect(parseCollectionDraft('package',{...draft,originalPrice:'0',packagePrice:'0'}).result?.value).toMatchObject({originalPrice:0,packagePrice:0,discountPercentage:0});});
 it('converts exact Arabic decimal prices and computes discount',()=>{expect(parseCollectionDraft('package',{...draft,originalPrice:'١٠٠٫٥٠',packagePrice:'۸۰٫۴۰'}).result?.value).toMatchObject({originalPrice:10050,packagePrice:8040,discountPercentage:20});});
 it.each(['1.001','1e2','-1','','21474836.48'])('does not round or coerce invalid price %s',packagePrice=>{expect(parseCollectionDraft('package',{...draft,packagePrice}).result).toBeNull();});
 it('rejects a package more expensive than its original price',()=>{expect(parseCollectionDraft('package',{...draft,packagePrice:'100.01'}).errors.packagePrice).toBe('range');});
 it.each([[],null,[1,1],Array.from({length:201},(_,i)=>i+1)])('rejects missing, malformed, duplicate and excessive references',serviceIds=>{expect(parseCollectionDraft('package',{...draft,serviceIds}).errors.serviceIds).toBeTruthy();});
 it('does not convert a malformed stored selection into an empty draft',()=>{expect(collectionDraftFromRecord({entity:'package',id:1,definition:'a'.repeat(64),issues:['serviceIds'],unavailableReferences:0,categoryName:null,references:[],fields:{name:'Stored',description:null,isActive:null,serviceIds:null,originalPrice:0,packagePrice:0,discountPercentage:0}})).toMatchObject({serviceIds:null,isActive:null,originalPrice:'0.00',packagePrice:'0.00'});});
});
