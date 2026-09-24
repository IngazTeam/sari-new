import {
  centralCatalog,
  centralHelp,
  centralHref,
  getCentralPage,
  type CentralLanguage,
  type CentralPage,
} from "./catalog";
import { icon } from "./icons";
import { centralIntegrations } from "./integrations";
export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
const e = escapeHtml;
export function renderCentralMarkup(
  path: string,
  lang: CentralLanguage
): string {
  const page = getCentralPage(path, lang);
  if (!page) return "";
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const catalog = centralCatalog[lang];
  const href = (p: string) => (p.startsWith("#") ? p : centralHref(p, lang));
  const link = (p: string, text: string, cls = "") =>
    `<a href="${e(href(p))}" class="${cls}">${e(text)}</a>`;
  const button = (p: string, text: string, cls = "green") =>
    `<a class="button ${cls}" href="${e(href(p))}">${e(text)}${icon("arrow-up-left", "directional")}</a>`;
  const tag = (text: string) => `<span class="eyebrow">${e(text)}</span>`;
  const lines = (text: string) =>
    text
      .split("\n")
      .map((s, i) => (i ? `<span class="green-text">${e(s)}</span>` : e(s)))
      .join("<br>");
  const img = (name: string, alt: string, priority = false) =>
    `<picture><source type="image/webp" srcset="/central/${name}-640.webp 640w, /central/${name}-1024.webp 1024w" sizes="(max-width:700px) 90vw, 48vw"><img src="/central/${name}-1024.webp" alt="${e(alt)}" width="1024" height="${name === "founder" || name === "sary-director" ? 1280 : 683}" ${priority ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>`;
  const founderAlt = t(
    "ساري، مدير مبيعات ذكي بثوب سعودي وبطاقة تعريف تحمل شعار ساري",
    "Sary, an AI sales director in a Saudi thobe wearing an ID with the official Sary logo"
  );
  const teamAlt = t(
    "فريق عمل يتعاون على تطوير نشاطه",
    "A team collaborating on their business"
  );
  const brand = () =>
    `<a class="brand" href="${href("/")}" aria-label="${t("ساري — الرئيسية", "Sary — home")}"><img src="/sari-logo.png" alt="Sary" width="113" height="67"></a>`;
  const crumb = () =>
    `<nav class="breadcrumbs" aria-label="${t("مسار الصفحة", "Breadcrumb")}">${link("/", t("الرئيسية", "Home"))}${icon("arrow-left", "directional")}${page.parent ? link(page.parent, catalog[page.parent]?.label || "") + icon("arrow-left", "directional") : ""}<span aria-current="page">${e(page.label)}</span></nav>`;
  const hero = () =>
    `<section class="page-hero container">${crumb()}${tag(page.label)}<h1>${lines(page.title)}</h1><p>${e(page.description)}</p></section>`;
  const cta = () =>
    `<section class="container inner-cta"><div><h2>${t("نبدأ من طموحك.<br>ونكمّل معك.", "Start with your ambition.<br>Let’s take the next step.")}</h2><p>${t("جرّب المحادثة، ثم جهّز مساحة تناسب شغلك.", "Explore a conversation, then build a workspace around your business.")}</p></div><div>${button("/signup", t("ابدأ مع ساري", "Start with Sary"), "lime")}${link("/company/contact", t("تواصل مع فريقنا", "Talk to our team"), "text-link")}</div>${icon("sparkles")}</section>`;
  const faq = (pairs: string[][] = []) =>
    `<div class="faq-list">${pairs.map(([q, a], i) => `<details ${i === 0 ? "open" : ""}><summary>${e(q)}${icon("plus")}</summary><p>${e(a)}</p></details>`).join("")}</div>`;
  const features = (p: CentralPage) =>
    p.features?.length
      ? `<section class="container inner-section"><div class="section-heading"><div>${tag(t("تفاصيل تخدم يومك", "Details that support your day"))}<h2>${e(p.sectionTitle || t("على طريقة شغلك", "Built around your business"))}</h2></div><p>${e(p.sectionDescription || "")}</p></div><div class="capability-grid">${p.features.map((f, i) => `<article class="capability-card tone-${i % 3}">${icon(f.icon, "capability-icon")}<span class="capability-number">${String(i + 1).padStart(2, "0")}</span><h3>${e(f.title)}</h3><p>${e(f.text)}</p></article>`).join("")}</div></section>`
      : "";
  const steps = (p: CentralPage) =>
    p.steps?.length
      ? `<section class="container inner-section"><div class="center-heading">${tag(t("تجربة مترابطة", "A connected experience"))}<h2>${t("كل خطوة. تكمّل اللي قبلها.", "Every step builds on the last.")}</h2></div><div class="journey-grid">${p.steps.map(([h, d], i) => `<article><span>0${i + 1}</span><h3>${e(h)}</h3><p>${e(d)}</p></article>`).join("")}</div></section>`
      : "";
  const faqSection = (p: CentralPage) =>
    p.faq?.length
      ? `<section class="container faq-section section"><div>${tag(t("الصورة أوضح", "A clearer picture"))}<h2>${t("تفاصيل تهمك.", "Questions that matter.")}</h2>${link("/resources/help-center", t("كل الإجابات", "More answers"), "text-link")}</div>${faq(p.faq)}</section>`
      : "";
  const stage = () =>
    `<div class="product-stage"><span class="stage-caption">SARY / YOUR EVERYDAY GROWTH PARTNER</span><div class="visual-app"><div class="visual-app-top"><span>${icon("sparkles")}${t("ساري", "Sary")}</span><span class="online-label"><i class="live-dot"></i>${t("معك في التفاصيل", "Here for the details")}</span></div><div class="visual-message customer">${t("أدور على خيار يناسب احتياجي", "I’m looking for an option that fits my needs.")}</div><div class="visual-message">${t("أكيد، خلّني أفهم احتياجك وأقترح لك الأنسب من خياراتنا.", "Of course. Tell me what you need and I’ll help you compare our options.")}</div><div class="visual-order">${icon("check")}<div><b>${t("خطوتك التالية أوضح", "A clearer next step")}</b><small>${t("معلومة واضحة · متابعة مترابطة", "Useful information · connected follow-up")}</small></div></div><div class="visual-input">${t("اكتب رسالة…", "Write a message…")}${icon("send")}</div></div><div class="stage-float">${icon("shield-check")}<span>${t("معلوماتك مرجع كل رد", "Your knowledge guides each reply")}</span></div><span class="stage-note">${t("تصوّر توضيحي للتجربة", "Illustrative conversation")}</span></div>`;
  const groups = [
    [
      t("المنتج", "Product"),
      [
        "/product/ai-agent",
        "/product/chatbot",
        "/product/whatsapp",
        "/product/broadcasts",
      ],
    ],
    [
      t("الحلول", "Solutions"),
      ["/solutions/sales", "/solutions/marketing", "/solutions/support"],
    ],
    [
      t("القطاعات", "Industries"),
      [
        "/sectors",
        ...Object.keys(catalog).filter(p => catalog[p].kind === "sector"),
      ],
    ],
    [
      t("الموارد", "Resources"),
      [
        "/resources/blog",
        "/resources/help-center",
        "/resources/success-stories",
        "/docs/how-sari-works",
      ],
    ],
  ] as [string, string[]][];
  const menus = (mobile = false) =>
    groups
      .map(
        ([label, paths]) =>
          `<details class="${mobile ? "mobile-nav-group" : "nav-dropdown"}"><summary>${e(label)}${icon("arrow-left")}</summary><div class="${mobile ? "mobile-links" : "nav-popover"}">${paths.map(p => link(p, catalog[p].label)).join("")}</div></details>`
      )
      .join("");
  const languageLink = () =>
    `<a class="language-link" href="${e(centralHref(path.startsWith("/reset-password/") ? "/reset-password" : path, lang === "ar" ? "en" : "ar"))}" lang="${lang === "ar" ? "en" : "ar"}" hreflang="${lang === "ar" ? "en" : "ar"}" data-language-switch>${lang === "ar" ? "EN" : "العربية"}</a>`;
  const header = () =>
    `<div class="announcement">${icon("sparkles")}<span>${t("أنت تبني شغلك. وساري يكمّل معك.", "You build your business. Sary takes care of the details.")}</span>${link("/try-sari", t("تعرّف على شريكك الجديد", "Meet your new partner"))}</div><header class="site-header"><div class="nav container">${brand()}<nav class="desktop-nav" aria-label="${t("التنقل الرئيسي", "Main navigation")}">${menus()}${link("/pricing", catalog["/pricing"].label)}</nav><div class="nav-actions">${languageLink()}${link("/login", t("دخول الحساب", "Sign in"), "login-link text-button")}${button("/signup", t("ابدأ مع ساري", "Get started"), "dark small")}<button class="icon-button menu-trigger" data-menu-open aria-label="${t("فتح قائمة التنقل", "Open navigation")}" aria-haspopup="dialog">${icon("menu")}</button></div></div></header>`;
  const footer = () =>
    `<footer class="container footer"><div class="footer-top"><div>${brand()}<p>${t("شريك نموّك على واتساب.<br>بذكاء يفهمك، وقرب يشبهك.", "Your growth partner on WhatsApp.<br>Helpful intelligence. A human connection.")}</p></div><div class="footer-link-groups">${[
      [
        t("اكتشف ساري", "Discover"),
        ["/product/ai-agent", "/solutions/sales", "/pricing", "/try-sari"],
      ],
      [
        t("المعرفة", "Knowledge"),
        ["/resources/blog", "/resources/help-center", "/docs/how-sari-works"],
      ],
      [
        t("الشركة", "Company"),
        [
          "/company/about",
          "/company/contact",
          "/company/privacy",
          "/company/terms",
        ],
      ],
    ]
      .map(
        ([l, ps]) =>
          `<nav aria-label="${e(l)}"><b>${e(l)}</b>${(ps as string[]).map(p => link(p, catalog[p].label)).join("")}</nav>`
      )
      .join(
        ""
      )}</div></div><div class="footer-bottom"><span>© ${new Date().getUTCFullYear()} ${t("ساري", "Sary")}</span>${link("/support", t("تحتاج مساعدة؟", "Need a hand?"))}${languageLink()}</div></footer><dialog id="central-menu" class="menu-dialog" aria-label="${t("قائمة التنقل", "Navigation")}"><div class="dialog-top"><b>${t("استكشف ساري", "Explore Sary")}</b><button class="icon-button" data-menu-close aria-label="${t("إغلاق القائمة", "Close menu")}">${icon("x")}</button></div><nav>${menus(true)}${link("/pricing", catalog["/pricing"].label)}${link("/login", catalog["/login"].label)}${link("/signup", catalog["/signup"].label)}</nav></dialog>`;
  const demo = () =>
    `<section class="demo-section section" id="experience"><div class="container demo-layout"><div class="demo-copy">${tag(t("أقل كلام عن الذكاء. أكثر تجربة له.", "Less talk about AI. More experience."))}<h2>${t('لا تتخيّل الفرق.<br><span class="green-text">خلّك العميل.</span>', 'Don’t just imagine it.<br><span class="green-text">Be the customer.</span>')}</h2><p>${t("اختر نشاطًا، وشاهد مثالًا يوضح السؤال والخطوة التالية.", "Choose a business and explore a question and its next step.")}</p><div class="scenario-tabs" role="group" aria-label="${t("نوع النشاط", "Business type")}">${[
      ["commerce", "store", t("متجر إلكتروني", "Online store")],
      ["training", "graduation-cap", t("مركز تدريب", "Training centre")],
      ["services", "calendar", t("خدمات وحجوزات", "Services and bookings")],
    ]
      .map(
        ([s, i, l], n) =>
          `<button data-demo-sector="${s}" class="${n === 0 ? "active" : ""}" aria-pressed="${n === 0}">${icon(i)}${l}</button>`
      )
      .join(
        ""
      )}</div><p class="demo-disclaimer">${t("مثال تفاعلي ببيانات افتراضية. لا يرسل رسائل ولا ينشئ طلبًا حقيقيًا.", "An interactive example with fictional data. It sends no messages and creates no real orders.")}</p></div><div class="chat-shell"><div class="chat-label">${t("هكذا تبدو تجربة عميلك", "A glimpse of your customer experience")}</div><div class="chat-card"><div class="chat-header"><span class="chat-avatar">${icon("sparkles")}</span><div><b id="demo-business">${t("متجر ورق", "Waraq store")}</b><span>${t("محادثة توضيحية", "Illustrative conversation")}</span></div><button class="icon-button" data-demo-reset aria-label="${t("إعادة المحادثة", "Reset conversation")}">${icon("rotate")}</button></div><div class="chat-messages" id="demo-messages" aria-live="polite" role="log"><div class="message bot">${t("يا هلا! تدور على هدية أو دفتر لأفكارك الكبيرة؟", "Hello! Looking for a gift or a notebook for your big ideas?")}</div></div><div class="chat-suggestions" id="demo-suggestions"><button data-demo-question="0">${t("أدور على هدية", "I’m looking for a gift")}</button><button data-demo-question="1">${t("كيف أكمل الطلب؟", "How do I order?")}</button><button data-demo-question="2">${t("أحتاج أكلم الفريق", "I need the team")}</button></div><form id="demo-form" class="chat-compose"><input id="demo-input" maxlength="500" aria-label="${t("رسالتك التجريبية", "Your example message")}" placeholder="${t("اكتب سؤالك هنا…", "Write your question…")}"><button type="submit" class="icon-button" aria-label="${t("إرسال الرسالة التجريبية", "Send example message")}">${icon("send")}</button></form></div></div></div></section>`;
  const planPlaceholder = () =>
    `<section class="container central-plans" aria-label="${t("الباقات الحالية", "Current plans")}"><div class="billing-toggle" role="group" aria-label="${t("دورة الفوترة", "Billing period")}"><button data-billing="monthly" class="active" aria-pressed="true">${t("شهري", "Monthly")}</button><button data-billing="yearly" aria-pressed="false">${t("سنوي", "Yearly")}</button></div><div class="plan-grid" id="central-plans" aria-live="polite"><p class="inline-notice" role="status">${t("تُحمّل الأسعار الحالية من النظام عند فتح الصفحة.", "Current prices load from the platform when the page opens.")}</p></div><noscript><p>${t("فعّل JavaScript لعرض الأسعار الحالية، أو تواصل مع فريقنا.", "Enable JavaScript to load current prices, or contact our team.")}</p>${link("/company/contact", t("تواصل معنا", "Contact us"))}</noscript><p class="pricing-note">${t("الأسعار والعملة والحدود المعتمدة هي المعروضة في الباقة وشاشة الدفع وقت الشراء.", "The plan and checkout at purchase show the applicable price, currency and limits.")}</p></section>`;
  const integrations = () =>
    `<section class="container integrations-section" id="integrations" aria-labelledby="integrations-heading"><div class="integrations-heading"><div>${tag(t("متصل بعالم شغلك", "CONNECTED TO YOUR WORK"))}<h2 id="integrations-heading">${t("أدواتك المعتادة.<br><span class=\"green-text\">وقوة ساري معها.</span>", "Your everyday tools.<br><span class=\"green-text\">With Sary alongside.</span>")}</h2></div><p>${t("محادثات، متاجر، مواعيد وتحليلات.<br>تكاملات تجمع تفاصيل يومك، ومنظومة أدوات تفتح لك فرصًا أكثر.", "Conversations, commerce, appointments and insights.<br>Connect the details of your day and explore more possibilities.")}</p></div><ul class="integration-grid">${centralIntegrations.map(tool => `<li><a class="integration-card" href="${e(tool.url)}" target="_blank" rel="noopener noreferrer" aria-label="${e(t("تعرّف على ", "Explore ") + tool.name)}"><span class="integration-logo ${tool.type}"><img src="/central/brands/${tool.asset}" alt="${e(tool.name)}" width="160" height="52" loading="lazy" decoding="async">${tool.type === "symbol" ? `<b dir="ltr">${tool.name}</b>` : ""}</span><span class="integration-purpose">${e(t(tool.ar, tool.en))}</span>${icon("arrow-up-left", "integration-arrow directional")}</a></li>`).join("")}</ul><p class="integrations-note">${t("تُفعّل التكاملات حسب إعدادات حسابك وصلاحيات الخدمة. زاهي رابط لاستكشاف المنظومة.", "Connections depend on your account setup and service permissions. Zahy links to its wider ecosystem.")}</p></section>`;
  const home = () =>
    `<section class="hero container"><div class="hero-copy"><div class="eyebrow"><span class="live-dot"></span>${t("شريك نموّك على واتساب", "Your growth partner on WhatsApp")}</div><h1>${t('شغلك يكبر.<br><strong>وساري <span class="underlined">معك.</span></strong>', 'Your business grows.<br><strong>Sary grows <span class="underlined">with you.</span></strong>')}</h1><p class="hero-description">${t("خلّك قريب من طموحك، ومن عملائك.<br>ساري يفهم، يرد، ويتابع البيع على واتساب.<br>وأنت تتفرّغ للي يخلّي شغلك يكبر.", "Stay close to your ambition and your customers.<br>Sary understands, replies and follows up on WhatsApp.<br>So you can focus on what makes your business grow.")}</p><div class="hero-actions">${button("/try-sari", t("جرّب ساري بنفسك", "Try Sary yourself"))}${button("/product/ai-agent", t("اكتشف كيف يساعدك", "See how it helps"), "outline")}</div><div class="hero-notes">${[t("يفهم لهجتك", "Understands your language"), t("يعرف معلومات نشاطك", "Uses your business knowledge"), t("فريقك دائمًا بالصورة", "Keeps your team involved")].map(n => `<span>${icon("check")}${n}</span>`).join("")}</div></div><div class="hero-visual director-visual"><div class="portrait-frame">${img("sary-director", founderAlt, true)}<div class="portrait-caption"><span class="tiny-label">MORE HUMAN. MORE POSSIBLE.</span><span>${t("طموحك كبير.<br><b>ومعك ساري.</b>", "Big ambitions.<br><b>Meet your sales partner.</b>")}</span></div>${icon("sparkles", "orbit-spark")}</div><div class="float-badge"><span class="badge-icon">${icon("sparkles")}</span><div><strong>${t("أنا ساري", "Meet Sary")}</strong><span>${t("مدير مبيعاتك الذكي", "Your AI sales director")}</span></div><i class="live-dot"></i></div><div class="order-float director-note"><div class="order-top">${icon("sparkles")}<span>${t("قدرات أكبر. تجربة أقرب.", "More capable. More connected.")}</span></div><b>${t("يفهم. يوصي. ويتابع.", "Understands. Guides. Follows up.")}</b></div><span class="visual-footnote">${t("شخصية توضيحية مولّدة", "AI-generated illustrative portrait")}</span></div></section>${integrations()}${features(catalog["/product/ai-agent"])}${demo()}<section class="people-section section container" id="people"><div class="team-photo">${img("team", teamAlt)}<div class="photo-label">${t("البشر في قلب التجربة.", "People at the heart of it.")}</div></div><div class="people-copy">${tag(t("شغلك له قصته", "Your business has a story"))}<h2>${t('تختلف الأنشطة.<br><span class="green-text">والطموح يجمعنا.</span>', 'Different businesses.<br><span class="green-text">A shared ambition.</span>')}</h2><p>${t("من متجر إلى مركز تدريب أو مقدم خدمات. معلوماتك وطريقة شغلك هي البداية في كل محادثة.", "From a store to a training centre or a service business, your knowledge and way of working shape the conversation.")}</p><div class="people-pills">${["/solutions/restaurants", "/solutions/training-centers", "/solutions/consultants"].map(p => link(p, catalog[p].label)).join("")}</div>${button("/sectors", t("اكتشف قطاعك", "Explore your industry"), "outline")}</div></section><section class="container section center-heading">${tag(t("على قد شغلك. وعلى قد طموحك.", "Room for your business. Room for your ambition."))}<h2>${t("ابدأ بخطوة.<br>وكبّرها مع ساري.", "Start with a step.<br>Grow with Sary.")}</h2><p>${t("اختر مساحة تناسب نشاطك من الباقات الحالية.", "Choose the fit for your business from current plans.")}</p>${button("/pricing", t("شاهد الباقات والأسعار", "See plans and pricing"))}</section>${faqSection(catalog["/product/ai-agent"])}${cta()}`;
  const marketing = () =>
    `<section class="container">${crumb()}<div class="inner-split-hero"><div>${tag(page.label)}<h1>${lines(page.title)}</h1><p>${e(page.description)}</p><div class="page-hero-actions">${button("/try-sari", t("تحدث مع ساري", "Try a conversation"))}${link("/pricing", t("شاهد الباقات", "See plans"), "text-link")}</div><div class="quiet-line">${icon("check")}${t("يفهم نشاطك", "Understands your business")}${icon("check")}${t("ويكمّل مع فريقك", "Works with your team")}</div></div>${stage()}</div></section>${features(page)}${steps(page)}<section class="container inner-team-strip">${img("team", teamAlt)}<div><span>${t("البشر في قلب التجربة.", "People at the heart of it.")}</span><h2>${t("المعلومة منك.<br>والاهتمام يجمعنا.", "Your knowledge.<br>A shared focus on care.")}</h2></div></section>${faqSection(page)}${page.parent ? `<section class="container">${link(page.parent, t("اكتشف خدمات القطاع الأخرى", "Explore other services in this industry"), "text-link")}</section>` : ""}${cta()}`;
  const cardList = (paths: string[]) =>
    `<div class="sector-grid">${paths.map((p, i) => `<a class="sector-card tone-${i % 3}" href="${href(p)}">${icon(["store", "calendar", "graduation-cap", "messages", "users", "leaf"][i % 6])}<h2>${e(catalog[p].label)}</h2><p>${e(catalog[p].description)}</p><span class="text-link">${t("اكتشف أكثر", "Explore more")}${icon("arrow-up-left", "directional")}</span></a>`).join("")}</div>`;
  const articleCard = (p: string, i: number) =>
    `<a class="article-card" href="${href(p)}" data-search-card data-category="${e(catalog[p].label)}"><div class="article-cover cover-${i % 4}">${i % 3 === 0 ? img("team", teamAlt) : icon(["chart", "book-open", "messages"][i % 3])}<span>SARY JOURNAL / ${String(i + 1).padStart(2, "0")}</span></div><div class="article-card-copy"><span class="article-category">${e(catalog[p].label)}</span><h2>${e(catalog[p].title)}</h2><p>${e(catalog[p].description)}</p><div><span>${e(catalog[p].readTime)}</span>${icon("arrow-up-left", "directional")}</div></div></a>`;
  const filters = (categories: string[]) =>
    `<div class="filter-chips">${[t("الكل", "All"), ...categories].map((c, i) => `<button data-filter="${i === 0 ? "*" : e(c)}" aria-pressed="${i === 0}">${e(c)}</button>`).join("")}</div>`;
  const search = (label: string) =>
    `<label class="search-field">${icon("messages")}<input type="search" id="central-search" aria-label="${e(label)}" placeholder="${e(label)}"></label>`;
  const noResults = () =>
    `<div class="empty-state" id="central-empty" role="status" hidden><h2>${t("ما لقينا نتيجة مطابقة.", "No matching results.")}</h2><p>${t("جرّب كلمة أقصر أو اختر تصنيفًا آخر.", "Try a shorter search or another category.")}</p></div>`;
  const article = () =>
    `${hero()}<section class="container article-layout"><aside class="article-toc"><span>${t("في هذه الصفحة", "On this page")}</span>${page.sections?.map((s, i) => link("#" + (s.id || "section-" + i), s.title)).join("")}${page.date ? `<div><time datetime="${e(page.date)}">${e(page.date)}</time><br>${t("بقلم فريق ساري", "By the Sary team")}</div>` : ""}</aside><article class="reading-article">${page.kind === "article" ? `<div class="article-banner">${icon("sparkles")}<span>${t("فكرة اليوم.<br><b>فرصة بكرة.</b>", "Today’s idea.<br><b>Tomorrow’s opportunity.</b>")}</span></div>` : ""}${page.version ? `<p class="inline-notice">${t("الإصدار وتاريخ النفاذ", "Version and effective date")}: <time datetime="${page.version}">${page.version}</time></p>` : ""}${page.sections?.map((s, i) => `<section id="${s.id || "section-" + i}"><h2>${e(s.title)}</h2>${[...(s.text ? [s.text] : []), ...(s.paragraphs || [])].map(p => `<p>${e(p)}</p>`).join("")}${s.bullets ? `<ul>${s.bullets.map(b => `<li>${e(b)}</li>`).join("")}</ul>` : ""}</section>`).join("")}${faq(page.faq)}</article></section>${page.kind !== "legal" ? cta() : ""}`;
  const field = (name: string, label: string, type = "text", more = "") =>
    `<div class="page-field"><label id="${name}-label" for="${name}">${label}</label><div class="input-wrap ${type === "password" ? "has-eye" : ""}"><input aria-labelledby="${name}-label" id="${name}" name="${name}" type="${type}" ${type === "email" || type === "tel" ? 'dir="ltr"' : ""} required ${more}>${type === "password" ? `<button type="button" class="password-toggle" data-password="${name}" aria-label="${t("إظهار كلمة المرور", "Show password")}" aria-pressed="false">${icon("eye")}</button>` : ""}</div></div>`;
  const auth = () => {
    const signup = path === "/signup",
      login = path === "/login",
      forgot = path === "/forgot-password",
      reset = path.startsWith("/reset-password");
    const password = (name: string, label: string) =>
      field(
        name,
        label,
        "password",
        `${login ? "" : 'minlength="8"'} maxlength="128" autocomplete="${login ? "current-password" : "new-password"}"`
      );
    const feedback =
      '<div id="form-feedback" role="status" aria-live="polite" tabindex="-1"></div>';
    const form = login
      ? `<form id="central-auth" data-action="login">${feedback}${field("email", t("البريد الإلكتروني", "Email address"), "email", 'autocomplete="username" maxlength="320"')}<div class="password-label"><span>${t("كلمة المرور", "Password")}</span>${link("/forgot-password", t("نسيتها؟", "Forgot password?"))}</div>${password("password", t("كلمة المرور", "Password"))}<label class="check-field"><input type="checkbox" name="remember">${t("تذكّر بريدي على هذا الجهاز", "Remember my email on this device")}</label><button class="button green full" type="submit">${t("تسجيل الدخول", "Sign in")}${icon("arrow-up-left", "directional")}</button></form><div class="auth-divider"><span>${t("أو استكشف قبل ما تبدأ", "Or explore before you start")}</span></div>${button("/try-sari", t("جرّب محادثة توضيحية", "Try an example conversation"), "outline full")}<p class="auth-switch">${t("أول مرة مع ساري؟", "New to Sary?")} ${link("/signup", t("أنشئ حسابك", "Create an account"))}</p>`
      : signup
        ? `<form id="central-auth" data-action="signup">${feedback}<div class="auth-step" id="signup-progress">${t("الخطوة 1 من 2 · نبدأ بالتعارف", "Step 1 of 2 · Let’s get to know you")}</div><div data-signup-step="1">${field("name", t("اسمك الكامل", "Full name"), "text", 'autocomplete="name" maxlength="100"')}${field("businessName", t("اسم النشاط", "Business name"), "text", 'autocomplete="organization" maxlength="100"')}${field("email", t("البريد الإلكتروني", "Email address"), "email", 'autocomplete="email" maxlength="320"')}${field("phone", t("رقم الجوال مع رمز الدولة", "Phone number with country code"), "tel", 'autocomplete="tel" placeholder="+966501234567" pattern="\\+?[0-9 ()-]{8,20}" maxlength="20"')}<button class="button green full" type="button" data-signup-next>${t("متابعة", "Continue")}${icon("arrow-left", "directional")}</button></div><div data-signup-step="2" hidden>${password("password", t("كلمة المرور", "Password"))}${password("confirmPassword", t("تأكيد كلمة المرور", "Confirm password"))}<p class="small-note">${t("من 8 إلى 128 حرفًا، مع حرف إنجليزي كبير ورقم.", "8–128 characters, including an uppercase letter and a number.")}</p><label class="check-field"><input name="acceptedTerms" type="checkbox" required><span>${t("أوافق على", "I agree to the")} ${link("/company/terms", t("الشروط والأحكام", "terms of use"))}</span></label><label class="check-field"><input name="acceptedPrivacy" type="checkbox" required><span>${t("أوافق على", "I agree to the")} ${link("/company/privacy", t("سياسة الخصوصية", "privacy policy"))}</span></label><label class="check-field"><input name="marketingConsent" type="checkbox">${t("أرغب بتلقي رسائل تسويقية (اختياري)", "Send me marketing updates (optional)")}</label><button class="button green full" type="submit">${t("إنشاء الحساب", "Create account")}${icon("arrow-up-left", "directional")}</button><button class="text-button" type="button" data-signup-back>${t("الخطوة السابقة", "Previous step")}</button></div></form><p class="auth-switch">${t("عندك حساب؟", "Already have an account?")} ${link("/login", t("سجّل دخولك", "Sign in"))}</p>`
        : forgot
          ? `<form id="central-auth" data-action="forgot">${feedback}${field("email", t("البريد الإلكتروني", "Email address"), "email", 'autocomplete="email" maxlength="320"')}<button class="button green full" type="submit">${t("إرسال رابط الاستعادة", "Send recovery link")}</button></form><p class="auth-switch">${link("/login", t("العودة لتسجيل الدخول", "Back to sign in"))}</p>`
          : reset
            ? `<form id="central-auth" data-action="reset">${feedback}<div id="token-status" role="status">${t("جارٍ فحص رابط الاستعادة…", "Checking the recovery link…")}</div><fieldset id="reset-fields" disabled>${password("newPassword", t("كلمة المرور الجديدة", "New password"))}${password("confirmPassword", t("تأكيد كلمة المرور", "Confirm password"))}<p class="small-note">${t("من 8 إلى 128 حرفًا، مع حرف إنجليزي كبير ورقم.", "8–128 characters, including an uppercase letter and a number.")}</p><button class="button green full" type="submit">${t("حفظ كلمة المرور", "Save password")}</button></fieldset></form><p class="auth-switch">${link("/forgot-password", t("طلب رابط جديد", "Request a new link"))}</p>`
            : `${feedback}<div id="token-status" role="status">${t("جارٍ فحص الرابط…", "Checking the link…")}</div><div id="token-actions"></div>`;
    return `<main class="auth-layout" id="central-main"><div class="auth-content"><div class="auth-top">${brand()}<div>${languageLink()}${link("/", t("العودة للموقع ←", "Back to the website →"), "auth-back")}</div></div><div class="auth-form-area">${tag(signup ? t("أهلًا بطموحك", "Welcome to your next chapter") : t("أهلًا برجعتك", "Welcome back"))}<h1>${lines(page.title)}</h1><p class="auth-intro">${e(page.description)}</p>${form}<noscript><p>${t("فعّل JavaScript لإكمال هذه العملية بأمان.", "Enable JavaScript to complete this action securely.")}</p></noscript></div><div class="auth-bottom"><span>© ${new Date().getUTCFullYear()} Sary</span>${link("/support", t("تحتاج مساعدة؟", "Need help?"))}</div></div><aside class="auth-art"><span class="auth-art-kicker">SARY / YOUR NEXT CHAPTER</span><h2>${signup ? t("كل بداية كبيرة.<br><strong>تبدأ بخطوة.</strong>", "Every big beginning.<br><strong>Starts with one step.</strong>") : t("شغلك يستاهل.<br><strong>نكمل مع بعض.</strong>", "Your business deserves it.<br><strong>Let’s keep growing.</strong>")}</h2>${img(signup ? "team" : "sary-director", signup ? teamAlt : founderAlt, true)}<div class="auth-art-caption">${icon("sparkles")}<div><b>${t("أنت للطموح الكبير.", "You bring the ambition.")}</b><span>${t("وساري معك في كل التفاصيل.", "Sary is with you in the details.")}</span></div></div><span class="auth-art-bottom">MORE HUMAN. MORE POSSIBLE.</span></aside></main>`;
  };
  const contact = () =>
    `${hero()}<section class="container contact-layout"><aside class="contact-aside"><span class="contact-icon">${icon("messages")}</span><h2>${t("شغلك له قصته.", "Your business has a story.")}</h2><p>${t("شاركنا الفكرة أو السؤال الذي يشغلك، ونساعدك على تحديد الخطوة التالية.", "Tell us about the idea or question on your mind, and we’ll help you find the next step.")}</p><div class="contact-note">${icon("mail")}<div><b>${t("البريد الرسمي", "Official email")}</b><a href="mailto:support@sary.live" dir="ltr">support@sary.live</a></div></div>${link("/resources/help-center", t("استكشف مركز المساعدة", "Visit the help centre"), "text-link")}<div id="service-status" role="status">${t("جارٍ فحص حالة الخدمة…", "Checking service status…")}</div></aside><form class="panel-form" id="central-contact"><div id="form-feedback" role="status" tabindex="-1" aria-live="polite"></div><div class="two-fields">${field("name", t("اسمك", "Your name"), "text", 'autocomplete="name" maxlength="100"')}${field("email", t("البريد الإلكتروني", "Email address"), "email", 'autocomplete="email" maxlength="320"')}</div>${field("subject", t("الموضوع", "Subject"), "text", 'minlength="3" maxlength="160"')}<label class="page-field"><span>${t("كيف نقدر نساعدك؟", "How can we help?")}</span><textarea name="message" id="message" rows="6" required minlength="10" maxlength="4000"></textarea></label><div class="central-honeypot" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div><button type="submit" class="button green">${t("إرسال الرسالة", "Send message")}${icon("arrow-up-left", "directional")}</button><p class="small-note">${t("تُستخدم بياناتك لمعالجة الطلب وفق", "Your information is used to handle this request under our")} ${link("/company/privacy", t("سياسة الخصوصية", "privacy policy"))}.</p></form></section>`;
  let body = "";
  if (page.kind === "auth")
    return `<div class="central-site auth-mode" lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><a class="skip" href="#central-main">${t("انتقل إلى المحتوى", "Skip to content")}</a>${auth()}</div>`;
  if (page.kind === "home") body = home();
  if (["marketing", "service"].includes(page.kind)) body = marketing();
  if (page.kind === "sector")
    body =
      hero() +
      `<section class="container">${cardList(page.children || [])}</section>` +
      cta();
  if (page.kind === "sectors")
    body =
      hero() +
      `<section class="container">${cardList(Object.keys(catalog).filter(p => catalog[p].kind === "sector"))}</section>` +
      cta();
  if (["article", "guide", "legal"].includes(page.kind)) body = article();
  if (page.kind === "pricing")
    body =
      hero() +
      planPlaceholder() +
      faqSection({
        ...page,
        faq: [
          [
            t("من أين تأتي الأسعار؟", "Where do the prices come from?"),
            t(
              "من الباقات الحالية المنشورة في النظام. إذا تعذر تحميلها نوضح ذلك بدل عرض سعر تقديري.",
              "From the plans currently published by the platform. If they cannot load, we show the issue rather than an estimated price."
            ),
          ],
          [
            t("كيف أعرف المبلغ النهائي؟", "How do I confirm the final amount?"),
            t(
              "راجع العملة ودورة الفوترة والرسوم المعروضة في شاشة الدفع قبل المتابعة.",
              "Review the currency, billing period and charges shown at checkout before proceeding."
            ),
          ],
        ],
      }) +
      cta();
  if (page.kind === "demo") body = hero() + demo() + cta();
  if (page.kind === "contact") body = contact();
  if (page.kind === "checkout" || page.kind === "payment")
    body =
      hero() +
      `<section class="container"><div class="public-order" id="central-transaction"><div id="form-feedback" role="status" aria-live="polite" tabindex="-1"></div><div id="transaction-content" role="status">${t("جارٍ تحميل التفاصيل…", "Loading the details…")}</div><noscript><p>${t("فعّل JavaScript لعرض التفاصيل المؤكدة وإكمال العملية.", "Enable JavaScript to view confirmed details and continue.")}</p></noscript></div></section>`;
  if (page.kind === "blog") {
    const paths = Object.keys(catalog).filter(
      p => catalog[p].kind === "article"
    );
    body =
      hero() +
      `<section class="container"><div class="resource-toolbar">${search(t("ابحث في المدونة", "Search the journal"))}${filters(Array.from(new Set(paths.map(p => catalog[p].label))))}</div><div class="article-grid">${paths.map(articleCard).join("")}</div>${noResults()}</section>` +
      cta();
  }
  if (page.kind === "help") {
    const help = centralHelp(lang);
    body =
      hero() +
      `<section class="container help-container">${search(t("ابحث في مركز المساعدة", "Search the help centre"))}<div class="help-layout"><aside class="help-sidebar">${filters(help.map(g => g.category))}${link("/docs/how-sari-works", t("دليل البداية", "Getting started guide"), "text-link")}</aside><div>${help.map(g => `<section class="help-result-group" data-help-group><h2>${e(g.category)}</h2>${g.questions.map(q => `<div data-search-card data-category="${e(g.category)}">${faq([[q.q, q.a]])}</div>`).join("")}</section>`).join("")}${noResults()}</div></div></section>` +
      cta();
  }
  if (page.kind === "about")
    body =
      `<section class="about-hero container">${crumb()}${tag(page.label)}<h1>${lines(page.title)}</h1><p>${e(page.description)}</p><div class="about-photo">${img("team", teamAlt)}<span>${t("الناس أولًا.<br><b>والذكاء في خدمتهم.</b>", "People first.<br><b>Intelligence that helps them.</b>")}</span></div></section>` +
      features({
        ...page,
        sectionTitle: t(
          "وراء كل نشاط، طموح يستاهل يكبر.",
          "Behind every business is an ambition worth growing."
        ),
        features: [
          {
            icon: "users",
            title: t("قرب إنساني", "A human connection"),
            text: t(
              "العميل له سياق وقصة. وفريقك يظل حاضرًا في المحادثة.",
              "Every customer has a story. Your team remains part of the conversation."
            ),
          },
          {
            icon: "book-open",
            title: t("معلومة واضحة", "Clear information"),
            text: t(
              "معلومات نشاطك أساس الإجابة، وتحديثها جزء من تطور التجربة.",
              "Your business knowledge guides the answer. Keeping it current improves the experience."
            ),
          },
          {
            icon: "leaf",
            title: t("نمو بطريقتك", "Growth your way"),
            text: t(
              "ابدأ برحلة يحتاجها نشاطك، وتوسع مع استعداد فريقك.",
              "Start with a journey your business needs, then expand with your team."
            ),
          },
        ],
      }) +
      cta();
  if (page.kind === "stories")
    body =
      hero() +
      `<section class="container stories-list">${[
        [
          "/solutions/sales",
          t(
            "من سؤال عن هدية، إلى طلب مرتب.",
            "From a gift question to a clear order."
          ),
          "bag",
        ],
        [
          "/solutions/training-centers",
          t(
            "من اهتمام بدورة، إلى خطوة تسجيل.",
            "From course interest to an enrolment step."
          ),
          "graduation-cap",
        ],
        [
          "/whatsapp-booking-system",
          t(
            "من استفسار، إلى موعد مناسب.",
            "From an enquiry to a suitable appointment."
          ),
          "calendar",
        ],
      ]
        .map(
          ([p, h, i], n) =>
            `<article class="story-card tone-${n}"><div class="story-art">${icon(i)}<span>0${n + 1}</span></div><div>${tag(catalog[p].label)}<h2>${h}</h2><p>${e(catalog[p].description)}</p>${button(p, t("اكتشف الرحلة", "Explore the journey"))}<small>${t("سيناريو توضيحي، وليس شهادة عميل أو نتيجة تجارية.", "An illustrative scenario, not a customer testimonial or business result.")}</small></div></article>`
        )
        .join("")}</section>` +
      cta();
  if (page.kind === "catalog")
    body =
      hero() +
      features({
        ...catalog["/solutions/sales"],
        sectionTitle: t(
          "كل معلومة تساعد على الاختيار.",
          "Every detail helps a decision."
        ),
      }) +
      `<section class="container">${cardList(["/product/ai-agent", "/whatsapp-ordering-system", "/whatsapp-booking-system"])}</section>` +
      cta();
  return `<div class="central-site" lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><a class="skip" href="#${page.kind === "home" ? "main" : "page-view"}">${t("انتقل إلى المحتوى", "Skip to content")}</a>${header()}<main id="${page.kind === "home" ? "main" : "page-view"}">${body}</main>${footer()}</div>`;
}
