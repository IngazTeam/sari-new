import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type QueryStateCardProps = {
  kind: 'error' | 'empty';
  title: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  action?: ReactNode;
};

export function QueryStateCard({
  kind,
  title,
  description,
  retryLabel,
  onRetry,
  action,
}: QueryStateCardProps) {
  const Icon = kind === 'error' ? AlertTriangle : Inbox;

  return (
    <Card role={kind === 'error' ? 'alert' : 'status'}>
      <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
        <Icon className={`h-10 w-10 ${kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}`} />
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="max-w-xl text-sm text-muted-foreground">{description}</p>}
        {(onRetry || action) && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {onRetry && (
              <Button type="button" variant="outline" onClick={onRetry}>
                {retryLabel ?? 'إعادة المحاولة'}
              </Button>
            )}
            {action}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
