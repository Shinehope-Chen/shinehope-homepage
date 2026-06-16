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
