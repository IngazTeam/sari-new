/**
 * @fileoverview ملف تكوين Vite الرئيسي
 * 
 * هذا الملف يُحدد إعدادات Vite لبناء المشروع، بما في ذلك:
 * - تكوين React plugin
 * - تحسينات الأداء (Code Splitting)
 * - إعدادات البناء للإنتاج
 * 
 * @packageDocumentation
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/**
 * تكوين Vite للمشروع
 * 
 * @description يتضمن:
 * - React plugin مع دعم JSX
 * - Tailwind CSS plugin
 * - Path aliases للاستيراد السهل
 * - تحسينات الـ Rollup لتقسيم الكود
 * 
 * @example
 * // استخدام الـ alias في الكود
 * import { Button } from '@/components/ui/button';
 */
export default defineConfig({
  // Plugins المستخدمة
  plugins: [
    react(),           // دعم React 19 مع JSX Transform الجديد
    tailwindcss(),     // Tailwind CSS 4 مباشرة في Vite
  ],

  // إعدادات الاستيراد
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@db": path.resolve(import.meta.dirname, "db"),
    },
  },

  // جذر المشروع (Frontend)
  root: path.resolve(import.meta.dirname, "client"),

  // إعدادات البناء للإنتاج
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,

    // تحسينات Rollup لتقسيم الكود
    rollupOptions: {
      output: {
        /**
         * تقسيم الكود إلى chunks منفصلة
         * 
         * الفوائد:
         * 1. تحميل أسرع - كل صفحة تحمّل الكود المطلوب فقط
         * 2. Caching أفضل - المكتبات المشتركة تُخزّن مؤقتاً
         * 3. تجربة مستخدم أفضل - التطبيق يظهر بسرعة
         */
        manualChunks: {
          // مكتبات React الأساسية
          'vendor-react': ['react', 'react-dom'],

          // مكتبات UI من Radix
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
          ],

          // مكتبة الرسوم البيانية
          'vendor-charts': ['recharts'],

          // مكتبات النماذج
          'vendor-forms': ['react-hook-form', 'zod'],

          // مكتبة التواريخ
          'vendor-date': ['date-fns'],
        },
      },
    },

    // الحد الأدنى لحجم الـ chunk قبل التحذير
    chunkSizeWarningLimit: 600,
  },
});
