import {z} from 'zod';
export const calendlySettingsCommand=z.object({requestId:z.string().uuid().toLowerCase(),revision:z.string().regex(/^[a-f0-9]{64}$/),syncToWhatsApp:z.boolean()}).strict();
