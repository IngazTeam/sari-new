/**
 * Website Analysis Page
 * 
 * صفحة التحليل الذكي للمواقع
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Search, 
  TrendingUp, 
  Zap, 
  Eye, 
  FileText, 
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export default function WebsiteAnalysis() {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Queries
  const { data: analyses, isLoading: isLoadingAnalyses } = trpc.websiteAnalysis.listAnalyses.useQuery();
  const { data: currentAnalysis } = trpc.websiteAnalysis.getAnalysis.useQuery(
    { id: selectedAnalysisId! },
    { enabled: !!selectedAnalysisId }
  );
  const { data: extractedProducts } = trpc.websiteAnalysis.getExtractedProducts.useQuery(
    { analysisId: selectedAnalysisId! },
    { enabled: !!selectedAnalysisId }
  );
  const { data: insights } = trpc.websiteAnalysis.getInsights.useQuery(
    { analysisId: selectedAnalysisId! },
    { enabled: !!selectedAnalysisId }
  );

  // Mutations
  const analyzeMutation = trpc.websiteAnalysis.analyze.useMutation({
    onSuccess: (data) => {
      toast.success(t('websiteAnalysisPage.text0'));
      setSelectedAnalysisId(data.analysisId);
      utils.websiteAnalysis.listAnalyses.invalidate();
      setUrl('');
    },
    onError: (error) => {
      toast.error(error.message || 'فشل بدء التحليل');
    },
  });

  const deleteMutation = trpc.websiteAnalysis.deleteAnalysis.useMutation({
    onSuccess: () => {
      toast.success(t('websiteAnalysisPage.text1'));
      utils.websiteAnalysis.listAnalyses.invalidate();
      if (selectedAnalysisId) {
        setSelectedAnalysisId(null);
      }
    },
    onError: (error) => {
      toast.error(error.message || 'فشل حذف التحليل');
    },
  });

  const handleAnalyze = () => {
    if (!url) {
      toast.error(t('websiteAnalysisPage.text2'));
      return;
    }

    try {
      new URL(url);
      analyzeMutation.mutate({ url });
    } catch {
      toast.error(t('websiteAnalysisPage.text3'));
    }
  };

  const handleDelete = (id: number) => {
    if (confirm('هل أنت متأكد من حذف هذا التحليل؟')) {
      deleteMutation.mutate({ id });
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'default';
      case 'medium':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'حرج';
      case 'high':
        return 'عالي';
      case 'medium':
        return 'متوسط';
      default:
        return 'منخفض';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'strength':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'weakness':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'opportunity':
        return <TrendingUp className="h-4 w-4 text-blue-600" />;
      case 'threat':
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'strength':
        return 'نقطة قوة';
      case 'weakness':
        return 'نقطة ضعف';
      case 'opportunity':
        return 'فرصة';
      case 'threat':
        return 'تهديد';
      default:
        return 'توصية';
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('websiteAnalysisPage.text4')}</h1>
        <p className="text-muted-foreground">
          قم بتحليل أي موقع إلكتروني واحصل على رؤى ذكية وتوصيات لتحسين موقعك
        </p>
      </div>

      {/* Analysis Form */}
      <Card>
        <CardHeader>
          <CardTitle>{t('websiteAnalysisPage.text5')}</CardTitle>
          <CardDescription>
            أدخل رابط الموقع الذي تريد تحليله
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              disabled={analyzeMutation.isPending}
            />
            <Button
              onClick={handleAnalyze}
              disabled={analyzeMutation.isPending}
            >
              {analyzeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  جاري التحليل...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  تحليل
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analyses List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoadingAnalyses ? (
          <div className="col-span-full flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : analyses && analyses.length > 0 ? (
          analyses.map((analysis) => (
            <Card
              key={analysis.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedAnalysisId === analysis.id ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => setSelectedAnalysisId(analysis.id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg line-clamp-1">
                      {analysis.title || 'بدون عنوان'}
                    </CardTitle>
                    <CardDescription className="line-clamp-1">
                      {analysis.url}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(analysis.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Status */}
                  <div className="flex items-center gap-2">
                    {analysis.status === 'analyzing' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">{t('websiteAnalysisPage.text6')}</span>
                      </>
                    ) : analysis.status === 'completed' ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm">{t('websiteAnalysisPage.text7')}</span>
                      </>
                    ) : analysis.status === 'failed' ? (
                      <>
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span className="text-sm">{t('websiteAnalysisPage.text8')}</span>
                      </>
                    ) : (
                      <>
                        <Loader2 className="h-4 w-4" />
                        <span className="text-sm">{t('websiteAnalysisPage.text9')}</span>
                      </>
                    )}
                  </div>

                  {/* Overall Score */}
                  {analysis.status === 'completed' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{t('websiteAnalysisPage.text10')}</span>
                        <span className={`text-2xl font-bold ${getScoreColor(analysis.overallScore)}`}>
                          {analysis.overallScore}
                        </span>
                      </div>
                      <Progress value={analysis.overallScore} className="h-2" />
                    </div>
                  )}

                  {/* Date */}
                  <div className="text-xs text-muted-foreground">
                    {new Date(analysis.createdAt).toLocaleDateString('ar-SA')}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full text-center py-12">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t('websiteAnalysisPage.text11')}</p>
            <p className="text-sm text-muted-foreground">{t('websiteAnalysisPage.text12')}</p>
          </div>
        )}
      </div>

      {/* Analysis Details */}
      {currentAnalysis && currentAnalysis.status === 'completed' && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>{currentAnalysis.title}</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <a 
                    href={currentAnalysis.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="hover:underline flex items-center gap-1"
                  >
                    {currentAnalysis.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </CardDescription>
              </div>
              <Badge variant="outline">{currentAnalysis.industry}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">{t('websiteAnalysisPage.text13')}</TabsTrigger>
                <TabsTrigger value="insights">{t('websiteAnalysisPage.text14')}</TabsTrigger>
                <TabsTrigger value="products">{t('websiteAnalysisPage.text15')}</TabsTrigger>
                <TabsTrigger value="details">{t('websiteAnalysisPage.text16')}</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                {/* Score Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-lg ${getScoreBgColor(currentAnalysis.seoScore)}`}>
                          <Search className={`h-6 w-6 ${getScoreColor(currentAnalysis.seoScore)}`} />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">SEO</p>
                          <p className={`text-2xl font-bold ${getScoreColor(currentAnalysis.seoScore)}`}>
                            {currentAnalysis.seoScore}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-lg ${getScoreBgColor(currentAnalysis.performanceScore)}`}>
                          <Zap className={`h-6 w-6 ${getScoreColor(currentAnalysis.performanceScore)}`} />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('websiteAnalysisPage.text17')}</p>
                          <p className={`text-2xl font-bold ${getScoreColor(currentAnalysis.performanceScore)}`}>
                            {currentAnalysis.performanceScore}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-lg ${getScoreBgColor(currentAnalysis.uxScore)}`}>
                          <Eye className={`h-6 w-6 ${getScoreColor(currentAnalysis.uxScore)}`} />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('websiteAnalysisPage.text18')}</p>
                          <p className={`text-2xl font-bold ${getScoreColor(currentAnalysis.uxScore)}`}>
                            {currentAnalysis.uxScore}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-lg ${getScoreBgColor(currentAnalysis.contentQuality)}`}>
                          <FileText className={`h-6 w-6 ${getScoreColor(currentAnalysis.contentQuality)}`} />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('websiteAnalysisPage.text19')}</p>
                          <p className={`text-2xl font-bold ${getScoreColor(currentAnalysis.contentQuality)}`}>
                            {currentAnalysis.contentQuality}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Description */}
                {currentAnalysis.description && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t('websiteAnalysisPage.text20')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{currentAnalysis.description}</p>
                    </CardContent>
                  </Card>
                )}

                {/* SEO Issues */}
                {currentAnalysis.seoIssues && currentAnalysis.seoIssues.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t('websiteAnalysisPage.text21')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {currentAnalysis.seoIssues.map((issue: string, index: number) => (
                          <li key={index} className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{issue}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Insights Tab */}
              <TabsContent value="insights" className="space-y-4">
                {insights && insights.length > 0 ? (
                  insights.map((insight: any) => (
                    <Card key={insight.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            {getTypeIcon(insight.type)}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <CardTitle className="text-lg">{insight.title}</CardTitle>
                                <Badge variant={getPriorityColor(insight.priority)}>
                                  {getPriorityLabel(insight.priority)}
                                </Badge>
                              </div>
                              <CardDescription>{getTypeLabel(insight.type)}</CardDescription>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm">{insight.description}</p>
                        
                        {insight.recommendation && (
                          <div className="bg-blue-50 p-3 rounded-lg">
                            <p className="text-sm font-medium text-blue-900 mb-1">{t('websiteAnalysisPage.text22')}</p>
                            <p className="text-sm text-blue-800">{insight.recommendation}</p>
                          </div>
                        )}

                        {insight.impact && (
                          <div className="bg-green-50 p-3 rounded-lg">
                            <p className="text-sm font-medium text-green-900 mb-1">{t('websiteAnalysisPage.text23')}</p>
                            <p className="text-sm text-green-800">{insight.impact}</p>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>مستوى الثقة: {insight.confidence}%</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">{t('websiteAnalysisPage.text24')}</p>
                  </div>
                )}
              </TabsContent>

              {/* Products Tab */}
              <TabsContent value="products" className="space-y-4">
                {extractedProducts && extractedProducts.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {extractedProducts.map((product: any) => (
                      <Card key={product.id}>
                        {product.imageUrl && (
                          <div className="aspect-video bg-muted relative overflow-hidden">
                            <img 
                              src={product.imageUrl} 
                              alt={product.name}
                              className="object-cover w-full h-full"
                            />
                          </div>
                        )}
                        <CardHeader>
                          <CardTitle className="text-lg line-clamp-2">{product.name}</CardTitle>
                          {product.category && (
                            <CardDescription>{product.category}</CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {product.description && (
                            <p className="text-sm text-muted-foreground line-clamp-3">
                              {product.description}
                            </p>
                          )}
                          
                          {product.price && (
                            <div className="flex items-center justify-between">
                              <span className="text-2xl font-bold">
                                {product.price} {product.currency}
                              </span>
                              <Badge variant={product.inStock ? 'default' : 'secondary'}>
                                {product.inStock ? 'متوفر' : 'غير متوفر'}
                              </Badge>
                            </div>
                          )}

                          {product.tags && product.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {product.tags.slice(0, 3).map((tag: string, index: number) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {product.productUrl && (
                            <a
                              href={product.productUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-1"
                            >
                              عرض المنتج
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">{t('websiteAnalysisPage.text25')}</p>
                  </div>
                )}
              </TabsContent>

              {/* Details Tab */}
              <TabsContent value="details" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t('websiteAnalysisPage.text26')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('websiteAnalysisPage.text27')}</span>
                        <span className="font-medium">{currentAnalysis.language}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('websiteAnalysisPage.text28')}</span>
                        <span className="font-medium">{currentAnalysis.wordCount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('websiteAnalysisPage.text29')}</span>
                        <span className="font-medium">{currentAnalysis.imageCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('websiteAnalysisPage.text30')}</span>
                        <span className="font-medium">{currentAnalysis.videoCount}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t('websiteAnalysisPage.text31')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('websiteAnalysisPage.text32')}</span>
                        <span className="font-medium">{currentAnalysis.loadTime}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('websiteAnalysisPage.text33')}</span>
                        <span className="font-medium">
                          {(currentAnalysis.pageSize / 1024).toFixed(2)} KB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('websiteAnalysisPage.text34')}</span>
                        <span className="font-medium">
                          {currentAnalysis.mobileOptimized ? 'نعم' : 'لا'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('websiteAnalysisPage.text35')}</span>
                        <span className="font-medium">
                          {currentAnalysis.hasWhatsapp ? 'نعم' : 'لا'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
