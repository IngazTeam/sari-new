import { useEffect, useState } from 'react';

interface LiveStatsProps {
  targetConversations: number;
  targetOrders: number;
  duration?: number; // مدة الأنيميشن بالميلي ثانية
}

export default function LiveStats({ 
  targetConversations, 
  targetOrders, 
  duration = 2000 
}: LiveStatsProps) {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState(0);
  const [orders, setOrders] = useState(0);

  useEffect(() => {
    const conversationsIncrement = targetConversations / (duration / 50);
    const ordersIncrement = targetOrders / (duration / 50);
    
    let currentConversations = 0;
    let currentOrders = 0;

    const timer = setInterval(() => {
      currentConversations += conversationsIncrement;
      currentOrders += ordersIncrement;

      if (currentConversations >= targetConversations) {
        currentConversations = targetConversations;
      }
      if (currentOrders >= targetOrders) {
        currentOrders = targetOrders;
      }

      setConversations(Math.floor(currentConversations));
      setOrders(Math.floor(currentOrders));

      if (currentConversations >= targetConversations && currentOrders >= targetOrders) {
        clearInterval(timer);
      }
    }, 50);

    return () => clearInterval(timer);
  }, [targetConversations, targetOrders, duration]);

  return (
    <div className="grid grid-cols-2 gap-6 p-6 bg-gradient-to-br from-primary/10 to-purple-500/10 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl border-2 border-primary/20 dark:border-blue-800/30">
      <div className="text-center space-y-2">
        <div className="text-4xl md:text-5xl font-bold text-primary tabular-nums">
          {conversations.toLocaleString('ar-SA')}+
        </div>
        <div className="text-sm md:text-base text-muted-foreground font-medium">{t('liveStats.auto_0')}</div>
      </div>
      <div className="text-center space-y-2">
        <div className="text-4xl md:text-5xl font-bold text-primary tabular-nums">
          {orders.toLocaleString('ar-SA')}+
        </div>
        <div className="text-sm md:text-base text-muted-foreground font-medium">{t('liveStats.auto_1')}</div>
      </div>
    </div>
  );
}
