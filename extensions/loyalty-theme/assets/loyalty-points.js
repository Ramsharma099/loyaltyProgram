"use strict";

(() => {
  const rewardTypePreferences = ["gift_card", "discount", "both"];

  function normalizeRewardTypePreference(value) {
    return rewardTypePreferences.includes(value) ? value : "both";
  }

  function getRewardsForPreference(rewards, preference) {
    const normalizedPreference = normalizeRewardTypePreference(preference);

    return rewards.filter((reward) => {
      const type = reward.type || "discount";
      return normalizedPreference === "both"
        ? type === "discount" || type === "gift_card"
        : type === normalizedPreference;
    });
  }

  function formatRewardTitle(reward) {
    if (reward.type === "gift_card") {
      return reward.title || `$${reward.amount} Gift Card`;
    }

    return `Discount $${reward.discount} for ${reward.points} points`;
  }

  function formatRewardDescription(reward) {
    if (reward.description) return reward.description;

    return reward.type === "gift_card"
      ? `Redeem ${reward.points} points for this gift card.`
      : `Redeem ${reward.points} points for a discount.`;
  }

  function appendText(parent, tagName, className, text) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function setRewardMessage(container, message, isError) {
    let messageElement = container.querySelector("[data-loyalty-reward-message]");

    if (!messageElement) {
      messageElement = document.createElement("p");
      messageElement.className = "loyalty-points-widget__reward-message";
      messageElement.dataset.loyaltyRewardMessage = "";
      container.prepend(messageElement);
    }

    messageElement.textContent = message;
    messageElement.classList.toggle(
      "loyalty-points-widget__reward-message--error",
      Boolean(isError),
    );
  }

  async function readJsonResponse(response, fallbackMessage) {
    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(fallbackMessage);
    }

    if (!response.ok || !data || typeof data !== "object") {
      throw new Error(data?.message || fallbackMessage);
    }

    return data;
  }

  async function hasCartItems() {
    const response = await fetch("/cart.js", {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Could not check your cart. Please try again.");
    }

    const data = await readJsonResponse(
      response,
      "Could not check your cart. Please try again.",
    );

    return Number(data.item_count || 0) > 0;
  }

  function openCheckoutWithReward(reward) {
    const code = encodeURIComponent(reward.rewardCode);

    if (reward.rewardType === "discount") {
      window.location.assign(`/discount/${code}?redirect=/checkout`);
      return;
    }

    window.location.assign(`/checkout?discount=${code}`);
  }

  async function redeemReward(widget, container, reward, button) {
    const dataset = widget.dataset;

    if (!dataset.apiBaseUrl || !dataset.customerId) {
      setRewardMessage(container, dataset.errorMessage, true);
      return;
    }

    const cta = button.querySelector(".loyalty-points-widget__reward-cta");
    const originalText = cta.textContent;

    button.disabled = true;
    button.classList.add("loyalty-points-widget__reward--loading");
    cta.textContent = "Redeeming...";
    setRewardMessage(container, "Creating your reward...", false);

    try {
      if (!(await hasCartItems())) {
        throw new Error("Please add product to cart");
      }

      const response = await fetch(
        `${dataset.apiBaseUrl.replace(/\/$/, "")}/api/redeem-points`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerId: dataset.loyaltyCustomerId || dataset.customerId,
            shop: dataset.shopDomain || "",
            pointsToRedeem: Number(reward.points),
            rewardType: reward.type || "discount",
          }),
        },
      );
      const data = await readJsonResponse(response, dataset.errorMessage);

      if (!data.success || !data.reward) {
        throw new Error(data.message || dataset.errorMessage);
      }

      setRewardMessage(container, "Reward created. Opening checkout...", false);
      openCheckoutWithReward(data.reward);
    } catch (error) {
      console.error("[loyalty-points] Could not redeem reward", error);
      setRewardMessage(container, error.message || dataset.errorMessage, true);
      button.disabled = false;
      button.classList.remove("loyalty-points-widget__reward--loading");
      cta.textContent = originalText;
    }
  }

  function createRewardItem(widget, container, reward, isAvailable) {
    const item = document.createElement("li");
    item.className = "loyalty-points-widget__reward";

    const button = document.createElement("button");
    button.className = "loyalty-points-widget__reward-button";
    button.type = "button";
    button.disabled = !isAvailable;
    button.setAttribute("aria-label", `Redeem ${formatRewardTitle(reward)}`);

    appendText(
      button,
      "p",
      "loyalty-points-widget__reward-title",
      formatRewardTitle(reward),
    );
    appendText(
      button,
      "p",
      "loyalty-points-widget__reward-description",
      formatRewardDescription(reward),
    );
    appendText(
      button,
      "span",
      "loyalty-points-widget__reward-cta",
      isAvailable ? "Redeem and checkout >" : `${reward.points} points required`,
    );

    if (isAvailable) {
      button.addEventListener("click", () => redeemReward(widget, container, reward, button));
    }

    item.appendChild(button);
    return item;
  }

  function renderRewardList(widget, container, rewards, points) {
    container.replaceChildren();

    const list = document.createElement("ul");
    list.className = "loyalty-points-widget__reward-list";

    rewards.forEach((reward) => {
      list.appendChild(
        createRewardItem(widget, container, reward, Number(reward.points) <= points),
      );
    });

    container.appendChild(list);
  }

  function renderAvailableRewards(widget, container, dataset, rewards, points) {
    if (dataset.showRewards !== "true") return;

    container.replaceChildren();

    const availableRewards = rewards.filter((reward) => Number(reward.points) <= points);
    appendText(
      container,
      "p",
      "loyalty-points-widget__rewards-title",
      dataset.rewardsHeading,
    );

    if (availableRewards.length === 0) {
      appendText(
        container,
        "p",
        "loyalty-points-widget__message",
        dataset.noRewardsMessage,
      );
      container.hidden = false;
      return;
    }

    renderRewardList(widget, container, availableRewards, points);
    container.hidden = false;
  }

  async function loadWidgetData(widget) {
    const dataset = widget.dataset;
    const status = widget.querySelector("[data-loyalty-status]");
    const balance = widget.querySelector("[data-loyalty-balance]");
    const balanceValue = widget.querySelector("[data-loyalty-balance-value]");
    const viewPoints = widget.querySelectorAll("[data-loyalty-view-points]");
    const rewardsContainer = widget.querySelector("[data-loyalty-rewards]");
    const allRewardsContainer = widget.querySelector("[data-loyalty-all-rewards]");
    const availableCount = widget.querySelector("[data-loyalty-available-count]");

    if (dataset.loggedIn !== "true") return;

    try {
      const params = new URLSearchParams({
        customerId: dataset.customerId || "",
        shop: dataset.shopDomain || "",
      });
      const response = await fetch(`${dataset.balanceUrl}?${params}`);
      const data = await readJsonResponse(response, dataset.errorMessage);

      if (!data.success) {
        throw new Error(data.message || dataset.errorMessage);
      }

      const points = Number(data.loyaltyPoints || 0);
      const rewards = Array.isArray(data.rewardOptions)
        ? getRewardsForPreference(data.rewardOptions, data.rewardTypePreference)
        : [];
      const availableRewards = rewards.filter(
        (reward) => Number(reward.points) <= points,
      );

      if (data.customerId) {
        widget.dataset.loyaltyCustomerId = String(data.customerId);
      }

      if (availableCount) {
        availableCount.textContent =
          availableRewards.length === 1
            ? "You have 1 reward available"
            : `You have ${availableRewards.length} rewards available`;
      }

      if (status) status.hidden = true;
      if (balance) balance.hidden = false;
      if (balanceValue) balanceValue.textContent = points.toLocaleString();
      viewPoints.forEach((element) => {
        element.textContent = points.toLocaleString();
      });

      if (rewardsContainer && rewards.length > 0 && data.checkoutRedemptionEnabled !== false) {
        renderAvailableRewards(widget, rewardsContainer, dataset, rewards, points);
      } else if (rewardsContainer) {
        rewardsContainer.hidden = true;
      }

      if (allRewardsContainer) {
        renderRewardList(widget, allRewardsContainer, rewards, points);
      }
    } catch (error) {
      console.error("[loyalty-points] Could not load balance", error);

      if (status) {
        status.hidden = false;
        status.textContent = dataset.errorMessage;
      }
      if (balance) balance.hidden = false;
      if (balanceValue) balanceValue.textContent = "--";
      if (rewardsContainer) rewardsContainer.hidden = true;
    }
  }

  function setWidgetOpen(widget, open, restoreFocus = false) {
    const launcher = widget.querySelector("[data-loyalty-toggle]");
    const panel = widget.querySelector("[data-loyalty-panel]");
    const closeButton = widget.querySelector("[data-loyalty-close]");

    if (!launcher || !panel) return;

    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    widget.classList.toggle("loyalty-points-widget--open", open);

    if (open) closeButton?.focus();
    if (!open && restoreFocus) launcher.focus();
  }

  function ensureCriticalStyles() {
    if (document.getElementById("loyalty-points-widget-critical-styles")) return;

    const style = document.createElement("style");
    style.id = "loyalty-points-widget-critical-styles";
    style.textContent = `
      .loyalty-points-widget--floating {
        position: fixed;
        z-index: 9999;
        right: 16px;
        bottom: 16px;
        left: auto;
        width: min(380px, calc(100vw - 32px));
        margin: 0;
        font-family: inherit;
      }

      .loyalty-points-widget--floating .loyalty-points-widget__launcher {
        display: flex;
        align-items: center;
        gap: 9px;
        min-height: 52px;
        margin-right: 0;
        margin-left: auto;
        border: 0;
        border-radius: 8px;
        padding: 0 20px;
        background: var(--loyalty-accent-color, #008060);
        color: #fff;
        box-shadow: 0 6px 20px rgba(32, 34, 35, 0.18);
        cursor: pointer;
        font: inherit;
        font-weight: 700;
      }

      .loyalty-points-widget--floating .loyalty-points-widget__inner {
        max-height: min(640px, calc(100vh - 96px));
        margin-bottom: 12px;
        overflow-y: auto;
        background: #fff;
        box-shadow: 0 12px 36px rgba(32, 34, 35, 0.22);
      }
    `;

    document.head.appendChild(style);
  }

  function mountFloatingWidget(widget) {
    if (widget.dataset.displayMode !== "floating") return;
    ensureCriticalStyles();

    if (widget.parentElement === document.body) return;

    document.body.appendChild(widget);
  }

  function initializeWidget(widget) {
    mountFloatingWidget(widget);

    if (widget.dataset.loyaltyReady === "true") return;

    widget.dataset.loyaltyReady = "true";

    widget.querySelectorAll("[data-loyalty-view-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.loyaltyViewTarget;
        const isOverview = target === "overview";
        const header = widget.querySelector(".loyalty-points-widget__header");
        const panelTop = widget.querySelector(".loyalty-points-widget__panel-top");
        const balance = widget.querySelector("[data-loyalty-balance]");
        const actions = widget.querySelector(".loyalty-points-widget__actions");

        if (header) header.hidden = !isOverview;
        if (panelTop) panelTop.hidden = !isOverview;
        if (balance) balance.hidden = !isOverview;
        if (actions) actions.hidden = !isOverview;

        widget.querySelectorAll("[data-loyalty-view]").forEach((view) => {
          view.hidden = view.dataset.loyaltyView !== target;
        });
      });
    });
  }

  function initializeWidgets() {
    document.querySelectorAll("[data-loyalty-points-widget]").forEach((widget) => {
      initializeWidget(widget);
      if (widget.dataset.loyaltyDataLoaded !== "true") {
        widget.dataset.loyaltyDataLoaded = "true";
        loadWidgetData(widget);
      }
    });
  }

  let initializeScheduled = false;

  function scheduleInitializeWidgets() {
    if (initializeScheduled) return;

    initializeScheduled = true;
    window.requestAnimationFrame(() => {
      initializeScheduled = false;
      initializeWidgets();
    });
  }

  function nodeHasLoyaltyWidget(node) {
    if (!(node instanceof Element)) return false;

    return (
      node.matches("[data-loyalty-points-widget]") ||
      Boolean(node.querySelector("[data-loyalty-points-widget]"))
    );
  }

  document.addEventListener(
    "click",
    (event) => {
      const toggle = event.target.closest("[data-loyalty-toggle]");
      const closeButton = event.target.closest("[data-loyalty-close]");
      const control = toggle || closeButton;

      if (!control) return;

      const widget = control.closest("[data-loyalty-points-widget]");
      if (!widget) return;

      if (toggle) {
        event.preventDefault();
        event.stopPropagation();
        setWidgetOpen(widget, toggle.getAttribute("aria-expanded") !== "true");
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setWidgetOpen(widget, false, true);
    },
    true,
  );

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    document
      .querySelectorAll('[data-loyalty-toggle][aria-expanded="true"]')
      .forEach((toggle) => {
        const widget = toggle.closest("[data-loyalty-points-widget]");
        if (widget) setWidgetOpen(widget, false, true);
      });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeWidgets);
  } else {
    initializeWidgets();
  }

  document.addEventListener("shopify:section:load", initializeWidgets);
  document.addEventListener("shopify:section:reorder", scheduleInitializeWidgets);
  document.addEventListener("shopify:section:select", scheduleInitializeWidgets);
  window.addEventListener("pageshow", scheduleInitializeWidgets);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleInitializeWidgets();
  });

  new MutationObserver((mutations) => {
    if (
      mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some(nodeHasLoyaltyWidget),
      )
    ) {
      scheduleInitializeWidgets();
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
