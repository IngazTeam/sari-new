/**
 * Knowledge Engine — AI Classification & Evolution Pipeline
 * 
 * Three core functions:
 * 1. classifyContent() — Raw text → Hierarchical sections
 * 2. analyzeSalesIntelligence() — Sections → Sales insights + opportunities
 * 3. evolveKnowledge() — Old + New → Best version (never replace, always evolve)
 * 
 * Uses GPT-4o for analysis. Cost: ~$0.06 per full analysis cycle.
 */

import { callGPT4 } from './openai';
import type { ChatMessage } from './openai';
import {
  createSection,
  updateSection,
  logChange,
  getSectionsByMerchantId,
  type InsertKnowledgeSection,
  type KnowledgeSection,
  type SectionType,
  type SectionSource,
} from '../db/knowledge';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ClassifiedSection {
  sectionType: SectionType;
  title: string;
  content: string;
  summary: string;
  confidence: number;
  children?: ClassifiedSection[];
}

export interface SalesIntelligence {
  usps: string[];           // Unique Selling Points — نقاط القوة
  sellingTips: string[];    // إرشادات البيع للبوت (inject_as: 'behavior')
  opportunities: string[];  // فرص التطوير (inject_as: 'none' — للتاجر فقط)
}

export interface EvolveResult {
  added: number;
  merged: number;
  evolved: number;
  conflicts: number;
  unchanged: number;
}

// ═══════════════════════════════════════════════════════════════
// 1. classifyContent — Raw text → Structured sections
// ═══════════════════════════════════════════════════════════════

/**
 * Takes raw text (from website scrape, document, etc.) and classifies it
 * into hierarchical knowledge sections using GPT-4o.
 */
