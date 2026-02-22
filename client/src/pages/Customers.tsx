import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Users,
  UserCheck,
  UserPlus,
  Search,
  Phone,
  MessageSquare,
  ShoppingBag,
  Calendar,
  Tag,
  FileText,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from 'react-i18next';

export default function Customers() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newTag, setNewTag] = useState("");

  // Fetch customers
  const { data: customers = [], isLoading } = trpc.customers.list.useQuery({
    search: searchQuery,
  });

  // Fetch stats
  const { data: stats } = trpc.customers.getStats.useQuery();

  // Add note mutation
  const addNoteMutation = trpc.customers.addNote.useMutation({
    onSuccess: () => {
      toast({
        title: "تم إضافة الملاحظة",
        description: "تم حفظ الملاحظة بنجاح",
      });
      setNewNote("");
      // Refetch customer details
      if (selectedCustomer) {
        refetchCustomerDetails();
      }
    },
  });

  // Add tag mutation
  const addTagMutation = trpc.customers.addTag.useMutation({
    onSuccess: () => {
      toast({
        title: "تم إضافة التصنيف",
        description: "تم إضافة التصنيف بنجاح",
      });
      setNewTag("");
      if (selectedCustomer) {
        refetchCustomerDetails();
      }
    },
  });

  // Remove tag mutation
  const removeTagMutation = trpc.customers.removeTag.useMutation({
    onSuccess: () => {
      toast({
        title: "تم إزالة التصنيف",
        description: "تم إزالة التصنيف بنجاح",
      });
      if (selectedCustomer) {
        refetchCustomerDetails();
      }
    },
  });

  const handleViewDetails = (customer: any) => {
    setSelectedCustomer(customer);
    setShowDetails(true);
  };

  const refetchCustomerDetails = () => {
    // This would refetch the customer details
    // For now, we'll just close and reopen
  };

  const handleAddNote = () => {
    if (!newNote.trim() || !selectedCustomer) return;
    addNoteMutation.mutate({
      customerId: selectedCustomer.id,
      note: newNote,
    });
  };

  const handleAddTag = () => {
    if (!newTag.trim() || !selectedCustomer) return;
    addTagMutation.mutate({
      customerId: selectedCustomer.id,
      tag: newTag,
    });
  };

  const handleRemoveTag = (tag: string) => {
    if (!selectedCustomer) return;
    removeTagMutation.mutate({
      customerId: selectedCustomer.id,
      tag,
    });
  };

  const handleExport = () => {
    toast({
      title: "جاري التصدير",
      description: "سيتم تحميل ملف CSV قريباً",
    });
    // TODO: Implement CSV export
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('customersPage.text0')}</h1>
          <p className="text-muted-foreground mt-1">
            عرض وإدارة جميع عملائك
          </p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="ml-2 h-4 w-4" />
          تصدير CSV
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('customersPage.text1')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              جميع العملاء المسجلين
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('customersPage.text2')}</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.active || 0}</div>
            <p className="text-xs text-muted-foreground">
              تفاعلوا خلال آخر 30 يوم
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('customersPage.text3')}</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.newThisMonth || 0}</div>
            <p className="text-xs text-muted-foreground">{t('customersPage.text4')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('customersPage.text5')}</CardTitle>
          <CardDescription>{t('customersPage.text6')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('customersPage.text7')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
          </div>

          {/* Customers Table */}
          {isLoading ? (
            <div className="text-center py-8">{t('customersPage.text8')}</div>
          ) : customers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا يوجد عملاء
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('customersPage.text9')}</TableHead>
                    <TableHead>{t('customersPage.text10')}</TableHead>
                    <TableHead>{t('customersPage.text11')}</TableHead>
                    <TableHead>{t('customersPage.text12')}</TableHead>
                    <TableHead>{t('customersPage.text13')}</TableHead>
                    <TableHead>{t('customersPage.text14')}</TableHead>
                    <TableHead>{t('customersPage.text15')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer: any) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">
                        {customer.name || "غير محدد"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {customer.phone}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          {customer.conversationCount || 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                          {customer.orderCount || 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        {customer.lastInteraction
                          ? new Date(customer.lastInteraction).toLocaleDateString(
                              "ar-SA"
                            )
                          : "لا يوجد"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            customer.status === "active"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {customer.status === "active" ? "نشط" : "غير نشط"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(customer)}
                        >
                          عرض التفاصيل
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('customersPage.text16')}</DialogTitle>
            <DialogDescription>
              معلومات شاملة عن العميل وتفاعلاته
            </DialogDescription>
          </DialogHeader>

          {selectedCustomer && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="info">{t('customersPage.text17')}</TabsTrigger>
                <TabsTrigger value="conversations">{t('customersPage.text18')}</TabsTrigger>
                <TabsTrigger value="orders">{t('customersPage.text19')}</TabsTrigger>
                <TabsTrigger value="notes">{t('customersPage.text20')}</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('customersPage.text21')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>{t('customersPage.text22')}</Label>
                        <p className="text-sm font-medium">
                          {selectedCustomer.name || "غير محدد"}
                        </p>
                      </div>
                      <div>
                        <Label>{t('customersPage.text23')}</Label>
                        <p className="text-sm font-medium">
                          {selectedCustomer.phone}
                        </p>
                      </div>
                      <div>
                        <Label>{t('customersPage.text24')}</Label>
                        <p className="text-sm font-medium">
                          {selectedCustomer.email || "غير محدد"}
                        </p>
                      </div>
                      <div>
                        <Label>{t('customersPage.text25')}</Label>
                        <p className="text-sm font-medium">
                          {new Date(
                            selectedCustomer.createdAt
                          ).toLocaleDateString("ar-SA")}
                        </p>
                      </div>
                    </div>

                    <div>
                      <Label className="mb-2 block">{t('customersPage.text26')}</Label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {selectedCustomer.tags?.map((tag: string) => (
                          <Badge key={tag} variant="secondary">
                            <Tag className="ml-1 h-3 w-3" />
                            {tag}
                            <button
                              onClick={() => handleRemoveTag(tag)}
                              className="mr-1 hover:text-destructive"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder={t('customersPage.text27')}
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                        />
                        <Button onClick={handleAddTag} size="sm">
                          إضافة
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="conversations">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('customersPage.text28')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-center py-8">
                      سيتم عرض سجل المحادثات هنا
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="orders">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('customersPage.text29')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-center py-8">
                      سيتم عرض سجل الطلبات هنا
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notes" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('customersPage.text30')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t('customersPage.text31')}</Label>
                      <Textarea
                        placeholder={t('customersPage.text32')}
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                      />
                      <Button onClick={handleAddNote} size="sm">
                        <FileText className="ml-2 h-4 w-4" />
                        حفظ الملاحظة
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label>{t('customersPage.text33')}</Label>
                      {selectedCustomer.notes?.length > 0 ? (
                        selectedCustomer.notes.map((note: any, index: number) => (
                          <Card key={index}>
                            <CardContent className="pt-4">
                              <p className="text-sm">{note.content}</p>
                              <p className="text-xs text-muted-foreground mt-2">
                                {new Date(note.createdAt).toLocaleString("ar-SA")}
                              </p>
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-center py-4">
                          لا توجد ملاحظات
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
