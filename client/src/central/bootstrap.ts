import { renderPlanLimits } from "./plan-features";
import {
  createTRPCProxyClient,
  httpBatchLink,
  TRPCClientError,
} from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";
import {
  centralLanguage,
  centralHref,
  getCentralPage,
} from "../../../shared/central/catalog";
import {
  renderCentralMarkup,
  escapeHtml,
} from "../../../shared/central/render";
import { renderCentralHead } from "../../../shared/central/seo";
import { resolveSupportLeadContext } from "../../../shared/support-lead";
import { icon } from "../../../shared/central/icons";
import { safeCheckoutReturn, wireTransactions } from "./transactions";

export function bootstrapCentral() {
  const lang = centralLanguage(location.search),
    localizedText = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const href = (p: string) => centralHref(p, lang),
    e = escapeHtml;
  const page = getCentralPage(location.pathname, lang);
  if (!page) return;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.classList.add("central-page");
  document.body.classList.add("central-page");
  const root = document.getElementById("root")!;
  // Production HTML is already complete. This fallback also supports Vite's
  // standalone development server without replacing a user's live form input.
  if (!root.querySelector(".central-site"))
    root.innerHTML = renderCentralMarkup(location.pathname, lang);
  if (!document.querySelector("[data-central-seo]")) {
    document.head
      .querySelectorAll(
        'title,meta[name="description"],meta[name="robots"],link[rel="canonical"],link[hreflang],meta[property^="og:"],meta[name^="twitter:"]'
      )
      .forEach(n => n.remove());
    document.head.insertAdjacentHTML(
      "beforeend",
      renderCentralHead(location.pathname, lang)
    );
  }
  for (const file of ["central", "refinements", "identity"])
    if (!document.querySelector(`link[href^="/central/${file}.css"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `/central/${file}.css?v=${file === "identity" ? "20260924-2" : "20260923-2"}`;
      document.head.append(link);
    }
  const $ = <T extends Element = HTMLElement>(s: string) =>
    root.querySelector<T>(s);
  const $$ = (s: string) => Array.from(root.querySelectorAll<HTMLElement>(s));
  const api = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: (input, init) =>
          fetch(input, { ...init, credentials: "include" }),
      }),
    ],
  });
  const message = (text: string, error = false, target = "#form-feedback") => {
    const box = $(target);
    if (!box) return;
    box.innerHTML = `<div class="inline-notice ${error ? "error" : "success"}">${e(text)}</div>`;
    box.setAttribute("role", error ? "alert" : "status");
    box.focus();
  };
  const failure = (err: unknown) =>
    err instanceof TRPCClientError && err.data?.code === "TOO_MANY_REQUESTS"
      ? localizedText(
          "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
          "Too many attempts. Please wait before trying again."
        )
      : localizedText(
          "تعذرت العملية. تحقق من المعلومات وحاول مرة أخرى.",
          "We could not complete the action. Check the details and try again."
        );
  const menu = $<HTMLDialogElement>("#central-menu");
  $("[data-menu-open]")?.addEventListener("click", () => menu?.showModal());
  $("[data-menu-close]")?.addEventListener("click", () => menu?.close());
  menu?.addEventListener("click", ev => {
    if (ev.target === menu) menu.close();
  });
  $$("[data-language-switch]").forEach(a => {
    const url = new URL((a as HTMLAnchorElement).href);
    for (const key of ["domain", "platform", "topic", "billing", "tap_id"]) {
      const value = new URLSearchParams(location.search).get(key);
      if (value) url.searchParams.set(key, value);
    }
    const next = safeCheckoutReturn(
      new URLSearchParams(location.search).get("next"),
      lang === "ar" ? "en" : "ar"
    );
    if (next) url.searchParams.set("next", next);
    (a as HTMLAnchorElement).href = url.pathname + url.search + location.hash;
  });
  $$(".nav-dropdown").forEach(node =>
    node.addEventListener("toggle", () => {
      if ((node as HTMLDetailsElement).open)
        $$(".nav-dropdown")
          .filter(n => n !== node)
          .forEach(n => ((n as HTMLDetailsElement).open = false));
    })
  );
  document.addEventListener("click", ev => {
    if (!(ev.target as Element).closest(".nav-dropdown"))
      $$(".nav-dropdown").forEach(
        n => ((n as HTMLDetailsElement).open = false)
      );
  });
  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape")
      $$(".nav-dropdown").forEach(
        n => ((n as HTMLDetailsElement).open = false)
      );
  });
  $$("[data-password]").forEach(button =>
    button.addEventListener("click", () => {
      const input = $<HTMLInputElement>("#" + button.dataset.password)!;
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      button.setAttribute("aria-pressed", String(visible));
      button.setAttribute(
        "aria-label",
        visible
          ? localizedText("إخفاء كلمة المرور", "Hide password")
          : localizedText("إظهار كلمة المرور", "Show password")
      );
    })
  );

  let category = "*";
  function search() {
    const query = ($<HTMLInputElement>("#central-search")?.value || "")
      .trim()
      .toLocaleLowerCase(lang);
    let count = 0;
    $$("[data-search-card]").forEach(card => {
      const visible =
        (category === "*" || card.dataset.category === category) &&
        card.textContent!.toLocaleLowerCase(lang).includes(query);
      card.hidden = !visible;
      if (visible) count++;
    });
    $$("[data-help-group]").forEach(
      g => (g.hidden = !g.querySelector("[data-search-card]:not([hidden])"))
    );
    const empty = $("#central-empty");
    if (empty) empty.hidden = count > 0;
  }
  $("#central-search")?.addEventListener("input", search);
  $$("[data-filter]").forEach(button =>
    button.addEventListener("click", () => {
      category = button.dataset.filter!;
      $$("[data-filter]").forEach(b =>
        b.setAttribute("aria-pressed", String(b === button))
      );
      search();
    })
  );

  let sector = "commerce";
  const demoContent = {
    commerce: {
      name: localizedText("متجر ورق", "Waraq store"),
      greeting: localizedText(
        "يا هلا! تدور على هدية أو دفتر لأفكارك الكبيرة؟",
        "Hello! Looking for a gift or a notebook for your big ideas?"
      ),
      questions: [
        localizedText("أدور على هدية", "I’m looking for a gift"),
        localizedText("كيف أكمل الطلب؟", "How do I order?"),
        localizedText("أحتاج أكلم الفريق", "I need the team"),
      ],
      replies: [
        localizedText(
          "عندنا في هذا المثال دفتر بغلاف أخضر. وش تفضّل: هدية لشخص، أو أدوات لفريقك؟",
          "In this example, we have a green notebook. Is it a gift for one person or supplies for your team?"
        ),
        localizedText(
          "نراجع المنتج والكمية والبيانات المطلوبة، ثم نوضح لك الخطوة التالية. هذه محاكاة ولا تنشئ طلبًا.",
          "We would review the product, quantity and required details, then explain the next step. This example creates no real order."
        ),
        localizedText(
          "في النشاط الفعلي يتولى الفريق المحادثة مع بقاء سياقها. هنا نعرض مثالًا على انتقال واضح للموظف.",
          "In a real workspace, a teammate can take over with the conversation context. This illustrates that handover."
        ),
      ],
    },
    training: {
      name: localizedText("مركز التدريب", "Training centre"),
      greeting: localizedText(
        "أهلًا بطموحك! أي مهارة ودّك تطوّرها؟",
        "Welcome! What skill would you like to develop?"
      ),
      questions: [
        localizedText("أدور على دورة", "I’m looking for a course"),
        localizedText("كيف أسجل؟", "How do I enrol?"),
        localizedText("عندي سؤال للفريق", "I have a question for the team"),
      ],
      replies: [
        localizedText(
          "نبدأ بهدفك ومستواك، ثم نعرض معلومات الدورات المتاحة في بيانات المركز. أي مجال يهمك؟",
          "We start with your goals and experience, then use the centre’s available course information. Which field interests you?"
        ),
        localizedText(
          "نوضح المحتوى والموعد والمتطلبات، ثم نتبع مسار التسجيل المدعوم. لا يتم تسجيل فعلي من هذه التجربة.",
          "We explain the content, schedule and requirements, then follow the supported registration process. This example does not enrol you."
        ),
        localizedText(
          "الأسئلة الخاصة ومتطلبات التسجيل غير الواضحة تنتقل للفريق ليكمل معك.",
          "The team handles special questions and enrolment requirements that need clarification."
        ),
      ],
    },
    services: {
      name: localizedText("مساحة للخدمات", "Service studio"),
      greeting: localizedText(
        "يا هلا! وش الخدمة اللي تحتاجها؟",
        "Hello! What service do you need?"
      ),
      questions: [
        localizedText("أبغى أعرف الخدمات", "Tell me about your services"),
        localizedText("كيف أحجز؟", "How do I book?"),
        localizedText("أحتاج أغيّر الموعد", "I need to reschedule"),
      ],
      replies: [
        localizedText(
          "نشرح الخدمة ومدتها ومتطلباتها من معلومات النشاط، ثم نساعدك تختار الأنسب.",
          "We explain the service, duration and requirements from business information and help you choose."
        ),
        localizedText(
          "نجمع تفضيلاتك ونراجع التوفر عبر الأدوات المربوطة قبل التأكيد. لا يُحجز موعد فعلي هنا.",
          "We collect your preferences and check availability through connected tools before confirmation. No real appointment is booked here."
        ),
        localizedText(
          "نراجع تفاصيل طلب التغيير مع الفريق أو النظام المدعوم، ونوضح النتيجة المؤكدة.",
          "We review the requested change with the team or supported system and communicate the confirmed result."
        ),
      ],
    },
  };
  const demoData = () => demoContent[sector as keyof typeof demoContent];
  const resetDemo = () => {
    if (!$("#demo-messages")) return;
    $("#demo-business")!.textContent = demoData().name;
    $("#demo-messages")!.innerHTML =
      `<div class="message bot">${e(demoData().greeting)}</div>`;
    $("#demo-suggestions")!.innerHTML = demoData()
      .questions.map(
        (q, i) => `<button data-demo-question="${i}">${e(q)}</button>`
      )
      .join("");
    $$("[data-demo-sector]").forEach(b => {
      b.classList.toggle("active", b.dataset.demoSector === sector);
      b.setAttribute("aria-pressed", String(b.dataset.demoSector === sector));
    });
  };
  const reply = (text: string, index?: number) => {
    const box = $("#demo-messages");
    if (!box || !text.trim()) return;
    const answer =
      index === undefined
        ? localizedText(
            "شكرًا لتوضيحك. في ساري نربط السؤال بمعلومات نشاطك. جرّب الاقتراحات لتشاهد خطوات هذا المثال.",
            "Thanks for explaining. Sary connects the question with your business knowledge. Try a suggestion to explore this example."
          )
        : demoData().replies[index];
    box.insertAdjacentHTML(
      "beforeend",
      `<div class="message user">${e(text.trim())}</div><div class="message bot">${e(answer)}</div>`
    );
    box.scrollTop = box.scrollHeight;
  };
  root.addEventListener("click", ev => {
    const target = (ev.target as Element).closest<HTMLElement>(
      "[data-demo-question],[data-demo-sector],[data-demo-reset]"
    );
    if (!target) return;
    if (target.dataset.demoSector) {
      sector = target.dataset.demoSector;
      resetDemo();
    } else if (target.hasAttribute("data-demo-reset")) resetDemo();
    else {
      const i = Number(target.dataset.demoQuestion);
      reply(demoData().questions[i], i);
    }
  });
  $("#demo-form")?.addEventListener("submit", ev => {
    ev.preventDefault();
    const input = $<HTMLInputElement>("#demo-input")!;
    reply(input.value);
    input.value = "";
  });

  const auth = $<HTMLFormElement>("#central-auth");
  let token = "",
    tokenReady = false;
  const input = (name: string) =>
    auth?.elements.namedItem(name) as HTMLInputElement | null;
  if (auth?.dataset.action === "login") {
    try {
      const saved = localStorage.getItem("sari_remember_email");
      if (saved) {
        input("email")!.value = saved;
        input("remember")!.checked = true;
      }
      localStorage.removeItem("sari_remember_password");
    } catch {
      /* Storage may be blocked. */
    }
  }
  if (auth?.dataset.action === "signup") {
    for (const name of ["name", "email", "phone"]) {
      const value = new URLSearchParams(location.search).get(name);
      if (value) input(name)!.value = value.slice(0, 100);
    }
    $$('[data-signup-step="2"] input').forEach(
      i => ((i as HTMLInputElement).disabled = true)
    );
  }
  const signupStep = (step: number) => {
    $$("[data-signup-step]").forEach(part => {
      const selected = part.dataset.signupStep === String(step);
      part.hidden = !selected;
      part
        .querySelectorAll<HTMLInputElement>("input")
        .forEach(i => (i.disabled = !selected));
    });
    $("#signup-progress")!.textContent =
      step === 1
        ? localizedText(
            "الخطوة 1 من 2 · نبدأ بالتعارف",
            "Step 1 of 2 · Let’s get to know you"
          )
        : localizedText("الخطوة 2 من 2 · أمّن حسابك", "Step 2 of 2 · Secure your account");
    const first = $<HTMLInputElement>(`[data-signup-step="${step}"] input`);
    first?.focus();
  };
  $("[data-signup-next]")?.addEventListener("click", () => {
    if (auth?.reportValidity()) {
      if (
        !input("name")!.value.trim() ||
        !input("businessName")!.value.trim()
      ) {
        message(
          localizedText(
            "اكتب الاسم واسم النشاط للمتابعة.",
            "Enter your name and business name to continue."
          ),
          true
        );
        return;
      }
      signupStep(2);
    }
  });
  $("[data-signup-back]")?.addEventListener("click", () => signupStep(1));
  const busy = (form: HTMLFormElement, on: boolean) => {
    form.dataset.busy = String(on);
    form
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach(b => (b.disabled = on));
    form.setAttribute("aria-busy", String(on));
  };
  auth?.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (auth.dataset.busy === "true") return;
    const action = auth.dataset.action;
    if (
      action === "signup" &&
      !$<HTMLElement>('[data-signup-step="1"]')!.hidden
    ) {
      $("[data-signup-next]")!.click();
      return;
    }
    const value = (name: string) => input(name)?.value || "";
    const password = value(action === "reset" ? "newPassword" : "password");
    if (action === "signup" || action === "reset") {
      if (
        password.length < 8 ||
        password.length > 128 ||
        !/[A-Z]/.test(password) ||
        !/[0-9]/.test(password)
      ) {
        message(
          localizedText(
            "استخدم من 8 إلى 128 حرفًا، وحرفًا إنجليزيًا كبيرًا ورقمًا.",
            "Use 8–128 characters, including an uppercase letter and a number."
          ),
          true
        );
        return;
      }
      if (password !== value("confirmPassword")) {
        message(
          localizedText("كلمتا المرور غير متطابقتين.", "The passwords do not match."),
          true
        );
        return;
      }
    }
    busy(auth, true);
    message(localizedText("جارٍ تنفيذ طلبك…", "Working on your request…"));
    try {
      if (action === "login") {
        const params = new URLSearchParams(location.search);
        const domain = params.get("domain"),
          platform = params.get("platform");
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: value("email").trim(),
            password,
            ...(domain && platform ? { domain, platform } : {}),
          }),
        });
        if (!response.ok) {
          message(
            response.status === 429
              ? localizedText(
                  "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.",
                  "Too many attempts. Wait before trying again."
                )
              : response.status === 401 || response.status === 404
                ? localizedText(
                    "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
                    "The email address or password is incorrect."
                  )
                : localizedText(
                    "تعذر تسجيل الدخول الآن. حاول مرة أخرى.",
                    "Sign-in is unavailable. Please try again."
                  ),
            true
          );
          return;
        }
        const data = await response.json();
        try {
          if (input("remember")!.checked)
            localStorage.setItem("sari_remember_email", value("email"));
          else localStorage.removeItem("sari_remember_email");
          localStorage.removeItem("sari_remember_password");
          if (data.user)
            localStorage.setItem("user-info", JSON.stringify(data.user));
        } catch {
          /* Sign-in does not depend on local storage. */
        }
        input("password")!.value = "";
        location.assign(
          data.user?.role === "admin" || data.user?.role === "superadmin"
            ? "/admin/dashboard"
            : safeCheckoutReturn(
                new URLSearchParams(location.search).get("next"),
                lang
              ) || "/merchant/dashboard"
        );
      }
      if (action === "signup") {
        if (
          !input("acceptedTerms")?.checked ||
          !input("acceptedPrivacy")?.checked
        ) {
          message(
            localizedText(
              "يلزم قبول الشروط وسياسة الخصوصية.",
              "Accept the terms and privacy policy to continue."
            ),
            true
          );
          return;
        }
        await api.auth.signup.mutate({
          name: value("name").trim(),
          email: value("email").trim(),
          businessName: value("businessName").trim(),
          phone: value("phone").replace(/[ ()-]/g, ""),
          password,
          acceptedTerms: true,
          acceptedPrivacy: true,
          marketingConsent: !!input("marketingConsent")?.checked,
        });
        input("password")!.value = "";
        input("confirmPassword")!.value = "";
        location.assign(
          safeCheckoutReturn(
            new URLSearchParams(location.search).get("next"),
            lang
          ) || "/merchant/setup-wizard"
        );
      }
      if (action === "forgot") {
        await api.auth.requestPasswordReset.mutate({
          email: value("email").trim(),
        });
        auth.innerHTML = `<div class="inline-notice success" role="status"><h2>${localizedText("راجع بريدك.", "Check your inbox.")}</h2><p>${localizedText("إذا كان البريد مرتبطًا بحساب، ستصلك تعليمات استعادة كلمة المرور.", "If the email is associated with an account, you will receive password recovery instructions.")}</p></div>`;
      }
      if (action === "reset") {
        if (!tokenReady) throw new Error("Invalid token");
        await api.auth.resetPassword.mutate({ token, newPassword: password });
        token = "";
        tokenReady = false;
        auth.innerHTML = `<div class="inline-notice success" role="status"><p>${localizedText("تم تغيير كلمة المرور. سجّل دخولك بكلمتك الجديدة.", "Your password has been changed. Sign in with your new password.")}</p><a class="button green" href="${href("/login")}">${localizedText("تسجيل الدخول", "Sign in")}</a></div>`;
      }
    } catch (err) {
      message(failure(err), true);
    } finally {
      busy(auth, false);
    }
  });
  if (
    location.pathname.startsWith("/reset-password") ||
    location.pathname === "/verify-email" ||
    location.pathname === "/accept-invite"
  ) {
    const originalPath = location.pathname;
    token =
      new URLSearchParams(location.hash.slice(1)).get("token") ||
      (/^\/reset-password\/[a-f0-9]{64}$/i.test(originalPath)
        ? originalPath.split("/")[2]
        : "");
    const clean = originalPath.startsWith("/reset-password")
      ? "/reset-password"
      : originalPath;
    history.replaceState(null, "", href(clean));
    // Secret-bearing links stay within the current page; language changes carry
    // only the fragment (never a query parameter sent to the server).
    $$("[data-language-switch]").forEach(a => {
      if (token)
        (a as HTMLAnchorElement).href =
          centralHref(clean, lang === "ar" ? "en" : "ar") +
          "#token=" +
          encodeURIComponent(token);
    });
    const invalid = () =>
      message(
        localizedText(
          "الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.",
          "The link is invalid or has expired. Request a new one."
        ),
        true,
        "#token-status"
      );
    if (!/^[a-f0-9]{64}$/i.test(token)) invalid();
    else
      void (async () => {
        try {
          if (clean === "/reset-password") {
            await api.auth.verifyResetToken.query({ token });
            tokenReady = true;
            $<HTMLFieldSetElement>("#reset-fields")!.disabled = false;
            $("#token-status")!.textContent = "";
          }
          if (clean === "/verify-email") {
            await api.auth.emailVerification.verifyEmail.mutate({ token });
            token = "";
            message(
              localizedText("تم تأكيد بريدك بنجاح.", "Your email has been verified."),
              false,
              "#token-status"
            );
            $("#token-actions")!.innerHTML =
              `<a class="button green" href="/merchant/dashboard">${localizedText("افتح حسابك", "Open your account")}</a>`;
          }
          if (clean === "/accept-invite") {
            const invitation = await api.team.acceptInvite.mutate({ token });
            message(
              localizedText("دعوة للانضمام إلى: ", "Invitation to join: ") +
                invitation.merchantName,
              false,
              "#token-status"
            );
            $("#token-actions")!.innerHTML =
              `<p>${localizedText("اقبل الدعوة بالحساب الذي استلمها.", "Accept using the account that received this invitation.")}</p><button class="button green" id="accept-invitation">${localizedText("قبول الدعوة", "Accept invitation")}</button><a class="text-link" href="${href("/login")}" target="_blank" rel="noopener noreferrer">${localizedText("افتح تسجيل الدخول في نافذة أخرى", "Open sign-in in another tab")}</a>`;
            $("#accept-invitation")!.addEventListener("click", async ev => {
              const b = ev.currentTarget as HTMLButtonElement;
              b.disabled = true;
              try {
                await api.team.confirmInvite.mutate({ token });
                token = "";
                message(
                  localizedText(
                    "انضم حسابك للمتجر بنجاح.",
                    "Your account has joined the store."
                  ),
                  false,
                  "#token-status"
                );
                $("#token-actions")!.innerHTML =
                  `<a class="button green" href="/merchant/dashboard">${localizedText("افتح لوحة العمل", "Open the workspace")}</a>`;
              } catch {
                message(
                  localizedText(
                    "تعذر القبول. سجّل الدخول بالحساب الذي استلم الدعوة وتحقق من توثيق بريدك.",
                    "We could not accept the invitation. Sign in with the receiving account and ensure its email is verified."
                  ),
                  true,
                  "#token-status"
                );
                b.disabled = false;
              }
            });
          }
        } catch {
          invalid();
        }
      })();
  }

  const contact = $<HTMLFormElement>("#central-contact");
  if (contact) {
    let startedAt = Date.now();
    const context = resolveSupportLeadContext(location.search, lang);
    (contact.elements.namedItem("subject") as HTMLInputElement).value =
      context.subject;
    (contact.elements.namedItem("message") as HTMLTextAreaElement).value =
      context.message;
    void fetch("/api/public/status", {
      headers: { Accept: "application/json" },
    })
      .then(async response => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        $("#service-status")!.textContent =
          data.status === "operational"
            ? localizedText("حالة الخدمة: تعمل", "Service status: operational")
            : localizedText(
                "حالة الخدمة: بعض الخدمات متأثرة",
                "Service status: some services are degraded"
              );
      })
      .catch(() => {
        $("#service-status")!.textContent = localizedText(
          "تعذر التحقق من حالة الخدمة الآن.",
          "Service status is currently unavailable."
        );
      });
    contact.addEventListener("submit", async ev => {
      ev.preventDefault();
      if (contact.dataset.busy === "true") return;
      busy(contact, true);
      const form = Object.fromEntries(new FormData(contact));
      try {
        const response = await fetch("/api/public/support", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...form, source: context.source, startedAt }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.accepted || !result.reference) {
          message(
            response.status === 429
              ? localizedText(
                  "محاولات كثيرة. أعد المحاولة بعد قليل.",
                  "Too many attempts. Try again later."
                )
              : localizedText(
                  "لم يُرسل الطلب. راجع البيانات وحاول مجددًا، أو تواصل عبر البريد.",
                  "The request was not sent. Check the details and retry, or contact us by email."
                ),
            true
          );
          return;
        }
        message(
          localizedText(
            "استلمنا طلبك. رقم المتابعة: ",
            "We received your request. Reference: "
          ) + result.reference
        );
        contact.reset();
        startedAt = Date.now();
      } catch {
        message(
          localizedText(
            "تعذر إرسال الطلب. حاول مجددًا أو تواصل عبر البريد.",
            "The request could not be sent. Retry or contact us by email."
          ),
          true
        );
      } finally {
        busy(contact, false);
      }
    });
  }

  if ($("#central-transaction")) void wireTransactions(root, lang, api);
  if ($("#central-plans")) {
    let billing: "monthly" | "yearly" = "monthly";
    let plans: Awaited<
      ReturnType<typeof api.subscriptionPlans.listPlans.query>
    > = [];
    const renderPlans = () => {
      $("#central-plans")!.innerHTML = plans.length
        ? plans
            .map((p, i) => {
              const price = Number(
                billing === "monthly" ? p.monthlyPrice : p.yearlyPrice
              );
              const name =
                lang === "ar"
                  ? p.name
                  : p.nameEn || localizedText("باقة", "Plan") + " " + p.id;
              const description =
                lang === "ar" ? p.description : p.descriptionEn;
              return `<article class="plan-card ${i === 1 ? "featured" : ""}">${icon(["leaf", "sparkles", "zap"][i % 3], "plan-icon")}<h2>${e(name)}</h2><p>${e(description || "")}</p><div class="plan-price"><strong dir="ltr">${new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: 2 }).format(price)}</strong><span>${e(p.currency)} / ${billing === "monthly" ? localizedText("شهر", "month") : localizedText("سنة", "year")}</span></div><p class="billing-detail">${localizedText("السعر الحالي من النظام", "Current published price")}</p><a class="button ${i === 1 ? "lime" : "outline"}" href="${href("/subscribe/" + p.id + "?billing=" + billing)}">${localizedText("اختر الباقة", "Choose plan")}${icon("arrow-up-left", "directional")}</a>${renderPlanLimits(p, lang)}</article>`;
            })
            .join("")
        : `<div class="inline-notice">${localizedText("لا توجد باقات منشورة حاليًا. تواصل معنا لمعرفة الخيارات.", "No plans are currently published. Contact us for available options.")}</div>`;
    };
    const load = async () => {
      try {
        plans = await api.subscriptionPlans.listPlans.query();
        renderPlans();
      } catch {
        $("#central-plans")!.innerHTML =
          `<div class="inline-notice error" role="alert"><h2>${localizedText("تعذر تحميل الأسعار الحالية.", "Current prices are unavailable.")}</h2><p>${localizedText("حاول مجددًا أو تواصل معنا لمعرفة الخيارات.", "Retry or contact us for available options.")}</p><button class="button outline" id="retry-prices">${localizedText("إعادة المحاولة", "Try again")}</button></div>`;
        $("#retry-prices")!.addEventListener("click", () => void load());
      }
    };
    $$("[data-billing]").forEach(b =>
      b.addEventListener("click", () => {
        billing = b.dataset.billing as "monthly" | "yearly";
        $$("[data-billing]").forEach(x => {
          x.classList.toggle("active", x === b);
          x.setAttribute("aria-pressed", String(x === b));
        });
        if (plans.length) renderPlans();
      })
    );
    void load();
  }
}
