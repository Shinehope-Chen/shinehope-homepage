const yearNode = document.querySelector("#year");

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

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
