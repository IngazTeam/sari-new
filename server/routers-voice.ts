/**
 * Voice Router Module
 * Handles voice message upload and transcription
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from 'node:crypto';
import { protectedProcedure, router } from "./_core/trpc";

export const voiceRouter = router({
    // Upload audio file to S3
    uploadAudio: protectedProcedure
        .input(z.object({
            audioBase64: z.string(),
            mimeType: z.string(),
            duration: z.number(),
            conversationId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            try {
                const audioBuffer = Buffer.from(input.audioBase64, 'base64');

                const sizeMB = audioBuffer.length / (1024 * 1024);
                if (sizeMB > 16) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `حجم الملف كبير جداً (${sizeMB.toFixed(2)}MB). الحد الأقصى 16MB`
                    });
                }

                const extension = input.mimeType.includes('webm') ? 'webm' : 'mp3';
                const timestamp = Date.now();
                const randomStr = crypto.randomBytes(4).toString('hex');
                const fileName = `voice-${ctx.user.id}-${timestamp}-${randomStr}.${extension}`;

                const { storagePut } = await import('./storage');
                const { url } = await storagePut(
                    `audio/${fileName}`,
                    audioBuffer,
                    input.mimeType
                );

                return {
                    success: true,
                    audioUrl: url,
                    duration: input.duration,
                    size: sizeMB,
                };
            } catch (error) {
                console.error('[Voice] Upload failed:', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'فشل رفع الملف الصوتي'
                });
            }
        }),

    // Transcribe audio to text
    transcribe: protectedProcedure
        .input(z.object({
            audioUrl: z.string().url(),
            language: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            try {
                const { transcribeAudio } = await import('./_core/voiceTranscription');
                const result = await transcribeAudio({
                    audioUrl: input.audioUrl,
                    language: input.language || 'ar',
                });

                if ('error' in result) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: result.error,
                    });
                }

                return {
                    success: true,
                    text: result.text,
                    language: result.language,
                    duration: result.duration,
                    segments: result.segments,
                };
            } catch (error) {
                console.error('[Voice] Transcription failed:', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'فشل تحويل الصوت إلى نص'
                });
            }
        }),
});

export type VoiceRouter = typeof voiceRouter;