export async function classifyContent(
  rawText: string,
  merchantContext: { businessName?: string; industry?: string }
): Promise<ClassifiedSection[]> {
  // Truncate very long content to stay within token limits (~100K chars ≈ 25K tokens)
  const content = rawText.substring(0, 100000);

  const systemPrompt = `أنت محلل محتوى خبير. مهمتك تحليل نص خام واستخراج أقسام معرفية مهيكلة.

لكل قسم حدد:
- sectionType: أحد القيم التالية بالضبط: identity, services, policies, faq, contact, team, achievements, custom
- title: عنوان وصفي بالعربية
- content: المحتوى الكامل
- summary: ملخص في جملة واحدة
- confidence: نسبة الثقة (0.50-1.00)
- children: أقسام فرعية إن وُجدت

قواعد مهمة:
1. لا تخترع معلومات — استخرج فقط ما هو موجود في النص
2. اجمع المعلومات المتشابهة في قسم واحد
3. إذا وجدت خدمات/منتجات متعددة، ضعها كـ children تحت services
4. إذا وجدت أسئلة وأجوبة، صنفها كـ faq
5. معلومات التواصل (هاتف، إيميل، عنوان، خريطة) في contact
6. أجب بـ JSON فقط — بدون markdown أو شرح`;

  const userPrompt = `اسم النشاط: ${merchantContext.businessName || 'غير محدد'}
المجال: ${merchantContext.industry || 'غير محدد'}

المحتوى المطلوب تحليله:
---
${content}
---

أرجع مصفوفة JSON بالأقسام المستخرجة. مثال:
[
  {
    "sectionType": "identity",
    "title": "عن الشركة",
    "content": "...",
    "summary": "...",
    "confidence": 0.95,
    "children": []
  }
]`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    console.log(`[KnowledgeEngine] classifyContent: sending ${content.length} chars to GPT-4o...`);
    const response = await callGPT4(messages, {
      model: 'gpt-4o',
      temperature: 0.3,  // Low temp for consistency
      maxTokens: 4000,
    });

    console.log(`[KnowledgeEngine] classifyContent: GPT response length=${response.length}, first 200 chars: ${response.substring(0, 200)}`);

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = response
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    // Handle case where GPT wraps in extra text
    const jsonStart = jsonStr.indexOf('[');
    const jsonEnd = jsonStr.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonStart < jsonEnd) {
      jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
    }

    const sections: ClassifiedSection[] = JSON.parse(jsonStr);
    console.log(`[KnowledgeEngine] classifyContent: parsed ${sections.length} sections: ${sections.map(s => `${s.sectionType}:"${s.title}"`).join(', ')}`);

    // Validate section types
    const validTypes: SectionType[] = [
      'identity', 'services', 'policies', 'faq', 'contact',
      'team', 'achievements', 'sales_intel', 'opportunities', 'custom',
    ];

    const filtered = sections.filter(s => validTypes.includes(s.sectionType));
    console.log(`[KnowledgeEngine] classifyContent: ${filtered.length} sections passed validation (of ${sections.length})`);
    return filtered;
  } catch (e: any) {
    console.error(`[KnowledgeEngine] classifyContent FAILED: ${e.message}`);
    console.error(`[KnowledgeEngine] Stack: ${e.stack?.substring(0, 300)}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. analyzeSalesIntelligence — Sections → Sales insights
// ═══════════════════════════════════════════════════════════════

/**
 * Analyzes classified sections to extract sales intelligence:
 * - USPs (inject_as: 'fact') — what makes this business special
 * - Selling Tips (inject_as: 'behavior') — how the bot should sell
 * - Opportunities (inject_as: 'none') — suggestions for the merchant only
 */
export async function analyzeSalesIntelligence(
  sections: ClassifiedSection[],
  merchantContext: { businessName?: string; industry?: string }
): Promise<SalesIntelligence> {
  const sectionsText = sections
    .map(s => `[${s.sectionType}] ${s.title}: ${s.summary || s.content.substring(0, 300)}`)
    .join('\n');

  const systemPrompt = `أنت مستشار مبيعات خبير. حلل معلومات هذا النشاط التجاري واستخرج:

1. usps (نقاط القوة الفريدة): ما يميز هذا النشاط عن المنافسين — حقائق قوية يستخدمها البوت في الإقناع
2. sellingTips (إرشادات البيع): تعليمات محددة للبوت — كيف يبيع، متى يقترح، أي منتج يُبرز أولاً
3. opportunities (فرص التطوير): نقاط ضعف أو فرص ضائعة — للتاجر فقط وليس للعميل

قواعد:
- كل عنصر جملة واحدة واضحة
- usps: 3-5 نقاط
- sellingTips: 3-5 نصائح
- opportunities: 2-4 فرص
- أجب بـ JSON فقط`;

  const userPrompt = `النشاط: ${merchantContext.businessName || 'غير محدد'} — ${merchantContext.industry || 'عام'}

الأقسام المحللة:
${sectionsText}

أرجع JSON:
{
  "usps": ["..."],
  "sellingTips": ["..."],
  "opportunities": ["..."]
}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const response = await callGPT4(messages, {
      model: 'gpt-4o',
      temperature: 0.4,
      maxTokens: 1500,
    });

    const jsonStr = response
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    return JSON.parse(jsonStr);
  } catch (e: any) {
    console.error('[KnowledgeEngine] analyzeSalesIntelligence failed:', e.message);
    return { usps: [], sellingTips: [], opportunities: [] };
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. evolveKnowledge — Merge new content without losing existing
// ═══════════════════════════════════════════════════════════════

/**
 * The core evolution algorithm:
 * 1. Compares new classified sections against existing knowledge
 * 2. Decides for each: ADD / MERGE / EVOLVE / CONFLICT
 * 3. Never touches merchant_edited sections
 * 4. Logs every change to changelog
 * 5. Conflicts → pending_review (bot keeps old data until merchant approves)
 */
export async function evolveKnowledge(
  merchantId: number,
  newSections: ClassifiedSection[],
  source: SectionSource,
  sourceUrl?: string
): Promise<EvolveResult> {
  const result: EvolveResult = { added: 0, merged: 0, evolved: 0, conflicts: 0, unchanged: 0 };

  // Get existing sections (full content for comparison)
  const existingSections = await getSectionsByMerchantId(merchantId);

  for (const newSection of newSections) {
    // Find matching existing section by type + similarity
    const match = findBestMatch(newSection, existingSections);

    if (!match) {
      // === ADD: Brand new section ===
      const sectionId = await createSection({
        merchantId,
        sectionType: newSection.sectionType,
        title: newSection.title,
        content: newSection.content,
        summary: newSection.summary,
        source,
        sourceUrl,
        confidence: newSection.confidence,
        status: 'auto_approved',
        useInBot: true,
        injectAs: newSection.sectionType === 'opportunities' ? 'none' : 'fact',
      });

      await logChange({
        merchantId,
        sectionId,
        action: 'add',
        reason: `قسم جديد مكتشف: ${newSection.title}`,
        newContent: newSection.content,
        source,
      });

      result.added++;

      // Handle children
      if (newSection.children?.length) {
        for (const child of newSection.children) {
          const childId = await createSection({
            merchantId,
            parentId: sectionId,
            sectionType: newSection.sectionType,
            title: child.title,
            content: child.content,
            summary: child.summary,
            source,
            sourceUrl,
            confidence: child.confidence,
            injectAs: 'fact',
          });

          await logChange({
            merchantId,
            sectionId: childId,
            action: 'add',
            reason: `قسم فرعي جديد: ${child.title} تحت ${newSection.title}`,
            newContent: child.content,
            source,
          });

          result.added++;
        }
      }
    } else if ((match as any).merchant_edited || (match as any).merchantEdited) {
      // === PROTECTED: Merchant edited — don't touch ===
      result.unchanged++;
    } else {
      // Compare content to decide: EVOLVE or CONFLICT
      const decision = await decideEvolution(match, newSection);

      if (decision === 'unchanged') {
        result.unchanged++;
      } else if (decision === 'evolve') {
        // === EVOLVE: New content is better/newer — auto-update ===
        await logChange({
          merchantId,
          sectionId: match.id,
          action: 'evolve',
          reason: `تطوير: ${newSection.title}`,
          oldContent: match.content,
          newContent: newSection.content,
          source,
        });

        await updateSection(match.id, merchantId, {
          content: newSection.content,
          summary: newSection.summary,
          confidence: newSection.confidence,
          source,
          sourceUrl,
        });

        result.evolved++;
      } else if (decision === 'conflict') {
        // === CONFLICT: Contradictory info — needs merchant review ===
        const conflictId = await createSection({
          merchantId,
          sectionType: newSection.sectionType,
          title: `⚠️ تعارض: ${newSection.title}`,
          content: newSection.content,
          summary: newSection.summary,
          source,
          sourceUrl,
          confidence: newSection.confidence,
          status: 'pending_review',
          useInBot: false,  // Bot keeps old data
        });

        await logChange({
          merchantId,
          sectionId: conflictId,
          action: 'conflict',
          reason: `تعارض في "${newSection.title}" — القيمة القديمة: ${match.content.substring(0, 200)}`,
          oldContent: match.content,
          newContent: newSection.content,
          source,
        });

        result.conflicts++;
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Helper: Find best matching existing section
// ═══════════════════════════════════════════════════════════════

function findBestMatch(
  newSection: ClassifiedSection,
  existingSections: KnowledgeSection[]
): KnowledgeSection | null {
  // First: exact type match
  const sameType = existingSections.filter(
    e => (e as any).section_type === newSection.sectionType || e.sectionType === newSection.sectionType
  );

  if (sameType.length === 0) return null;
  if (sameType.length === 1) {
    // GAP-3 FIX: Even single match must pass similarity threshold
    // Prevents merging unrelated FAQs/sections that happen to share a type
    const sim = textSimilarity(sameType[0].content, newSection.content);
    return sim > 0.2 ? sameType[0] : null;
  }

  // Multiple same-type sections: compare titles first
  const titleLower = newSection.title.toLowerCase();
  const titleMatch = sameType.find(e => {
    const existingTitle = (e.title || '').toLowerCase();
    return existingTitle === titleLower ||
      existingTitle.includes(titleLower) ||
      titleLower.includes(existingTitle);
  });

  if (titleMatch) return titleMatch;

  // No title match — use content similarity to find best match (P1-4 FIX)
  // Prevents blind sameType[0] from merging unrelated sections
  let bestMatch = sameType[0];
  let bestSim = 0;
  for (const s of sameType) {
    const sim = textSimilarity(s.content, newSection.content);
    if (sim > bestSim) {
      bestSim = sim;
      bestMatch = s;
    }
  }
  // Only return match if there's meaningful overlap (>20%)
  return bestSim > 0.2 ? bestMatch : null;
}

// ═══════════════════════════════════════════════════════════════
// Helper: Decide evolution strategy using GPT-4o
// ═══════════════════════════════════════════════════════════════

async function decideEvolution(
  existing: KnowledgeSection,
  newSection: ClassifiedSection
): Promise<'unchanged' | 'evolve' | 'conflict'> {
  // Quick check: if content is very similar, skip AI call
  const similarity = textSimilarity(existing.content, newSection.content);
  if (similarity > 0.90) return 'unchanged';

  const systemPrompt = `أنت محلل بيانات. قارن بين نسختين من معلومات تجارية وحدد العلاقة بينهما.

أجب بكلمة واحدة فقط:
- "unchanged" إذا المعلومات متطابقة أو متشابهة جداً
- "evolve" إذا النسخة الجديدة تضيف تفاصيل أو تحدّث معلومات بدون تناقض
- "conflict" إذا هناك تناقض واضح (مثلاً سعر مختلف، معلومة متعارضة)`;

  const userPrompt = `النسخة الحالية:
"${existing.content.substring(0, 1000)}"

النسخة الجديدة:
"${newSection.content.substring(0, 1000)}"

أجب بكلمة واحدة: unchanged أو evolve أو conflict`;

  try {
    const response = await callGPT4(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model: 'gpt-4o', temperature: 0.1, maxTokens: 10 }
    );

    const decision = response.trim().toLowerCase();
    if (['unchanged', 'evolve', 'conflict'].includes(decision)) {
      return decision as 'unchanged' | 'evolve' | 'conflict';
    }
    return 'unchanged'; // Default: preserve existing knowledge (safer than evolve)
  } catch {
    return 'unchanged'; // On AI failure, preserve existing (P1-5 FIX: was 'evolve')
  }
}

// ═══════════════════════════════════════════════════════════════
// Helper: Simple text similarity (Jaccard on words)
// ═══════════════════════════════════════════════════════════════

function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  Array.from(wordsA).forEach(word => {
    if (wordsB.has(word)) intersection++;
  });

  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ═══════════════════════════════════════════════════════════════
// Full Pipeline: Ingest → Classify → Analyze → Evolve
// ═══════════════════════════════════════════════════════════════

/**
 * Complete ingestion pipeline:
 * 1. Classify raw content into sections
 * 2. Analyze sales intelligence
 * 3. Evolve existing knowledge with new sections
 * 4. Save sales intel as special sections
 */
export async function ingestContent(
  merchantId: number,
  rawContent: string,
  source: SectionSource,
  merchantContext: { businessName?: string; industry?: string },
  sourceUrl?: string
): Promise<{ evolveResult: EvolveResult; salesIntel: SalesIntelligence }> {
  console.log(`[KnowledgeEngine] Starting ingestion for merchant ${merchantId} from ${source}`);

  // Step 1: Classify content
  console.log(`[KnowledgeEngine] Raw content preview (first 500 chars): ${rawContent.substring(0, 500)}`);
  const classifiedSections = await classifyContent(rawContent, merchantContext);
  console.log(`[KnowledgeEngine] Classified ${classifiedSections.length} sections`);
  if (classifiedSections.length === 0) {
    console.error(`[KnowledgeEngine] ⚠️ ZERO SECTIONS — GPT may have failed to parse or classify the content. Content length was ${rawContent.length} chars.`);
  }

  if (classifiedSections.length === 0) {
    return {
      evolveResult: { added: 0, merged: 0, evolved: 0, conflicts: 0, unchanged: 0 },
      salesIntel: { usps: [], sellingTips: [], opportunities: [] },
    };
  }

  // Step 2: Analyze sales intelligence
  const salesIntel = await analyzeSalesIntelligence(classifiedSections, merchantContext);
  console.log(`[KnowledgeEngine] Sales intel: ${salesIntel.usps.length} USPs, ${salesIntel.sellingTips.length} tips, ${salesIntel.opportunities.length} opportunities`);

  // Step 3: Evolve knowledge (merge with existing)
  const evolveResult = await evolveKnowledge(merchantId, classifiedSections, source, sourceUrl);
  console.log(`[KnowledgeEngine] Evolution: +${evolveResult.added} added, ↗${evolveResult.evolved} evolved, ⚠${evolveResult.conflicts} conflicts`);

  // Step 4: Save sales intelligence as special sections
  if (salesIntel.usps.length > 0 || salesIntel.sellingTips.length > 0) {
    const existingSections = await getSectionsByMerchantId(merchantId);
    const existingIntel = existingSections.find(
      s => (s as any).section_type === 'sales_intel' || s.sectionType === 'sales_intel'
    );

    const intelContent = [
      salesIntel.usps.length > 0 ? `نقاط القوة:\n${salesIntel.usps.map(u => `• ${u}`).join('\n')}` : '',
      salesIntel.sellingTips.length > 0 ? `\nإرشادات البيع:\n${salesIntel.sellingTips.map(t => `• ${t}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    if (existingIntel && !((existingIntel as any).merchant_edited || existingIntel.merchantEdited)) {
      // Update existing sales intel
      await updateSection(existingIntel.id, merchantId, {
        content: intelContent,
        summary: `${salesIntel.usps.length} نقاط قوة، ${salesIntel.sellingTips.length} إرشادات بيع`,
      });
    } else if (!existingIntel) {
      // Create new sales intel section
      await createSection({
        merchantId,
        sectionType: 'sales_intel',
        title: 'ذكاء المبيعات',
        content: intelContent,
        summary: `${salesIntel.usps.length} نقاط قوة، ${salesIntel.sellingTips.length} إرشادات بيع`,
        source: 'ai_evolved',
        injectAs: 'behavior',
      });
    }
  }

  // Save opportunities (merchant-only, not for bot)
  if (salesIntel.opportunities.length > 0) {
    const existingSections = await getSectionsByMerchantId(merchantId);
    const existingOpps = existingSections.find(
      s => (s as any).section_type === 'opportunities' || s.sectionType === 'opportunities'
    );

    const oppsContent = salesIntel.opportunities.map(o => `• ${o}`).join('\n');

    if (existingOpps && !((existingOpps as any).merchant_edited || existingOpps.merchantEdited)) {
      await updateSection(existingOpps.id, merchantId, { content: oppsContent });
    } else if (!existingOpps) {
      await createSection({
        merchantId,
        sectionType: 'opportunities',
        title: 'فرص التطوير',
        content: oppsContent,
        summary: `${salesIntel.opportunities.length} فرص تطوير`,
        source: 'ai_evolved',
        injectAs: 'none',  // Merchant-only, not sent to bot
        useInBot: false,
      });
    }
  }

  return { evolveResult, salesIntel };
}
