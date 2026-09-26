import { z } from 'zod';

export const staffVoiceMime=z.enum(['audio/webm','audio/ogg','audio/mpeg','audio/mp3','audio/mp4','audio/wav']);
export const staffVoiceInput=z.object({
  conversationId:z.number().int().positive().safe(),requestId:z.string().uuid(),
  audioBase64:z.string().min(1).max(24*1024*1024),mimeType:staffVoiceMime,duration:z.number().finite().positive().max(3600),
}).strict();
export type StaffVoiceInput=z.infer<typeof staffVoiceInput>;
export const staffVoiceExtension={ 'audio/webm':'webm','audio/ogg':'ogg','audio/mpeg':'mp3','audio/mp3':'mp3','audio/mp4':'m4a','audio/wav':'wav' } as const;
