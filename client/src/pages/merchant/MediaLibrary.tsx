import { useState, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ImageIcon, Upload, Trash2, Grid3x3, List, Copy, Check,
  FileText, Package, Megaphone, LayoutTemplate, FolderOpen,
  HardDrive, X, ZoomIn, Download, Search, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type MediaCategory = 'product' | 'promotion' | 'template' | 'general';

const CATEGORY_META: Record<MediaCategory | 'all', { label: string; icon: any; color: string }> = {
  all: { label: 'الكل', icon: FolderOpen, color: 'text-white' },
  product: { label: 'المنتجات', icon: Package, color: 'text-blue-400' },
  promotion: { label: 'العروض', icon: Megaphone, color: 'text-amber-400' },
  template: { label: 'القوالب', icon: LayoutTemplate, color: 'text-violet-400' },
  general: { label: 'عام', icon: FolderOpen, color: 'text-emerald-400' },
};

// ═══════════════════════════════════════════════════════════════
// Media Library Page
// ═══════════════════════════════════════════════════════════════

export default function MediaLibrary() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();

  // State
  const [activeCategory, setActiveCategory] = useState<MediaCategory | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState<MediaCategory>('general');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Data
  const { data: mediaItems, isLoading } = trpc.media.list.useQuery(
    activeCategory === 'all' ? {} : { category: activeCategory },
  );
  const { data: stats } = trpc.media.getStats.useQuery();

  // Mutations
  const uploadMut = trpc.media.upload.useMutation({
    onSuccess: () => {
      toast.success('تم رفع الملف بنجاح');
      utils.media.list.invalidate();
      utils.media.getStats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.media.delete.useMutation({
    onSuccess: () => {
      toast.success('تم حذف الملف');
      utils.media.list.invalidate();
      utils.media.getStats.invalidate();
      setDeleteConfirm(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // ═══════════════════════════════════════════════════════════════
  // Upload Logic
  // ═══════════════════════════════════════════════════════════════

  const handleUploadFile = useCallback(async (file: File) => {
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`حجم الملف كبير جداً (${(file.size / 1024 / 1024).toFixed(1)}MB). الحد الأقصى 5MB`);
      return;
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      toast.error('نوع الملف غير مدعوم. الأنواع المدعومة: JPEG, PNG, WebP, GIF, PDF');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      uploadMut.mutate({
        fileBase64: base64,
        originalName: file.name,
        mimeType: file.type,
        category: uploadCategory,
      });
    };
    reader.readAsDataURL(file);
  }, [uploadCategory, uploadMut]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUploadFile(files[0]);
    }
    e.target.value = '';
  }, [handleUploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleUploadFile(files[0]);
    }
  }, [handleUploadFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  function copyUrl(url: string, id: number) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      toast.success('تم نسخ الرابط');
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function isImage(mime: string): boolean {
    return mime.startsWith('image/');
  }

  // Filter by search
  const filteredItems = (mediaItems || []).filter((item: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (item.originalName || item.original_name || '').toLowerCase().includes(q);
  });

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20">
              <ImageIcon className="h-6 w-6 text-cyan-400" />
            </div>
            مكتبة الوسائط
          </h1>
          <p className="text-muted-foreground mt-1">
            إدارة الصور والملفات المستخدمة في المنتجات والعروض والقوالب
          </p>
        </div>
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={uploadMut.isPending}
          className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white shadow-lg"
        >
          {uploadMut.isPending ? (
            <Loader2 className="h-4 w-4 ml-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 ml-2" />
          )}
          {uploadMut.isPending ? 'جاري الرفع...' : 'رفع ملف'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* ═════════ Storage Stats ═════════ */}
      {stats && (
        <Card className="bg-card/40 backdrop-blur-sm border-white/5">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <HardDrive className="h-5 w-5 text-cyan-400" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-muted-foreground">
                      {formatSize(stats.totalSizeBytes)} من {formatSize(stats.maxStorageBytes)}
                    </span>
                    <span className="text-xs text-muted-foreground">{stats.usagePercent}%</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        stats.usagePercent > 80
                          ? 'bg-gradient-to-r from-red-500 to-orange-500'
                          : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                      }`}
                      style={{ width: `${Math.min(stats.usagePercent, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{stats.totalFiles} ملف</span>
                {Object.entries(stats.byCategory).map(([cat, cnt]) => {
                  if (!cnt) return null;
                  const meta = CATEGORY_META[cat as MediaCategory];
                  return (
                    <span key={cat} className={meta.color}>
                      {meta.label}: {cnt as number}
                    </span>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═════════ Upload Drop Zone ═════════ */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-xl p-6 transition-all text-center ${
          isDragging
            ? 'border-cyan-400 bg-cyan-500/10 scale-[1.01]'
            : 'border-white/10 hover:border-white/20'
        }`}
      >
        <div className="flex flex-col md:flex-row items-center justify-center gap-4">
          <div className="flex items-center gap-3">
            <Upload className={`h-5 w-5 ${isDragging ? 'text-cyan-400' : 'text-muted-foreground'}`} />
            <span className="text-sm text-muted-foreground">
              {isDragging ? 'أفلت الملف هنا...' : 'اسحب وأفلت الملفات هنا أو'}
            </span>
            {!isDragging && (
              <Button
                variant="outline" size="sm"
                onClick={() => fileRef.current?.click()}
                className="border-white/10 text-xs"
              >
                اختر ملف
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">التصنيف:</label>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value as MediaCategory)}
              className="bg-background/50 border border-white/10 rounded-md text-xs px-2 py-1 text-white"
            >
              {Object.entries(CATEGORY_META).filter(([k]) => k !== 'all').map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ═════════ Filter Bar ═════════ */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
        {/* Category Tabs */}
        <div className="flex gap-1 flex-wrap">
          {Object.entries(CATEGORY_META).map(([key, meta]) => {
            const Icon = meta.icon;
            const isActive = activeCategory === key;
            return (
              <button
                key={key}
                onClick={() => setActiveCategory(key as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-muted-foreground hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? meta.color : ''}`} />
                {meta.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 mr-auto">
          {/* Search */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث..."
              className="h-8 text-xs bg-background/50 pr-8 w-40"
            />
          </div>

          {/* View Toggle */}
          <div className="flex border border-white/10 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}
            >
              <Grid3x3 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ═════════ Media Grid / List ═════════ */}
      {isLoading ? (
        <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'grid-cols-1'} gap-3`}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`${viewMode === 'grid' ? 'aspect-square' : 'h-16'} rounded-xl bg-card/40 animate-pulse`} />
          ))}
        </div>
      ) : filteredItems.length > 0 ? (
        viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredItems.map((item: any) => {
              const name = item.originalName || item.original_name || '';
              const mime = item.mimeType || item.mime_type || '';
              const size = item.fileSize || item.file_size || 0;
              const cat = item.category || 'general';
              const catMeta = CATEGORY_META[cat as MediaCategory];

              return (
                <div
                  key={item.id}
                  className="group relative bg-card/40 rounded-xl border border-white/5 hover:border-cyan-500/20 transition-all overflow-hidden"
                >
                  {/* Thumbnail */}
                  <div
                    className="aspect-square bg-black/20 flex items-center justify-center cursor-pointer"
                    onClick={() => isImage(mime) && setLightboxUrl(item.url)}
                  >
                    {isImage(mime) ? (
                      <img src={item.url} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <FileText className="h-10 w-10 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Overlay Actions */}
                  <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => copyUrl(item.url, item.id)}
                      className="p-1.5 rounded-lg bg-black/60 backdrop-blur-sm text-white/80 hover:text-white"
                      title="نسخ الرابط"
                    >
                      {copiedId === item.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    {isImage(mime) && (
                      <button
                        onClick={() => setLightboxUrl(item.url)}
                        className="p-1.5 rounded-lg bg-black/60 backdrop-blur-sm text-white/80 hover:text-white"
                        title="تكبير"
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Category Badge */}
                  <div className="absolute top-2 right-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm ${catMeta.color}`}>
                      {catMeta.label}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-2.5 space-y-1">
                    <p className="text-xs font-medium text-white truncate" title={name}>{name}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">{formatSize(size)}</span>
                      {deleteConfirm === item.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => deleteMut.mutate({ id: item.id })}
                            className="text-[10px] text-red-400 hover:text-red-300"
                          >
                            تأكيد
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-[10px] text-muted-foreground hover:text-white"
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(item.id)}
                          className="p-1 rounded text-muted-foreground/40 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-1.5">
            {filteredItems.map((item: any) => {
              const name = item.originalName || item.original_name || '';
              const mime = item.mimeType || item.mime_type || '';
              const size = item.fileSize || item.file_size || 0;
              const cat = item.category || 'general';
              const catMeta = CATEGORY_META[cat as MediaCategory];
              const date = new Date(item.createdAt || item.created_at).toLocaleDateString('ar-SA');

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 bg-card/40 rounded-lg border border-white/5 hover:border-cyan-500/20 transition-all group"
                >
                  {/* Mini Thumbnail */}
                  <div className="w-10 h-10 rounded-lg bg-black/20 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {isImage(mime) ? (
                      <img src={item.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Name + Category */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{name}</p>
                    <span className={`text-[10px] ${catMeta.color}`}>{catMeta.label}</span>
                  </div>

                  {/* Meta */}
                  <span className="text-xs text-muted-foreground hidden md:block">{date}</span>
                  <span className="text-xs text-muted-foreground">{formatSize(size)}</span>

                  {/* Actions */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => copyUrl(item.url, item.id)}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white"
                    >
                      {copiedId === item.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    {isImage(mime) && (
                      <button
                        onClick={() => setLightboxUrl(item.url)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white"
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {deleteConfirm === item.id ? (
                      <>
                        <button onClick={() => deleteMut.mutate({ id: item.id })} className="text-xs text-red-400 px-2">تأكيد</button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-xs text-muted-foreground px-1">إلغاء</button>
                      </>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(item.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground/40 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Empty State */
        <Card className="bg-card/40 backdrop-blur-sm border-white/5 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-600/10 mb-4">
              <ImageIcon className="h-10 w-10 text-cyan-400/60" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              {searchQuery ? 'لا توجد نتائج' : 'لا توجد ملفات بعد'}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              {searchQuery
                ? 'جرب البحث بكلمات مختلفة'
                : 'ارفع صور المنتجات وشعارات العروض وصور القوالب لاستخدامها في جميع أدوات ساري'}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => fileRef.current?.click()}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white"
              >
                <Upload className="h-4 w-4 ml-2" />
                رفع أول ملف
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═════════ Lightbox ═════════ */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <Button
              variant="ghost" size="sm"
              className="absolute -top-10 left-0 text-white/60 hover:text-white z-10"
              onClick={() => setLightboxUrl(null)}
            >
              <X className="h-5 w-5" />
            </Button>
            <img
              src={lightboxUrl}
              alt=""
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex gap-2">
              <Button
                variant="ghost" size="sm"
                className="text-white/60 hover:text-white text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(lightboxUrl);
                  toast.success('تم نسخ الرابط');
                }}
              >
                <Copy className="h-3.5 w-3.5 ml-1" />
                نسخ الرابط
              </Button>
              <a
                href={lightboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white px-3 py-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="h-3.5 w-3.5" />
                فتح
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
