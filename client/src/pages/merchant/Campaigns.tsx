import { trpc } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Eye, Pencil, Trash2, Send, FileText, Loader2, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';

export default function Campaigns() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [manualReviewOpen, setManualReviewOpen] = useState(false);
  const { data: campaigns, isLoading, refetch } = trpc.campaigns.list.useQuery();
  const deleteMutation = trpc.campaigns.delete.useMutation({
    onSuccess: () => {
      toast.success(t('toast.campaigns.msg3'));
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || t('campaignsPage.failedDelete'));
    },
  });

  const sendMutation = trpc.campaigns.send.useMutation({
    onSuccess: () => {
      toast.success(t('toast.campaigns.msg5'));
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || t('campaignsPage.failedSend'));
    },
  });

  const handleDelete = async (id: number) => {
    if (confirm(t('campaignsPage.confirmDelete'))) {
      await deleteMutation.mutateAsync({ id });
    }
  };

  // FIX #7: Confirmation before send
  const handleSend = async (id: number, name: string) => {
    const confirmed = confirm(t('campaignsPage.confirmSend', `هل أنت متأكد من إرسال حملة "${name}"؟ سيتم إرسالها لجميع العملاء المستهدفين.`));
    if (confirmed) {
      await sendMutation.mutateAsync({ id });
    }
  };

  // FIX #9: Poll progress for sending campaigns
  const progressCampaign = campaigns?.find(c => c.status === 'sending');
  const { data: sendProgress } = trpc.campaigns.getSendProgress.useQuery(
    { id: progressCampaign?.id || 0 },
    {
      enabled: !!progressCampaign,
      refetchInterval: progressCampaign?.status === 'sending' ? 3000 : false,
    }
  );
  const { data: manualReviewSummary, refetch: refetchManualReviewSummary } = trpc.campaigns.getManualReviewSummary.useQuery();

  const acknowledgeManualReviewMutation = trpc.campaigns.acknowledgeManualReview.useMutation({
    onSuccess: async ({ acknowledged }) => {
      setManualReviewOpen(false);
      await Promise.all([refetch(), refetchManualReviewSummary()]);
      toast.success(t('campaignsPage.manualReviewSuccess', { count: acknowledged }));
    },
    onError: () => {
      toast.error(t('campaignsPage.manualReviewFailure'));
    },
  });

  // Auto-refetch when campaign completes
  useEffect(() => {
    if (sendProgress?.status === 'completed') {
      refetch();
    }
  }, [sendProgress?.status]);

  const getStatusBadge = (status: string) => {
    const statusMap = {
      draft: { label: t('campaignsPage.statusDraft'), variant: 'secondary' as const },
      scheduled: { label: t('campaignsPage.statusScheduled'), variant: 'default' as const },
      sending: { label: t('campaignsPage.statusSending'), variant: 'default' as const },
      completed: { label: t('campaignsPage.statusCompleted'), variant: 'default' as const },
      failed: { label: t('campaignsPage.statusFailed'), variant: 'destructive' as const },
    };

    const config = statusMap[status as keyof typeof statusMap] || statusMap.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('campaignsPage.title')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('campaignsPage.description')}
          </p>
        </div>
        <Button onClick={() => setLocation('/merchant/campaigns/new')}>
          <Plus className="w-4 h-4 ml-2" />
          {t('campaignsPage.newCampaign')}
        </Button>
      </div>

      {manualReviewSummary && manualReviewSummary.needsReview > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <p className="font-medium">{t('campaignsPage.manualReviewTitle')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('campaignsPage.manualReviewDescription', {
                    count: manualReviewSummary.needsReview,
                    name: manualReviewSummary.campaignName,
                  })}
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => setManualReviewOpen(true)}>
              {t('campaignsPage.reviewIncidents')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('campaignsPage.totalCampaigns')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('campaignsPage.completed')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {campaigns?.filter(c => c.status === 'completed').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('campaignsPage.inProgress')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {campaigns?.filter(c => c.status === 'sending' || c.status === 'scheduled').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('campaignsPage.drafts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">
              {campaigns?.filter(c => c.status === 'draft').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('campaignsPage.allCampaigns')}</CardTitle>
          <CardDescription>
            {t('campaignsPage.allCampaignsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns && campaigns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('campaignsPage.campaignName')}</TableHead>
                  <TableHead>{t('campaignsPage.status')}</TableHead>
                  <TableHead>{t('campaignsPage.sent')}</TableHead>
                  <TableHead>{t('campaignsPage.total')}</TableHead>
                  <TableHead>{t('campaignsPage.date')}</TableHead>
                  <TableHead className="text-left">{t('campaignsPage.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                    <TableCell>{campaign.sentCount}</TableCell>
                    <TableCell>{campaign.totalRecipients}</TableCell>
                    <TableCell>
                      {campaign.status === 'sending' && campaign.id === progressCampaign?.id && sendProgress && sendProgress.progress !== undefined ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin text-primary" />
                          <div className="flex-1">
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all duration-500"
                                style={{ width: `${sendProgress.progress}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {sendProgress.sentCount}/{sendProgress.totalRecipients}
                          </span>
                        </div>
                      ) : (
                        new Date(campaign.createdAt).toLocaleDateString()
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setLocation(`/merchant/campaigns/${campaign.id}`)}
                          title={t('campaignsPage.viewDetails')}
                          aria-label={t('merchantUx.actions.viewNamed', { name: campaign.name })}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>

                        {campaign.status === 'completed' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setLocation(`/merchant/campaigns/${campaign.id}/report`)}
                            title={t('campaignsPage.viewReport')}
                            aria-label={t('merchantUx.actions.viewReportNamed', { name: campaign.name })}
                          >
                            <FileText className="w-4 h-4 text-blue-600" />
                          </Button>
                        )}

                        {campaign.status === 'draft' && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSend(campaign.id, campaign.name)}
                              disabled={sendMutation.isPending}
                              title={t('campaignsPage.sendNow')}
                              aria-label={t('merchantUx.actions.sendNamed', { name: campaign.name })}
                            >
                              <Send className="w-4 h-4 text-green-600" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setLocation(`/merchant/campaigns/${campaign.id}/edit`)}
                              aria-label={t('merchantUx.actions.editNamed', { name: campaign.name })}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(campaign.id)}
                              disabled={deleteMutation.isPending}
                              aria-label={t('merchantUx.actions.deleteNamed', { name: campaign.name })}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <Send className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('campaignsPage.noCampaigns')}</h3>
              <p className="text-muted-foreground mb-4">
                {t('campaignsPage.noCampaignsDesc')}
              </p>
              <Button onClick={() => setLocation('/merchant/campaigns/new')}>
                <Plus className="w-4 h-4 ml-2" />
                {t('campaignsPage.createNew')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={manualReviewOpen} onOpenChange={setManualReviewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('campaignsPage.manualReviewDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('campaignsPage.manualReviewDialogDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acknowledgeManualReviewMutation.isPending}>
              {t('campaignsPage.manualReviewCancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!manualReviewSummary || acknowledgeManualReviewMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (manualReviewSummary) acknowledgeManualReviewMutation.mutate({ id: manualReviewSummary.campaignId });
              }}
            >
              {acknowledgeManualReviewMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              {t('campaignsPage.manualReviewConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
