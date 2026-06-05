(function () {
  var REWARD_TYPE_PREFERENCES = ["gift_card", "discount", "both"];

  function formatTemplate(template, replacements) {
    return Object.entries(replacements).reduce(function (text, entry) {
      var key = entry[0];
      var value = String(entry[1]);

      return text
        .replaceAll("{" + key + "}", value)
        .replaceAll("{{" + key + "}}", value);
    }, template || "");
  }

  function normalizeRewardTypePreference(value) {
    return REWARD_TYPE_PREFERENCES.indexOf(value) >= 0 ? value : "both";
  }

  function filterRewardsByPreference(rewards, preference) {
    var normalizedPreference = normalizeRewardTypePreference(preference);

    return rewards.filter(function (reward) {
      var type = reward.type || "discount";

      if (normalizedPreference === "both") {
        return type === "discount" || type === "gift_card";
      }

      return type === normalizedPreference;
    });
  }

  function rewardTitle(reward) {
    if (reward.type === "gift_card") {
      return reward.title || "$" + reward.amount + " Gift Card";
    }

    return "Discount $" + reward.discount + " for " + reward.points + " points";
  }

  function rewardDescription(reward) {
    if (reward.description) {
      return reward.description;
    }

    if (reward.type === "gift_card") {
      return "Redeem " + reward.points + " points for this gift card.";
    }

    return "Redeem " + reward.points + " points for a discount.";
  }

  function appendTextElement(parent, tagName, className, text) {
    var element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function renderRewards(container, settings, rewards, points) {
    if (settings.showRewards !== "true") {
      return;
    }

    container.replaceChildren();

    var availableRewards = rewards.filter(function (reward) {
      return Number(reward.points) <= points;
    });

    appendTextElement(
      container,
      "p",
      "loyalty-points-widget__rewards-title",
      settings.rewardsHeading,
    );

    if (availableRewards.length === 0) {
      appendTextElement(
        container,
        "p",
        "loyalty-points-widget__message",
        settings.noRewardsMessage,
      );
      container.hidden = false;
      return;
    }

    var list = document.createElement("ul");
    list.className = "loyalty-points-widget__reward-list";

    availableRewards.forEach(function (reward) {
      var item = document.createElement("li");
      item.className = "loyalty-points-widget__reward";

      appendTextElement(
        item,
        "p",
        "loyalty-points-widget__reward-title",
        rewardTitle(reward),
      );
      appendTextElement(
        item,
        "p",
        "loyalty-points-widget__reward-description",
        rewardDescription(reward),
      );

      list.appendChild(item);
    });

    container.appendChild(list);
    container.hidden = false;
  }

  async function loadWidget(widget) {
    var settings = widget.dataset;
    var status = widget.querySelector("[data-loyalty-status]");
    var balance = widget.querySelector("[data-loyalty-balance]");
    var rewards = widget.querySelector("[data-loyalty-rewards]");

    if (settings.loggedIn !== "true") {
      return;
    }

    if (!settings.apiBaseUrl) {
      if (status) status.textContent = settings.errorMessage;
      return;
    }

    try {
      var params = new URLSearchParams({
        customerId: settings.customerId || "",
        shop: settings.shopDomain || "",
      });
      var response = await fetch(
        settings.apiBaseUrl.replace(/\/$/, "") +
          "/api/loyalty-balance?" +
          params,
      );
      var data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || settings.errorMessage);
      }

      var points = Number(data.loyaltyPoints || 0);
      var rewardOptions = Array.isArray(data.rewardOptions)
        ? filterRewardsByPreference(
            data.rewardOptions,
            data.rewardTypePreference,
          )
        : [];

      if (status) status.hidden = true;
      if (balance) {
        balance.textContent = formatTemplate(settings.pointsTemplate, {
          points: points,
          reward_count: rewardOptions.length,
        });
        balance.hidden = false;
      }

      if (
        rewards &&
        rewardOptions.length > 0 &&
        data.checkoutRedemptionEnabled !== false
      ) {
        renderRewards(rewards, settings, rewardOptions, points);
      } else if (rewards) {
        rewards.hidden = true;
      }
    } catch (error) {
      console.error("[loyalty-points] Could not load balance", error);
      if (status) {
        status.hidden = false;
        status.textContent = settings.errorMessage;
      }
      if (balance) balance.hidden = true;
      if (rewards) rewards.hidden = true;
    }
  }

  function init() {
    document
      .querySelectorAll("[data-loyalty-points-widget]")
      .forEach(loadWidget);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  document.addEventListener("shopify:section:load", init);
})();
