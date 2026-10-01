import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Bot,
  Sparkles,
  Key,
  Mic,
  Calendar,
  BellRing,
  BarChart3,
  TestTube,
  Lightbulb,
  Users,
  Brain,
  UserCheck,
  Globe,
} from "lucide-react";

interface HubCard {
  icon: React.ElementType;
  title: string;
  description: string;
  path: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

export default function AIWhatsAppHub() {
  const { t, i18n } = useTranslation();

  const cards: HubCard[] = [
    {
      icon: Brain,
      title: t("assistantSectionsUx.brain"),
      description: t("assistantSectionsUx.brainDescription"),
      path: "/merchant/sari-brain",
    },
    {
      icon: Users,
      title: t("assistantSectionsUx.personas"),
      description: t("assistantSectionsUx.personasDescription"),
      path: "/merchant/virtual-team",
    },
    {
      icon: UserCheck,
      title: t("assistantSectionsUx.takeover"),
      description: t("assistantSectionsUx.takeoverDescription"),
      path: "/merchant/human-takeover",
    },
    {
      icon: Globe,
      title: t("assistantSectionsUx.language"),
      description: t("assistantSectionsUx.languageDescription"),
      path: "/merchant/language-settings",
    },
    {
      icon: Bot,
      title: t("assistantSectionsUx.basicTitle"),
      description: t("assistantSectionsUx.basicDescription"),
      path: "/merchant/bot-settings",
      badge: t("assistantHubUx.essential"),
      badgeVariant: "default",
    },
    {
      icon: TestTube,
      title: t("assistantHubUx.test"),
      description: t("assistantHubUx.testDescription"),
      path: "/merchant/test-sari",
    },
    {
      icon: Sparkles,
      title: t("assistantHubUx.playground"),
      description: t("assistantHubUx.playgroundDescription"),
      path: "/merchant/sari-playground",
      badge: t("assistantHubUx.experimental"),
      badgeVariant: "secondary",
    },
    {
      icon: Key,
      title: t("assistantHubUx.quickResponses"),
      description: t("assistantHubUx.quickResponsesDescription"),
      path: "/merchant/quick-responses",
    },
    {
      icon: Lightbulb,
      title: t("assistantHubUx.suggestions"),
      description: t("assistantHubUx.suggestionsDescription"),
      path: "/merchant/ai-suggestions",
    },
    {
      icon: Mic,
      title: t("assistantHubUx.voice"),
      description: t("assistantHubUx.voiceDescription"),
      path: "/merchant/voice-messages",
    },
    {
      icon: Calendar,
      title: t("assistantHubUx.scheduled"),
      description: t("assistantHubUx.scheduledDescription"),
      path: "/merchant/scheduled-messages",
    },
    {
      icon: BellRing,
      title: t("assistantHubUx.notifications"),
      description: t("assistantHubUx.notificationsDescription"),
      path: "/merchant/whatsapp-auto-notifications",
    },
    {
      icon: BarChart3,
      title: t("assistantHubUx.analytics"),
      description: t("assistantHubUx.analyticsDescription"),
      path: "/merchant/sari-analytics",
    },
  ];

  return (
    <div
      className="container mx-auto py-6 space-y-8"
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary text-white shadow-lg">
            <Sparkles className="h-7 w-7" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("aIWhatsAppHub.auto_0")}
            </h1>
            <p className="text-muted-foreground">{t("aIWhatsAppHub.auto_1")}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        {t("assistantSectionsUx.hubHint")}
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link
            key={card.path}
            href={card.path}
            className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Card className="group cursor-pointer transition-colors hover:shadow-md hover:border-primary/30 h-full">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                    <card.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  {card.badge && (
                    <Badge
                      variant={card.badgeVariant || "default"}
                      className="text-xs"
                    >
                      {card.badge}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-base mt-3 group-hover:text-primary transition-colors">
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <CardDescription className="text-sm leading-relaxed">
                  {card.description}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
