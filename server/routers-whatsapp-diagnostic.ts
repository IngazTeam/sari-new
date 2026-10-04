import { TRPCError } from '@trpc/server';
import { permissionProcedure, router } from './_core/trpc';
import { whatsappConnectionTestInput, whatsappImageTestInput, whatsappTextTestInput } from '../shared/whatsapp-test-input';
import { runWhatsAppDiagnostic } from './whatsapp/diagnostic-tests';
import { readWhatsAppDiagnosticWorkspace } from './whatsapp/diagnostic-workspace';
import { whatsappDiagnosticWorkspaceInput, whatsappRemovalInput, whatsappSaveReviewedInput } from '../shared/whatsapp-diagnostic-workspace';
import { saveReviewedWhatsAppInstance } from './whatsapp/reviewed-save';
import { removeReviewedWhatsAppInstance } from './whatsapp/reviewed-removal';
import { MerchantSettingsAuthorityError } from './accounts/merchant-settings-authority';
const owner = permissionProcedure('whatsapp.manage').use(({ctx,next}) => {
  if (ctx.merchantRole !== 'owner') throw new TRPCError({code:'FORBIDDEN',message:'whatsapp_test:owner_required'});
  return next({ctx});
});
export const whatsappDiagnosticProcedures = {
  saveReviewedInstance: owner.input(whatsappSaveReviewedInput).mutation(({ctx,input})=>saveReviewedWhatsAppInstance(ctx.user.id,ctx.merchantId,input)),
  deleteReviewedInstance: owner.input(whatsappRemovalInput).mutation(({ctx,input})=>removeReviewedWhatsAppInstance(ctx.user.id,ctx.merchantId,input)),
  diagnosticWorkspace: owner.input(whatsappDiagnosticWorkspaceInput).query(async({ctx,input})=>{
    if(input.merchantId!==ctx.merchantId)throw new TRPCError({code:'FORBIDDEN',message:'whatsapp_test:access_required'});
    try{return await readWhatsAppDiagnosticWorkspace(ctx.user.id,ctx.merchantId);}
    catch(error){throw new TRPCError({code:error instanceof MerchantSettingsAuthorityError&&error.reason==='forbidden'?'FORBIDDEN':'INTERNAL_SERVER_ERROR',message:'whatsapp_test:unavailable'});}
  }),
  testConnection: owner.input(whatsappConnectionTestInput).mutation(({ctx,input}) => runWhatsAppDiagnostic(ctx.user.id,ctx.merchantId,'connection',input)),
  sendTestMessage: owner.input(whatsappTextTestInput).mutation(({ctx,input}) => runWhatsAppDiagnostic(ctx.user.id,ctx.merchantId,'text',input)),
  sendTestImage: owner.input(whatsappImageTestInput).mutation(({ctx,input}) => runWhatsAppDiagnostic(ctx.user.id,ctx.merchantId,'image',input)),
};
export const whatsappDiagnosticRouter = router(whatsappDiagnosticProcedures);
