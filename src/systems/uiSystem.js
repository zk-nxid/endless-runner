import { GAME_STATES } from "../core/constants.js";

const SCORE_POPUP_LIFETIME_MS = 1100;

export class UiSystem {
  constructor() {
    this.menu = document.getElementById("menu-screen");
    this.hud = document.getElementById("hud");
    this.gameOver = document.getElementById("gameover-screen");
    this.scoreValue = document.getElementById("score-value");
    this.speedValue = document.getElementById("speed-value");
    this.finalScore = document.getElementById("final-score");
    this.leaderboardList = document.getElementById("leaderboard-list");
    this.uiLayer = document.getElementById("ui-layer");
    this.scorePopups = document.getElementById("score-popups");
    this.flashLayer = document.getElementById("fx-flash");
    this.impactLayer = document.getElementById("fx-impact");
    this.aberrationLayer = document.getElementById("fx-aberration");
    this.fxLayer = document.getElementById("fx-layer");
    this.pauseScreen = document.getElementById("pause-screen");
    this.settingsScreen = document.getElementById("settings-screen");
    this.countdownScreen = document.getElementById("countdown-screen");
    this.countdownValue = document.getElementById("countdown-value");
    this.pauseButton = document.getElementById("pause-button");
    this.menuAccountCorner = document.getElementById("menu-account-corner");
    this.endAccountCorner = document.getElementById("end-account-corner");
    this.menuSettingsButton = document.getElementById("menu-settings-button");
    this.endSettingsButton = document.getElementById("end-settings-button");
    this.menuAccountIcon = document.getElementById("menu-account-icon");
    this.menuAccountLabel = document.getElementById("menu-account-label");
    this.endAccountIcon = document.getElementById("end-account-icon");
    this.endAccountLabel = document.getElementById("end-account-label");
    this.authScreen = document.getElementById("auth-screen");
    this.authConfigHint = document.getElementById("auth-config-hint");
    this.authSignedInPanel = document.getElementById("auth-signed-in-panel");
    this.authFormsPanel = document.getElementById("auth-forms-panel");
    this.authTabSignin = document.getElementById("auth-tab-signin");
    this.authTabSignup = document.getElementById("auth-tab-signup");
    this.authEmailInput = document.getElementById("auth-email");
    this.authDisplayNameRow = document.getElementById("auth-display-name-row");
    this.authDisplayNameInput = document.getElementById("auth-display-name");
    this.authPasswordInput = document.getElementById("auth-password");
    this.authError = document.getElementById("auth-error");
    this.authSubmit = document.getElementById("auth-submit");
    this.authSubmitLabel = document.getElementById("auth-submit-label");
    this.authClose = document.getElementById("auth-close");
    this.authCloseSigned = document.getElementById("auth-close-signed");
    this.authSignOutButton = document.getElementById("auth-sign-out-button");
    this._authUiMode = "signin";
    this.coinHudValue = document.getElementById("coin-value");
    this.coinMenuValue = document.getElementById("menu-coin-value");
    this.shopScreen = document.getElementById("shop-screen");
    this.shopTabSkins = document.getElementById("shop-tab-skins");
    this.shopTabTrails = document.getElementById("shop-tab-trails");
    this.shopPanelSkins = document.getElementById("shop-panel-skins");
    this.shopPanelTrails = document.getElementById("shop-panel-trails");
    this.shopGridSkins = document.getElementById("shop-grid-skins");
    this.shopGridTrails = document.getElementById("shop-grid-trails");
    this.shopCoinValue = document.getElementById("shop-coin-value");
    this.shopButton = document.getElementById("shop-button");
    this.shopConfirmPanel = document.getElementById("shop-confirm-panel");
    this.shopConfirmText = document.getElementById("shop-confirm-text");
    this.endCoinsLine = document.getElementById("end-coins-line");
    this.endCoinsEarned = document.getElementById("end-coins-earned");
    this.endCoinsTotal = document.getElementById("end-coins-total");

    this._scoreCountUp = null;
    this._activePopups = [];
    this._countdownTimer = null;
    this._countdownResolve = null;
    /** @type {'skins' | 'trails'} */
    this._shopSection = "skins";
  }

