import React, { useState, useEffect } from 'react';
import { WhatsAppPreview, PreviewMessage } from './WhatsAppPreview';
import { ChatScenario } from '../data/solutions/types';
import { cn } from '@/lib/utils';
import { MessageSquare, RefreshCw } from 'lucide-react';

interface SectorChatShowcaseProps {
  scenarios: ChatScenario[];
  className?: string;
}

export function SectorChatShowcase({ scenarios, className }: SectorChatShowcaseProps) {
  const [activeScenarioId, setActiveScenarioId] = useState<string>(
    scenarios.length > 0 ? scenarios[0].id : ''
  );
  
  const [displayedMessages, setDisplayedMessages] = useState<PreviewMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  
  const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];

  const resetChat = () => {
    setDisplayedMessages([]);
    setMessageIndex(0);
    setIsTyping(true);
  };

  useEffect(() => {
    if (!activeScenario) return;
    
    // Reset when scenario changes
    setDisplayedMessages([]);
    setMessageIndex(0);
    setIsTyping(true);
  }, [activeScenarioId, activeScenario]);

  useEffect(() => {
    if (!activeScenario || messageIndex >= activeScenario.messages.length) {
      setIsTyping(false);
      return;
    }

    const currentMsg = activeScenario.messages[messageIndex];
    
    // Simulate typing delay
    const typingDelay = currentMsg.role === 'bot' ? 1200 : 800;
    
    const timer = setTimeout(() => {
      setIsTyping(false);
      
      const newMessage: PreviewMessage = {
        id: `${activeScenario.id}-${messageIndex}`,
        sender: currentMsg.role === 'bot' ? (currentMsg.isAction ? 'system' : 'sari') : 'customer',
        content: currentMsg.content,
        timestamp: new Date().toISOString(),
        status: currentMsg.role === 'user' ? 'read' : undefined
      };
      
      setDisplayedMessages(prev => [...prev, newMessage]);
      
      // Prepare for next message
      if (messageIndex < activeScenario.messages.length - 1) {
        setTimeout(() => {
          setIsTyping(true);
          setMessageIndex(prev => prev + 1);
        }, 500); // Pause before next message starts typing
      }
    }, typingDelay);

    return () => clearTimeout(timer);
  }, [messageIndex, activeScenario]);

  if (!activeScenario) return null;

  return (
    <div className={cn("grid lg:grid-cols-12 gap-8 items-start", className)}>
      {/* Text & Controls Side */}
      <div className="lg:col-span-5 space-y-6">
        <div>
          <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            شاهد ساري في العمل
          </h3>
          <p className="text-gray-500">
            اختر سيناريو لترى كيف يتفاعل ساري مع عملائك بذكاء واحترافية.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => setActiveScenarioId(scenario.id)}
              className={cn(
                "text-right p-4 rounded-xl border transition-all flex flex-col gap-1",
                activeScenarioId === scenario.id 
                  ? "border-primary bg-primary/5 shadow-sm" 
                  : "border-gray-200 bg-white hover:border-primary/50 hover:bg-gray-50"
              )}
            >
              <span className={cn(
                "font-semibold",
                activeScenarioId === scenario.id ? "text-primary" : "text-gray-900"
              )}>
                {scenario.title}
              </span>
              <span className="text-sm text-gray-500">{scenario.description}</span>
            </button>
          ))}
        </div>

        <button 
          onClick={resetChat}
          className="flex items-center justify-center gap-2 w-full py-3 mt-4 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          إعادة المحادثة
        </button>
      </div>

      {/* WhatsApp Preview Side */}
      <div className="lg:col-span-7 relative max-w-[400px] mx-auto w-full">
        {/* Subtle decorative background blur */}
        <div className="absolute -inset-1 bg-gradient-to-r from-primary to-green-400 rounded-3xl blur opacity-20 z-0"></div>
        
        <div className="relative z-10 rounded-3xl border-[8px] border-gray-900 overflow-hidden shadow-2xl bg-white">
          <WhatsAppPreview
            messages={displayedMessages}
            customerName="ساري بوت"
            isOnline={true}
            showTypingIndicator={isTyping}
            typingText="ساري يكتب..."
            compact={false}
            className="border-0 rounded-none !h-[550px]"
          />
        </div>
      </div>
    </div>
  );
}
