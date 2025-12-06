# 📦 دليل إدارة المنتجات ورفع CSV - مشروع Sari

## نظرة عامة

يوفر مشروع Sari نظاماً سهلاً لإدارة المنتجات عبر رفع ملف CSV/Excel يحتوي على بيانات المنتجات.

---

## 1️⃣ تنسيق ملف CSV المطلوب

### الأعمدة المطلوبة:
```csv
name,nameAr,description,descriptionAr,price,imageUrl,productUrl,category,stock
iPhone 15 Pro,آيفون 15 برو,Latest iPhone model,أحدث موديل آيفون,4299,https://example.com/iphone15.jpg,https://example.com/buy/iphone15,Electronics,10
Samsung S24,سامسونج S24,Flagship Samsung phone,جوال سامسونج الرائد,4599,https://example.com/s24.jpg,https://example.com/buy/s24,Electronics,5
```

### شرح الأعمدة:
| العمود | الوصف | مطلوب؟ | مثال |
|--------|-------|--------|------|
| `name` | اسم المنتج بالإنجليزية | ✅ نعم | iPhone 15 Pro |
| `nameAr` | اسم المنتج بالعربية | ⚪ اختياري | آيفون 15 برو |
| `description` | وصف المنتج بالإنجليزية | ⚪ اختياري | Latest iPhone model |
| `descriptionAr` | وصف المنتج بالعربية | ⚪ اختياري | أحدث موديل آيفون |
| `price` | السعر بالريال السعودي | ✅ نعم | 4299 |
| `imageUrl` | رابط صورة المنتج | ⚪ اختياري | https://... |
| `productUrl` | رابط صفحة المنتج/الدفع | ⚪ اختياري | https://... |
| `category` | تصنيف المنتج | ⚪ اختياري | Electronics |
| `stock` | الكمية المتوفرة | ⚪ اختياري | 10 |

---

## 2️⃣ Backend API لرفع CSV

### Installation:
```bash
cd /home/ubuntu/sari
pnpm add papaparse
pnpm add -D @types/papaparse
```