  /**
   * @param {'skins' | 'trails'} section
   */
  setShopSection(section) {
    this._shopSection = section === "trails" ? "trails" : "skins";
    const skins = this._shopSection === "skins";
    this.shopTabSkins?.classList.toggle("active", skins);
    this.shopTabTrails?.classList.toggle("active", !skins);
    this.shopTabSkins?.setAttribute("aria-selected", skins ? "true" : "false");
    this.shopTabTrails?.setAttribute("aria-selected", !skins ? "true" : "false");
    this.shopPanelSkins?.classList.toggle("active", skins);
    this.shopPanelTrails?.classList.toggle("active", !skins);
    if (this.shopPanelSkins) {
      if (skins) this.shopPanelSkins.removeAttribute("hidden");
      else this.shopPanelSkins.setAttribute("hidden", "");
    }
    if (this.shopPanelTrails) {
      if (!skins) this.shopPanelTrails.removeAttribute("hidden");
      else this.shopPanelTrails.setAttribute("hidden", "");
    }
  }

  renderState(state) {
    this.menu.classList.toggle("hidden", state !== GAME_STATES.MENU);
    this.menu.classList.toggle("visible", state === GAME_STATES.MENU);
    this.hud.classList.toggle("hidden", state !== GAME_STATES.PLAYING);
    this.gameOver.classList.toggle("hidden", state !== GAME_STATES.END);
    this.gameOver.classList.toggle("visible", state === GAME_STATES.END);
    this.fxLayer?.classList.toggle("playing", state === GAME_STATES.PLAYING);
    this.pauseButton?.classList.toggle("hidden", state !== GAME_STATES.PLAYING);
    this.menuAccountCorner?.classList.toggle("hidden", state !== GAME_STATES.MENU);
    this.endAccountCorner?.classList.toggle("hidden", state !== GAME_STATES.END);
    this.menuSettingsButton?.classList.toggle("hidden", state !== GAME_STATES.MENU);
    this.endSettingsButton?.classList.toggle("hidden", state !== GAME_STATES.END);
    this.shopButton?.classList.toggle("hidden", state !== GAME_STATES.MENU);
    // Always close modals on state change to avoid stuck overlays.
    this.setPaused(false);
    this.setSettingsOpen(false);
    this.setShopOpen(false);
    this.setAuthOpen(false);
    this.cancelCountdown();
  }

  setPaused(open) {
    if (!this.pauseScreen) return;
    this.pauseScreen.classList.toggle("hidden", !open);
    this.pauseScreen.classList.toggle("visible", open);
  }

  setSettingsOpen(open) {
    if (!this.settingsScreen) return;
    this.settingsScreen.classList.toggle("hidden", !open);
    this.settingsScreen.classList.toggle("visible", open);
  }

  setShopOpen(open) {
    if (!this.shopScreen) return;
    this.shopScreen.classList.toggle("hidden", !open);
    this.shopScreen.classList.toggle("visible", open);
    if (!open) this.hideShopPurchaseConfirmPanel();
  }

  setAuthOpen(open) {
    if (!this.authScreen) return;
    this.authScreen.classList.toggle("hidden", !open);
    this.authScreen.classList.toggle("visible", open);
    if (open) {
      this.setAuthFormError("");
      if (this.authPasswordInput) this.authPasswordInput.value = "";
    }
  }

  getAuthUiMode() {
    return this._authUiMode;
  }

  resetAuthPanels() {
    this.setAuthFormError("");
    this.authError?.classList.remove("auth-error--success");
    this.closeSignedInEditors(true);
    const np = document.getElementById("auth-new-password");
    const cp = document.getElementById("auth-confirm-password");
    if (np) np.value = "";
    if (cp) cp.value = "";
  }

