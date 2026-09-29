// Read-only local design data. No merchant reads, provider calls or message sends.
window.InsightsPreview = (() => {
  const routes = [
    "/merchant/insights",
    "/merchant/ai-suggestions",
    "/merchant/ab-tests",
  ];
  const handles = page => routes.includes(page?.route);
  const e = value =>
    String(value ?? "").replace(
      /[&<>"']/g,
      c =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]
    );
  const now = Date.now(),
    ago = days => new Date(now - days * 86400000).toISOString();
  const names = [
    "مدة الشحن",
    "طرق الدفع",
    "الاسترجاع",
    "توفر المنتج",
    "المقاسات",
    "متابعة الطلب",
  ];
  const categories = {
    product: "منتجات",
    price: "أسعار",
    shipping: "شحن",
    complaint: "شكاوى",
    question: "أسئلة",
    other: "أخرى",
  };
  const statuses = {
    new: "جديد",
    reviewed: "مراجع",
    response_created: "معلّم بإنشاء رد",
    ignored: "متجاهل",
    running: "جارٍ",
    paused: "متوقف",
    completed: "مكتمل",
  };
  const initial = () => ({
    keywords: Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      keyword: names[i % names.length] + " · " + (i + 1),
      category: Object.keys(categories)[i % 6],
      frequency: 40 - i,
      status: i % 4 === 0 ? "response_created" : "new",
      suggestedResponse:
        i % 3 === 0
          ? null
          : "مثال تصميم محلي: راجع حقائق " +
            names[i % 6] +
            " في المصدر قبل اعتماد الرد.",
      firstSeenAt: ago(120),
      lastSeenAt: ago(i < 22 ? 1 : 60),
    })),
    reports: Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      weekStart: ago(i + 7),
      weekEnd: ago(i + 1),
      total: i === 2 ? 0 : 10,
      positive: i === 2 ? 0 : i === 3 ? 12 : 4,
      negative: i === 2 ? 0 : 1,
      neutral: i === 2 ? 0 : 2,
      emailMarkedSent: i === 0,
    })),
    tests: Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      name: "مثال سجل محلي " + (i + 1),
      keyword: names[i % 6],
      status: ["running", "paused", "completed"][i % 3],
      createdAt: ago(i < 22 ? 1 : 60),
      storedSelection: i === 4 ? "A" : null,
      variantA: {
        text: "صيغة محلية أ للمراجعة فقط.",
        total: i === 0 ? 0 : 10,
        positive: i === 0 ? 0 : 4,
      },
      variantB: {
        text: "صيغة محلية ب للمراجعة فقط.",
        total: i === 0 ? 0 : 8,
        positive: i === 0 ? 0 : i === 1 ? 9 : 5,
      },
    })),
  });
  const source = initial();
  let route = "",
    tab = "keywords",
    period = 30,
    pages = { keywords: 1, reports: 1, tests: 1 },
    mode = "normal",
    pending = false,
    generation = 0;
  const date = value =>
    new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
      calendar: "gregory",
    }).format(new Date(value));
  const number = value =>
    new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(value);
  const ratio = value => (value === null ? "غير متاح" : number(value) + "%");
  const arm = value => {
    const valid =
      [value.total, value.positive].every(
        n => Number.isSafeInteger(n) && n >= 0
      ) && value.positive <= value.total;
    return {
      ...value,
      valid,
      ratio:
        valid && value.total > 0 ? (value.positive / value.total) * 100 : null,
    };
  };
  const observation = row => {
    const classified = row.positive + row.negative + row.neutral,
      valid =
        [row.total, row.positive, row.negative, row.neutral, classified].every(
          n => Number.isSafeInteger(n) && n >= 0
        ) && classified <= row.total;
    return {
      ...row,
      valid,
      unclassified: valid ? row.total - classified : null,
      positiveShare:
        valid && row.total > 0 ? (row.positive / row.total) * 100 : null,
    };
  };
  const button = (label, action, extra = "", primary = false) =>
    `<button type='button' class='button ${primary ? "primary" : ""}' data-in-action='${action}' ${extra}>${e(label)}</button>`;
  function view() {
    const start = now - period * 86400000,
      within = value =>
        new Date(value).getTime() >= start && new Date(value).getTime() <= now;
    const filtered = {
      keywords:
        mode === "empty"
          ? []
          : source.keywords
              .filter(row => within(row.lastSeenAt))
              .sort((a, b) => b.frequency - a.frequency || a.id - b.id),
      reports:
        mode === "empty"
          ? []
          : source.reports
              .filter(row => within(row.weekEnd))
              .sort(
                (a, b) => b.weekEnd.localeCompare(a.weekEnd) || b.id - a.id
              ),
      tests:
        mode === "empty"
          ? []
          : source.tests
              .filter(row => within(row.createdAt))
              .sort(
                (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id
              ),
    };
    const rows = filtered[tab],
      count = rows.length,
      totalPages = Math.max(1, Math.ceil(count / 20));
    pages[tab] = Math.min(pages[tab], totalPages);
    return {
      filtered,
      count,
      totalPages,
      page: pages[tab],
      rows: rows.slice((pages[tab] - 1) * 20, pages[tab] * 20),
    };
  }
  function keywordView(current) {
    const categoriesIn = Object.entries(categories)
      .map(([id, label]) => ({
        id,
        label,
        count: current.filtered.keywords.filter(row => row.category === id)
          .length,
      }))
      .filter(row => row.count);
    return `<p class='hint'>الفترة تختار سجلات الكلمات بحسب آخر ظهور محفوظ. التكرار تراكمي طوال عمر السجل، وليس عدد رسائل الفترة. حالة «إنشاء رد» لا تثبت تفعيل الرد أو تحسن البيع.</p><dl class='in-stats'>${[
      ["سجلات كلمات في الفترة", current.count],
      [
        "سجلات لها نص مقترح",
        current.filtered.keywords.filter(row => row.suggestedResponse?.trim())
          .length,
      ],
      [
        "معلّمة بإنشاء رد",
        current.filtered.keywords.filter(
          row => row.status === "response_created"
        ).length,
      ],
    ]
      .map(
        ([label, value]) =>
          `<div class='panel panel-pad'><dt>${label}</dt><dd>${number(value)}</dd></div>`
      )
      .join(
        ""
      )}</dl><section class='panel panel-pad'><h2>توزيع سجلات الكلمات</h2>${categoriesIn.length ? `<ul class='in-categories'>${categoriesIn.map(row => `<li><div><span>${row.label}</span><span>${number(row.count)}</span></div><progress value='${row.count}' max='${current.count}' aria-label='${row.label}'></progress></li>`).join("")}</ul>` : "<p>لا توجد كلمات محفوظة بآخر ظهور ضمن هذه الفترة.</p>"}</section>${current.rows.map(row => `<article class='panel panel-pad in-card'><header><h2>${e(row.keyword)}</h2><span>${categories[row.category]} · ${statuses[row.status]}</span></header><p>التكرار التراكمي المسجل: ${number(row.frequency)}</p><p class='hint'>أول ظهور: ${date(row.firstSeenAt)} · آخر ظهور: ${date(row.lastSeenAt)}</p><details><summary>مراجعة النص المقترح</summary><p class='in-text'>${e(row.suggestedResponse?.trim() || "لا يوجد نص مقترح محفوظ لهذا السجل.")}</p><p class='hint'>اقتراح محفوظ يحتاج مراجعة المصادر والحقائق. لم يُنشأ أو يُفعّل رد من هذه الشاشة.</p></details></article>`).join("")}<a class='button' href='#/page/merchant/quick-responses'>إدارة الردود السريعة</a>`;
  }
  function reportsView(current) {
    return `<p class='hint'>تظهر التقارير التي ينتهي نطاقها داخل الفترة المختارة. تُعرض كل عينة مستقلة؛ قد تتداخل فترات التقارير، فلا تُجمع كعملاء فريدين.</p>${
      current.rows.length > 1
        ? `<figure class='panel panel-pad in-trend'><figcaption><h2>اتجاه المشاعر في التقارير المعروضة</h2><p class='hint'>مرتب من الأقدم للأحدث في هذه الصفحة. طول الشريط نسبة من عينة تقريره؛ الأعداد مكتوبة ولا تُجمع بين التقارير.</p></figcaption>${[
            ...current.rows,
          ]
            .reverse()
            .map(source => {
              const row = observation(source);
              return `<div><p class='hint'>${date(row.weekEnd)} · حجم العينة: ${number(row.total)}</p><div class='in-bars'>${[
                ["إيجابي", row.positive],
                ["محايد", row.neutral],
                ["سلبي", row.negative],
              ]
                .map(
                  ([label, value]) =>
                    `<div><small>${label}: ${number(value)}</small>${row.valid && row.total > 0 ? `<progress value='${value}' max='${row.total}' aria-label='${label} · ${e(date(row.weekEnd))}'></progress>` : ""}</div>`
                )
                .join("")}</div></div>`;
            })
            .join("")}</figure>`
        : ""
    }${
      current.rows
        .map(source => {
          const row = observation(source);
          return `<article class='panel panel-pad in-card'><h2>التقرير من ${date(row.weekStart)} إلى ${date(row.weekEnd)}</h2><p><strong class='in-ratio'>${ratio(row.positiveShare)}</strong> حصة المشاعر الإيجابية من عينة التقرير</p>${!row.valid ? `<p role='alert'>عدادات غير متسقة؛ لا يمكن احتساب نسبة موثوقة منها.</p>` : ""}<dl class='in-samples'>${[
            ["حجم العينة", row.total],
            ["إيجابي", row.positive],
            ["محايد", row.neutral],
            ["سلبي", row.negative],
            ["غير مصنّف", row.unclassified],
          ]
            .map(
              ([label, value]) =>
                `<div><dt>${label}</dt><dd>${value === null ? "غير متاح" : number(value)}</dd></div>`
            )
            .join(
              ""
            )}</dl><p class='hint'>النسبة = المصنّف إيجابيًا ÷ إجمالي عينة التقرير. تصنيف آلي للمشاعر؛ لا يمثل رضا مقاسًا أو شراءً مؤكدًا أو احتراف المبيعات. عدم وجود عينة يظهر «غير متاح».</p><p class='hint'>علامة البريد في السجل: ${row.emailMarkedSent ? "معلّم بالإرسال" : "غير معلّم بالإرسال"}. لا تثبت تسليم البريد أو قراءته.</p></article>`;
        })
        .join("") ||
      '<p class="panel panel-pad">لا توجد تقارير محفوظة تنتهي ضمن هذه الفترة.</p>'
    }`;
  }
  function testsView(current) {
    return `<p class='panel panel-pad hint'>سجلات A/B التقليدية للردود السريعة. عدادات ملاحظات قد تتكرر للعميل نفسه، وتفتقر إلى ربط التعرض والشراء الموثق. لا تثبت تحويلًا أو فائزًا إحصائيًا ولا تفعّل أي رد. الفترة بحسب إنشاء السجل؛ العدادات تراكمية.</p>${
      current.rows
        .map(
          row =>
            `<article class='panel panel-pad in-card'><header><div><h2>${e(row.name)}</h2><p>${e(row.keyword)}</p></div><span>${statuses[row.status]}</span></header><p class='hint'>إنشاء السجل: ${date(row.createdAt)}</p><div class='in-arms'>${[
              ["A", arm(row.variantA)],
              ["B", arm(row.variantB)],
            ]
              .map(
                ([name, value]) =>
                  `<section class='panel panel-pad'><h3>النسخة ${name}</h3><p class='in-text'>${e(value.text)}</p><p>ملاحظات مسجلة: ${number(value.total)} · معلّمة إيجابيًا: ${number(value.positive)}</p><p>نسبة العلامات الإيجابية: ${ratio(value.ratio)}</p>${!value.valid ? '<p role="alert">عدادات غير متسقة؛ لا يمكن احتساب نسبة موثوقة منها.</p>' : ""}</section>`
              )
              .join(
                ""
              )}</div><p class='hint'>الاختيار التاريخي المحفوظ: ${e(row.storedSelection || "دون اختيار نسخة")}. ليس إثبات فوز أو إذن تفعيل.</p></article>`
        )
        .join("") ||
      '<p class="panel panel-pad">لا توجد سجلات A/B أُنشئت ضمن هذه الفترة.</p>'
    }`;
  }
  function render(page) {
    if (route !== page.route) {
      route = page.route;
      tab = route.endsWith("/ab-tests") ? "tests" : "keywords";
      generation++;
      pending = false;
    }
    const current = view(),
      failed = ["error", "offline", "forbidden"].includes(mode),
      busy = pending || mode === "loading";
    return `<div class='in-workspace'><div class='in-actions'>${button("تصدير الصفحة CSV", "export", failed || busy || !current.rows.length ? "disabled" : "")}</div><details><summary>حالات مصدر البيانات لتجربة التصميم</summary><label class='field'>حالة المصدر<select id='in-mode'>${[
      ["normal", "البيانات"],
      ["empty", "عينة فارغة"],
      ["loading", "تحميل"],
      ["error", "فشل القراءة"],
      ["offline", "انقطاع الاتصال"],
      ["forbidden", "دون صلاحية"],
    ]
      .map(
        ([value, label]) =>
          `<option value='${value}' ${mode === value ? "selected" : ""}>${label}</option>`
      )
      .join(
        ""
      )}</select></label></details><fieldset ${busy ? "disabled" : ""}><legend>فترة السجل</legend><div class='in-actions'>${[7, 30, 90].map(value => button(value + " يوم", "period", `data-value='${value}' aria-pressed='${period === value}'`, period === value)).join("")}</div></fieldset>${
      busy
        ? '<p role="status" class="panel panel-pad">جارٍ تحديث البيانات…</p>'
        : failed
          ? `<section role='alert' class='panel panel-pad'><h2>${mode === "forbidden" ? "تحتاج صلاحية لهذا القسم" : mode === "offline" ? "تعذّر الاتصال" : "تعذّر عرض الصفحة"}</h2><p>لا نعرض أصفارًا بدل البيانات التي لم تصل. التصدير متوقف حتى نجاح القراءة.</p>${button("إعادة المحاولة", "recover")}</section>`
          : `<p class='hint'>من ${date(new Date(now - period * 86400000).toISOString())} إلى ${date(new Date(now).toISOString())}. التصدير يشمل صفحة التبويب المعروضة فقط.</p><div role='tablist' aria-label='تبويبات الرؤى' class='in-tabs'>${[
              ["keywords", "الكلمات والاقتراحات"],
              ["reports", "تقارير المشاعر"],
              ["tests", "سجل A/B"],
            ]
              .map(
                ([value, label]) =>
                  `<button type='button' id='in-tab-${value}' role='tab' aria-selected='${tab === value}' aria-controls='in-panel' tabindex='${tab === value ? 0 : -1}' data-in-action='tab' data-value='${value}'>${label}</button>`
              )
              .join(
                ""
              )}</div><section id='in-panel' role='tabpanel' aria-labelledby='in-tab-${tab}' class='in-panel'>${tab === "keywords" ? keywordView(current) : tab === "reports" ? reportsView(current) : testsView(current)}</section><nav class='in-pagination' aria-label='صفحات سجلات الرؤى'>${button("السابق", "previous", current.page <= 1 ? "disabled" : "")}<span>صفحة ${current.page} من ${current.totalPages} · ${current.count} سجل</span>${button("التالي", "next", current.page >= current.totalPages ? "disabled" : "")}</nav>`
    }</div>`;
  }
  function csv(rows) {
    return (
      "\uFEFF" +
      rows
        .map(row =>
          row
            .map(value => {
              let text = String(value ?? "");
              if (
                typeof value === "string" &&
                /^[\s\u0000-\u001f]*[=+\-@]/.test(text)
              )
                text = "'" + text;
              return '"' + text.replace(/"/g, '""') + '"';
            })
            .join(",")
        )
        .join("\r\n")
    );
  }
  function exportPage() {
    if (pending || ["loading", "error", "offline", "forbidden"].includes(mode))
      return;
    const current = view();
    if (!current.rows.length) return;
    let rows;
    if (tab === "keywords")
      rows = [
        [
          "keyword",
          "category",
          "lifetime_frequency",
          "record_status",
          "suggested_text",
          "first_seen_utc",
          "last_seen_utc",
        ],
        ...current.rows.map(row => [
          row.keyword,
          row.category,
          row.frequency,
          row.status,
          row.suggestedResponse,
          row.firstSeenAt,
          row.lastSeenAt,
        ]),
      ];
    else if (tab === "reports")
      rows = [
        [
          "id",
          "week_start_utc",
          "week_end_utc",
          "total",
          "positive",
          "negative",
          "neutral",
          "unclassified",
          "positive_share_percent",
          "valid_sample",
          "email_record_flag",
        ],
        ...current.rows.map(value => {
          const row = observation(value);
          return [
            row.id,
            row.weekStart,
            row.weekEnd,
            row.total,
            row.positive,
            row.negative,
            row.neutral,
            row.unclassified,
            row.positiveShare,
            String(row.valid),
            String(row.emailMarkedSent),
          ];
        }),
      ];
    else
      rows = [
        [
          "id",
          "name",
          "keyword",
          "status",
          "created_utc",
          "variant_a",
          "observations_a",
          "positive_flags_a",
          "ratio_a",
          "variant_b",
          "observations_b",
          "positive_flags_b",
          "ratio_b",
          "evidence",
          "activation_allowed",
        ],
        ...current.rows.map(row => [
          row.id,
          row.name,
          row.keyword,
          row.status,
          row.createdAt,
          row.variantA.text,
          row.variantA.total,
          row.variantA.positive,
          arm(row.variantA).ratio,
          row.variantB.text,
          row.variantB.total,
          row.variantB.positive,
          arm(row.variantB).ratio,
          "legacy_unverified_observations",
          "false",
        ]),
      ];
    const url = URL.createObjectURL(
        new Blob(
          [
            csv([
              ["preview", "local design sample"],
              ["period", period + "d"],
              ["from_utc", new Date(now - period * 86400000).toISOString()],
              ["through_utc", new Date(now).toISOString()],
              ["scope", "displayed page only"],
              [],
              ...rows,
            ]),
          ],
          { type: "text/csv;charset=utf-8" }
        )
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `sary-insights-preview-${tab}-${period}d-page-${current.page}.csv`;
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function refresh() {
    if (pending) return;
    const token = ++generation;
    pending = true;
    window.render();
    await Promise.resolve();
    if (token !== generation) return;
    pending = false;
    window.render();
    toast(
      ["error", "offline", "forbidden"].includes(mode)
        ? "تعذر تحديث البيانات. حاول مجددًا."
        : "حُدّثت البيانات التوضيحية."
    );
  }
  document.addEventListener("change", event => {
    if (event.target.id === "in-mode") {
      generation++;
      pending = false;
      mode = event.target.value;
      pages = { keywords: 1, reports: 1, tests: 1 };
      window.render();
    }
  });
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-in-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.inAction;
    if (action === "tab") {
      tab = button.dataset.value;
      window.render();
      document.getElementById("in-tab-" + tab)?.focus();
    }
    if (action === "period") {
      period = Number(button.dataset.value);
      pages = { keywords: 1, reports: 1, tests: 1 };
      window.render();
    }
    if (action === "next" || action === "previous") {
      pages[tab] += action === "next" ? 1 : -1;
      window.render();
    }
    if (action === "refresh") void refresh();
    if (action === "recover") {
      mode = "normal";
      void refresh();
    }
    if (action === "export") exportPage();
  });
  document.addEventListener("keydown", event => {
    const current = event.target.closest('[data-in-action="tab"]');
    if (!current) return;
    const tabs = ["keywords", "reports", "tests"];
    let index = tabs.indexOf(current.dataset.value);
    if (event.key === "ArrowLeft") index = (index + 1) % 3;
    else if (event.key === "ArrowRight") index = (index + 2) % 3;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = 2;
    else return;
    event.preventDefault();
    tab = tabs[index];
    window.render();
    document.getElementById("in-tab-" + tab)?.focus();
  });
  return {
    handles,
    render,
    primary: refresh,
    primaryLabel: () => "تحديث البيانات",
    canPrimary: () => !pending && mode !== "loading",
  };
})();
