import { useEffect, useRef, useState } from "react";
import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { WorkspaceState } from "@/components/merchant/WorkspaceState";
import { quickResponseKeywords } from "@shared/quick-response";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Edit,
  Trash2,
  MessageSquare,
  TrendingUp,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

export default function QuickResponses() {
  return (
    <KnowledgeWorkspaceScope slot="quick-responses">
      {key => <QuickResponseWorkspace key={key} />}
    </KnowledgeWorkspaceScope>
  );
}
function QuickResponseWorkspace() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const merchant = trpc.merchants.getCurrent.useQuery();
  const workspace = trpc.quickResponses.workspace.useQuery(undefined, {
    refetchOnMount: "always",
    staleTime: 0,
  });
  const inScope = workspace.data?.merchantId === merchant.data?.id;
  const responses = inScope ? workspace.data?.rows : undefined;
  const stats = inScope ? workspace.data : undefined;
  const isLoading = workspace.isLoading || !inScope;
  const canManage = !!stats?.canManage && !workspace.isError;
  const [createRevision, setCreateRevision] = useState("");
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const alive = useRef(true),
    locked = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const createMutation = trpc.quickResponses.create.useMutation();
  const updateMutation = trpc.quickResponses.update.useMutation();
  const deleteMutation = trpc.quickResponses.delete.useMutation();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingResponse, setEditingResponse] = useState<any>(null);

  const [formData, setFormData] = useState({
    trigger: "",
    response: "",
    keywords: "",
    priority: 5,
  });

  const resetForm = () => {
    setFormData({
      trigger: "",
      response: "",
      keywords: "",
      priority: 5,
    });
  };

  const handleCreate = async () => {
    if (!canManage || locked.current || !createRevision) return;
    locked.current = true;
    setBusy(true);
    setFailure("");
    try {
      await createMutation.mutateAsync({
        ...formData,
        expectedRevision: createRevision,
      });
      if (!alive.current) return;
      toast.success(t("quickResponsesPage.text0"));
      setIsCreateOpen(false);
      resetForm();
      void utils.quickResponses.invalidate();
    } catch (error) {
      if (alive.current)
        setFailure(
          t(
            (error as any)?.data?.code === "CONFLICT"
              ? "quickResponsesUx.conflict"
              : "quickResponsesUx.failed"
          )
        );
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const handleEdit = async () => {
    if (!editingResponse || !canManage || locked.current) return;
    locked.current = true;
    setBusy(true);
    setFailure("");

    try {
      await updateMutation.mutateAsync({
        id: editingResponse.id,
        expectedRevision: editingResponse.revision,
        ...formData,
      });
      if (!alive.current) return;
      toast.success(t("quickResponsesPage.text2"));
      setIsEditOpen(false);
      setEditingResponse(null);
      resetForm();
      void utils.quickResponses.invalidate();
    } catch (error) {
      if (alive.current)
        setFailure(
          t(
            (error as any)?.data?.code === "CONFLICT"
              ? "quickResponsesUx.conflict"
              : "quickResponsesUx.failed"
          )
        );
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!canManage || locked.current) return;
    const selected = responses?.find(row => row.id === id);
    if (!selected) return;
    if (!confirm(t("quickResponsesUx.confirmDelete"))) return;
    locked.current = true;
    setBusy(true);
    setFailure("");

    try {
      await deleteMutation.mutateAsync({
        id,
        expectedRevision: selected.revision,
      });
      if (!alive.current) return;
      toast.success(t("quickResponsesPage.text4"));
      void utils.quickResponses.invalidate();
    } catch (error) {
      if (alive.current)
        setFailure(
          t(
            (error as any)?.data?.code === "PRECONDITION_FAILED"
              ? "quickResponsesUx.experimentReference"
              : (error as any)?.data?.code === "CONFLICT"
                ? "quickResponsesUx.conflict"
                : "quickResponsesUx.failed"
          )
        );
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    if (!canManage || locked.current) return;
    const selected = responses?.find(row => row.id === id);
    if (!selected) return;
    locked.current = true;
    setBusy(true);
    setFailure("");
    try {
      await updateMutation.mutateAsync({
        id,
        expectedRevision: selected.revision,
        isActive: !isActive,
      });
      if (!alive.current) return;
      toast.success(
        isActive
          ? t("quickResponsesPage.text34")
          : t("quickResponsesPage.text35")
      );
      void utils.quickResponses.invalidate();
    } catch (error) {
      if (alive.current)
        setFailure(
          t(
            (error as any)?.data?.code === "CONFLICT"
              ? "quickResponsesUx.conflict"
              : "quickResponsesUx.failed"
          )
        );
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const openEditDialog = (response: any) => {
    if (!canManage || locked.current) return;
    setFailure("");
    setEditingResponse(response);
    setFormData({
      trigger: response.trigger,
      response: response.response,
      keywords: quickResponseKeywords(response.keywords).join("، "),
      priority: response.priority ?? 5,
    });
    setIsEditOpen(true);
  };

  if (workspace.isError)
    return (
      <WorkspaceState kind="error" onRetry={() => void workspace.refetch()} />
    );
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {!canManage && (
        <p role="note" className="mb-4 rounded-xl border p-4">
          {t("virtualTeamReview.readOnly")}
        </p>
      )}
      {failure && (
        <p role="alert" className="mb-4 rounded-xl border p-4 text-destructive">
          {failure}
        </p>
      )}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MessageSquare className="h-8 w-8 text-primary" />
            {t("quickResponsesPage.text36")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t("quickResponsesPage.text37")}
          </p>
        </div>

        <Dialog
          open={isCreateOpen}
          onOpenChange={open => {
            if (!locked.current) setIsCreateOpen(open);
          }}
        >
          <DialogTrigger asChild>
            <Button
              disabled={!canManage || busy}
              onClick={() => {
                resetForm();
                setFailure("");
                setCreateRevision(stats?.revision || "");
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("quickResponsesPage.text38")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("quickResponsesPage.text7")}</DialogTitle>
              <DialogDescription>
                {t("quickResponsesPage.text39")}
              </DialogDescription>
            </DialogHeader>
            {failure && (
              <p role="alert" className="text-sm text-destructive">
                {failure}
              </p>
            )}

            <fieldset
              disabled={!canManage || busy}
              className="min-w-0 grid gap-4 py-4"
            >
              <div className="grid gap-2">
                <Label htmlFor="trigger">{t("quickResponsesPage.text8")}</Label>
                <Input
                  id="trigger"
                  value={formData.trigger}
                  onChange={e =>
                    setFormData({ ...formData, trigger: e.target.value })
                  }
                  placeholder={t("quickResponsesPage.text9")}
                />
                <p className="text-sm text-muted-foreground">
                  {t("quickResponsesPage.text40")}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="response">
                  {t("quickResponsesPage.text10")}
                </Label>
                <Textarea
                  id="response"
                  value={formData.response}
                  onChange={e =>
                    setFormData({ ...formData, response: e.target.value })
                  }
                  placeholder={t("quickResponsesPage.text11")}
                  rows={4}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="keywords">
                  {t("quickResponsesPage.text12")}
                </Label>
                <Input
                  id="keywords"
                  value={formData.keywords}
                  onChange={e =>
                    setFormData({ ...formData, keywords: e.target.value })
                  }
                  placeholder={t("quickResponsesPage.text13")}
                />
                <p className="text-sm text-muted-foreground">
                  {t("quickResponsesPage.text41")}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="priority">
                  {t("quickResponsesPage.text14")}
                </Label>
                <Input
                  id="priority"
                  type="number"
                  min="0"
                  max="10"
                  value={formData.priority}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      priority:
                        e.target.value === "" ? NaN : Number(e.target.value),
                    })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  {t("quickResponsesPage.text42")}
                </p>
              </div>
            </fieldset>

            <DialogFooter>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
              >
                {t("quickResponsesPage.text43")}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={
                  !canManage ||
                  busy ||
                  !formData.trigger.trim() ||
                  !formData.response.trim() ||
                  !Number.isInteger(formData.priority) ||
                  formData.priority < 0 ||
                  formData.priority > 10
                }
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("quickResponsesPage.text44")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("quickResponsesPage.text15")}
              </CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("quickResponsesPage.text16")}
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.active}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("quickResponsesPage.text17")}
              </CardTitle>
              <ToggleLeft className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">
                {stats.inactive}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Responses Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("quickResponsesPage.text18")}</CardTitle>
          <CardDescription>{t("quickResponsesPage.text45")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!responses || responses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>{t("quickResponsesPage.text19")}</p>
              <p className="text-sm mt-2">{t("quickResponsesPage.text20")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("quickResponsesPage.text21")}</TableHead>
                  <TableHead>{t("quickResponsesPage.text22")}</TableHead>
                  <TableHead>{t("quickResponsesPage.text23")}</TableHead>
                  <TableHead>{t("quickResponsesPage.text24")}</TableHead>
                  <TableHead>{t("quickResponsesPage.text25")}</TableHead>
                  <TableHead className="text-left">
                    {t("quickResponsesPage.text26")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {responses.map(response => (
                  <TableRow key={response.id}>
                    <TableCell className="font-medium">
                      {response.trigger}
                    </TableCell>
                    <TableCell className="max-w-md truncate">
                      {response.response}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          response.priority >= 7 ? "default" : "secondary"
                        }
                      >
                        {response.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t("quickResponsesPage.text49", {
                        var0: response.useCount,
                      })}
                    </TableCell>
                    <TableCell>
                      {response.isActive ? (
                        <Badge className="bg-green-600">
                          {t("quickResponsesPage.text27")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          {t("quickResponsesPage.text28")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-left">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!canManage || busy}
                          onClick={() =>
                            handleToggleActive(response.id, !!response.isActive)
                          }
                          aria-label={t(
                            response.isActive
                              ? "merchantUx.actions.deactivateNamed"
                              : "merchantUx.actions.activateNamed",
                            { name: response.trigger }
                          )}
                        >
                          {response.isActive ? (
                            <ToggleLeft className="h-4 w-4" />
                          ) : (
                            <ToggleRight className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!canManage || busy}
                          onClick={() => openEditDialog(response)}
                          aria-label={t("merchantUx.actions.editNamed", {
                            name: response.trigger,
                          })}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!canManage || busy}
                          onClick={() => handleDelete(response.id)}
                          aria-label={t("merchantUx.actions.deleteNamed", {
                            name: response.trigger,
                          })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        open={isEditOpen}
        onOpenChange={open => {
          if (!locked.current) setIsEditOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("quickResponsesPage.text29")}</DialogTitle>
            <DialogDescription>
              {t("quickResponsesPage.text46")}
            </DialogDescription>
          </DialogHeader>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}

          <fieldset
            disabled={!canManage || busy}
            className="min-w-0 grid gap-4 py-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="edit-trigger">
                {t("quickResponsesPage.text30")}
              </Label>
              <Input
                id="edit-trigger"
                value={formData.trigger}
                onChange={e =>
                  setFormData({ ...formData, trigger: e.target.value })
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-response">
                {t("quickResponsesPage.text31")}
              </Label>
              <Textarea
                id="edit-response"
                value={formData.response}
                onChange={e =>
                  setFormData({ ...formData, response: e.target.value })
                }
                rows={4}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-keywords">
                {t("quickResponsesPage.text32")}
              </Label>
              <Input
                id="edit-keywords"
                value={formData.keywords}
                onChange={e =>
                  setFormData({ ...formData, keywords: e.target.value })
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-priority">
                {t("quickResponsesPage.text33")}
              </Label>
              <Input
                id="edit-priority"
                type="number"
                min="0"
                max="10"
                value={formData.priority}
                onChange={e =>
                  setFormData({
                    ...formData,
                    priority:
                      e.target.value === "" ? NaN : Number(e.target.value),
                  })
                }
              />
            </div>
          </fieldset>

          <DialogFooter>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => setIsEditOpen(false)}
            >
              {t("quickResponsesPage.text47")}
            </Button>
            <Button
              onClick={handleEdit}
              disabled={
                !canManage ||
                busy ||
                !formData.trigger.trim() ||
                !formData.response.trim() ||
                !Number.isInteger(formData.priority) ||
                formData.priority < 0 ||
                formData.priority > 10
              }
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("quickResponsesPage.text48")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
