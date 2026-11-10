(() => {
  const consentKey = "drogalink-analytics";
  const measurementId = "G-FDTB9XF21K";
  const preferences = document.querySelector("#preferencias-analytics");
  const buttons = preferences.querySelector("[data-analytics-buttons]");
  const status = preferences.querySelector("[data-analytics-status]");
  let active = false;
  let recordEvent;

  function loadAnalytics() {
    if (active) return;
    active = true;
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    const page = location.pathname.startsWith("/carrinho") ? "/carrinho" : "/";
    gtag("js", new Date());
    gtag("config", measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: location.origin + page,
      page_referrer: "",
      page_title: page === "/" ? "Catálogo" : "Carrinho"
    });
    recordEvent = window.registrarEventoGA4 = (event) => {
      gtag("event", event, { loja: LojaAtual.slug() || "principal" });
    };
    window.registrarEventoGA4("page_view");

    const tag = document.createElement("script");
    tag.async = true;
    tag.referrerPolicy = "no-referrer";
    tag.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
    document.head.append(tag);
  }

  function updatePreference(choice) {
    preferences.open = !choice;
    status.textContent = choice === "yes" ? "Medição ativada." :
      choice === "no" ? "Medição desativada." :
      "Você aceita cookies de medição para ajudar a melhorar o catálogo?";
    if (choice === "yes") loadAnalytics();
  }

  buttons.addEventListener("click", (event) => {
    const choice = event.target.dataset.analyticsChoice;
    if (!choice) return;
    try {
      localStorage.setItem(consentKey, choice);
    } catch {
      if (choice === "yes") return;
    }
    if (active && choice === "no") {
      window["ga-disable-" + measurementId] = true;
      delete window.registrarEventoGA4;
      updatePreference(choice);
      return;
    }
    if (choice === "yes") {
      window["ga-disable-" + measurementId] = false;
      if (active) window.registrarEventoGA4 = recordEvent;
    }
    updatePreference(choice);
  });

  let choice;
  try { choice = localStorage.getItem(consentKey); } catch {}
  updatePreference(choice);
})();