### Implementation:
```typescript
// في server/routers.ts
import Papa from 'papaparse';

products: router({
  uploadCSV: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      csvContent: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
      // التحقق من أن المستخدم هو صاحب المتجر أو Admin
      const merchant = await getMerchantById(input.merchantId);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      if (ctx.user.role !== 'admin' && merchant.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      // تحليل CSV
      const parsed = Papa.parse<{
        name: string;
        nameAr?: string;
        description?: string;
        descriptionAr?: string;
        price: string;
        imageUrl?: string;
        productUrl?: string;
        category?: string;
        stock?: string;
      }>(input.csvContent, {
        header: true,
        skipEmptyLines: true
      });

      if (parsed.errors.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `CSV parsing error: ${parsed.errors[0].message}`
        });
      }

      // تحويل البيانات إلى صيغة قاعدة البيانات
      const products: InsertProduct[] = parsed.data.map(row => ({
        merchantId: input.merchantId,
        name: row.name,
        nameAr: row.nameAr || null,
        description: row.description || null,
        descriptionAr: row.descriptionAr || null,
        price: Math.round(parseFloat(row.price) * 100), // تحويل إلى فلوس (100 فلس = 1 ريال)
        imageUrl: row.imageUrl || null,
        productUrl: row.productUrl || null,
        category: row.category || null,
        stock: row.stock ? parseInt(row.stock) : 0,
        isActive: true
      }));

      // حذف المنتجات القديمة (اختياري)
      // await deleteProductsByMerchantId(input.merchantId);

      // إضافة المنتجات الجديدة
      await bulkCreateProducts(products);

      return {
        success: true,
        count: products.length
      };
    }),

  list: protectedProcedure
    .input(z.object({
      merchantId: z.number()
    }))
    .query(async ({ input, ctx }) => {
      const merchant = await getMerchantById(input.merchantId);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      if (ctx.user.role !== 'admin' && merchant.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      return getProductsByMerchantId(input.merchantId);
    }),

  create: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      name: z.string(),
      nameAr: z.string().optional(),
      description: z.string().optional(),
      descriptionAr: z.string().optional(),
      price: z.number(),
      imageUrl: z.string().optional(),
      productUrl: z.string().optional(),
      category: z.string().optional(),
      stock: z.number().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const merchant = await getMerchantById(input.merchantId);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      if (ctx.user.role !== 'admin' && merchant.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      return createProduct({
        merchantId: input.merchantId,
        name: input.name,
        nameAr: input.nameAr || null,
        description: input.description || null,
        descriptionAr: input.descriptionAr || null,
        price: Math.round(input.price * 100),
        imageUrl: input.imageUrl || null,
        productUrl: input.productUrl || null,
        category: input.category || null,
        stock: input.stock || 0,
        isActive: true
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      merchantId: z.number(),
      name: z.string().optional(),
      nameAr: z.string().optional(),
      description: z.string().optional(),
      descriptionAr: z.string().optional(),
      price: z.number().optional(),
      imageUrl: z.string().optional(),
      productUrl: z.string().optional(),
      category: z.string().optional(),
      stock: z.number().optional(),
      isActive: z.boolean().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const product = await getProductById(input.id);
      if (!product) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const merchant = await getMerchantById(product.merchantId);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      if (ctx.user.role !== 'admin' && merchant.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      const updateData: Partial<InsertProduct> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.nameAr !== undefined) updateData.nameAr = input.nameAr;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.descriptionAr !== undefined) updateData.descriptionAr = input.descriptionAr;
      if (input.price !== undefined) updateData.price = Math.round(input.price * 100);
      if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;
      if (input.productUrl !== undefined) updateData.productUrl = input.productUrl;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.stock !== undefined) updateData.stock = input.stock;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      await updateProduct(input.id, updateData);

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({
      id: z.number(),
      merchantId: z.number()
    }))
    .mutation(async ({ input, ctx }) => {
      const product = await getProductById(input.id);
      if (!product) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const merchant = await getMerchantById(product.merchantId);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      if (ctx.user.role !== 'admin' && merchant.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      await deleteProduct(input.id);

      return { success: true };
    })
}),
```

---

## 3️⃣ Frontend - صفحة رفع CSV

### Implementation:
```tsx
// في client/src/pages/merchant/ProductUpload.tsx
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useState } from 'react';
import { toast } from 'sonner';

export function ProductUpload() {
  const [file, setFile] = useState<File | null>(null);
  const uploadMutation = trpc.products.uploadCSV.useMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('الرجاء اختيار ملف');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvContent = e.target?.result as string;

      try {
        const result = await uploadMutation.mutateAsync({
          merchantId: currentMerchantId,
          csvContent
        });

        toast.success(`تم رفع ${result.count} منتج بنجاح`);
        setFile(null);
      } catch (error) {
        toast.error('فشل رفع الملف');
      }
    };

    reader.readAsText(file);
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">رفع المنتجات من CSV</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            اختر ملف CSV
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="block w-full text-sm"
          />
        </div>

        <Button
          onClick={handleUpload}
          disabled={!file || uploadMutation.isPending}
        >
          {uploadMutation.isPending ? 'جاري الرفع...' : 'رفع الملف'}
        </Button>

        <div className="mt-6 p-4 bg-gray-50 rounded">
          <h3 className="font-semibold mb-2">تنسيق الملف المطلوب:</h3>
          <pre className="text-xs overflow-x-auto">
name,nameAr,description,descriptionAr,price,imageUrl,productUrl,category,stock
iPhone 15 Pro,آيفون 15 برو,Latest iPhone,أحدث آيفون,4299,https://...,https://...,Electronics,10
          </pre>
        </div>
      </div>
    </Card>
  );
}
```

---

## 4️⃣ Frontend - جدول المنتجات

