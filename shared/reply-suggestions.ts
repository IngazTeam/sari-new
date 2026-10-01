import {z} from 'zod';
const id=z.number().int().positive().safe();
const legacyMessage=z.object({content:z.string().max(100000),direction:z.enum(['incoming','outgoing']),timestamp:z.string().max(100).optional()}).strict();
export const suggestionHints=z.object({businessType:z.string().max(200).optional(),
  products:z.array(z.object({name:z.string().max(500),price:z.number().finite().nonnegative().optional()}).strict()).max(20).optional(),
  services:z.array(z.object({name:z.string().max(500),price:z.number().finite().nonnegative().optional()}).strict()).max(20).optional(),
}).strict();
// Retained for compatible clients. These messages and names never establish conversation evidence.
export const generateSuggestionsInput=z.object({conversationId:id,lastMessages:z.array(legacyMessage).max(10),customerName:z.string().max(500).optional(),context:suggestionHints.optional()}).strict();
export const customReplyInput=z.object({conversationId:id,instruction:z.string().trim().min(1).max(1000),lastMessages:z.array(legacyMessage.omit({timestamp:true}).strict()).max(5)}).strict();
export const improveReplyInput=z.object({originalReply:z.string().trim().min(1).max(4096),improvement:z.enum(['more_friendly','more_professional','shorter','longer','add_emoji'])}).strict();
export const suggestionStyle=z.enum(['friendly','professional','brief','detailed']);
export const suggestionText=z.string().trim().min(1).max(4096);
export const modelSuggestions=z.object({suggestions:z.array(z.object({text:suggestionText,type:suggestionStyle}).strict()).length(4)}).strict()
  .refine(s=>new Set(s.suggestions.map(i=>i.type)).size===4,'Four distinct suggestion styles are required');
export const replySuggestionContext=z.object({merchantId:id,actorUserId:id,conversationId:id,lastMessageId:z.number().int().nonnegative().safe(),version:z.number().int().nonnegative().safe(),evidenceHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const generatedSuggestions=z.object({context:replySuggestionContext,suggestions:z.array(z.object({id:z.number().int().min(1).max(4),type:suggestionStyle,label:z.string().min(1).max(40),text:suggestionText}).strict()).length(4)}).strict()
  .refine(s=>new Set(s.suggestions.map(i=>i.type)).size===4&&s.suggestions.every((s,i)=>s.id===i+1),'Invalid suggestion identity');
