import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
    Globe,
    Loader2,
    ArrowRight,
    SkipForward,
    Package,
    CheckCircle2,
    AlertCircle,
    ExternalLink,
    Search,
    Building2,
    Phone,
    MessageCircle,
    BarChart3,
    FileText,
    Eye,
    Smartphone,
    Star,
    ShoppingBag,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface WebsiteStepProps {
    wizardData: Record<string, any>;
    updateWizardData: (data: Record<string, any>) => void;
    goToNextStep: () => void;
    skipStep: () => void;
}

export default function WebsiteStep({ wizardData, updateWizardData, goToNextStep, skipStep }: WebsiteStepProps) {
    const { t } = useTranslation();
    const [url, setUrl] = useState(wizardData.websiteUrl || '');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any>(wizardData.websiteAnalysis || null);
    const [extractedProducts, setExtractedProducts] = useState<any[]>(wizardData.extractedProducts || []);
    const [error, setError] = useState('');

    const analyzeWebsite = trpc.websiteAnalysis.analyze.useMutation();
    const getAnalysis = trpc.websiteAnalysis.getAnalysis.useQuery(
        { id: analysisResult?.analysisId },
        {
            enabled: !!analysisResult?.analysisId && isAnalyzing,
            refetchInterval: isAnalyzing ? 2000 : false,
        }
    );

    // Poll for analysis completion — products are included in getAnalysis response
    useEffect(() => {
        if (getAnalysis.data && isAnalyzing) {
            if (getAnalysis.data.status === 'completed') {
                setIsAnalyzing(false);
                setAnalysisResult((prev: any) => ({ ...prev, ...getAnalysis.data, status: 'completed' }));
                // Products come directly from getAnalysis response
                const products = getAnalysis.data.extractedProducts || [];
                if (products.length > 0 && extractedProducts.length === 0) {
                    setExtractedProducts(products);
                    updateWizardData({
                        extractedProducts: products,
                        websiteAnalysis: { ...getAnalysis.data, status: 'completed' },
                    });
                }
            } else if (getAnalysis.data.status === 'failed') {
                setIsAnalyzing(false);
                setError('فشل تحليل الموقع. تأكد من صحة الرابط وحاول مرة أخرى.');
            }
        }
    }, [getAnalysis.data, isAnalyzing]);

    const handleAnalyze = async () => {
        if (!url.trim()) {
            setError('الرجاء إدخال رابط الموقع');
            return;
        }

        // Basic URL validation
        let finalUrl = url.trim();
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            finalUrl = 'https://' + finalUrl;
        }

        setError('');
        setIsAnalyzing(true);
        setExtractedProducts([]);
        setAnalysisResult(null);

        try {
            const result = await analyzeWebsite.mutateAsync({ url: finalUrl });
            setAnalysisResult(result);
            setUrl(finalUrl);
            updateWizardData({ websiteUrl: finalUrl });
        } catch (err: any) {
            setIsAnalyzing(false);
            setError(err.message || 'فشل بدء التحليل');
        }
    };

    const handleContinue = () => {
        // Save extracted products to wizard data for ProductsServicesStep
        if (extractedProducts.length > 0) {
            const products = extractedProducts.map((p: any) => ({
                id: crypto.randomUUID(),
                name: p.name || '',
                description: p.description || '',
                price: p.price?.toString() || '',
                currency: p.currency || 'SAR',
                imageUrl: p.imageUrl || '',
                productUrl: p.productUrl || '',
                category: p.category || '',
            }));
            updateWizardData({
                products,
                websiteUrl: url,
                websiteAnalysis: analysisResult,
                extractedProducts,
            });
        }
        goToNextStep();
    };

    const showResults = !isAnalyzing && analysisResult?.status === 'completed';

    // Score color helper
    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
        if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
        return 'text-red-500 bg-red-50 border-red-200';
    };

    const getScoreLabel = (score: number) => {
        if (score >= 80) return 'ممتاز';
        if (score >= 60) return 'جيد';
        if (score >= 40) return 'متوسط';
        return 'يحتاج تحسين';
    };

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            {/* Header */}
            <div className="text-center space-y-2">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                    <Globe className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">{t('wizardWebsiteStepPage.text0')}</h2>
                <p className="text-muted-foreground">
                    أدخل رابط موقعك وساري يسحب المنتجات والمعلومات تلقائياً
                </p>
            </div>

            {/* URL Input */}
            {!showResults && (
                <div className="space-y-3">
                    <div className="flex gap-2">
                        <Input
                            type="url"
                            placeholder="https://example.com"
                            value={url}
                            onChange={(e) => {
                                setUrl(e.target.value);
                                setError('');
                            }}
                            disabled={isAnalyzing}
                            className="text-left"
                            dir="ltr"
                            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                        />
                        <Button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing || !url.trim()}
                            className="shrink-0"
                        >
                            {isAnalyzing ? (
                                <>
                                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                                    جاري التحليل...
                                </>
                            ) : (
                                <>
                                    <Search className="w-4 h-4 ml-2" />
                                    تحليل
                                </>
                            )}
                        </Button>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-600 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {isAnalyzing && (
                        <Card className="p-4 bg-blue-50 border-blue-200">
                            <div className="flex items-center gap-3">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                <div>
                                    <p className="font-medium text-blue-900">{t('wizardWebsiteStepPage.text1')}</p>
                                    <p className="text-sm text-blue-700">{t('wizardWebsiteStepPage.text2')}</p>
                                </div>
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {/* Results */}
            {showResults && (
                <div className="space-y-5">
                    {/* Success banner */}
                    <Card className="p-4 bg-emerald-50 border-emerald-200">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="font-medium text-emerald-900">
                                    تم تحليل الموقع بنجاح! 🎉
                                </p>
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-emerald-700 flex items-center gap-1 mt-0.5 hover:underline"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    {url}
                                </a>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-emerald-700 hover:bg-emerald-100"
                                onClick={() => {
                                    setAnalysisResult(null);
                                    setExtractedProducts([]);
                                    setIsAnalyzing(false);
                                }}
                            >
                                <Search className="w-4 h-4 ml-1" />
                                إعادة التحليل
                            </Button>
                        </div>
                    </Card>

                    {/* Products Grid */}
                    {extractedProducts.length > 0 ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <ShoppingBag className="w-5 h-5 text-primary" />
                                <h3 className="font-semibold text-lg">
                                    تم استخراج {extractedProducts.length} منتج
                                </h3>
                            </div>

                            {/* Responsive product card grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto p-1">
                                {extractedProducts.map((product: any, index: number) => (
                                    <Card
                                        key={index}
                                        className="group overflow-hidden border hover:border-primary/40 hover:shadow-md transition-all duration-200"
                                    >
                                        {/* Product Image */}
                                        <div className="aspect-square bg-muted relative overflow-hidden">
                                            {product.imageUrl && typeof product.imageUrl === 'string' && product.imageUrl.trim() ? (
                                                <img
                                                    src={product.imageUrl}
                                                    alt={product.name}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                        const fallback = (e.target as HTMLImageElement).nextElementSibling;
                                                        if (fallback) (fallback as HTMLElement).style.display = 'flex';
                                                    }}
                                                />
                                            ) : null}
                                            <div
                                                className={`absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10 items-center justify-center ${product.imageUrl && typeof product.imageUrl === 'string' && product.imageUrl.trim() ? 'hidden' : 'flex'}`}
                                            >
                                                <Package className="w-10 h-10 text-primary/30" />
                                            </div>
                                            {/* Price badge */}
                                            {product.price > 0 && (
                                                <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm rounded-full px-2.5 py-0.5 text-xs font-bold text-primary shadow-sm">
                                                    {product.price} {product.currency === 'SAR' ? 'ر.س' : product.currency || 'ر.س'}
                                                </div>
                                            )}
                                        </div>
                                        {/* Product Info */}
                                        <div className="p-2.5">
                                            <p className="font-medium text-sm leading-tight line-clamp-2 min-h-[2.5rem]">
                                                {product.name}
                                            </p>
                                            {product.category && (
                                                <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5 mt-1 inline-block">
                                                    {product.category}
                                                </span>
                                            )}
                                        </div>
                                    </Card>
                                ))}
                            </div>

                            <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg text-center">
                                💡 سيتم إضافة هذه المنتجات تلقائياً في الخطوة التالية. يمكنك تعديلها أو حذفها.
                            </p>
                        </div>
                    ) : (
                        /* Informational website data */
                        <div className="space-y-4">
                            {/* Site info header */}
                            {analysisResult?.title && (
                                <Card className="p-4 border-blue-100 bg-blue-50/50">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                                            <Building2 className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-gray-900 text-lg">{analysisResult.title}</h3>
                                            {analysisResult.description && (
                                                <p className="text-sm text-gray-600 mt-1 line-clamp-3">{analysisResult.description}</p>
                                            )}
                                            {analysisResult.industry && (
                                                <span className="inline-block mt-2 text-xs bg-blue-100 text-blue-700 rounded-full px-3 py-0.5">
                                                    {analysisResult.industry}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            )}

                            {/* Score cards */}
                            {analysisResult?.overallScore > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                    {/* Overall */}
                                    <Card className={`p-3 text-center border ${getScoreColor(analysisResult.overallScore)}`}>
                                        <Star className="w-4 h-4 mx-auto mb-1 opacity-70" />
                                        <p className="text-2xl font-bold">{analysisResult.overallScore}</p>
                                        <p className="text-[10px] mt-0.5 opacity-80">التقييم العام</p>
                                    </Card>
                                    {/* SEO */}
                                    {analysisResult.seoScore != null && (
                                        <Card className={`p-3 text-center border ${getScoreColor(analysisResult.seoScore)}`}>
                                            <BarChart3 className="w-4 h-4 mx-auto mb-1 opacity-70" />
                                            <p className="text-2xl font-bold">{analysisResult.seoScore}</p>
                                            <p className="text-[10px] mt-0.5 opacity-80">SEO</p>
                                        </Card>
                                    )}
                                    {/* Performance */}
                                    {analysisResult.performanceScore != null && (
                                        <Card className={`p-3 text-center border ${getScoreColor(analysisResult.performanceScore)}`}>
                                            <Eye className="w-4 h-4 mx-auto mb-1 opacity-70" />
                                            <p className="text-2xl font-bold">{analysisResult.performanceScore}</p>
                                            <p className="text-[10px] mt-0.5 opacity-80">الأداء</p>
                                        </Card>
                                    )}
                                    {/* UX */}
                                    {analysisResult.uxScore != null && (
                                        <Card className={`p-3 text-center border ${getScoreColor(analysisResult.uxScore)}`}>
                                            <Smartphone className="w-4 h-4 mx-auto mb-1 opacity-70" />
                                            <p className="text-2xl font-bold">{analysisResult.uxScore}</p>
                                            <p className="text-[10px] mt-0.5 opacity-80">تجربة المستخدم</p>
                                        </Card>
                                    )}
                                </div>
                            )}

                            {/* Site details list */}
                            <Card className="divide-y">
                                {analysisResult?.wordCount > 0 && (
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <FileText className="w-4 h-4" />
                                            <span>المحتوى</span>
                                        </div>
                                        <span className="text-sm font-medium">{analysisResult.wordCount.toLocaleString()} كلمة</span>
                                    </div>
                                )}
                                {analysisResult?.imageCount > 0 && (
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Eye className="w-4 h-4" />
                                            <span>الصور</span>
                                        </div>
                                        <span className="text-sm font-medium">{analysisResult.imageCount} صورة</span>
                                    </div>
                                )}
                                {analysisResult?.mobileOptimized != null && (
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Smartphone className="w-4 h-4" />
                                            <span>متوافق مع الجوال</span>
                                        </div>
                                        <span className={`text-sm font-medium ${analysisResult.mobileOptimized ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {analysisResult.mobileOptimized ? '✅ نعم' : '❌ لا'}
                                        </span>
                                    </div>
                                )}
                                {analysisResult?.hasContactInfo != null && (
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Phone className="w-4 h-4" />
                                            <span>معلومات التواصل</span>
                                        </div>
                                        <span className={`text-sm font-medium ${analysisResult.hasContactInfo ? 'text-emerald-600' : 'text-amber-500'}`}>
                                            {analysisResult.hasContactInfo ? '✅ متوفرة' : '⚠️ غير متوفرة'}
                                        </span>
                                    </div>
                                )}
                                {analysisResult?.hasWhatsapp != null && (
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <MessageCircle className="w-4 h-4" />
                                            <span>واتساب</span>
                                        </div>
                                        <span className={`text-sm font-medium ${analysisResult.hasWhatsapp ? 'text-emerald-600' : 'text-gray-400'}`}>
                                            {analysisResult.hasWhatsapp ? '✅ مرتبط' : '—'}
                                        </span>
                                    </div>
                                )}
                                {analysisResult?.language && (
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Globe className="w-4 h-4" />
                                            <span>اللغة</span>
                                        </div>
                                        <span className="text-sm font-medium">{analysisResult.language === 'ar' ? 'العربية' : analysisResult.language === 'en' ? 'الإنجليزية' : analysisResult.language}</span>
                                    </div>
                                )}
                            </Card>

                            <p className="text-sm text-muted-foreground bg-amber-50 border border-amber-200 p-3 rounded-lg text-center">
                                ℹ️ لم يتم العثور على منتجات — يمكنك إضافة المنتجات والخدمات يدوياً في الخطوة التالية
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                {showResults ? (
                    <Button onClick={handleContinue} className="flex-1">
                        <ArrowRight className="w-4 h-4 ml-2" />
                        {extractedProducts.length > 0
                            ? `متابعة مع ${extractedProducts.length} منتج`
                            : 'متابعة'
                        }
                    </Button>
                ) : (
                    !isAnalyzing && (
                        <Button onClick={skipStep} variant="ghost" className="flex-1">
                            <SkipForward className="w-4 h-4 ml-2" />
                            تخطي — ليس لدي موقع
                        </Button>
                    )
                )}
            </div>
        </div>
    );
}