### Implementation:
```tsx
// في client/src/pages/merchant/ProductList.tsx
import { trpc } from '@/lib/trpc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';

export function ProductList() {
  const { data: products, isLoading } = trpc.products.list.useQuery({
    merchantId: currentMerchantId
  });

  const deleteMutation = trpc.products.delete.useMutation();

  const handleDelete = async (id: number) => {
    if (confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
      await deleteMutation.mutateAsync({
        id,
        merchantId: currentMerchantId
      });
    }
  };

  if (isLoading) return <div>جاري التحميل...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">المنتجات</h2>
      
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>الاسم</TableHead>
            <TableHead>السعر</TableHead>
            <TableHead>التصنيف</TableHead>
            <TableHead>المخزون</TableHead>
            <TableHead>الحالة</TableHead>
            <TableHead>الإجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products?.map(product => (
            <TableRow key={product.id}>
              <TableCell>{product.nameAr || product.name}</TableCell>
              <TableCell>{product.price / 100} ريال</TableCell>
              <TableCell>{product.category}</TableCell>
              <TableCell>{product.stock}</TableCell>
              <TableCell>
                {product.isActive ? 'نشط' : 'غير نشط'}
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(product.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

## 5️⃣ تحميل ملف CSV نموذجي

### Implementation:
```typescript
// في server/routers.ts
downloadSampleCSV: publicProcedure
  .query(() => {
    const sampleCSV = `name,nameAr,description,descriptionAr,price,imageUrl,productUrl,category,stock
iPhone 15 Pro,آيفون 15 برو,Latest iPhone model with A17 Pro chip,أحدث موديل آيفون مع معالج A17 Pro,4299,https://example.com/iphone15.jpg,https://example.com/buy/iphone15,Electronics,10
Samsung S24 Ultra,سامسونج S24 الترا,Flagship Samsung phone with S Pen,جوال سامسونج الرائد مع قلم S Pen,4599,https://example.com/s24.jpg,https://example.com/buy/s24,Electronics,5
MacBook Pro 14,ماك بوك برو 14,Professional laptop with M3 chip,لابتوب احترافي مع معالج M3,7999,https://example.com/macbook.jpg,https://example.com/buy/macbook,Computers,3`;

    return { csv: sampleCSV };
  }),
```

### Frontend:
```tsx
const downloadSample = () => {
  const csv = `name,nameAr,description,descriptionAr,price,imageUrl,productUrl,category,stock
iPhone 15 Pro,آيفون 15 برو,Latest iPhone,أحدث آيفون,4299,https://...,https://...,Electronics,10`;

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'products_sample.csv';
  a.click();
};
```

---

## 6️⃣ التحقق من صحة البيانات

### Implementation:
```typescript
function validateProductRow(row: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!row.name || row.name.trim() === '') {
    errors.push('اسم المنتج مطلوب');
  }

  if (!row.price || isNaN(parseFloat(row.price))) {
    errors.push('السعر مطلوب ويجب أن يكون رقماً');
  }

  if (row.price && parseFloat(row.price) < 0) {
    errors.push('السعر يجب أن يكون موجباً');
  }

  if (row.imageUrl && !row.imageUrl.startsWith('http')) {
    errors.push('رابط الصورة غير صحيح');
  }

  if (row.productUrl && !row.productUrl.startsWith('http')) {
    errors.push('رابط المنتج غير صحيح');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

---

## 7️⃣ الخلاصة

### الخطوات الأساسية:
1. ✅ إنشاء ملف CSV بالتنسيق الصحيح
2. ✅ رفع الملف عبر الواجهة
3. ✅ تحليل CSV بواسطة papaparse
4. ✅ التحقق من صحة البيانات
5. ✅ حفظ المنتجات في قاعدة البيانات
6. ✅ عرض المنتجات في جدول
7. ✅ تعديل وحذف المنتجات

### Resources:
- [PapaParse Documentation](https://www.papaparse.com/docs)
- [CSV Format Guide](https://en.wikipedia.org/wiki/Comma-separated_values)