  revealAuthSignedInSubview(which) {
    const usernamePanel = document.getElementById("auth-edit-username-panel");
    const passwordPanel = document.getElementById("auth-edit-password-panel");
    const actions = document.getElementById("auth-signed-in-actions");
    const showU = which === "username";
    const showP = which === "password";
    usernamePanel?.classList.toggle("hidden", !showU);
    passwordPanel?.classList.toggle("hidden", !showP);
    actions?.classList.toggle("hidden", showU || showP);
    this.setSignedInAuthFeedback("", "neutral");
  }

  closeSignedInEditors(clearFeedback = true) {
    document.getElementById("auth-edit-username-panel")?.classList.add("hidden");
    document.getElementById("auth-edit-password-panel")?.classList.add("hidden");
    document.getElementById("auth-signed-in-actions")?.classList.remove("hidden");
    if (clearFeedback) this.setSignedInAuthFeedback("", "neutral");
  }

  setSignedInAuthFeedback(message, kind = "neutral") {
    const el = document.getElementById("auth-signed-feedback");
    if (!el) return;
    el.textContent = message ?? "";
    el.classList.toggle("auth-signed-feedback--success", kind === "success");
    el.classList.toggle("auth-signed-feedback--error", kind === "error");
  }

  setAuthTab(mode) {
    this._authUiMode = mode === "signup" ? "signup" : "signin";
    const signIn = this._authUiMode === "signin";
    this.authTabSignin?.classList.toggle("active", signIn);
    this.authTabSignup?.classList.toggle("active", !signIn);
    this.authTabSignin?.setAttribute("aria-selected", signIn ? "true" : "false");
    this.authTabSignup?.setAttribute("aria-selected", signIn ? "false" : "true");
    this.authDisplayNameRow?.classList.toggle("hidden", signIn);
    if (this.authSubmitLabel) {
      this.authSubmitLabel.textContent = signIn ? "Sign in" : "Create account";
    }
    if (this.authPasswordInput) {
      this.authPasswordInput.autocomplete = signIn ? "current-password" : "new-password";
    }
    this.setAuthFormError("");
  }

  setAuthFormError(message) {
    if (!this.authError) return;
    this.authError.classList.remove("auth-error--success");
    this.authError.textContent = message ?? "";
  }

  setAuthFormMessage(message, kind = "neutral") {
    if (!this.authError) return;
    const msg = message ?? "";
    this.authError.textContent = msg;
    this.authError.classList.toggle("auth-error--success", kind === "success");
  }

  renderAuthSync(authSync) {
    if (!this.authScreen) return;
    const configured = authSync?.isConfigured?.() ?? false;
    this.authConfigHint?.classList.toggle("hidden", configured);
    const preview = authSync?.getSignedInPreview?.();
    const signedIn = preview != null;
    if (signedIn) {
      this.authSignedInPanel?.classList.remove("hidden");
      this.authFormsPanel?.classList.add("hidden");
    } else {
      this.authSignedInPanel?.classList.add("hidden");
      this.authFormsPanel?.classList.remove("hidden");
    }

    const contactLabelEl = document.getElementById("auth-signed-contact-label");
    const contactEl = document.getElementById("auth-signed-contact");
    const signedUsernameEl = document.getElementById("auth-signed-username");
    if (signedIn && preview) {
      if (contactLabelEl && contactEl) {
        if (preview.email) {
          contactLabelEl.textContent = "Email";
          contactEl.textContent = preview.email;
        } else if (preview.phone) {
          contactLabelEl.textContent = "Phone";
          contactEl.textContent = preview.phone;
        } else {
          contactLabelEl.textContent = "Account";
          contactEl.textContent = "—";
        }
      }
      if (signedUsernameEl) {
        signedUsernameEl.textContent =
          preview.displayName != null && String(preview.displayName).trim() !== ""
            ? String(preview.displayName)
            : "—";
      }
    } else {
      if (contactEl) contactEl.textContent = "";
      if (signedUsernameEl) signedUsernameEl.textContent = "";
    }

    const cornerSlice = 18;
    const labelText =
      signedIn && preview?.displayName
        ? String(preview.displayName).slice(0, cornerSlice)
        : "";
    const corners = [
      { corner: this.menuAccountCorner, icon: this.menuAccountIcon, label: this.menuAccountLabel },
      { corner: this.endAccountCorner, icon: this.endAccountIcon, label: this.endAccountLabel },
    ];
    for (const { corner, icon, label } of corners) {
      if (!corner) continue;
      corner.classList.toggle("corner-account--signed-in", signedIn);
      icon?.classList.toggle("hidden", signedIn);
      if (label) {
        label.classList.toggle("hidden", !signedIn);
        if (signedIn) label.textContent = labelText;
      }
      corner.setAttribute(
        "aria-label",
        signedIn && labelText.length ? `Account · ${labelText}` : "Account"
      );
    }
  }

