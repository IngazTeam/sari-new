import { useState } from 'react';
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
    Mail,
    HelpCircle,
    MapPin,
    ShoppingBag,
    Briefcase,
    GraduationCap,
    LayoutGrid,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface WebsiteStepProps {
    wizardData: Record<string, any>;
    updateWizardData: (data: Record<string, any>) => void;
    goToNextStep: () => void;
    skipStep: () => void;
}

type WebsitePlatform = 'salla' | 'zid' | 'shopify' | 'woocommerce' | 'custom' | 'unknown';

function safeText(value: unknown, maxLength: number): string {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeWebUrl(value: unknown): string {
    const candidate = safeText(value, 500);
    if (!candidate) return '';
    try {
        const parsed = new URL(candidate);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? candidate : '';
    } catch {
        return '';
    }
}

function normalizePlatform(value: unknown): WebsitePlatform {
    return ['salla', 'zid', 'shopify', 'woocommerce', 'custom'].includes(String(value))
        ? value as WebsitePlatform
        : 'unknown';
}

function toWizardProduct(product: any) {
    const numericPrice = Number(product?.price || 0);
    return {
        id: crypto.randomUUID(),
        name: safeText(product?.name, 255),
        description: safeText(product?.description, 5000),
        price: Number.isFinite(numericPrice) && numericPrice >= 0
            ? String(Math.min(numericPrice, 1_000_000))
            : '0',
        currency: product?.currency === 'USD' ? 'USD' : 'SAR',
        imageUrl: safeWebUrl(product?.imageUrl),
        productUrl: safeWebUrl(product?.productUrl),
        category: safeText(product?.category, 100),
    };
}

function buildProfileSuggestion(result: any, sourceUrl: string) {
    const values: Record<string, string> = {};
    const businessName = safeText(result?.companyInfo?.name, 255);
    const description = safeText(result?.companyInfo?.description, 10_000);
    const address = safeText(result?.contactInfo?.address, 500);
    const phone = safeText(result?.contactInfo?.phones?.[0], 20);

    if (businessName.length >= 2) values.businessName = businessName;
    if (description) values.description = description;
    if (address) values.address = address;
    if (/^[+0-9][0-9\s()\-]{6,19}$/.test(phone)) values.phone = phone;
    if (result?.siteType === 'services') values.businessType = 'services';
    if (result?.siteType === 'ecommerce') values.businessType = 'store';

    return {
        sourceUrl,
        applied: false,
        fields: Object.keys(values),
        values,
    };
}

function buildAnalysisSummary(result: any, websiteUrl: string, productCount: number) {
    return {
        success: true,
        source: 'website',
        status: 'previewed',
        confirmed: false,
        websiteUrl,
        platform: normalizePlatform(result?.platform),
        siteType: safeText(result?.siteType, 30),
        companyInfo: {
            name: safeText(result?.companyInfo?.name, 255),
            description: safeText(result?.companyInfo?.description, 2000),
            industry: safeText(result?.companyInfo?.industry, 100),
        },
        contactInfo: {
            phones: Array.isArray(result?.contactInfo?.phones)
                ? result.contactInfo.phones.slice(0, 3).map((value: unknown) => safeText(value, 20)).filter(Boolean)
                : [],
            emails: Array.isArray(result?.contactInfo?.emails)
                ? result.contactInfo.emails.slice(0, 3).map((value: unknown) => safeText(value, 320)).filter(Boolean)
                : [],
            whatsappNumber: safeText(result?.contactInfo?.whatsappNumber, 20) || null,
            address: safeText(result?.contactInfo?.address, 500) || null,
        },
        crawlStats: {
            totalPages: Math.max(0, Math.min(30, Number(result?.crawlStats?.totalPages || 0))),
        },
        productCount,
        faqCount: Math.max(0, Math.min(100, Number(result?.faqs?.length || 0))),
        pageCount: Math.max(0, Math.min(30, Number(result?.pages?.length || 0))),
    };
}

export default function WebsiteStep({ wizardData, updateWizardData, goToNextStep, skipStep }: WebsiteStepProps) {
    const { t } = useTranslation();
    const [url, setUrl] = useState(wizardData.websiteUrl || '');
    const [analysisResult, setAnalysisResult] = useState<any>(wizardData.websiteAnalysis || null);
    const [extractedProducts, setExtractedProducts] = useState<any[]>(
        wizardData.websiteAnalysis?.source === 'website' ? wizardData.products || [] : []
    );
    const [profileSuggestion, setProfileSuggestion] = useState<any>(wizardData.websiteProfileSuggestion || null);
    const [error, setError] = useState('');

    const previewMutation = trpc.analysis.previewAnalysis.useMutation();

    const handleAnalyze = async () => {
        if (!url.trim()) {
            setError('الرجاء إدخال رابط الموقع');
            return;
        }

        let finalUrl = url.trim();
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            finalUrl = 'https://' + finalUrl;
        }

        setError('');
        setExtractedProducts([]);
        setAnalysisResult(null);

        try {
            const result = await previewMutation.mutateAsync({ websiteUrl: finalUrl });
            const products = Array.isArray(result.products)
                ? result.products.slice(0, 100).map(toWizardProduct).filter(product => product.name)
                : [];
            const suggestion = buildProfileSuggestion(result, finalUrl);
            const summary = buildAnalysisSummary(result, finalUrl, products.length);

            setUrl(finalUrl);
            setAnalysisResult(summary);
            setExtractedProducts(products);
            setProfileSuggestion(suggestion);

            const wizardUpdate: Record<string, any> = {
                websiteUrl: finalUrl,
                websiteAnalysis: summary,
                websiteProfileSuggestion: suggestion,
            };

            // Website extraction is a proposal. It may seed the draft catalog,
            // but it never overwrites the merchant's canonical profile silently.
            if (products.length > 0 || wizardData.websiteAnalysis?.source === 'website') {
                wizardUpdate.products = products;
            }

            updateWizardData(wizardUpdate);
        } catch (err: any) {
            setError(err.message || 'فشل تحليل الموقع');
        }
    };

    const handleApplyProfileSuggestion = () => {
        if (!profileSuggestion?.fields?.length) return;
        const appliedSuggestion = { ...profileSuggestion, applied: true };
        setProfileSuggestion(appliedSuggestion);
        updateWizardData({
            ...profileSuggestion.values,
            websiteProfileSuggestion: appliedSuggestion,
        });
    };

    const handleContinue = () => {
        const wizardUpdate: Record<string, any> = {
            websiteUrl: url,
            websiteAnalysis: {
                ...analysisResult,
                status: 'confirmed',
                confirmed: true,
                profileSuggestionApplied: Boolean(profileSuggestion?.applied),
            },
            websiteProfileSuggestion: profileSuggestion,
        };

        if (extractedProducts.length > 0) {
            wizardUpdate.products = extractedProducts;
        }

        updateWizardData(wizardUpdate);
        goToNextStep();
    };

    const isAnalyzing = previewMutation.isPending;
    const showResults = !isAnalyzing && analysisResult?.success;

    // Site type badge
    const getSiteTypeBadge = (siteType: string) => {
        const config: Record<string, { icon: any; label: string; color: string }> = {
            ecommerce: { icon: ShoppingBag, label: 'متجر إلكتروني', color: 'bg-purple-100 text-purple-700' },
            services: { icon: Briefcase, label: 'خدمات', color: 'bg-blue-100 text-blue-700' },
            courses: { icon: GraduationCap, label: 'تدريب وتعليم', color: 'bg-emerald-100 text-emerald-700' },
            general: { icon: LayoutGrid, label: 'موقع عام', color: 'bg-gray-100 text-gray-700' },
        };
        const c = config[siteType] || config.general;
        const Icon = c.icon;
        return (
            <span className={`inline-flex items-center gap-1 text-xs rounded-full px-3 py-1 font-medium ${c.color}`}>
                <Icon className="w-3 h-3" />
                {c.label}
            </span>
        );
    };

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            {/* Header */}
            <div className="text-center space-y-2">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                    <Globe className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">{t('wizardWebsiteStepPage.text0')}</h2>
                <p className="text-muted-foreground">{t('websiteStep.auto_0')}</p>
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
                                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />{t('websiteStep.auto_1')}</>
                            ) : (
                                <>
                                    <Search className="w-4 h-4 ml-2" />{t('websiteStep.auto_2')}</>
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
                                    <p className="font-medium text-blue-900">{t('websiteStep.auto_3')}</p>
                                    <p className="text-sm text-blue-700">{t('websiteStep.auto_4')}</p>
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
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-medium text-emerald-900">{t('websiteStep.auto_5')}</p>
                                    {analysisResult.siteType && getSiteTypeBadge(analysisResult.siteType)}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-sm text-emerald-700">
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                                        <ExternalLink className="w-3 h-3" />
                                        {url}
                                    </a>
                                    {analysisResult.crawlStats && (
                                        <span className="text-emerald-600">
                                            ({analysisResult.crawlStats.totalPages} صفحة)
                                        </span>
                                    )}
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-emerald-700 hover:bg-emerald-100"
                                onClick={() => {
                                    setAnalysisResult(null);
                                    setExtractedProducts([]);
                                }}
                            >
                                <Search className="w-4 h-4 ml-1" />{t('websiteStep.auto_6')}</Button>
                        </div>
                    </Card>

                    {/* Company Info */}
                    {profileSuggestion?.fields?.length > 0 && (
                        <Card className="p-4 border-blue-100 bg-blue-50/50">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <Building2 className="w-5 h-5 text-blue-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-gray-900 text-lg">
                                        {analysisResult.companyInfo?.name || 'بيانات مقترحة من الموقع'}
                                    </h3>
                                    {analysisResult.companyInfo.description && (
                                        <p className="text-sm text-gray-600 mt-1 line-clamp-3">{analysisResult.companyInfo.description}</p>
                                    )}
                                    {analysisResult.companyInfo.industry && (
                                        <span className="inline-block mt-2 text-xs bg-blue-100 text-blue-700 rounded-full px-3 py-0.5">
                                            {analysisResult.companyInfo.industry}
                                        </span>
                                    )}
                                    <p className="text-xs text-blue-800 mt-3">
                                        هذه اقتراحات مستخرجة فقط، ولن تستبدل ملف نشاطك إلا بعد موافقتك.
                                    </p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleApplyProfileSuggestion}
                                        disabled={profileSuggestion.applied}
                                        className="mt-3 border-blue-300 text-blue-800 hover:bg-blue-100"
                                    >
                                        {profileSuggestion.applied ? (
                                            <><CheckCircle2 className="w-4 h-4 ml-1" />تم اعتماد الاقتراحات</>
                                        ) : (
                                            'استخدام البيانات المقترحة'
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Products/Services Grid */}
                    {extractedProducts.length > 0 ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <ShoppingBag className="w-5 h-5 text-primary" />
                                <h3 className="font-semibold text-lg">
                                    تم استخراج {extractedProducts.length} عنصر
                                </h3>
                            </div>

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

                            <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg text-center">{t('websiteStep.auto_7')}</p>
                        </div>
                    ) : (
                        /* No products found */
                        <div className="space-y-4">
                            {/* Contact details */}
                            <Card className="divide-y">
                                {analysisResult.contactInfo?.phones?.length > 0 && (
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Phone className="w-4 h-4" />
                                            <span>{t('websiteStep.auto_8')}</span>
                                        </div>
                                        <span className="text-sm font-medium text-emerald-600" dir="ltr">
                                            {analysisResult.contactInfo.phones[0]}
                                        </span>
                                    </div>
                                )}
                                {analysisResult.contactInfo?.emails?.length > 0 && (
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Mail className="w-4 h-4" />
                                            <span>{t('websiteStep.auto_9')}</span>
                                        </div>
                                        <span className="text-sm font-medium text-emerald-600" dir="ltr">
                                            {analysisResult.contactInfo.emails[0]}
                                        </span>
                                    </div>
                                )}
                                {analysisResult.contactInfo?.whatsappNumber && (
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <MessageCircle className="w-4 h-4" />
                                            <span>{t('websiteStep.auto_10')}</span>
                                        </div>
                                        <span className="text-sm font-medium text-emerald-600" dir="ltr">
                                            ✅ +{analysisResult.contactInfo.whatsappNumber}
                                        </span>
                                    </div>
                                )}
                                {analysisResult.contactInfo?.address && (
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <MapPin className="w-4 h-4" />
                                            <span>{t('websiteStep.auto_11')}</span>
                                        </div>
                                        <span className="text-sm font-medium text-gray-700 max-w-[200px] truncate">
                                            {analysisResult.contactInfo.address}
                                        </span>
                                    </div>
                                )}
                                {analysisResult.faqCount > 0 && (
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <HelpCircle className="w-4 h-4" />
                                            <span>{t('websiteStep.auto_12')}</span>
                                        </div>
                                        <span className="text-sm font-medium text-emerald-600">
                                            ✅ {analysisResult.faqCount} سؤال
                                        </span>
                                    </div>
                                )}
                            </Card>

                            <p className="text-sm text-muted-foreground bg-amber-50 border border-amber-200 p-3 rounded-lg text-center">{t('websiteStep.auto_13')}</p>
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
                            ? `اعتماد التحليل والمتابعة مع ${extractedProducts.length} عنصر`
                            : 'اعتماد التحليل والمتابعة'
                        }
                    </Button>
                ) : (
                    !isAnalyzing && (
                        <Button onClick={skipStep} variant="ghost" className="flex-1">
                            <SkipForward className="w-4 h-4 ml-2" />{t('websiteStep.auto_14')}</Button>
                    )
                )}
            </div>
        </div>
    );
}
