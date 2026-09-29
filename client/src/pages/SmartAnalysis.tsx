import { WebsiteImportWorkspace } from "@/components/WebsiteImportWorkspace";
import { WebsiteReportsWorkspace } from "@/components/WebsiteReportsWorkspace";
import { KnowledgeWebsiteWorkspace } from "@/components/KnowledgeWebsiteWorkspace";
import { KnowledgeFaqWorkspace } from "@/components/KnowledgeFaqWorkspace";
import { useWebsiteImportCopy } from "@/hooks/useWebsiteImportCopy";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
export default function SmartAnalysis() {
  const c = useWebsiteImportCopy();
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{c.pageTitle}</h1>
        <p className="text-muted-foreground">{c.subtitle}</p>
      </header>
      <Tabs defaultValue="import">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="import">{c.general}</TabsTrigger>
          <TabsTrigger value="reports">{c.reports}</TabsTrigger>
          <TabsTrigger value="pages">{c.pages}</TabsTrigger>
          <TabsTrigger value="faqs">{c.faqs}</TabsTrigger>
        </TabsList>
        <TabsContent value="import">
          <WebsiteImportWorkspace />
        </TabsContent>
        <TabsContent value="reports">
          <WebsiteReportsWorkspace />
        </TabsContent>
        <TabsContent value="pages">
          <KnowledgeWebsiteWorkspace />
        </TabsContent>
        <TabsContent value="faqs">
          <KnowledgeFaqWorkspace />
        </TabsContent>
      </Tabs>
    </div>
  );
}
