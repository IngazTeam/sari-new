// Local synthetic data only. The optional export bundle shares the actual report implementation.
window.MessagePreview = (() => {
  const routes = [
    "message-analytics",
    "sari-analytics",
    "advanced-analytics",
    "analytics-dashboard",
    "voice-messages",
    "analysis",
  ].map(p => "/merchant/" + p);
  const handles = p => routes.includes(p?.route);
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
  const labels = {
    text: "نص",
    voice: "صوت",
    image: "صورة",
    document: "مستند",
    positive: "إيجابي",
    negative: "سلبي",
    neutral: "محايد",
    happy: "سعيد",
    angry: "غاضب",
    sad: "حزين",
    frustrated: "محبط",
  };
  const tabs = {
    messages: "الرسائل",
    sentiment: "المشاعر المحفوظة",
    products: "المنتجات والطلبات",
  };
  let period = 30,
    tab = "messages",
    mode = "normal",
    format = "xlsx",
    pending = false,
    exporting = false,
    generation = 0,
    exportLoader;
  let captured = Date.now();
  const num = n =>
    Number(n).toLocaleString("ar-SA", { maximumFractionDigits: 1 });
  const ratio = n => (n === null ? "غير متاح" : num(n) + "%");
  const control = (label, action, extra = "") =>
    `<button type="button" class="button" data-ma-action="${action}" ${extra}>${label}</button>`;
  const card = (title, value) =>
    `<div class="panel panel-pad"><dt>${e(title)}</dt><dd>${e(value)}</dd></div>`;
  const note = {
    window:
      "تشمل الفترة اليوم الحالي جزئيًا، وتُحسب الأيام والتوزيعات بتوقيت UTC.",
    messages:
      "تُعد الرسائل المحفوظة، بما فيها الصادرة. وجود رسالة صادرة لا يثبت وصولها للعميل.",
    sentiment:
      "أحدث تحليل محفوظ لكل رسالة واردة ضمن الفترة. النسب من كل الوارد، بما فيه غير المصنف. هذه تصنيفات وليست قياس رضا أو احتراف مبيعات.",
    confidence:
      "درجة يصرح بها المحلل نفسه وليست دقة مقاسة. يُحسب المتوسط للقيم بين 0 و100 فقط.",
    products:
      "أكثر 10 منتجات ذُكرت أسماؤها في الرسائل الواردة. الذكر لا يثبت نية الشراء، والأسعار المعروضة من الكتالوج الحالي.",
    orders:
      "رقم المحادثة يطابق رقم طلب من المتجر نفسه، وكلاهما أُنشئ خلال الفترة. تشمل الطلبات الملغاة وغير المدفوعة، ولا يثبت التطابق أن المساعد سبب الطلب أو تحقق الدفع.",
  };
  function snapshot() {
    const empty = mode === "empty",
      through = new Date(Math.floor(captured / 1000) * 1000),
      start = new Date(through);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - period + 1);
    const total = empty ? 0 : period * 10,
      incoming = total * 0.6,
      classified = (incoming * 2) / 3;
    return {
      merchantId: 1,
      period: period + "d",
      from: start.toISOString(),
      through: through.toISOString(),
      timeZone: "UTC",
      messages: {
        total,
        incoming,
        outgoing: total - incoming,
        activeConversations: empty ? 0 : period * 2,
        byType: Object.keys(labels)
          .slice(0, 4)
          .map((kind, i) => ({
            kind,
            count: total * [0.6, 0.2, 0.1, 0.1][i],
            share: empty ? null : [60, 20, 10, 10][i],
          })),
      },
      daily: Array.from({ length: period }, (_, i) => ({
        date: new Date(start.getTime() + i * 86400000)
          .toISOString()
          .slice(0, 10),
        count: empty ? 0 : 10,
      })),
      hourly: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        count: empty
          ? 0
          : hour === 10
            ? period * 6
            : hour === 14
              ? period * 4
              : 0,
      })),
      sentiment: {
        incoming,
        classified,
        unclassified: incoming - classified,
        classificationCoverage: empty ? null : (classified / incoming) * 100,
        distribution: Object.keys(labels)
          .slice(4)
          .map((kind, i) => ({
            kind,
            count: empty ? 0 : [period, period, period, period, 0, 0, 0][i],
            share: empty
              ? null
              : ([period, period, period, period, 0, 0, 0][i] / incoming) * 100,
          })),
        confidence: {
          average: empty ? null : 80,
          validCount: classified,
          invalidCount: 0,
          meaning: "model_self_report_not_accuracy",
        },
        evidenceKind: "latest_stored_analysis_per_incoming_message",
        measuredSatisfaction: null,
      },
      products: {
        rows: empty
          ? []
          : [
              {
                productId: 1,
                productName:
                  "بن كولومبيا · 250 جم — اسم كامل طويل لتجربة التفاف النص دون حذف أي جزء منه",
                price: 6400,
                priceUnit: "minor",
                currency: "SAR",
                mentionCount: period,
              },
              {
                productId: 2,
                productName: "منتج محلي بسعر يحتاج مراجعة",
                price: 70,
                priceUnit: "unverified",
                currency: "SAR",
                mentionCount: period / 1,
              },
            ],
        limit: 10,
        evidenceKind: "literal_current_catalog_name_in_incoming_text",
        priceMeaning: "current_catalog_price",
      },
      orderAssociation: {
        total: empty ? 0 : period * 2,
        positive: empty ? 0 : period,
        ratio: empty ? null : 50,
        valid: true,
        evidenceKind: "exact_phone_match_to_any_order_in_period",
        includesAllOrderStatuses: true,
        salesConversion: null,
        salesProficiency: null,
      },
    };
  }
  function distribution(rows) {
    return rows
      .map(
        row =>
          `<div class="ma-distribution"><div><span>${e(labels[row.kind])}</span><span>${num(row.count)} · ${ratio(row.share)}</span></div><div class="ma-track" aria-hidden="true"><i style="width:${row.share ?? 0}%"></i></div></div>`
      )
      .join("");
  }
  function series(title, caption, rows) {
    const max = Math.max(1, ...rows.map(r => r.count));
    return `<section class="panel panel-pad"><h2>${title}</h2><p>${e(caption)}</p><div class="ma-series" aria-hidden="true">${rows.map(r => `<i title="${e(r.name)}: ${r.count}" style="height:${(r.count / max) * 100}%"></i>`).join("")}</div><details><summary>عرض الأرقام كاملة · ${rows.length}</summary><div class="ma-scroll"><table><caption class="sr-only">${title}</caption><thead><tr><th>اليوم / الساعة</th><th>العدد</th></tr></thead><tbody>${rows.map(r => `<tr><th scope="row" dir="ltr">${r.name}</th><td>${num(r.count)}</td></tr>`).join("")}</tbody></table></div></details></section>`;
  }
  function body(s) {
    if (tab === "messages")
      return `<section class="panel panel-pad"><h2>أنواع الرسائل</h2><p>${note.messages}</p>${distribution(s.messages.byType)}</section><div class="ma-series-grid">${series(
        "الرسائل يومًا بيوم",
        note.window,
        s.daily.map(r => ({ name: r.date, count: r.count }))
      )}${series(
        "التوزيع حسب الساعة",
        "تجميع الرسائل بحسب ساعة حفظها في UTC طوال الفترة المحددة.",
        s.hourly.map(r => ({
          name: String(r.hour).padStart(2, "0") + ":00",
          count: r.count,
        }))
      )}</div>`;
    if (tab === "sentiment")
      return `<p class="page-local-note">${note.sentiment}</p><dl class="ma-stats">${card("رسائل مصنفة", num(s.sentiment.classified))}${card("رسائل غير مصنفة", num(s.sentiment.unclassified))}${card("تغطية التصنيف", ratio(s.sentiment.classificationCoverage))}</dl><section class="panel panel-pad">${distribution(s.sentiment.distribution)}</section><details class="panel panel-pad"><summary>تفاصيل ثقة المحلل</summary><p>${note.confidence}</p><dl class="ma-detail">${[
        ["متوسط الثقة المحفوظة", ratio(s.sentiment.confidence.average)],
        ["قيم صالحة للمتوسط", num(s.sentiment.confidence.validCount)],
        ["قيم خارج المجال", num(s.sentiment.confidence.invalidCount)],
      ]
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
        .join("")}</dl></details>`;
    return `<section class="panel panel-pad"><h2>إشارات أسماء المنتجات</h2><p>${note.products}</p>${s.products.rows.length ? s.products.rows.map(r => `<article class="ma-product"><div><h3>${e(r.productName)}</h3><p>${r.priceUnit === "minor" ? num(r.price / 100) + " ر.س" : "السعر يحتاج مراجعة"}</p></div><p>رسائل تطابق الاسم: <strong>${num(r.mentionCount)}</strong></p></article>`).join("") : "<p>لا توجد مطابقة لأسماء المنتجات في هذه الفترة.</p>"}</section><section class="panel panel-pad"><h2>ارتباط المحادثات بطلبات</h2><p>${note.orders}</p><dl class="ma-stats">${card("محادثات أُنشئت في الفترة", num(s.orderAssociation.total))}${card("محادثات بأرقام لها طلب", num(s.orderAssociation.positive))}${card("حصة الارتباط بالرقم", ratio(s.orderAssociation.ratio))}</dl><p>احتراف المبيعات: <strong>غير مقاس بهذه البيانات</strong></p></section>`;
  }
  const readable = () =>
    !["error", "offline", "forbidden", "loading"].includes(mode) && !pending;
  function render() {
    const s = snapshot();
    const tools = `<div class="ma-tools"><label for="ma-period">الفترة<select id="ma-period">${[7, 30, 90].map(n => `<option value="${n}" ${n === period ? "selected" : ""}>آخر ${n} يومًا</option>`).join("")}</select></label><label for="ma-mode">حالة البيانات التوضيحية<select id="ma-mode">${Object.entries(
      {
        normal: "بيانات متاحة",
        empty: "لا توجد رسائل",
        loading: "جارٍ التحميل",
        error: "تعذر القراءة",
        offline: "تعذر الاتصال",
        forbidden: "صلاحية غير متاحة",
        "export-failure": "تعذر تجهيز الملف",
      }
    )
      .map(
        ([v, l]) =>
          `<option value="${v}" ${mode === v ? "selected" : ""}>${l}</option>`
      )
      .join("")}</select></label></div>`;
    let content;
    if (!readable())
      content = `<section class="panel panel-pad" ${mode === "loading" || pending ? 'role="status" aria-busy="true"' : 'role="alert"'}><h2>${pending || mode === "loading" ? "نجهّز مساحة عملك" : mode === "forbidden" ? "تحتاج صلاحية لهذا القسم" : mode === "offline" ? "تعذّر الاتصال" : "تعذّر عرض البيانات"}</h2><p>لا تُعرض بيانات قديمة أو أصفار بدل القراءة التي لم تكتمل.</p>${pending || mode === "loading" ? "" : control("استعادة القراءة في المثال", "recover")}</section>`;
    else
      content = `<section class="panel panel-pad"><p>بداية الفترة: <bdi>${s.from}</bdi> · آخر وقت مشمول: <bdi>${s.through}</bdi></p><p>${note.window}</p></section><dl class="ma-stats ma-four">${card("كل الرسائل", num(s.messages.total))}${card("رسائل واردة", num(s.messages.incoming))}${card("رسائل صادرة", num(s.messages.outgoing))}${card("محادثات بها رسائل", num(s.messages.activeConversations))}</dl>${mode === "empty" ? '<p class="page-local-note" role="status">لا توجد رسائل محفوظة خلال هذه الفترة. هذه نتيجة قراءة ناجحة.</p>' : ""}<div class="ma-tabs" role="tablist" aria-label="أقسام التحليلات">${Object.entries(
        tabs
      )
        .map(
          ([key, value]) =>
            `<button id="ma-tab-${key}" data-ma-action="tab" data-value="${key}" role="tab" aria-selected="${tab === key}" tabindex="${tab === key ? 0 : -1}" aria-controls="ma-panel">${value}</button>`
        )
        .join(
          ""
        )}</div><div id="ma-panel" role="tabpanel" aria-labelledby="ma-tab-${tab}" tabindex="0">${body(s)}</div><section class="panel panel-pad ma-export"><div><h2>تصدير اللقطة كاملة</h2><p>يشمل الأقسام الثمانية من بيانات المثال وتعريفاتها، وليس التبويب الظاهر وحده.</p></div><div class="ma-tools"><label for="ma-format">صيغة الملف<select id="ma-format" ${exporting ? "disabled" : ""}>${["xlsx", "pdf", "csv"].map(f => `<option value="${f}" ${f === format ? "selected" : ""}>${f === "xlsx" ? "Excel" : f.toUpperCase()}</option>`).join("")}</select></label>${control(exporting ? "جارٍ تجهيز الملف…" : "تصدير اللقطة كاملة", "export", exporting ? "disabled" : "")}</div></section>`;
    return `<div class="ma-workspace">${tools}${content}</div>`;
  }
  async function exporter() {
    if (window.MessageExportPreview) return window.MessageExportPreview;
    exportLoader ??= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "message-export.js";
      script.onload = () => resolve(window.MessageExportPreview);
      script.onerror = () => {
        script.remove();
        exportLoader = undefined;
        reject(Error("unavailable"));
      };
      document.head.append(script);
    });
    return exportLoader;
  }
  async function exportFile() {
    if (exporting || !readable()) return;
    const token = generation,
      s = snapshot(),
      chosen = format;
    exporting = true;
    window.render();
    try {
      if (mode === "export-failure") throw Error("simulated");
      const api = await exporter();
      const blob = await api.exportSnapshot(s, chosen);
      if (token !== generation || !readable()) return;
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `sary-messages-preview-${period}d.${chosen}`;
      a.hidden = true;
      document.body.append(a);
      try {
        a.click();
      } finally {
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      toast("جُهّز ملف المثال وطُلب تنزيله من المتصفح.");
    } catch {
      if (token === generation) toast("تعذر تجهيز الملف. أعد المحاولة.");
    } finally {
      if (token === generation) {
        exporting = false;
        window.render();
      }
    }
  }
  async function refresh() {
    if (pending) return;
    const token = ++generation;
    pending = true;
    exporting = false;
    window.render();
    await Promise.resolve();
    if (token !== generation) return;
    pending = false;
    captured = Date.now();
    window.render();
    toast(
      readable()
        ? "حُدّثت بيانات المثال المحلي."
        : "تعذر تحديث البيانات. حاول مجددًا."
    );
  }
  document.addEventListener("change", event => {
    const el = event.target;
    if (!["ma-period", "ma-mode", "ma-format"].includes(el.id)) return;
    if (el.id === "ma-format") format = el.value;
    else {
      generation++;
      pending = false;
      exporting = false;
      if (el.id === "ma-period") period = Number(el.value);
      else mode = el.value;
    }
    window.render();
    document.getElementById(el.id)?.focus();
  });
  document.addEventListener("click", event => {
    const el = event.target.closest("[data-ma-action]");
    if (!el || el.disabled) return;
    const action = el.dataset.maAction;
    if (action === "tab") {
      tab = el.dataset.value;
      window.render();
      document.getElementById("ma-tab-" + tab)?.focus();
    }
    if (action === "export") void exportFile();
    if (action === "recover") {
      mode = "normal";
      void refresh();
    }
  });
  document.addEventListener("keydown", event => {
    const el = event.target.closest('[data-ma-action="tab"]');
    if (!el) return;
    const keys = Object.keys(tabs);
    let index = keys.indexOf(tab);
    if (event.key === "ArrowLeft") index = (index + 1) % 3;
    else if (event.key === "ArrowRight") index = (index + 2) % 3;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = 2;
    else return;
    event.preventDefault();
    tab = keys[index];
    window.render();
    document.getElementById("ma-tab-" + tab)?.focus();
  });
  window.addEventListener("hashchange", () => {
    generation++;
    pending = false;
    exporting = false;
  });
  return {
    handles,
    render,
    primary: refresh,
    primaryLabel: () => "تحديث البيانات",
    canPrimary: () => !pending && mode !== "loading",
  };
})();
