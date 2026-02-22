import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Sparkles, 
  Wand2, 
  RefreshCw, 
  Copy, 
  Check,
  Smile,
  Briefcase,
  Zap,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Message {
  content: string;
  direction: 'incoming' | 'outgoing';
  timestamp?: string;
}

interface AISuggestionsProps {
  conversationId: number;
  messages: Message[];
  customerName?: string;
  onSelectSuggestion: (text: string) => void;
  context?: {
    businessType?: string;
    products?: Array<{ name: string; price?: number }>;
    services?: Array<{ name: string; price?: number }>;
  };
  className?: string;
  compact?: boolean;
}

const typeIcons: Record<string, React.ReactNode> = {
  friendly: <Smile className="w-3 h-3" />,
  professional: <Briefcase className="w-3 h-3" />,
  brief: <Zap className="w-3 h-3" />,
  detailed: <FileText className="w-3 h-3" />,
};

const typeColors: Record<string, string> = {
  friendly: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  professional: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  brief: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  detailed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

export function AISuggestions({
  conversationId,
  messages,
  customerName,
  onSelectSuggestion,
  context,
  className,
  compact = false,
}: AISuggestionsProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const generateMutation = trpc.aiSuggestions.generateSuggestions.useMutation();

  const handleGenerate = () => {
    const lastMessages = messages.slice(-10).map(m => ({
      content: m.content,
      direction: m.direction,
      timestamp: m.timestamp,
    }));

    generateMutation.mutate({
      conversationId,
      lastMessages,
      customerName,
      context,
    });
  };

  const handleCopy = async (text: string, id: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(t('compAISuggestionsPage.text0'));
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSelect = (text: string) => {
    onSelectSuggestion(text);
    toast.success(t('compAISuggestionsPage.text1'));
  };

  if (compact && !isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className={cn("gap-2", className)}
      >
        <Sparkles className="w-4 h-4 text-primary" />
        اقتراحات AI
        <ChevronDown className="w-3 h-3" />
      </Button>
    );
  }

  return (
    <Card className={cn("border-primary/20", className)}>
      <CardContent className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h4 className="text-sm font-medium">{t('compAISuggestionsPage.text2')}</h4>
              <p className="text-xs text-muted-foreground">{t('compAISuggestionsPage.text3')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleGenerate}
                    disabled={generateMutation.isPending}
                  >
                    {generateMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('compAISuggestionsPage.text4')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {compact && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsExpanded(false)}
              >
                <ChevronUp className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Suggestions */}
        <div className="space-y-2">
          {generateMutation.isPending ? (
            // Loading skeleton
            <>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </>
          ) : generateMutation.data?.suggestions ? (
            // Suggestions list
            generateMutation.data.suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="group flex items-start gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                onClick={() => handleSelect(suggestion.text)}
              >
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "shrink-0 gap-1 text-[10px] px-1.5 py-0.5",
                    typeColors[suggestion.type]
                  )}
                >
                  {typeIcons[suggestion.type]}
                  {suggestion.label}
                </Badge>
                <p className="text-sm flex-1 leading-relaxed">{suggestion.text}</p>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(suggestion.text, suggestion.id);
                          }}
                        >
                          {copiedId === suggestion.id ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('compAISuggestionsPage.text5')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            ))
          ) : (
            // Empty state
            <div className="text-center py-4">
              <Sparkles className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                اضغط على زر التوليد للحصول على اقتراحات
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 gap-2"
                onClick={handleGenerate}
              >
                <Wand2 className="w-4 h-4" />
                توليد اقتراحات
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// مكون للردود السريعة
interface QuickRepliesProps {
  messageType: 'greeting' | 'product_inquiry' | 'price_inquiry' | 'order_status' | 'complaint' | 'thanks' | 'goodbye' | 'general';
  onSelect: (text: string) => void;
  className?: string;
}

export function QuickReplies({ messageType, onSelect, className }: QuickRepliesProps) {
  const { data, isLoading } = trpc.aiSuggestions.getQuickSuggestions.useQuery({ messageType });

  if (isLoading) {
    return (
      <div className={cn("flex gap-2 flex-wrap", className)}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2 flex-wrap", className)}>
      {data?.suggestions.map((suggestion, index) => (
        <Button
          key={index}
          variant="outline"
          size="sm"
          className="gap-1 text-xs"
          onClick={() => onSelect(suggestion.text)}
        >
          <span>{suggestion.emoji}</span>
          <span className="max-w-[150px] truncate">{suggestion.text}</span>
        </Button>
      ))}
    </div>
  );
}

export default AISuggestions;
