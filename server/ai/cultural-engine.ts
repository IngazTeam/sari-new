/**
 * Cultural Intelligence Engine — Phase 4 of Adaptive Sales Engine
 * 
 * Auto-detects customer dialect from first messages and adapts:
 * - Greeting style
 * - Vocabulary
 * - Rapport building (أبو فلان for Gulf — only when child name is mentioned!)
 * - Formality level
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type Dialect = 'saudi' | 'egyptian' | 'gulf' | 'shami' | 'maghrebi' | 'english' | 'formal_arabic' | 'unknown';

export interface CulturalProfile {
  detectedDialect: Dialect;
  confidence: number;          // 0-100
  rapportLevel: 'cold' | 'warm' | 'friendly';
  preferredAddress: string;    // "محمد" / "أبو عبدالله" / "يا باشا"
  childName: string | null;    // ONLY if customer mentioned it
  culturalGreeting: string;    // "يا هلا" / "أهلاً بيك" / "Hi"
}

// ═══════════════════════════════════════════════════════════════
// Dialect Detection (keyword-based — no API call)
// ═══════════════════════════════════════════════════════════════

interface DialectPattern {
  dialect: Dialect;
  keywords: string[];
  weight: number; // Higher = stronger signal
}

const DIALECT_PATTERNS: DialectPattern[] = [
  // Saudi (Najdi + Hijazi)
  { dialect: 'saudi', keywords: ['ابغى', 'أبغى', 'وش', 'كذا', 'ايش', 'أيش', 'يابعد', 'حلو', 'ذا', 'ابي', 'أبي', 'كيذا', 'مره', 'زين', 'يالغالي', 'طيب'], weight: 2 },
  // Egyptian
  { dialect: 'egyptian', keywords: ['عايز', 'عاوز', 'ازاي', 'إزاي', 'كده', 'دي', 'دا', 'اللي', 'بتاع', 'يعني', 'طب', 'ماشي', 'جميل اوي', 'كويس', 'اه', 'ده'], weight: 2 },
  // Gulf (Kuwaiti, Emirati, Bahraini, Qatari)
  { dialect: 'gulf', keywords: ['شلونك', 'شلون', 'هلا', 'اشلون', 'زين', 'عيل', 'يالحبيب', 'خوش', 'اللحين', 'شنو', 'جي'], weight: 2 },
  // Shami (Levantine: Syrian, Lebanese, Jordanian, Palestinian)
  { dialect: 'shami', keywords: ['بدي', 'كيفك', 'هيك', 'هلق', 'شو', 'منيح', 'كتير', 'هلأ', 'يسلمو', 'اديش', 'ليش'], weight: 2 },
  // Maghrebi (Moroccan, Algerian, Tunisian, Libyan)
  { dialect: 'maghrebi', keywords: ['بغيت', 'واش', 'كيفاش', 'بزاف', 'ديال', 'هاد', 'لاباس', 'ياك', 'زعما'], weight: 2 },
  // English
  { dialect: 'english', keywords: ['want', 'need', 'how much', 'price', 'please', 'thank you', 'hello', 'can i', 'do you', 'is there'], weight: 2 },
  // Formal Arabic
  { dialect: 'formal_arabic', keywords: ['أريد', 'أرغب', 'هل يمكن', 'أود', 'من فضلك', 'شكراً جزيلاً', 'بإمكانكم', 'أستفسر', 'لو سمحت'], weight: 1 },
];

/**
 * Detect dialect from message text. Pure keyword matching — no API call.
 */
export function detectDialect(message: string): { dialect: Dialect; confidence: number } {
  const msg = message.toLowerCase();
  const scores: Record<Dialect, number> = {
    saudi: 0, egyptian: 0, gulf: 0, shami: 0, 
    maghrebi: 0, english: 0, formal_arabic: 0, unknown: 0,
  };

  for (const pattern of DIALECT_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (msg.includes(keyword)) {
        scores[pattern.dialect] += pattern.weight;
      }
    }
  }

  // Find highest scoring dialect
  let bestDialect: Dialect = 'unknown';
  let bestScore = 0;
  for (const [dialect, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestDialect = dialect as Dialect;
    }
  }

  // Confidence: how dominant is the winning dialect
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? Math.min(95, Math.round((bestScore / totalScore) * 100)) : 0;

  // Default to saudi if no signals (most common for Sari's market)
  if (bestDialect === 'unknown' || confidence < 20) {
    return { dialect: 'saudi', confidence: 30 };
  }

  return { dialect: bestDialect, confidence };
}