  showShopPurchaseConfirmPanel({ itemLabel, skinLabel, cost }) {
    if (!this.shopConfirmPanel || !this.shopConfirmText) return;
    const label = itemLabel ?? skinLabel ?? "Item";
    this.shopConfirmText.textContent = `Buy "${label}" for ${cost} ◇ coins?`;
    this.shopConfirmPanel.classList.remove("hidden");
    this.shopConfirmPanel.classList.add("visible");
  }

  hideShopPurchaseConfirmPanel() {
    if (!this.shopConfirmPanel) return;
    this.shopConfirmPanel.classList.add("hidden");
    this.shopConfirmPanel.classList.remove("visible");
  }

  isAnyModalOpen() {
    return (
      this.pauseScreen?.classList.contains("visible") === true ||
      this.settingsScreen?.classList.contains("visible") === true ||
      this.shopScreen?.classList.contains("visible") === true ||
      this.authScreen?.classList.contains("visible") === true ||
      this.countdownScreen?.classList.contains("visible") === true
    );
  }

  updateCoinHud(coins) {
    if (this.coinHudValue) this.coinHudValue.textContent = String(coins);
  }

  updateMenuCoins(coins) {
    if (this.coinMenuValue) this.coinMenuValue.textContent = String(coins);
    if (this.shopCoinValue) this.shopCoinValue.textContent = String(coins);
  }

