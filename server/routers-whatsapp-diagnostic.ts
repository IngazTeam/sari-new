import { TRPCError } from '@trpc/server';
import { permissionProcedure, router } from './_core/trpc';
import { whatsappConnectionTestInput, whatsappImageTestInput, whatsappTextTestInput } from '../shared/whatsapp-test-input';
import { runWhatsAppDiagnostic } from './whatsapp/diagnostic-tests';
const owner = permissionProcedure('whatsapp.manage').use(({ctx,next}) => {
  if (ctx.merchantRole !== 'owner') throw new TRPCError({code:'FORBIDDEN',message:'whatsapp_test:owner_required'});
  return next({ctx});
});
export const whatsappDiagnosticProcedures = {
  testConnection: owner.input(whatsappConnectionTestInput).mutation(({ctx,input}) => runWhatsAppDiagnostic(ctx.user.id,ctx.merchantId,'connection',input)),
  sendTestMessage: owner.input(whatsappTextTestInput).mutation(({ctx,input}) => runWhatsAppDiagnostic(ctx.user.id,ctx.merchantId,'text',input)),
  sendTestImage: owner.input(whatsappImageTestInput).mutation(({ctx,input}) => runWhatsAppDiagnostic(ctx.user.id,ctx.merchantId,'image',input)),
};
export const whatsappDiagnosticRouter = router(whatsappDiagnosticProcedures);
