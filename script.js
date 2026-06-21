const yearNode = document.querySelector("#year");

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

const setupVisitorCounter = () => {
  if (document.querySelector(".visitor-counter")) {
    return;
  }

  const isChinese = document.documentElement.lang.toLowerCase().startsWith("zh");
  const copy = isChinese
    ? {
        title: "站点访问",
        views: "浏览量",
        visitors: "访客数",
        loading: "加载中",
        localViews: "本设备访问",
        unavailable: "线上统计暂不可用",
        aria: "站点访问统计",
      }
    : {
        title: "Site visits",
        views: "Views",
        visitors: "Visitors",
        loading: "Loading",
        localViews: "Local visits",
        unavailable: "Online counter unavailable",
        aria: "Site visit statistics",
      };

  const counter = document.createElement("aside");
  counter.className = "visitor-counter";
  counter.setAttribute("aria-label", copy.aria);
  counter.innerHTML = `
    <span class="visitor-counter__title">${copy.title}</span>
    <span class="visitor-counter__metric">
      <strong id="vercount_value_site_pv">${copy.loading}</strong>
      <span data-visitor-label="views">${copy.views}</span>
    </span>
    <span class="visitor-counter__divider" aria-hidden="true"></span>
    <span class="visitor-counter__metric">
      <strong id="vercount_value_site_uv">${copy.loading}</strong>
      <span data-visitor-label="visitors">${copy.visitors}</span>
    </span>
  `;

  document.body.appendChild(counter);

  const viewsValue = counter.querySelector("#vercount_value_site_pv");
  const visitorsValue = counter.querySelector("#vercount_value_site_uv");
  const viewsLabel = counter.querySelector('[data-visitor-label="views"]');
  const visitorsLabel = counter.querySelector('[data-visitor-label="visitors"]');
  const storageKey = "shinehope:local-visit-count";
  let localVisits = 1;

  try {
    const currentLocalVisits = Number.parseInt(localStorage.getItem(storageKey) || "0", 10);
    localVisits = Number.isFinite(currentLocalVisits) ? currentLocalVisits + 1 : 1;
    localStorage.setItem(storageKey, String(localVisits));
  } catch {
    localVisits = 1;
  }

  const hasOnlineCount = () => {
    const onlineValuePattern = /^\d[\d,]*$/;

    return onlineValuePattern.test(viewsValue.textContent.trim())
      && onlineValuePattern.test(visitorsValue.textContent.trim());
  };

  const syncOnlineCounterState = () => {
    if (!hasOnlineCount()) {
      return false;
    }

    viewsLabel.textContent = copy.views;
    visitorsLabel.textContent = copy.visitors;
    counter.dataset.counterState = "ready";
    window.clearTimeout(fallbackTimer);
    return true;
  };

  const observer = new MutationObserver(() => {
    syncOnlineCounterState();
  });

  const fallbackTimer = window.setTimeout(() => {
    if (syncOnlineCounterState()) {
      return;
    }

    viewsValue.textContent = localVisits.toLocaleString(isChinese ? "zh-CN" : "en");
    viewsLabel.textContent = copy.localViews;
    visitorsValue.textContent = "-";
    visitorsLabel.textContent = copy.unavailable;
    counter.dataset.counterState = "fallback";
  }, 8000);

  observer.observe(viewsValue, { childList: true, characterData: true, subtree: true });
  observer.observe(visitorsValue, { childList: true, characterData: true, subtree: true });

  if (!document.querySelector('script[src*="vercount.one/js"]')) {
    const vercountScript = document.createElement("script");
    vercountScript.defer = true;
    vercountScript.src = "https://events.vercount.one/js";
    vercountScript.onerror = () => {
      window.clearTimeout(fallbackTimer);
      viewsValue.textContent = localVisits.toLocaleString(isChinese ? "zh-CN" : "en");
      viewsLabel.textContent = copy.localViews;
      visitorsValue.textContent = "-";
      visitorsLabel.textContent = copy.unavailable;
      counter.dataset.counterState = "fallback";
      observer.disconnect();
    };
    document.body.appendChild(vercountScript);
  }
};

setupVisitorCounter();

const headerNode = document.querySelector(".site-header");

if (headerNode) {
  const updateHeaderState = () => {
    headerNode.classList.toggle("is-scrolled", window.scrollY > 24);
  };

  updateHeaderState();
  window.addEventListener("scroll", updateHeaderState, { passive: true });
}

const introVideo = document.querySelector(".hero-intro-video");

if (introVideo) {
  const completeIntro = (className = "home-intro-complete") => {
    document.body.classList.add(className);
    introVideo.classList.add("is-complete");
    introVideo.style.opacity = "0";
    introVideo.style.pointerEvents = "none";
    window.setTimeout(() => {
      introVideo.style.visibility = "hidden";
      introVideo.style.display = "none";
    }, 1300);
    introVideo.pause();
  };

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (motionQuery.matches) {
    completeIntro();
  } else {
    introVideo.addEventListener("ended", () => completeIntro(), { once: true });
    introVideo.addEventListener("error", () => completeIntro("home-intro-unavailable"), { once: true });

    const playRequest = introVideo.play();

    if (playRequest) {
      playRequest.catch(() => {
        completeIntro("home-intro-unavailable");
      });
    }
  }
}

const homeStage = document.querySelector(".home-stage");

if (homeStage) {
  const panelButtons = document.querySelectorAll("[data-home-target]");
  const panels = document.querySelectorAll("[data-home-panel]");
  const closeButtons = document.querySelectorAll("[data-home-close]");
  const hashToPanel = {
    "#profile": "profile",
    "#research": "research",
    "#life": "interests",
    "#interests": "interests",
  };

  const openPanel = (target) => {
    document.body.classList.add("home-panel-open");
    panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.homePanel === target);
    });
    panelButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.homeTarget === target);
    });
  };

  const closePanel = () => {
    document.body.classList.remove("home-panel-open");
    panels.forEach((panel) => panel.classList.remove("is-active"));
    panelButtons.forEach((button) => button.classList.remove("is-active"));
  };

  panelButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openPanel(button.dataset.homeTarget);
    });
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", closePanel);
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');

    if (!link) {
      return;
    }

    const panel = hashToPanel[link.getAttribute("href")];

    if (panel) {
      event.preventDefault();
      openPanel(panel);
      history.replaceState(null, "", link.getAttribute("href"));
    } else if (link.getAttribute("href") === "#top") {
      closePanel();
    }
  });

  const openHashPanel = () => {
    const panel = hashToPanel[window.location.hash];

    if (panel) {
      openPanel(panel);
    }
  };

  openHashPanel();
  window.addEventListener("hashchange", openHashPanel);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("home-panel-open")) {
      closePanel();
    }
  });
}

const revealNodes = document.querySelectorAll("[data-reveal]");

if (revealNodes.length) {
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16 }
    );

    revealNodes.forEach((node, index) => {
      node.style.transitionDelay = `${Math.min(index * 55, 260)}ms`;
      observer.observe(node);
    });
  } else {
    revealNodes.forEach((node) => {
      node.classList.add("is-visible");
    });
  }
}
