"use strict";

(() => {
  if (document.__loyaltyFloatingEmbedLoaded) return;
  document.__loyaltyFloatingEmbedLoaded = true;

  const WRAPPER_SELECTOR = '[data-loyalty-global-floating="true"]';
  const CLOSED_SIZE = {
    width: "min(220px, 100vw)",
    height: "92px",
  };
  const OPEN_SIZE = {
    width: "min(420px, 100vw)",
    height: "min(720px, 100vh)",
  };

  function setImportantStyles(element, styles) {
    Object.entries(styles).forEach(([property, value]) => {
      element.style.setProperty(property, value, "important");
    });
  }

  function applyLayout(wrapper) {
    const isOpen = wrapper.classList.contains(
      "loyalty-points-widget--iframe-open",
    );

    setImportantStyles(wrapper, {
      position: "fixed",
      "z-index": "2147483000",
      right: "0",
      bottom: "0",
      left: "auto",
      margin: "0",
      transform: "none",
      "pointer-events": "none",
      ...(isOpen ? OPEN_SIZE : CLOSED_SIZE),
    });

    const iframe = wrapper.querySelector(
      ".loyalty-points-widget__floating-iframe",
    );
    if (!iframe) return;

    setImportantStyles(iframe, {
      display: "block",
      width: "100%",
      height: "100%",
      border: "0",
      background: "transparent",
      "pointer-events": "auto",
    });
  }

  function removeSectionFloatingWidgets(globalWrapper) {
    document
      .querySelectorAll(
        '[data-loyalty-points-widget][data-display-mode="floating"], [data-loyalty-floating-wrapper]:not([data-loyalty-global-floating="true"])',
      )
      .forEach((widget) => {
        if (widget !== globalWrapper) widget.remove();
      });
  }

  function initialize() {
    const wrappers = Array.from(document.querySelectorAll(WRAPPER_SELECTOR));
    const wrapper = wrappers.shift();
    if (!wrapper) return;

    wrappers.forEach((duplicate) => duplicate.remove());
    removeSectionFloatingWidgets(wrapper);

    if (wrapper.parentElement !== document.body) {
      document.body.appendChild(wrapper);
    }

    applyLayout(wrapper);
  }

  window.addEventListener("message", (event) => {
    if (event.data?.type !== "loyalty-floating-iframe-state") return;

    document.querySelectorAll(WRAPPER_SELECTOR).forEach((wrapper) => {
      const iframe = wrapper.querySelector(
        ".loyalty-points-widget__floating-iframe",
      );
      if (!iframe || iframe.contentWindow !== event.source) return;

      wrapper.classList.toggle(
        "loyalty-points-widget--iframe-open",
        Boolean(event.data.open),
      );
      applyLayout(wrapper);
    });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {once: true});
  } else {
    initialize();
  }

  document.addEventListener("shopify:section:load", initialize);
  window.addEventListener("pageshow", initialize);

  new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length > 0)) {
      initialize();
    }
  }).observe(document.documentElement, {childList: true, subtree: true});
})();
