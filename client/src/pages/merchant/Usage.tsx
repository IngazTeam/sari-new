import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc';
import { MessageSquare, Mic, MessageCircle, Calendar, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';

export default function Usage() {
  const { t } = useTranslation();
  const { data: usage, isLoading } = trpc.subscriptions.getUsage.useQuery();
  
  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  if (!usage) {
    return (
      <div className="container py-8">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('usagePage.text8')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };
  
  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };
  
  const isApproachingLimit = (percentage: number) => percentage >= 80;
  
  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('usagePage.text0')}</h1>
        <p className="text-muted-foreground mt-2">
          {t('usagePage.text9')}
        </p>
      </div>
      
      {/* Warning if approaching limit */}
      {(isApproachingLimit(usage.conversations.percentage) ||
        isApproachingLimit(usage.messages.percentage) ||
        isApproachingLimit(usage.voiceMessages.percentage)) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{t('usagePage.text1')}</strong> {t('usagePage.text25')}
            {isApproachingLimit(usage.conversations.percentage)  && t('usagePage.text22')}
            {isApproachingLimit(usage.messages.percentage)  && t('usagePage.text23')}
            {isApproachingLimit(usage.voiceMessages.percentage)  && t('usagePage.text24')}
            {t('usagePage.text10')}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Usage Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Conversations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('usagePage.text2')}</CardTitle>
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage.conversations.used.toLocaleString('ar-SA')}
              {!usage.conversations.unlimited && (
                <span className="text-sm text-muted-foreground font-normal">
                  {' '}/ {usage.conversations.limit.toLocaleString('ar-SA')}
                </span>
              )}
            </div>
            {usage.conversations.unlimited ? (
              <p className="text-xs text-muted-foreground mt-2">
                {t('usagePage.text16')}
              </p>
            ) : (
              <>
                <Progress 
                  value={usage.conversations.percentage} 
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {t('usagePage.text17', { var0: Math.round(usage.conversations.percentage) })}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        
        {/* Messages */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('usagePage.text3')}</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage.messages.used.toLocaleString('ar-SA')}
              {!usage.messages.unlimited && (
                <span className="text-sm text-muted-foreground font-normal">
                  {' '}/ {usage.messages.limit.toLocaleString('ar-SA')}
                </span>
              )}
            </div>
            {usage.messages.unlimited ? (
              <p className="text-xs text-muted-foreground mt-2">
                {t('usagePage.text18')}
              </p>
            ) : (
              <>
                <Progress 
                  value={usage.messages.percentage} 
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {t('usagePage.text19', { var0: Math.round(usage.messages.percentage) })}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        
        {/* Voice Messages */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('usagePage.text4')}</CardTitle>
            <Mic className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage.voiceMessages.used.toLocaleString('ar-SA')}
              {!usage.voiceMessages.unlimited && (
                <span className="text-sm text-muted-foreground font-normal">
                  {' '}/ {usage.voiceMessages.limit.toLocaleString('ar-SA')}
                </span>
              )}
            </div>
            {usage.voiceMessages.unlimited ? (
              <p className="text-xs text-muted-foreground mt-2">
                {t('usagePage.text20')}
              </p>
            ) : (
              <>
                <Progress 
                  value={usage.voiceMessages.percentage} 
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {t('usagePage.text21', { var0: Math.round(usage.voiceMessages.percentage) })}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Reset Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('usagePage.text11')}
          </CardTitle>
          <CardDescription>
            {t('usagePage.text12')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('usagePage.text5')}</span>
            <span className="text-sm font-medium">{formatDate(usage.lastResetAt)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('usagePage.text6')}</span>
            <span className="text-sm font-medium">{formatDate(usage.nextResetAt)}</span>
          </div>
        </CardContent>
      </Card>
      
      {/* Upgrade Prompt */}
      {(usage.conversations.percentage >= 80 ||
        usage.messages.percentage >= 80 ||
        usage.voiceMessages.percentage >= 80) && (
        <Card className="border-yellow-500 bg-yellow-50">
          <CardHeader>
            <CardTitle>{t('usagePage.text7')}</CardTitle>
            <CardDescription>
              {t('usagePage.text13')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-4">
              {t('usagePage.text14')}
            </p>
            <a
              href="/merchant/plans"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              {t('usagePage.text15')}
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
