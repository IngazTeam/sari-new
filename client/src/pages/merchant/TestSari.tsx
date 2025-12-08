import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, Send, RotateCcw, User, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Scenario {
  id: string;
  title: string;
  description: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

const EXAMPLE_SCENARIOS: Scenario[] = [
  {
    id: "price-inquiry",
    title: "استفسار عن سعر",
    description: "عميل يسأل عن سعر منتج معين",
    messages: [
      { role: "user", content: "مرحباً، كم سعر الساعة الذكية؟" },
    ],
  },
  {
    id: "product-search",
    title: "البحث عن منتج",
    description: "عميل يبحث عن نوع معين من المنتجات",
    messages: [
      { role: "user", content: "عندك عطور رجالية؟" },
    ],
  },
  {
    id: "order-inquiry",
    title: "استفسار عن الطلب",
    description: "عميل يسأل عن التوصيل والدفع",
    messages: [
      { role: "user", content: "كيف أطلب؟ وكم يستغرق التوصيل؟" },
    ],
  },
  {
    id: "greeting",
    title: "ترحيب وتعريف",
    description: "عميل جديد يريد التعرف على المتجر",
    messages: [
      { role: "user", content: "السلام عليكم، أول مرة أتعامل معكم" },
    ],
  },
  {
    id: "recommendations",
    title: "طلب توصيات",
    description: "عميل يطلب اقتراحات لهدية",
    messages: [
      { role: "user", content: "أبغى هدية لصديقي، شو تقترح؟" },
    ],
  },
  {
    id: "complaint",
    title: "شكوى أو استفسار",
    description: "عميل لديه مشكلة أو سؤال",
    messages: [
      { role: "user", content: "المنتج اللي طلبته ما وصل، شو السالفة؟" },
    ],
  },
  {
    id: "multi-turn",
    title: "محادثة متعددة",
    description: "محادثة طويلة مع عدة أسئلة",
    messages: [
      { role: "user", content: "مرحباً" },
      { role: "assistant", content: "أهلاً وسهلاً! أنا ساري، مساعدك الشخصي 😊 كيف أقدر أساعدك اليوم؟" },
      { role: "user", content: "عندك ساعات ذكية؟" },
    ],
  },
];

export default function TestSari() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "مرحباً! أنا ساري، مساعدك الذكي. جرّب أن تسألني عن منتجاتك أو أي شيء تحتاجه! 👋",
      timestamp: new Date(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMessageMutation = trpc.testSari.sendMessage.useMutation({
    onSuccess: (data) => {
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    },
    onError: (error) => {
      toast.error(t("toast.conversations.sendFailed"));
      console.error("Error sending message:", error);
      setIsTyping(false);
    },
  });

  const resetMutation = trpc.testSari.resetConversation.useMutation({
    onSuccess: () => {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "مرحباً! أنا ساري، مساعدك الذكي. جرّب أن تسألني عن منتجاتك أو أي شيء تحتاجه! 👋",
          timestamp: new Date(),
        },
      ]);
      toast.success("تم إعادة تعيين المحادثة");
    },
  });

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);
    setInputMessage("");

    sendMessageMutation.mutate({
      message: inputMessage,
      conversationHistory: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });
  };

  const handleReset = () => {
    resetMutation.mutate();
  };

  const handleApplyScenario = (scenarioId: string) => {
    const scenario = EXAMPLE_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return;

    // Reset conversation first
    const welcomeMessage: Message = {
      id: "welcome",
      role: "assistant",
      content: "مرحباً! أنا ساري، مساعدك الذكي. جرّب أن تسألني عن منتجاتك أو أي شيء تحتاجه! 👋",
      timestamp: new Date(),
    };

    const scenarioMessages: Message[] = scenario.messages.map((msg, index) => ({
      id: `scenario-${index}-${Date.now()}`,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(Date.now() + index * 1000),
    }));

    setMessages([welcomeMessage, ...scenarioMessages]);

    // If last message is from user, send it to get AI response
    const lastMessage = scenario.messages[scenario.messages.length - 1];
    if (lastMessage.role === "user") {
      setIsTyping(true);
      sendMessageMutation.mutate({
        message: lastMessage.content,
        conversationHistory: scenario.messages.slice(0, -1),
      });
    }

    toast.success(`تم تطبيق سيناريو: ${scenario.title}`);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">اختبار ساري AI</h1>
            <p className="text-muted-foreground mt-2">
              جرّب المحادثة مع ساري قبل ربط WhatsApp الحقيقي
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={resetMutation.isPending}
          >
            <RotateCcw className="h-4 w-4 ml-2" />
            إعادة تعيين
          </Button>
        </div>

        <div className="flex items-center gap-3 bg-muted/50 p-4 rounded-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">جرّب أمثلة جاهزة</p>
            <p className="text-xs text-muted-foreground">
              اختر سيناريو محادثة لتجربة ساري بسرعة
            </p>
          </div>
          <Select onValueChange={handleApplyScenario}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="اختر سيناريو..." />
            </SelectTrigger>
            <SelectContent>
              {EXAMPLE_SCENARIOS.map((scenario) => (
                <SelectItem key={scenario.id} value={scenario.id}>
                  <div className="flex flex-col">
                    <span className="font-medium">{scenario.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {scenario.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="h-[600px] flex flex-col">
        <CardHeader className="border-b bg-muted/50">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback className="bg-primary text-primary-foreground">
                <Bot className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">ساري - المساعد الذكي</CardTitle>
              <CardDescription>
                {isTyping ? "يكتب..." : "متصل"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-0 overflow-hidden">
          <ScrollArea className="h-full p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback
                      className={
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }
                    >
                      {message.role === "user" ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>

                  <div
                    className={`flex flex-col gap-1 max-w-[70%] ${
                      message.role === "user" ? "items-end" : ""
                    }`}
                  >
                    <div
                      className={`rounded-lg px-4 py-2 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground px-2">
                      {message.timestamp.toLocaleTimeString("ar-SA", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-muted">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg px-4 py-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                      <div
                        className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      />
                      <div
                        className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                        style={{ animationDelay: "0.4s" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>

        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              placeholder="اكتب رسالتك هنا..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={sendMessageMutation.isPending || isTyping}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={
                !inputMessage.trim() ||
                sendMessageMutation.isPending ||
                isTyping
              }
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            هذه محادثة تجريبية - لن يتم حفظها في قاعدة البيانات
          </p>
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">💡 نصيحة</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              جرّب أن تسأل ساري عن منتجاتك: "عندك عطور؟" أو "كم سعر الساعة؟"
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">🎯 الميزات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              ساري يفهم اللهجة السعودية ويبحث في منتجاتك تلقائياً
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">🚀 الخطوة التالية</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              بعد التأكد من جودة الردود، اربط رقم WhatsApp الحقيقي
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