  showEndCoins(earned, total) {
    if (this.endCoinsTotal) this.endCoinsTotal.textContent = String(total);
    if (!this.endCoinsLine || !this.endCoinsEarned) return;
    this.endCoinsLine.classList.toggle("zero", earned <= 0);
    this.endCoinsLine.style.animation = "none";
    void this.endCoinsLine.offsetWidth;
    this.endCoinsLine.style.animation = "";
    const start = performance.now();
    const duration = 900;
    const target = Math.max(0, earned);
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.endCoinsEarned.textContent = String(Math.floor(target * eased));
      if (t < 1) requestAnimationFrame(tick);
      else this.endCoinsEarned.textContent = String(target);
    };
    requestAnimationFrame(tick);
  }

  renderShop({ coins, skins, trails }) {
    if (!this.shopGridSkins || !this.shopGridTrails) return;
    if (this.shopCoinValue) this.shopCoinValue.textContent = String(coins);

    this.shopGridSkins.innerHTML = "";
    skins?.catalog?.forEach((skin) => {
      const isOwned = skins.owned.includes(skin.id);
      const isEquipped = skins.equipped === skin.id;
      const canAfford = coins >= skin.cost;
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "skin-tile";
      tile.setAttribute("role", "listitem");
      tile.dataset.skinId = skin.id;
      if (isOwned) tile.classList.add("owned");
      else tile.classList.add("locked");
      if (isEquipped) tile.classList.add("equipped");
      if (!isOwned && !canAfford) tile.classList.add("disabled");
      if (
        !isOwned &&
        canAfford &&
        skins.pendingPurchaseId &&
        skin.id === skins.pendingPurchaseId
      ) {
        tile.classList.add("pending-purchase");
      }

      const hex = `#${skin.color.toString(16).padStart(6, "0")}`;
      const swatch = document.createElement("span");
      swatch.className = "skin-swatch";
      swatch.style.setProperty("--swatch", hex);
      swatch.style.setProperty(
        "--swatch-glow",
        `${hex}cc`
      );

      const accentHex =
        typeof skin.accent === "number"
          ? `#${skin.accent.toString(16).padStart(6, "0")}`
          : hex;
      if (skin.pattern) {
        tile.classList.add("skin-tile-pattern");
        swatch.classList.add("skin-swatch-pattern");
        swatch.style.setProperty("--swatch2", accentHex);
        const patternClass =
          skin.pattern === "checker"
            ? "skin-swatch-checker"
            : skin.pattern === "diagonalStripe"
              ? "skin-swatch-stripe"
              : skin.pattern === "dots"
                ? "skin-swatch-dots"
                : skin.pattern === "rings"
                  ? "skin-swatch-rings"
                  : null;
        if (patternClass) swatch.classList.add(patternClass);
      }
      tile.appendChild(swatch);

      const name = document.createElement("span");
      name.className = "skin-name";
      name.textContent = skin.label;
      tile.appendChild(name);

      const status = document.createElement("span");
      status.className = "skin-status";
      if (isEquipped) status.textContent = "Equipped";
      else if (isOwned) status.textContent = "Tap to equip";
      else if (canAfford) status.textContent = `${skin.cost} ◇ · Confirm`;
      else status.textContent = `${skin.cost} ◇`;
      tile.appendChild(status);

      tile.addEventListener("click", () => {
        skins.onSelect?.(skin.id);
      });
      this.shopGridSkins.appendChild(tile);
    });

    this.shopGridTrails.innerHTML = "";
    trails?.catalog?.forEach((trail) => {
      const isOwned = trails.owned.includes(trail.id);
      const isEquipped = trails.equipped === trail.id;
      const canAfford = coins >= trail.cost;
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "skin-tile trail-tile";
      tile.setAttribute("role", "listitem");
      tile.dataset.trailId = trail.id;
      if (isOwned) tile.classList.add("owned");
      else tile.classList.add("locked");
      if (isEquipped) tile.classList.add("equipped");
      if (!isOwned && !canAfford) tile.classList.add("disabled");
      if (
        !isOwned &&
        canAfford &&
        trails.pendingPurchaseId &&
        trail.id === trails.pendingPurchaseId
      ) {
        tile.classList.add("pending-purchase");
      }

      const hex = `#${trail.primaryColor.toString(16).padStart(6, "0")}`;
      const swatch = document.createElement("span");
      swatch.className = "skin-swatch";
      swatch.style.setProperty("--swatch", hex);
      swatch.style.setProperty("--swatch-glow", `${hex}cc`);
      if (trail.secondaryColor != null) {
        const hex2 = `#${trail.secondaryColor.toString(16).padStart(6, "0")}`;
        swatch.classList.add("skin-swatch-pattern");
        swatch.style.setProperty("--swatch2", hex2);
        swatch.classList.add("skin-swatch-stripe");
      }
      tile.appendChild(swatch);

      const name = document.createElement("span");
      name.className = "skin-name";
      name.textContent = trail.label;
      tile.appendChild(name);

      const status = document.createElement("span");
      status.className = "skin-status";
      if (isEquipped) status.textContent = "Equipped";
      else if (isOwned) status.textContent = "Tap to equip";
      else if (canAfford) status.textContent = `${trail.cost} ◇ · Confirm`;
      else status.textContent = `${trail.cost} ◇`;
      tile.appendChild(status);

      tile.addEventListener("click", () => {
        trails.onSelect?.(trail.id);
      });
      this.shopGridTrails.appendChild(tile);
    });

    this.setShopSection(this._shopSection);
  }

  flashShopBuy(kind, id) {
    if (kind === "trail") this.setShopSection("trails");
    const grid = kind === "trail" ? this.shopGridTrails : this.shopGridSkins;
    if (!grid) return;
    const sel =
      kind === "trail" ? `[data-trail-id="${id}"]` : `[data-skin-id="${id}"]`;
    const tile = grid.querySelector(sel);
    if (!tile) return;
    tile.classList.remove("flash-buy");
    void tile.offsetWidth;
    tile.classList.add("flash-buy");
  }

  runCountdown(seconds = 3) {
    this.cancelCountdown();
    if (!this.countdownScreen || !this.countdownValue) return Promise.resolve();
    return new Promise((resolve) => {
      this._countdownResolve = resolve;
      this.countdownScreen.classList.remove("hidden");
      this.countdownScreen.classList.add("visible");
      let n = seconds;
      const showFrame = (val) => {
        this.countdownValue.textContent = String(val);
        this.countdownValue.style.animation = "none";
        void this.countdownValue.offsetWidth;
        this.countdownValue.style.animation = "";
      };
      showFrame(n);
      const tick = () => {
        n -= 1;
        if (n <= 0) {
          this.countdownScreen.classList.add("hidden");
          this.countdownScreen.classList.remove("visible");
          const r = this._countdownResolve;
          this._countdownResolve = null;
          this._countdownTimer = null;
          if (r) r();
          return;
        }
        showFrame(n);
        this._countdownTimer = setTimeout(tick, 1000);
      };
      this._countdownTimer = setTimeout(tick, 1000);
    });
  }

  cancelCountdown() {
    if (this._countdownTimer) {
      clearTimeout(this._countdownTimer);
      this._countdownTimer = null;
    }
    if (this.countdownScreen) {
      this.countdownScreen.classList.add("hidden");
      this.countdownScreen.classList.remove("visible");
    }
    if (this._countdownResolve) {
      const r = this._countdownResolve;
      this._countdownResolve = null;
      r();
    }
  }

  updateHud(score, speed) {
    this.scoreValue.textContent = String(score);
    this.speedValue.textContent = speed.toFixed(1);
  }

  updateGameOver(score) {
    this.finalScore.textContent = String(score);
  }

  /** Animates final score from 0 -> target after game over. */
  startScoreCountUp(target) {
    if (!this.finalScore) return;
    if (this._scoreCountUp) cancelAnimationFrame(this._scoreCountUp);
    const startTime = performance.now();
    const duration = 1100;
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.floor(target * eased);
      this.finalScore.textContent = String(value);
      if (t < 1) {
        this._scoreCountUp = requestAnimationFrame(tick);
      } else {
        this.finalScore.textContent = String(target);
        this._scoreCountUp = null;
      }
    };
    this._scoreCountUp = requestAnimationFrame(tick);
  }

  renderLeaderboard(entries) {
    this.leaderboardList.innerHTML = "";
    entries.forEach((entry, idx) => {
      const line = document.createElement("div");
      line.className = "leaderboard-row";
      line.textContent = `${String(idx + 1).padStart(2, "0")}. ${entry.name} - ${entry.score}`;
      this.leaderboardList.appendChild(line);
    });
  }

  setMoodIntensity(intensity) {
    this.uiLayer.style.setProperty("--mood-intensity", intensity.toFixed(3));
  }

  spawnScorePopup(label, { kind = "default" } = {}) {
    if (!this.scorePopups) return;
    const el = document.createElement("div");
    el.className = `score-popup score-popup-${kind}`;
    el.textContent = label;
    this.scorePopups.appendChild(el);
    const removeAt = performance.now() + SCORE_POPUP_LIFETIME_MS;
    this._activePopups.push({ el, removeAt });
    setTimeout(() => {
      el.remove();
      this._activePopups = this._activePopups.filter((p) => p.el !== el);
    }, SCORE_POPUP_LIFETIME_MS + 50);
  }

  flashTransition() {
    this.#triggerLayer(this.flashLayer, "active");
  }

  flashBoost() {
    this.#triggerLayer(this.flashLayer, "boost-active");
    this.#triggerLayer(this.aberrationLayer, "active");
  }

  flashImpact() {
    this.#triggerLayer(this.impactLayer, "active");
    this.#triggerLayer(this.aberrationLayer, "active");
  }

  #triggerLayer(layer, className) {
    if (!layer) return;
    layer.classList.remove(className);
    void layer.offsetWidth;
    layer.classList.add(className);
    setTimeout(() => layer.classList.remove(className), 800);
  }
}
