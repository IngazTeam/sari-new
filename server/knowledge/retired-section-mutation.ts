import { TRPCError } from "@trpc/server";

// Keep a deliberate error for old tabs/clients; never silently approve a legacy write.
export function retiredSectionMutation(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "حدّث لوحة التحكم ثم افتح أقسام المعرفة لمراجعة النسخة الحالية قبل الحفظ أو الحذف.",
  });
}
