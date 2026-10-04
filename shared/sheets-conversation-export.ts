import {z} from 'zod';
export const sheetsConversationExportInput=z.object({conversationIds:z.array(z.number().int().positive().max(2147483647)).min(1).max(100).refine(ids=>new Set(ids).size===ids.length,'Duplicate conversations')}).strict();
export const SHEETS_CONVERSATION_MESSAGE_LIMIT=10000;
