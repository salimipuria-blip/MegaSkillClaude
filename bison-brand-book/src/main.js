import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const loader = document.getElementById("loader");
const progress = document.getElementById("progress");
const toast = document.getElementById("toast");
const theater = document.getElementById("theater");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayClose = document.getElementById("overlay-close");

function bootMotion() {
  if (reduced) {
    loader?.classList.add("is-done");
    return;
  }

  const bar = loader?.querySelector(".loader-bar span");
  const tl = gsap.timeline({
    onComplete: () => loader?.classList.add("is-done"),
  });

  tl.from(".loader-mark", { opacity: 0, y: 24, duration: 0.9, ease: "expo.out" })
    .from(".loader-word", { opacity: 0, y: 16, duration: 0.6, ease: "expo.out" }, "-=0.45")
    .from(".loader-kicker", { opacity: 0, duration: 0.4 }, "-=0.3")
    .to(bar, { width: "100%", duration: 1.1, ease: "power2.inOut" }, 0.2)
    .to(".loader-inner", { opacity: 0, y: -12, duration: 0.45, ease: "power2.in" }, "+=0.15");

  gsap.to(".hero-media img", {
    scale: 1,
    ease: "none",
    scrollTrigger: {
      trigger: "#origin",
      start: "top top",
      end: "bottom top",
      scrub: 0.6,
    },
  });

  gsap.to(".scroll-hint i", {
    scaleY: 0.2,
    y: 18,
    repeat: -1,
    yoyo: true,
    duration: 1.1,
    ease: "power1.inOut",
  });

  const pin = document.querySelector(".manifesto-pin");
  if (pin && window.matchMedia("(min-width: 900px)").matches) {
    const lines = gsap.utils.toArray(".manifesto-copy p:not(.kicker)");
    gsap.set(lines, { opacity: 0.22 });
    gsap
      .timeline({
        scrollTrigger: {
          trigger: pin,
          start: "top top",
          end: "+=140%",
          scrub: 1,
          pin: true,
        },
      })
      .to(lines[0], { opacity: 1, duration: 0.4 })
      .to(lines[1], { opacity: 1, duration: 0.4 })
      .to(lines[2], { opacity: 1, duration: 0.4 });
  }

  gsap.utils.toArray(".section-head, .chapter-list a, .lockup, .swatch, .type-row, .voice-card, .dont-card, .mosaic figure, .mark-stage").forEach((el) => {
    gsap.from(el, {
      opacity: 0,
      y: 12,
      duration: 0.45,
      ease: "power1.out",
      scrollTrigger: {
        trigger: el,
        start: "top 90%",
        toggleActions: "play none none reverse",
      },
    });
  });
}

function bootScroll() {
  if (reduced) {
    document.documentElement.style.scrollBehavior = "smooth";
    window.addEventListener("scroll", () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? (window.scrollY / max) * 100 : 0;
      if (progress) progress.style.width = `${p}%`;
    });
    return;
  }

  const lenis = new Lenis({
    duration: 1.15,
    smoothWheel: true,
    touchMultiplier: 1.1,
  });

  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.tick(time * 1000));
  gsap.ticker.lagSmoothing(0);

  lenis.on("scroll", ({ progress: p }) => {
    if (progress) progress.style.width = `${p * 100}%`;
  });

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const id = link.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      lenis.scrollTo(target, { offset: -8 });
    });
  });
}

function bootNav() {
  const links = [...document.querySelectorAll(".nav-links a")];
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const setActive = () => {
    const y = window.scrollY + 120;
    let current = sections[0];
    sections.forEach((section) => {
      if (section.offsetTop <= y) current = section;
    });
    links.forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === `#${current.id}`);
    });
  };

  window.addEventListener("scroll", setActive, { passive: true });
  setActive();
}

function bootSwatches() {
  document.querySelectorAll(".swatch").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const hex = btn.dataset.hex;
      const name = btn.dataset.name;
      try {
        await navigator.clipboard.writeText(hex);
        showToast(`${name}  ${hex}  copied`);
      } catch {
        showToast(`${name}  ${hex}`);
      }
    });
  });
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-on");
  window.clearTimeout(showToast.tid);
  showToast.tid = window.setTimeout(() => toast.classList.remove("is-on"), 1800);
}

function bootDevices() {
  const tabs = document.querySelectorAll(".device-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => {
        item.classList.toggle("is-on", item === tab);
        item.setAttribute("aria-selected", item === tab ? "true" : "false");
      });
      theater?.setAttribute("data-view", tab.dataset.view);
    });
  });

  document.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => openLive(btn.dataset.open));
  });

  overlayClose?.addEventListener("click", closeLive);
  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) closeLive();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay?.classList.contains("is-open")) {
      closeLive();
    }
  });
}

function openLive(kind) {
  if (!overlay) return;
  overlay.hidden = false;
  overlay.dataset.live = kind;
  overlay.classList.add("is-open");
  if (overlayTitle) {
    overlayTitle.textContent = kind === "mobile" ? "BISON — Mobile" : "BISON — Desktop";
  }
  document.body.style.overflow = "hidden";
  overlayClose?.focus();
}

function closeLive() {
  if (!overlay) return;
  overlay.classList.remove("is-open");
  overlay.hidden = true;
  document.body.style.overflow = "";
}

window.addEventListener("load", () => {
  bootScroll();
  bootMotion();
  bootNav();
  bootSwatches();
  bootDevices();
  ScrollTrigger.refresh();
});
