/**
 * Competitor Analysis Page
 * 
 * صفحة تحليل المنافسين
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown,
  Minus,
  ExternalLink,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';

export default function CompetitorAnalysis() {
  const { t } = useTranslation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const utils = trpc.useUtils();

  // Queries
  const { data: competitors, isLoading } = trpc.websiteAnalysis.listCompetitors.useQuery();

  // Mutations
  const addMutation = trpc.websiteAnalysis.addCompetitor.useMutation({
    onSuccess: () => {
      toast.success(t('competitorAnalysisPage.text0'));
      utils.websiteAnalysis.listCompetitors.invalidate();
      setIsAddDialogOpen(false);
      setName('');
      setUrl('');
    },
    onError: (error) => {
      toast.error(error.message || 'فشل إضافة المنافس');
    },
  });

  const deleteMutation = trpc.websiteAnalysis.deleteCompetitor.useMutation({
    onSuccess: () => {
      toast.success(t('competitorAnalysisPage.text1'));
      utils.websiteAnalysis.listCompetitors.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل حذف المنافس');
    },
  });

  const handleAdd = () => {
    if (!name || !url) {
      toast.error(t('competitorAnalysisPage.text2'));
      return;
    }

    try {
      new URL(url);
      addMutation.mutate({ name, url });
    } catch {
      toast.error(t('competitorAnalysisPage.text3'));
    }
  };

  const handleDelete = (id: number) => {
    if (confirm('هل أنت متأكد من حذف هذا المنافس؟')) {
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

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t('competitorAnalysisPage.text4')}</h1>
          <p className="text-muted-foreground">
            قم بإضافة منافسيك وقارن موقعك معهم
          </p>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              إضافة منافس
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('competitorAnalysisPage.text5')}</DialogTitle>
              <DialogDescription>
                أدخل معلومات المنافس لبدء التحليل
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('competitorAnalysisPage.text6')}</Label>
                <Input
                  id="name"
                  placeholder={t('competitorAnalysisPage.text7')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">{t('competitorAnalysisPage.text8')}</Label>
                <Input
                  id="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleAdd}
                disabled={addMutation.isPending}
              >
                {addMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    جاري الإضافة...
                  </>
                ) : (
                  'إضافة وتحليل'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Competitors List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : competitors && competitors.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {competitors.map((competitor) => (
            <Card key={competitor.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{competitor.name}</CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <a 
                        href={competitor.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:underline flex items-center gap-1"
                      >
                        {new URL(competitor.url).hostname}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(competitor.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Status */}
                <div className="flex items-center gap-2">
                  {competitor.status === 'analyzing' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">{t('competitorAnalysisPage.text9')}</span>
                    </>
                  ) : competitor.status === 'completed' ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">{t('competitorAnalysisPage.text10')}</span>
                    </>
                  ) : competitor.status === 'failed' ? (
                    <>
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="text-sm">{t('competitorAnalysisPage.text11')}</span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="h-4 w-4" />
                      <span className="text-sm">{t('competitorAnalysisPage.text12')}</span>
                    </>
                  )}
                </div>

                {competitor.status === 'completed' && (
                  <>
                    {/* Overall Score */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{t('competitorAnalysisPage.text13')}</span>
                        <span className={`text-2xl font-bold ${getScoreColor(competitor.overallScore)}`}>
                          {competitor.overallScore}
                        </span>
                      </div>
                      <Progress value={competitor.overallScore} className="h-2" />
                    </div>

                    {/* Detailed Scores */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">SEO:</span>
                        <span className={`font-medium ${getScoreColor(competitor.seoScore)}`}>
                          {competitor.seoScore}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t('competitorAnalysisPage.text14')}</span>
                        <span className={`font-medium ${getScoreColor(competitor.performanceScore)}`}>
                          {competitor.performanceScore}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">UX:</span>
                        <span className={`font-medium ${getScoreColor(competitor.uxScore)}`}>
                          {competitor.uxScore}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t('competitorAnalysisPage.text15')}</span>
                        <span className={`font-medium ${getScoreColor(competitor.contentScore)}`}>
                          {competitor.contentScore}
                        </span>
                      </div>
                    </div>

                    {/* Pricing */}
                    {competitor.productCount > 0 && (
                      <div className="pt-3 border-t">
                        <div className="text-sm text-muted-foreground mb-2">
                          {competitor.productCount} منتج
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t('competitorAnalysisPage.text16')}</span>
                          <span className="font-medium">
                            {competitor.avgPrice?.toFixed(2)} {competitor.currency}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t('competitorAnalysisPage.text17')}</span>
                          <span className="font-medium">
                            {competitor.minPrice?.toFixed(2)} - {competitor.maxPrice?.toFixed(2)} {competitor.currency}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Strengths & Weaknesses */}
                    {(competitor.strengths.length > 0 || competitor.weaknesses.length > 0) && (
                      <div className="pt-3 border-t space-y-2">
                        {competitor.strengths.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1 text-sm font-medium text-green-700 mb-1">
                              <TrendingUp className="h-3 w-3" />
                              نقاط القوة
                            </div>
                            <ul className="text-xs text-muted-foreground space-y-1">
                              {competitor.strengths.slice(0, 2).map((strength: string, index: number) => (
                                <li key={index}>• {strength}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {competitor.weaknesses.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1 text-sm font-medium text-red-700 mb-1">
                              <TrendingDown className="h-3 w-3" />
                              نقاط الضعف
                            </div>
                            <ul className="text-xs text-muted-foreground space-y-1">
                              {competitor.weaknesses.slice(0, 2).map((weakness: string, index: number) => (
                                <li key={index}>• {weakness}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Error Message */}
                {competitor.status === 'failed' && competitor.errorMessage && (
                  <div className="bg-red-50 p-3 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-800">{competitor.errorMessage}</p>
                    </div>
                  </div>
                )}

                {/* Date */}
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  {new Date(competitor.createdAt).toLocaleDateString('ar-SA')}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('competitorAnalysisPage.text18')}</h3>
              <p className="text-muted-foreground mb-4">
                ابدأ بإضافة منافسيك لمقارنة موقعك معهم
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                إضافة منافس
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