// ═══════════════════════════════════════════════════════════════
// Extract Personal Info from Conversation
// ═══════════════════════════════════════════════════════════════

/**
 * Extract child name or family references from message.
 * Used for "أبو فلان" — ONLY when the customer mentions their child.
 * 
 * ⚠️ CRITICAL RULE: NEVER assume "أبو + customer's own name"!
 * "أبو محمد" means "father of محمد" — only used when SON's name is محمد.
 */
export function extractChildName(message: string): string | null {
  const patterns = [
    // "ولدي عبدالله" / "ابني عبدالله" / "ولدي اسمه عبدالله"
    /(?:ولدي|ابني|ولد)\s+(?:اسمه\s+)?([أ-ي\u0600-\u06FF]+)/i,
    // "بنتي سارة" / "ابنتي سارة"
    /(?:بنتي|ابنتي|بنت)\s+(?:اسمها\s+)?([أ-ي\u0600-\u06FF]+)/i,
    // "عندي ولد اسمه..."
    /عندي\s+(?:ولد|ابن)\s+اسمه\s+([أ-ي\u0600-\u06FF]+)/i,
    // "أبو عبدالله" — customer refers to themselves
    /أنا\s+أبو\s+([أ-ي\u0600-\u06FF]+)/i,
    // "my son Abdullah"
    /(?:my son|my kid|my boy)\s+(\w+)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1] && match[1].length > 1 && match[1].length < 20) {
      return match[1].trim();
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// Build Cultural Prompt for GPT
// ═══════════════════════════════════════════════════════════════

/**
 * Build cultural instructions to inject into GPT system prompt.
 */
export function buildCulturalPrompt(cultural: CulturalProfile): string {
  let prompt = `\n## الأسلوب الثقافي لهذا العميل:\n`;

  switch (cultural.detectedDialect) {
    case 'saudi':
      prompt += `- تحدث باللهجة السعودية: استخدم "ابغى، وش، كذا، حلو، ماشي، تمام، أبشر"\n`;
      prompt += `- الترحيب: "يا هلا والله!" أو "أهلاً وسهلاً فيك"\n`;
      prompt += `- المناداة: `;
      if (cultural.childName) {
        prompt += `نادِ العميل "أبو ${cultural.childName}" (ذكر اسم ابنه بنفسه)\n`;
      } else if (cultural.preferredAddress) {
        prompt += `نادِ العميل "${cultural.preferredAddress}"\n`;
      } else {
        prompt += `استخدم "أخوي" أو الاسم مباشرة\n`;
      }
      prompt += `- التحفيز: "والله عرض ما يتفوت!" / "أبشر!"\n`;
      break;

    case 'egyptian':
      prompt += `- تحدث باللهجة المصرية المهذبة: استخدم "عايز، ازاي، كده، يعني، طب، ماشي، تمام"\n`;
      prompt += `- الترحيب: "أهلاً بيك!" أو "أهلاً وسهلاً!"\n`;
      prompt += `- المناداة: `;
      if (cultural.preferredAddress) {
        prompt += `"أستاذ ${cultural.preferredAddress}" أو "${cultural.preferredAddress}"\n`;
      } else {
        prompt += `"حضرتك" أو "أستاذ" أو الاسم مباشرة\n`;
      }
      prompt += `- التحفيز: "فرصة ممتازة!" / "هتعجبك جداً!"\n`;
      prompt += `- ⛔ ممنوع: "يا معلم"، "يا باشا"، "نورت"، "والنبي"، "يا حج" — لغة شوارع غير مقبولة في خدمة العملاء\n`;
      break;

    case 'gulf':
      prompt += `- تحدث باللهجة الخليجية: استخدم "شلونك، هلا، خوش، اللحين، شنو"\n`;
      prompt += `- الترحيب: "هلا والله!" أو "يا مرحبا!"\n`;
      prompt += `- المناداة: `;
      if (cultural.childName) {
        prompt += `"يا بو ${cultural.childName}"\n`;
      } else if (cultural.preferredAddress) {
        prompt += `"${cultural.preferredAddress}"\n`;
      } else {
        prompt += `"الغالي" أو الاسم\n`;
      }
      prompt += `- التحفيز: "خوش عرض!" / "ما يطوفك!"\n`;
      break;

    case 'shami':
      prompt += `- تحدث باللهجة الشامية: استخدم "بدي، كيفك، هيك، كتير، منيح"\n`;
      prompt += `- الترحيب: "أهلين!" أو "يسلمو!"\n`;
      prompt += `- المناداة: `;
      if (cultural.preferredAddress) {
        prompt += `"${cultural.preferredAddress}"\n`;
      } else {
        prompt += `"أخي" أو الاسم\n`;
      }
      prompt += `- التحفيز: "عرض كتير حلو!" / "ما رح تندم!"\n`;
      break;

    case 'english':
      prompt += `- Respond in English only\n`;
      prompt += `- Be professional but warm\n`;
      prompt += `- Use: "Hi!", "Great choice!", "Happy to help!"\n`;
      prompt += `- Address by name: "${cultural.preferredAddress || 'there'}"\n`;
      break;

    case 'formal_arabic':
      prompt += `- تحدث بالعربية الفصحى الرسمية\n`;
      prompt += `- استخدم: "حضرتك"، "سعدنا بتواصلكم"، "نتشرف بخدمتكم"\n`;
      prompt += `- لا تستخدم لهجات عامية\n`;
      break;

    default:
      prompt += `- تحدث باللهجة السعودية (افتراضي)\n`;
  }

  // Rapport level instructions
  if (cultural.rapportLevel === 'friendly') {
    prompt += `- العلاقة مع العميل: ودية جداً — تحدث كصديق\n`;
  } else if (cultural.rapportLevel === 'warm') {
    prompt += `- العلاقة: دافئة — كن ودوداً لكن محترماً\n`;
  } else {
    prompt += `- العلاقة: جديدة — كن محترماً ورسمياً بعض الشيء\n`;
  }

  // Critical cultural rule
  prompt += `\n⚠️ قاعدة ثقافية صارمة:\n`;
  prompt += `- لا تنادي العميل "أبو + اسمه"! هذا خطأ ثقافي فادح.\n`;
  prompt += `- "أبو محمد" تعني "والد محمد" — تُقال فقط إذا ابنه اسمه محمد.\n`;
  prompt += `- إذا العميل اسمه محمد، ناديه "محمد" أو "أخوي محمد".\n`;
  prompt += `- استخدم "أبو فلان" فقط إذا العميل نفسه ذكر اسم ابنه في المحادثة.\n`;

  return prompt;
}

/**
 * Build initial cultural profile from first message.
 */
export function buildInitialCulturalProfile(
  message: string,
  customerName?: string | null,
  storedChildName?: string | null
): CulturalProfile {
  const { dialect, confidence } = detectDialect(message);
  const childName = storedChildName || extractChildName(message);
  
  let preferredAddress = customerName || '';
  if (childName && (dialect === 'saudi' || dialect === 'gulf')) {
    preferredAddress = `أبو ${childName}`;
  }

  return {
    detectedDialect: dialect,
    confidence,
    rapportLevel: 'cold',
    preferredAddress,
    childName,
    culturalGreeting: getGreeting(dialect),
  };
}

function getGreeting(dialect: Dialect): string {
  switch (dialect) {
    case 'saudi': return 'يا هلا والله!';
    case 'egyptian': return 'أهلاً بيك!';
    case 'gulf': return 'هلا والله!';
    case 'shami': return 'أهلين!';
    case 'maghrebi': return 'مرحبا!';
    case 'english': return 'Hi there!';
    case 'formal_arabic': return 'أهلاً وسهلاً بكم!';
    default: return 'أهلاً وسهلاً!';
  }
}
