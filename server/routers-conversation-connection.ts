import {z} from 'zod';
import {permissionProcedure} from './_core/trpc';
import {hasPermission} from './_core/permissions';
import {readConversationConnection,diagnoseConversationConnection} from './conversation-connection';
export const conversationConnectionProcedures={
  connectionStatus:permissionProcedure('conversations.read').input(z.void()).query(({ctx})=>readConversationConnection(ctx.merchantId,ctx.user.id,hasPermission(ctx.merchantRole,'whatsapp.manage'))),
  diagnoseWebhook:permissionProcedure('whatsapp.manage').input(z.void()).mutation(({ctx})=>diagnoseConversationConnection(ctx.merchantId,ctx.user.id)),
};
