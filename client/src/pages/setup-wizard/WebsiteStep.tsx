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
    Search
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
    const getProducts = trpc.websiteAnalysis.getExtractedProducts.useQuery(
        { analysisId: analysisResult?.analysisId },
        {
            enabled: !!analysisResult?.analysisId && !isAnalyzing && analysisResult?.status === 'completed',
        }
    );

    // Poll for analysis completion
    useEffect(() => {
        if (getAnalysis.data && isAnalyzing) {
            if (getAnalysis.data.status === 'completed') {
                setIsAnalyzing(false);
                setAnalysisResult((prev: any) => ({ ...prev, ...getAnalysis.data, status: 'completed' }));
            } else if (getAnalysis.data.status === 'failed') {
                setIsAnalyzing(false);
                setError('فشل تحليل الموقع. تأكد من صحة الرابط وحاول مرة أخرى.');
            }
        }
    }, [getAnalysis.data, isAnalyzing]);

    // Load extracted products when analysis is complete
    useEffect(() => {
        if (getProducts.data && getProducts.data.length > 0 && extractedProducts.length === 0) {
            setExtractedProducts(getProducts.data);
            updateWizardData({
                extractedProducts: getProducts.data,
                websiteAnalysis: analysisResult,
            });
        }
    }, [getProducts.data]);

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

    return (
        <div className="space-y-6 py-4" dir="rtl">
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
                <div className="space-y-4">
                    {/* Success message */}
                    <Card className="p-4 bg-green-50 border-green-200">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="font-medium text-green-900">
                                    تم تحليل الموقع بنجاح! 🎉
                                </p>
                                <p className="text-sm text-green-700 flex items-center gap-1 mt-1">
                                    <ExternalLink className="w-3 h-3" />
                                    {url}
                                </p>
                            </div>
                        </div>
                    </Card>

                    {/* Products found */}
                    {extractedProducts.length > 0 ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Package className="w-5 h-5 text-primary" />
                                <h3 className="font-semibold text-lg">
                                    تم استخراج {extractedProducts.length} منتج
                                </h3>
                            </div>

                            {/* Product samples - show first 5 */}
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {extractedProducts.slice(0, 5).map((product: any, index: number) => (
                                    <Card key={index} className="p-3 flex items-center gap-3">
                                        {product.imageUrl && product.imageUrl.trim() ? (
                                            <img
                                                src={product.imageUrl}
                                                alt={product.name}
                                                className="w-12 h-12 rounded-lg object-cover bg-muted"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                    // Show fallback sibling
                                                    const fallback = (e.target as HTMLImageElement).nextElementSibling;
                                                    if (fallback) (fallback as HTMLElement).style.display = 'flex';
                                                }}
                                            />
                                        ) : null}
                                        <div className={`w-12 h-12 rounded-lg bg-muted items-center justify-center ${product.imageUrl && product.imageUrl.trim() ? 'hidden' : 'flex'}`}>
                                            <Package className="w-6 h-6 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{product.name}</p>
                                            {product.description && (
                                                <p className="text-sm text-muted-foreground truncate">{product.description}</p>
                                            )}
                                        </div>
                                        {product.price > 0 && (
                                            <span className="text-sm font-semibold text-primary shrink-0">
                                                {product.price} {product.currency || 'ر.س'}
                                            </span>
                                        )}
                                    </Card>
                                ))}
                            </div>

                            {extractedProducts.length > 5 && (
                                <p className="text-sm text-muted-foreground text-center">
                                    و {extractedProducts.length - 5} منتجات أخرى...
                                </p>
                            )}

                            <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                                💡 سيتم إضافة هذه المنتجات تلقائياً في الخطوة التالية. يمكنك تعديلها أو حذفها.
                            </p>
                        </div>
                    ) : (
                        <Card className="p-4 bg-amber-50 border-amber-200">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-amber-600" />
                                <div>
                                    <p className="font-medium text-amber-900">{t('wizardWebsiteStepPage.text3')}</p>
                                    <p className="text-sm text-amber-700">{t('wizardWebsiteStepPage.text4')}</p>
                                </div>
                            </div>
                        </Card>
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
