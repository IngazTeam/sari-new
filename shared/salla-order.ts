import { z } from 'zod';

// Confirmed national address and Salla directory IDs, never guessed by the LLM.
export const sallaShippingSchema = z.object({
  country: z.number().int().positive().safe(),
  city: z.number().int().positive().safe(),
  address_line: z.string().trim().min(1).max(300),
  street_number: z.string().trim().min(1).max(50),
  block: z.string().trim().min(1).max(100),
  short_address: z.string().trim().regex(/^[A-Z]{4}[0-9]{4}$/),
  building_number: z.string().regex(/^[0-9]{4}$/),
  additional_number: z.string().regex(/^[0-9]{4}$/),
  postal_code: z.string().regex(/^[0-9]{5}$/),
  geo_coordinates: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict(),
}).strict();
export type SallaShipping = z.infer<typeof sallaShippingSchema>;
