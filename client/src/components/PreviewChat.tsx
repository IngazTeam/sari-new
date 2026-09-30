import { TestSariSession } from "@/lib/test-sari-session";
import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: Date;
  source?: "model" | "guardrail";
  historyTruncated?: boolean;
}

interface PreviewChatProps {
  businessName?: string;
  botTone?: "friendly" | "professional" | "casual";
  botLanguage?: "ar" | "en" | "both";
  products?: Array<{ name: string; price: number; description?: string }>;
  services?: Array<{ name: string; price?: number; duration?: string }>;
  welcomeMessage?: string;
  className?: string;
  useAI?: boolean;
}

export default function PreviewChat({
  businessName = "متجرك",
  botTone = "friendly",
  botLanguage = "ar",
  products = [],
  services = [],
  welcomeMessage,
  className = "",
  useAI = true,
}: PreviewChatProps) {
  const { t } = useTranslation();
  const english = botLanguage === "en";
  const samples = english
    ? [
        t("setupPreviewUx.queryEnHello"),
        t("setupPreviewUx.queryEnProducts"),
        t("setupPreviewUx.queryEnPrices"),
        t("setupPreviewUx.queryEnBooking"),
      ]
    : [
        t("setupPreviewUx.queryArHello"),
        t("setupPreviewUx.queryArProducts"),
        t("setupPreviewUx.queryArPrices"),
        t("setupPreviewUx.queryArBooking"),
      ];
  const [localMessages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const create = trpc.testSari.createConversation.useMutation();
  const save = trpc.testSari.saveMessage.useMutation();
  const send = trpc.testSari.sendMessage.useMutation();
  const deal = trpc.testSari.markAsDeal.useMutation();
  const operations = useRef({ create, save, send, deal });
  operations.current = { create, save, send, deal };
  const [session] = useState(
    () =>
      new TestSariSession({
        create: input => operations.current.create.mutateAsync(input),
        save: input => operations.current.save.mutateAsync(input),
        send: input => operations.current.send.mutateAsync(input),
        deal: input => operations.current.deal.mutateAsync(input),
      })
  );
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const isTyping = useAI && state.busy;
  const disabled =
    useAI && (state.busy || !!state.error || !state.conversationId);
  useEffect(() => {
    if (useAI) void session.start();
  }, [useAI, session]);
  // Welcome greeting based on tone
  const getGreeting = () => {
    if (welcomeMessage) return welcomeMessage;
    const ar =
      botTone === "professional"
        ? t("setupPreviewUx.greetingArProfessional")
        : botTone === "casual"
          ? t("setupPreviewUx.greetingArCasual")
          : t("setupPreviewUx.greetingArFriendly");
    const en =
      botTone === "professional"
        ? t("setupPreviewUx.greetingEnProfessional")
        : botTone === "casual"
          ? t("setupPreviewUx.greetingEnCasual")
          : t("setupPreviewUx.greetingEnFriendly");
    return botLanguage === "both" ? `${ar}\n${en}` : english ? en : ar;
  };

  // Initialize with welcome message
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        sender: "bot",
        text: getGreeting(),
        timestamp: new Date(),
      },
    ]);
  }, [welcomeMessage, botTone, botLanguage]);

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [localMessages, state.messages]);

  const messages: Message[] = useAI
    ? [
        {
          id: "welcome",
          sender: "bot",
          text: getGreeting(),
          timestamp: new Date(),
        },
        ...state.messages.map(message => ({
          id: message.id,
          sender:
            message.role === "user" ? ("user" as const) : ("bot" as const),
          text: message.content,
          timestamp: message.timestamp,
          source: message.source,
          historyTruncated: message.historyTruncated,
        })),
      ]
    : localMessages;
  const sendText = async (text: string) => {
    if (disabled || !text.trim()) return;
    setInputValue("");
    if (useAI) {
      await session.send(text);
      return;
    }
    setMessages(previous => [
      ...previous,
      {
        id: crypto.randomUUID(),
        sender: "user",
        text: text.trim(),
        timestamp: new Date(),
      },
      {
        id: crypto.randomUUID(),
        sender: "bot",
        text: getGreeting(),
        timestamp: new Date(),
      },
    ]);
  };
  const handleSendMessage = () => sendText(inputValue);
  const handleQuickReply = (query: string) => sendText(query);
  const resetChat = async () => {
    if (useAI) {
      if (await session.start()) setInputValue("");
      return;
    }
    setMessages([
      {
        id: "welcome",
        sender: "bot",
        text: getGreeting(),
        timestamp: new Date(),
      },
    ]);
    setInputValue("");
  };
  return (
    <Card className={`overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">
                {t("setupPreviewUx.title", { name: businessName })}
              </h3>
              <p className="text-xs flex items-center gap-1">
                {useAI
                  ? t("testSariPage.title")
                  : t("previewChat.localPreview")}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={resetChat}
            disabled={disabled}
            aria-label={t("testSariPage.reset")}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {useAI && (
        <p className="p-3 text-xs text-muted-foreground">
          {t("testSariPage.contextLimit")}
        </p>
      )}
      {!useAI && (
        <p className="p-3 text-sm text-muted-foreground">
          {t("setupPreviewUx.greetingOnly")}
        </p>
      )}
      {useAI && state.error && (
        <div role="alert" className="space-y-2 p-3 text-sm">
          <p>
            {state.forbidden
              ? t("testSariPage.accessDenied")
              : state.error === "session"
                ? t("testSariPage.sessionFailed")
                : state.error === "reply"
                  ? t("testSariPage.replyFailed")
                  : t("testSariPage.messageSaveFailed")}
          </p>
          <Button
            variant="outline"
            disabled={isTyping || state.forbidden}
            onClick={() => void session.retry()}
          >
            {t("testSariPage.retry")}
          </Button>
        </div>
      )}
      {/* Messages */}
      <div
        ref={messagesContainerRef}
        dir={english ? "ltr" : "rtl"}
        className="h-72 overflow-y-auto p-4 bg-muted space-y-4"
      >
        {messages.map(message => (
          <div
            key={message.id}
            className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`min-w-0 max-w-[85%] break-words [overflow-wrap:anywhere] rounded-2xl px-4 py-2 ${
                message.sender === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-card text-card-foreground shadow-sm rounded-bl-md"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap" dir="auto">
                {message.text}
              </p>
              {message.source && (
                <p className="mt-2 text-xs">
                  {t(
                    message.source === "guardrail"
                      ? "testSariPage.guardrailSource"
                      : "testSariPage.modelSource"
                  )}
                  {message.historyTruncated
                    ? ` · ${t("testSariPage.contextTruncated")}`
                    : ""}
                </p>
              )}
              <p
                className={`text-xs mt-1 ${
                  message.sender === "user"
                    ? "text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {message.timestamp.toLocaleTimeString(
                  english ? "en-US" : "ar-SA",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                )}
              </p>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm rounded-bl-md">
              <div className="flex gap-1">
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                ></span>
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                ></span>
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                ></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      <div className="px-4 py-2 bg-muted border-t overflow-x-auto">
        <div className="flex gap-2">
          {samples.map((query, idx) => (
            <Button
              key={idx}
              variant="outline"
              size="sm"
              className="whitespace-nowrap text-xs"
              onClick={() => handleQuickReply(query)}
              disabled={disabled}
            >
              {query}
            </Button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 bg-card border-t">
        <div className="flex gap-2">
          <Input
            placeholder={t("setupPreviewUx.messagePlaceholder")}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void handleSendMessage();
              }
            }}
            maxLength={2000}
            aria-label={t("setupPreviewUx.messagePlaceholder")}
            className="min-w-0 flex-1 text-base"
            dir="auto"
            disabled={disabled}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || disabled}
            aria-label={t("merchantUx.actions.sendMessage")}
            className="h-11 min-w-11 shrink-0"
          >
            {isTyping ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Preview Badge */}
      <div className="bg-muted text-muted-foreground text-center py-2 text-xs">
        <Sparkles className="h-3 w-3 inline-block ml-1" />
        {useAI ? t("testSariPage.testingScope") : t("previewChat.localPreview")}
      </div>
    </Card>
  );
}
