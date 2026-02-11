---
description: خطة الحرب — Development team pipeline — mandatory workflow for ALL code tasks. Execute this BEFORE any code changes.
---

# خطة الحرب — Dev Team Pipeline

> **هذا الـ workflow يُنفذ تلقائياً قبل أي تعديل على الكود.**
> كل مهمة تمر بمراحل مدروسة حسب حجمها.

> [!CAUTION]
> **قاعدة ذهبية — لا يُسمح بأي commit بدون تنفيذ التحقق الإلزامي (Phase 5).**
> أي تعديل فرونت إند يجب فحصه بـ `pnpm run build`.
> أي تعديل على السيرفر يجب التحقق من بناء الـ server bundle.
> **هذا غير قابل للتفاوض.**

// turbo-all

## Phase 0: System Orientation (إلزامي دائماً)

1. Check relevant Knowledge Items if the task touches a known subsystem
2. Review existing workflows in `.agent/workflows/`
3. Understand the task context from user screenshots/descriptions

---

## Phase 1: 🎯 Tech Lead — Triage

Analyze the task and determine:

1. **Task Size**:
   - **S (صغيرة)**: Single file, 1-5 lines changed (typo fix, color change, translation key)
   - **M (متوسطة)**: 1-3 files, moderate logic (bug fix, add field, modify query)
   - **L (كبيرة)**: 3+ files, new feature, schema change, refactoring

2. **Required Team** based on size:

| Size | Team | User Approval |
|------|------|---------------|
| S | Tech Lead only | ❌ Execute directly |
| M | Analyst → Dev → Tester | ⚡ Approve plan only |
| L | Analyst → UX (if UI) → Dev → Tester → Release | ✅ Approve design + plan |

3. **Write triage output** (in task.md or implementation_plan.md):
   - Task size: S/M/L
   - Files likely affected
   - DB tables/schema involved (verify against Drizzle schema files)
   - Required team members
   - Risk level

4. For **S tasks**: skip to Phase 4 (Dev) directly
5. For **M tasks**: proceed to Phase 2, then request plan approval via notify_user
6. For **L tasks**: proceed to Phase 2, then request design approval via notify_user

---

## Phase 2: 🔍 System Analyst — Impact Analysis

1. **Identify affected schema**:
   - Check Drizzle schema files in `server/schema/` or `shared/schema.ts`
   - Verify table names and column types
   - Check relations and foreign keys
   - Document in implementation_plan.md

2. **Cross-reference tRPC routers**:
   - Identify affected routers in `server/routers*.ts`
   - Check shared types and Zod schemas
   - Map data flow: Router → DB query → Frontend component

3. **Identify risk zones**:
   - Are there orphaned records possible?
   - Are there N+1 query risks?
   - Does this affect middleware or auth flow?
   - Does this touch shared state (tRPC cache, React context)?

4. **Output**: Update implementation_plan.md with:
   - Schema → Table mapping
   - Router → Component chain
   - Risk assessment
   - Affected files list

---

## Phase 3: 🎨 UX Reviewer (only if task touches React frontend)

1. **Check existing components**:
   - Browse `client/src/components/` for reusable components
   - Do NOT create new components if equivalents exist
   - Check shadcn/ui components in `client/src/components/ui/`

2. **Verify compliance**:
   - [ ] Uses shadcn/ui components (Button, Card, Dialog, etc.)
   - [ ] Uses `sonner` toast — `toast.success()` / `toast.error()` — NOT `toast({})`
   - [ ] All user-facing strings are in Arabic (primary) with proper formatting
   - [ ] Responsive layout with Tailwind classes
   - [ ] RTL compatible (space-x-reverse, proper text alignment)
   - [ ] Uses Sari green identity (`emerald-500/600`, `green-500/600`) — NOT purple/blue
   - [ ] Hover states and transitions for interactive elements

3. **Output**: UX notes in implementation_plan.md

---

## Phase 4: ⚙️ Developer — Implementation

### Pre-Code Checklist (MANDATORY):
- [ ] Verified all table/column names against Drizzle schema
- [ ] Verified tRPC router input Zod schemas
- [ ] Using Drizzle ORM only — NO raw SQL unless absolutely necessary
- [ ] Router procedures wrapped in proper error handling

### During Coding:
1. Use Drizzle ORM query builder for all DB operations
2. Use proper Zod validation on tRPC inputs
3. Use React hooks patterns (useCallback, useMemo where appropriate)
4. Keep routers focused — one domain per router file
5. Use TypeScript strict types — avoid `any`
6. Follow existing patterns in the codebase

### Post-Code:
1. Review diff before committing
2. Ensure no regressions in related features

---

## Phase 5: 🧪 QA Tester — Quality Assurance (إلزامي — بدون استثناء)

> [!CAUTION]
> **هذه المرحلة إلزامية لكل المهام (S, M, L). لا يوجد استثناء.**
> عدم تنفيذها = خطأ في الإنتاج.

### 5.1 — Frontend Build Verification (إذا تم تعديل ملفات React/TSX):
// turbo
```bash
pnpm run build
```
**يجب أن ينتهي بنجاح بدون أخطاء. warnings مقبولة.**

### 5.2 — TypeScript Check (إذا تم تعديل ملفات .ts/.tsx):
- Verify no TypeScript errors in modified files
- Check that all imports resolve correctly

### 5.3 — Visual Verification (إذا تم تعديل UI):
- Use browser tool to verify the change visually
- Take screenshots for the walkthrough

---

## Phase 6: 📦 Release Manager — Commit & Deploy

1. **تأكد أن Phase 5 اكتملت بنجاح** — لا تتجاوزها أبداً
2. Write clear commit message:
   - `fix:` for bug fixes
   - `feat:` for new features
   - `refactor:` for code improvements
   - `chore:` for maintenance
// turbo
3. Commit and push:
```bash
git add -A && git commit -m "<type>: <message>" && git push origin main
```
4. Provide deploy command to user:
```bash
cd /var/www/sari && git pull origin main && pnpm run build && pm2 restart sari
```
