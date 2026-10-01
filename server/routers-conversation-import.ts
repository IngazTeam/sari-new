import { z } from 'zod';
import { permissionProcedure } from './_core/trpc';
import { importConversationHistory } from './conversation-import';
export const conversationImportProcedures = {
  syncFromWhatsApp: permissionProcedure('whatsapp.manage').input(z.void()).mutation(({ ctx }) => importConversationHistory(ctx.merchantId)),
};
