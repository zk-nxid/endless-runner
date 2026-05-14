import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CONFIG, GAME_STATES } from "./constants.js";
import { SeededRng } from "./rng.js";
import { InputSystem } from "../systems/inputSystem.js";
import { MovementSystem } from "../systems/movementSystem.js";
import { DifficultySystem } from "../systems/difficultySystem.js";
import { SpawnerSystem } from "../systems/spawnerSystem.js";
import { CameraSystem } from "../systems/cameraSystem.js";
import { UiSystem } from "../systems/uiSystem.js";
import { AudioSystem } from "../systems/audioSystem.js";
import { PostFxSystem } from "../systems/postFxSystem.js";
import { VfxSystem } from "../systems/vfxSystem.js";
import { TrailSystem } from "../systems/trailSystem.js";
import { LeaderboardAdapter } from "../integration/leaderboardAdapter.js";
import { EmailCaptureAdapter } from "../integration/emailCaptureAdapter.js";
import { RewardAdapter } from "../integration/rewardAdapter.js";
import { ShopAdapter } from "../integration/shopAdapter.js";
import { AuthProgressSync } from "../integration/authProgressSync.js";
import { SKIN_CATALOG, getSkin } from "./skins.js";
import { TRAIL_CATALOG, getTrail } from "./trails.js";
import { createSkinPatternTexture } from "./skinPatterns.js";
import { getTheme } from "./theme.js";
import { PlayCanvasWorld, OBSTACLE_PROFILES } from "../systems/playCanvasWorld.js";
import { ThreeWorldFallback } from "../systems/threeWorldFallback.js";

export class Game {
  constructor({ worldCanvas, avatarCanvas }) {
    this.theme = getTheme();
    this.worldCanvas = worldCanvas;
    this.avatarCanvas = avatarCanvas;
    this.state = GAME_STATES.MENU;
    this.score = 0;
    this._scoreAccum = 0;
    this.accumulator = 0;
    this.lastTimestamp = 0;
    this.previousBody = { x: 0, y: CONFIG.playerBaseY, z: 0 };
    this.moodIntensity = 0;
    this.paletteShift = 0;
    this.targetPaletteShift = 0;
    this.speedBoostTimer = 0;
    this.timeScale = 1;
    this.targetTimeScale = 1;
    this.deathSequenceTimer = 0;
    this.paused = false;
    this.frameTimes = [];
    /** @type {{ kind: 'skin' | 'trail'; id: string } | null} */
    this._shopPendingPurchase = null;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 300);
    this.renderer = new THREE.WebGLRenderer({
      canvas: avatarCanvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      typeof window.devicePixelRatio === "number" ? Math.min(window.devicePixelRatio, 2) : 1
    );
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;
    pmrem.dispose();

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const directional = new THREE.DirectionalLight(
      this.theme.palette.accentLightB ?? 0xc2d4ff,
      1.55
    );
    directional.position.set(8, 18, 8);
    directional.castShadow = true;
    directional.shadow.mapSize.set(2048, 2048);
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 140;
    directional.shadow.camera.left = -28;
    directional.shadow.camera.right = 28;
    directional.shadow.camera.top = 32;
    directional.shadow.camera.bottom = -24;
    directional.shadow.bias = -0.00028;
    directional.shadow.normalBias = 0.028;
    const rimLight = new THREE.DirectionalLight(
      this.theme.palette.accentLightA ?? 0xff5bb7,
      0.88
    );
    rimLight.position.set(-6, 8, -10);
    this.scene.add(ambient, directional, rimLight);

    this.shop = new ShopAdapter();
    this.authSync = new AuthProgressSync(this);
    this.playerMesh = this.#buildPlayerAvatar();
    this.playerMesh.position.y = 0.6;
    this.scene.add(this.playerMesh);

    this.postFx = new PostFxSystem(this.renderer, this.scene, this.camera, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    this.vfx = new VfxSystem(this.scene, this.theme);
    this.trailSystem = new TrailSystem(this.scene);
    this.trailSystem.setEquippedTrailId(this.shop.getEquippedTrail());
    this.trailSystem.setRunActive(false);

    this.rng = new SeededRng(42);
    this.input = new InputSystem(worldCanvas);
    this.movement = new MovementSystem();
    this.difficulty = new DifficultySystem();
    this.spawner = new SpawnerSystem(this.rng);
    this.cameraSystem = new CameraSystem();
    this.ui = new UiSystem();
    this.audio = new AudioSystem();

    this.leaderboard = new LeaderboardAdapter();
    this.emailCapture = new EmailCaptureAdapter();
    this.rewardAdapter = new RewardAdapter();

    this.obstacles = this.#buildObstacleData();
    try {
      this.world = new PlayCanvasWorld(worldCanvas, this.theme, this.rng, this.obstacles.length);
    } catch (error) {
      console.error("PlayCanvas world failed to initialize. Falling back to Three.js world.", error);
      this.world = new ThreeWorldFallback(this.scene, this.theme, this.rng, this.obstacles.length);
    }
    this.avatarCanvas.style.opacity = "1";
    this.playerMesh.visible = false;
    this.audio.setMenuMode(true);

    this.cameraSystem.reset({ x: 0, y: CONFIG.playerBaseY, z: 0 });
    this.#bindUi();
    this.#onResize();
    window.addEventListener("resize", () => this.#onResize());
    window.addEventListener("orientationchange", () => this.#onResize());
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this.#onResize());
      this._resizeObserver.observe(this.worldCanvas);
    }
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", () => this.#onResize());
      vv.addEventListener("scroll", () => this.#onResize());
    }
    this.ui.renderState(this.state);
    this.refreshAuthUi();
  }

  start() {
    requestAnimationFrame((t) => this.#frame(t));
  }

  async initCloudSave() {
    try {
      await this.authSync.init();
    } catch (e) {
      console.warn("Neon Runner: auth init failed", e);
    }
  }

  refreshAuthUi() {
    this.ui.renderAuthSync?.(this.authSync);
  }

  refreshShopAndCoinsUi() {
    const coins = this.shop.getCoins();
    this.ui.updateMenuCoins(coins);
    this.ui.updateCoinHud(coins);
    if (this.state === GAME_STATES.PLAYING) {
      return;
    }
    this.#applyEquippedSkin();
    this.trailSystem?.setEquippedTrailId(this.shop.getEquippedTrail());
    this._renderShop?.();
  }

  #buildPlayerAvatar() {
    const group = new THREE.Group();
    this.playerEmissiveMaterials = [];
    this.scarfMesh = null;

    const equipped = getSkin(this.shop?.getEquipped?.());

    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: this.theme.emissive.playerBase + 0.4,
      metalness: 0.38,
      roughness: 0.2,
      clearcoat: 0.62,
      clearcoatRoughness: 0.12,
      iridescence: 0.42,
      iridescenceIOR: 1.2,
      iridescenceThicknessRange: [100, 400],
      envMapIntensity: 1.15,
    });
    this.#syncBallMaterialToSkin(coreMat, equipped);

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.65, 48, 32), coreMat);
    core.castShadow = true;
    core.receiveShadow = true;
    group.add(core);
    this.playerCoreMesh = core;
    this.playerEmissiveMaterials.push(coreMat);
    this.groundGlowMesh = null;

    return group;
  }

  #syncBallMaterialToSkin(mat, skin) {
    if (!mat || !skin) return;
    if (mat.map) {
      mat.map.dispose();
      mat.map = null;
    }
    const patterned = createSkinPatternTexture(skin);
    if (patterned) {
      mat.map = patterned;
      mat.color.setHex(0xffffff);
      mat.emissive.setHex(skin.color);
    } else {
      mat.color.setHex(skin.color);
      mat.emissive.setHex(skin.color);
    }
    mat.needsUpdate = true;
  }

  #clearShopPendingPurchase() {
    this._shopPendingPurchase = null;
    this.ui.hideShopPurchaseConfirmPanel?.();
  }

  #confirmPendingShopPurchase() {
    const pending = this._shopPendingPurchase;
    if (!pending) return;

    if (pending.kind === "skin") {
      const skinId = pending.id;
      const skin = getSkin(skinId);
      if (this.shop.isOwned(skinId) || this.shop.getCoins() < skin.cost) {
        this.audio.playImpactSfx?.();
        this.#clearShopPendingPurchase();
        this._renderShop?.();
        return;
      }
      const result = this.shop.buy(skinId);
      if (result.ok) {
        this.#applyEquippedSkin();
        this.audio.playBoostStinger?.();
        this.ui.flashShopBuy?.("skin", skinId);
        this.audio.playUiHoverSfx?.();
      }
    } else if (pending.kind === "trail") {
      const trailId = pending.id;
      const trail = getTrail(trailId);
      if (this.shop.isTrailOwned(trailId) || this.shop.getCoins() < trail.cost) {
        this.audio.playImpactSfx?.();
        this.#clearShopPendingPurchase();
        this._renderShop?.();
        return;
      }
      const result = this.shop.buyTrail(trailId);
      if (result.ok) {
        this.trailSystem?.setEquippedTrailId(this.shop.getEquippedTrail());
        this.audio.playBoostStinger?.();
        this.ui.flashShopBuy?.("trail", trailId);
        this.audio.playUiHoverSfx?.();
      }
    }

    this.#clearShopPendingPurchase();
    const coins = this.shop.getCoins();
    this.ui.updateMenuCoins(coins);
    this.ui.updateCoinHud(coins);
    this._renderShop?.();
  }

  #cancelPendingShopPurchase() {
    this.#clearShopPendingPurchase();
    this.audio.playUiHoverSfx?.();
    this._renderShop?.();
  }

  #applyEquippedSkin() {
    if (!this.playerCoreMesh) return;
    const skin = getSkin(this.shop?.getEquipped?.());
    if (!skin) return;
    const mat = this.playerCoreMesh.material;
    if (!mat) return;
    this.#syncBallMaterialToSkin(mat, skin);
  }

  #onSkinSelected(skinId) {
    if (this.shop.isOwned(skinId)) {
      if (this.shop.getEquipped() === skinId) return;
      this.#clearShopPendingPurchase();
      this.shop.equip(skinId);
      this.#applyEquippedSkin();
      this.audio.playUiHoverSfx?.();
    } else {
      const skin = getSkin(skinId);
      const coins = this.shop.getCoins();
      if (!skin || coins < skin.cost) {
        this.audio.playImpactSfx?.();
        return;
      }
      if (
        this._shopPendingPurchase?.kind === "skin" &&
        this._shopPendingPurchase?.id === skinId &&
        this.ui.shopConfirmPanel?.classList.contains("visible") === true
      ) {
        return;
      }
      this._shopPendingPurchase = { kind: "skin", id: skinId };
      this.ui.showShopPurchaseConfirmPanel?.({ itemLabel: skin.label, cost: skin.cost });
      this.audio.playUiHoverSfx?.();
    }
    const c = this.shop.getCoins();
    this.ui.updateMenuCoins(c);
    this.ui.updateCoinHud(c);
    this._renderShop?.();
  }

  #onTrailSelected(trailId) {
    if (this.shop.isTrailOwned(trailId)) {
      if (this.shop.getEquippedTrail() === trailId) return;
      this.#clearShopPendingPurchase();
      this.shop.equipTrail(trailId);
      this.trailSystem?.setEquippedTrailId(this.shop.getEquippedTrail());
      this.audio.playUiHoverSfx?.();
    } else {
      const trail = getTrail(trailId);
      const coins = this.shop.getCoins();
      if (!trail || coins < trail.cost) {
        this.audio.playImpactSfx?.();
        return;
      }
      if (
        this._shopPendingPurchase?.kind === "trail" &&
        this._shopPendingPurchase?.id === trailId &&
        this.ui.shopConfirmPanel?.classList.contains("visible") === true
      ) {
        return;
      }
      this._shopPendingPurchase = { kind: "trail", id: trailId };
      this.ui.showShopPurchaseConfirmPanel?.({ itemLabel: trail.label, cost: trail.cost });
      this.audio.playUiHoverSfx?.();
    }
    const c = this.shop.getCoins();
    this.ui.updateMenuCoins(c);
    this.ui.updateCoinHud(c);
    this._renderShop?.();
  }

  #buildObstacleData() {
    const obstacles = [];
    for (let i = 0; i < CONFIG.obstaclePoolSize; i += 1) {
      const profile = OBSTACLE_PROFILES[i % OBSTACLE_PROFILES.length];
      obstacles.push({
        active: false,
        x: 0,
        z: 0,
        scale: 1,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        spinRate: this.rng.range(-1.2, 1.2),
        colliderHeight: profile.colliderHeight,
        unjumpable: profile.unjumpable,
        profileType: profile.type,
        isBoost: !!profile.isBoost,
      });
    }
    return obstacles;
  }

  #bindUi() {
    const startButton = document.getElementById("start-button");
    const retryButton = document.getElementById("retry-button");
    const submitButton = document.getElementById("submit-score-button");
    const endMenuButton = document.getElementById("end-menu-button");
    const nameInput = document.getElementById("player-name");
    this.nameInput = nameInput;
    const menuButtons = [startButton, retryButton, submitButton, endMenuButton].filter(Boolean);

    const playHoverClick = () => {
      this.audio.start().catch(() => {});
      this.audio.playUiHoverSfx();
    };
    menuButtons.forEach((button) => {
      button.addEventListener("pointerenter", playHoverClick);
      button.addEventListener("focus", playHoverClick);
    });

    startButton.addEventListener("click", () => this.#startRun());
    retryButton.addEventListener("click", () => this.#startRun());
    endMenuButton?.addEventListener("click", () => this.#quitToMenu());

    const submitScore = async () => {
      if (!submitButton || submitButton.disabled) return;
      const fromAuth = this.authSync.getLeaderboardHandle?.();
      const typed = (nameInput?.value ?? "").trim();
      const name =
        fromAuth != null && fromAuth.length > 0
          ? fromAuth
          : typed.length > 0
            ? typed.slice(0, 18)
            : "Player";
      submitButton.disabled = true;
      submitButton.textContent = "Logging...";
      try {
        await this.leaderboard.submit({ name, score: this.score });
        const top = await this.leaderboard.getTop();
        this.ui.renderLeaderboard(top);
        submitButton.textContent = "Logged";
      } catch (err) {
        console.warn("Leaderboard submit failed", err);
        submitButton.textContent = "Try Again";
      } finally {
        setTimeout(() => {
          if (!submitButton) return;
          submitButton.disabled = false;
          submitButton.textContent = "Log Score";
        }, 900);
      }
    };
    submitButton.addEventListener("click", submitScore);
    nameInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitScore();
      }
    });

    const pauseButton = document.getElementById("pause-button");
    const resumeButton = document.getElementById("resume-button");
    const quitButton = document.getElementById("quit-button");
    const menuSettingsBtn = document.getElementById("menu-settings-button");
    const endSettingsBtn = document.getElementById("end-settings-button");
    const settingsClose = document.getElementById("settings-close");
    const pauseVolume = document.getElementById("pause-volume");
    const settingsVolume = document.getElementById("settings-volume");
    const pauseVolumeValue = document.getElementById("pause-volume-value");
    const settingsVolumeValue = document.getElementById("settings-volume-value");

    [pauseButton, resumeButton, quitButton, menuSettingsBtn, endSettingsBtn, settingsClose]
      .filter(Boolean)
      .forEach((btn) => {
        btn.addEventListener("pointerenter", playHoverClick);
        btn.addEventListener("focus", playHoverClick);
      });

    pauseButton?.addEventListener("click", () => this.#setPaused(true));
    resumeButton?.addEventListener("click", () => this.#setPaused(false));
    quitButton?.addEventListener("click", () => this.#quitToMenu());
    menuSettingsBtn?.addEventListener("click", () => {
      this.ui.setAuthOpen(false);
      this.ui.setSettingsOpen(true);
    });
    endSettingsBtn?.addEventListener("click", () => {
      this.ui.setAuthOpen(false);
      this.ui.setSettingsOpen(true);
    });
    settingsClose?.addEventListener("click", () => this.ui.setSettingsOpen(false));

    const renderVolumeUi = (value) => {
      const pct = Math.round(value * 100);
      if (pauseVolume) pauseVolume.value = String(pct);
      if (settingsVolume) settingsVolume.value = String(pct);
      if (pauseVolumeValue) pauseVolumeValue.textContent = `${pct}%`;
      if (settingsVolumeValue) settingsVolumeValue.textContent = `${pct}%`;
    };
    const applyVolume = (raw) => {
      const v = Math.max(0, Math.min(1, Number(raw) / 100));
      this.audio.setMasterVolume(v);
      renderVolumeUi(v);
    };
    renderVolumeUi(this.audio.getMasterVolume?.() ?? 0.7);
    pauseVolume?.addEventListener("input", (e) => applyVolume(e.target.value));
    settingsVolume?.addEventListener("input", (e) => applyVolume(e.target.value));

    const shopTabSkins = document.getElementById("shop-tab-skins");
    const shopTabTrails = document.getElementById("shop-tab-trails");
    [shopTabSkins, shopTabTrails].filter(Boolean).forEach((btn) => {
      btn.addEventListener("pointerenter", playHoverClick);
      btn.addEventListener("focus", playHoverClick);
    });
    shopTabSkins?.addEventListener("click", () => this.ui.setShopSection("skins"));
    shopTabTrails?.addEventListener("click", () => this.ui.setShopSection("trails"));

    const shopButton = document.getElementById("shop-button");
    const shopClose = document.getElementById("shop-close");
    const shopConfirmYes = document.getElementById("shop-confirm-yes");
    const shopConfirmCancel = document.getElementById("shop-confirm-cancel");
    [shopButton, shopClose, shopConfirmYes, shopConfirmCancel]
      .filter(Boolean)
      .forEach((btn) => {
        btn.addEventListener("pointerenter", playHoverClick);
        btn.addEventListener("focus", playHoverClick);
      });

    const renderShop = () => {
      const coins = this.shop.getCoins();
      const pendingSkin =
        this._shopPendingPurchase?.kind === "skin"
          ? this._shopPendingPurchase.id
          : null;
      const pendingTrail =
        this._shopPendingPurchase?.kind === "trail"
          ? this._shopPendingPurchase.id
          : null;
      this.ui.renderShop({
        coins,
        skins: {
          catalog: SKIN_CATALOG,
          owned: this.shop.getOwned(),
          equipped: this.shop.getEquipped(),
          pendingPurchaseId: pendingSkin,
          onSelect: (id) => this.#onSkinSelected(id),
        },
        trails: {
          catalog: TRAIL_CATALOG,
          owned: this.shop.getOwnedTrails(),
          equipped: this.shop.getEquippedTrail(),
          pendingPurchaseId: pendingTrail,
          onSelect: (id) => this.#onTrailSelected(id),
        },
      });
    };

    shopButton?.addEventListener("click", () => {
      this.ui.setAuthOpen(false);
      this.ui.setShopSection("skins");
      this.#clearShopPendingPurchase();
      renderShop();
      this.ui.setShopOpen(true);
    });
    shopClose?.addEventListener("click", () => {
      this.#clearShopPendingPurchase();
      this.ui.setShopOpen(false);
    });
    shopConfirmYes?.addEventListener("click", () => {
      this.#confirmPendingShopPurchase();
    });
    shopConfirmCancel?.addEventListener("click", () =>
      this.#cancelPendingShopPurchase()
    );
    this._renderShop = renderShop;

    const menuAccountCorner = document.getElementById("menu-account-corner");
    const endAccountCorner = document.getElementById("end-account-corner");
    const authTabSigninBtn = document.getElementById("auth-tab-signin");
    const authTabSignupBtn = document.getElementById("auth-tab-signup");
    const authCloseBtn = document.getElementById("auth-close");
    const authSubmitBtn = document.getElementById("auth-submit");
    const authSignOutBtn = document.getElementById("auth-sign-out-button");
    const authOpenUsernameBtn = document.getElementById("auth-open-username");
    const authOpenPasswordBtn = document.getElementById("auth-open-password");
    const authSaveUsernameBtn = document.getElementById("auth-save-username");
    const authCancelUsernameBtn = document.getElementById("auth-cancel-username");
    const authSavePasswordBtn = document.getElementById("auth-save-password");
    const authCancelPasswordBtn = document.getElementById("auth-cancel-password");

    [
      menuAccountCorner,
      endAccountCorner,
      authTabSigninBtn,
      authTabSignupBtn,
      authCloseBtn,
      authSubmitBtn,
      authSignOutBtn,
      authOpenUsernameBtn,
      authOpenPasswordBtn,
      authSaveUsernameBtn,
      authCancelUsernameBtn,
      authSavePasswordBtn,
      authCancelPasswordBtn,
    ]
      .filter(Boolean)
      .forEach((btn) => {
        btn.addEventListener("pointerenter", playHoverClick);
        btn.addEventListener("focus", playHoverClick);
      });

    const openAuthPanel = () => {
      this.ui.setSettingsOpen(false);
      this.ui.setShopOpen(false);
      this.ui.setPaused(false);
      this.ui.resetAuthPanels();
      if (!this.authSync.getSignedInPreview?.()) {
        this.ui.setAuthTab("signin");
      }
      this.ui.setAuthOpen(true);
      this.refreshAuthUi();
    };

    const onAccountButtonClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openAuthPanel();
    };
    menuAccountCorner?.addEventListener("click", onAccountButtonClick);
    endAccountCorner?.addEventListener("click", onAccountButtonClick);

    authTabSigninBtn?.addEventListener("click", () => this.ui.setAuthTab("signin"));
    authTabSignupBtn?.addEventListener("click", () => this.ui.setAuthTab("signup"));

    authCloseBtn?.addEventListener("click", () => this.ui.setAuthOpen(false));
    document.getElementById("auth-close-signed")?.addEventListener("click", () => {
      this.ui.setAuthOpen(false);
    });

    authSubmitBtn?.addEventListener("click", async () => {
      if (!authSubmitBtn) return;
      const emailEl = document.getElementById("auth-email");
      const passEl = document.getElementById("auth-password");
      const dispEl = document.getElementById("auth-display-name");
      const email = (emailEl?.value ?? "").trim();
      const password = passEl?.value ?? "";
      const displayName = (dispEl?.value ?? "").trim();
      const mode = this.ui.getAuthUiMode();
      this.ui.setAuthFormMessage("", "neutral");
      if (!email || !password) {
        this.ui.setAuthFormError("Enter email and password.");
        return;
      }
      if (mode === "signup") {
        if (!displayName) {
          this.ui.setAuthFormError("Choose a username (3–32 characters).");
          return;
        }
        if (displayName.length < 3) {
          this.ui.setAuthFormError("Username must be at least 3 characters.");
          return;
        }
        if (displayName.length > 32) {
          this.ui.setAuthFormError("Username must be 32 characters or fewer.");
          return;
        }
      }
      authSubmitBtn.disabled = true;
      try {
        const res =
          mode === "signin"
            ? await this.authSync.signInWithEmail(email, password)
            : await this.authSync.signUpWithEmail(email, password, displayName);
        if (!res.ok) {
          this.ui.setAuthFormError(res.message);
          return;
        }
        if (res.message) {
          this.ui.setAuthFormMessage(res.message, "success");
        }
        this.refreshAuthUi();
        const needsEmailVerify =
          mode === "signup" &&
          /check your email|verify your account/i.test(String(res.message ?? ""));
        if (needsEmailVerify) return;
        if (mode === "signin" || mode === "signup") {
          setTimeout(() => this.ui.setAuthOpen(false), 1500);
        }
      } finally {
        authSubmitBtn.disabled = false;
      }
    });

    authOpenUsernameBtn?.addEventListener("click", () => {
      this.ui.revealAuthSignedInSubview("username");
      const nv = document.getElementById("auth-new-username");
      const p = this.authSync.getSignedInPreview?.();
      if (nv) nv.value = p?.displayName ? String(p.displayName) : "";
    });
    authOpenPasswordBtn?.addEventListener("click", () => {
      this.ui.revealAuthSignedInSubview("password");
    });
    authCancelUsernameBtn?.addEventListener("click", () => {
      this.ui.resetAuthPanels();
    });
    authCancelPasswordBtn?.addEventListener("click", () => {
      this.ui.resetAuthPanels();
    });
    authSaveUsernameBtn?.addEventListener("click", async () => {
      const input = document.getElementById("auth-new-username");
      const v = input?.value ?? "";
      authSaveUsernameBtn.disabled = true;
      try {
        const r = await this.authSync.updateDisplayName(v);
        if (!r.ok) {
          this.ui.setSignedInAuthFeedback(r.message, "error");
          return;
        }
        this.ui.closeSignedInEditors(false);
        this.ui.setSignedInAuthFeedback("Username updated.", "success");
        this.refreshAuthUi();
      } finally {
        authSaveUsernameBtn.disabled = false;
      }
    });
    authSavePasswordBtn?.addEventListener("click", async () => {
      const a = document.getElementById("auth-new-password");
      const b = document.getElementById("auth-confirm-password");
      const pw1 = a?.value ?? "";
      const pw2 = b?.value ?? "";
      if (pw1 !== pw2) {
        this.ui.setSignedInAuthFeedback("Passwords do not match.", "error");
        return;
      }
      authSavePasswordBtn.disabled = true;
      try {
        const r = await this.authSync.updatePassword(pw1);
        if (!r.ok) {
          this.ui.setSignedInAuthFeedback(r.message, "error");
          return;
        }
        this.ui.closeSignedInEditors(false);
        this.ui.setSignedInAuthFeedback("Password updated.", "success");
        if (a) a.value = "";
        if (b) b.value = "";
      } finally {
        authSavePasswordBtn.disabled = false;
      }
    });

    authSignOutBtn?.addEventListener("click", async () => {
      if (!authSignOutBtn) return;
      authSignOutBtn.disabled = true;
      try {
        await this.authSync.signOut();
      } finally {
        authSignOutBtn.disabled = false;
        this.ui.setAuthOpen(false);
        this.refreshAuthUi();
      }
    });

    const initialCoins = this.shop.getCoins();
    this.ui.updateMenuCoins(initialCoins);
    this.ui.updateCoinHud(initialCoins);

    window.addEventListener("keydown", (event) => {
      if (event.key !== " " || event.repeat) return;
      if (this.ui.isAnyModalOpen?.()) return;
      const target = event.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (this.state === GAME_STATES.MENU || this.state === GAME_STATES.END) {
        event.preventDefault();
        this.#startRun();
      }
    });
  }

  #startRun() {
    this.#clearShopPendingPurchase();
    this.state = GAME_STATES.PLAYING;
    this.ui.renderState(this.state);
    this.ui.flashTransition();
    this.score = 0;
    this._scoreAccum = 0;
    this.accumulator = 0;
    this.lastTimestamp = 0;
    this.moodIntensity = CONFIG.mood.stateTransitionBoost;
    this.speedBoostTimer = 0;
    this.paletteShift = 0;
    this.targetPaletteShift = 0;
    this.timeScale = 1;
    this.targetTimeScale = 1;
    this.deathSequenceTimer = 0;
    this.paused = false;
    this.input.consume();
    this.audio.start().catch(() => {});
    this.audio.setMenuMode(false);
    this.playerMesh.visible = true;
    if (this.nameInput) this.nameInput.value = "";
    const submitBtn = document.getElementById("submit-score-button");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Log Score";
    }

    this.movement = new MovementSystem();
    this.difficulty = new DifficultySystem();
    this.spawner.reset();
    this.previousBody = this.movement.getBodyPosition();
    this.cameraSystem.reset(this.previousBody);
    this.cameraSystem.punchFov?.(0, 0);
    this.cameraSystem.shake?.(0, 0);
    this.postFx?.punch({ aberration: 0.006, bloom: 0.25, duration: 0.4 });
    this.obstacles.forEach((obstacle) => {
      obstacle.active = false;
    });
    this.trailSystem?.setEquippedTrailId(this.shop.getEquippedTrail());
    this.trailSystem?.clearPath();
    this.trailSystem?.setRunActive(true);
  }

  #beginDeathSequence() {
    if (this.state !== GAME_STATES.PLAYING) return;
    this.deathSequenceTimer = 0.9;
    this.targetTimeScale = 0.18;
    this.cameraSystem.shake?.(0.55, 0.7);
    this.postFx?.punch({ aberration: 0.008, bloom: 0.4, duration: 0.7 });
    this.audio.playImpactSfx?.();
    this.audio.duckMusic?.(0.45, 0.9);
    this.ui.flashImpact();
    this.ui.spawnScorePopup?.("// SIGNAL LOST", { kind: "danger" });
    const body = this.movement.getBodyPosition();
    this.vfx?.triggerImpact(body.x, body.y + 0.4, body.z);
  }

  #setPaused(value) {
    if (this.state !== GAME_STATES.PLAYING) return;
    if (this.paused === value) return;
    if (value) {
      this.paused = true;
      this.ui.setPaused(true);
      return;
    }
    this.ui.setPaused(false);
    this.ui.runCountdown(3).then(() => {
      if (this.state !== GAME_STATES.PLAYING) return;
      this.paused = false;
      this.lastTimestamp = 0;
      this.accumulator = 0;
    });
  }

  #quitToMenu() {
    this.ui.cancelCountdown?.();
    this.paused = false;
    this.ui.setPaused(false);
    this.ui.setSettingsOpen(false);
    this.ui.setAuthOpen(false);
    this.state = GAME_STATES.MENU;
    this.timeScale = 1;
    this.targetTimeScale = 1;
    this.deathSequenceTimer = 0;
    this.lastTimestamp = 0;
    this.accumulator = 0;
    this.audio.setMenuMode(true);
    this.playerMesh.visible = false;
    this.trailSystem?.setRunActive(false);
    this.obstacles.forEach((o) => {
      o.active = false;
    });
    this.ui.renderState(this.state);
  }

  #endRun() {
    this.state = GAME_STATES.END;
    this.timeScale = 1;
    this.targetTimeScale = 1;
    const earnedCoins = Math.floor(this.score / 1000);
    if (earnedCoins > 0) {
      this.shop.addCoins(earnedCoins);
    }
    const totalCoins = this.shop.getCoins();
    this.ui.renderState(this.state);
    this.refreshAuthUi();
    this.ui.startScoreCountUp(this.score);
    this.ui.showEndCoins?.(earnedCoins, totalCoins);
    this.ui.updateMenuCoins(totalCoins);
    this.ui.updateCoinHud(totalCoins);
    void this.authSync.flushNowIfSignedIn().then(() => this.refreshShopAndCoinsUi());
    this.leaderboard
      .getTop()
      .then((top) => this.ui.renderLeaderboard(top))
      .catch((err) => console.warn("Leaderboard preload failed", err));
    this.moodIntensity = Math.min(1, this.moodIntensity + CONFIG.mood.stateTransitionBoost);
    this.audio.pulse();
    this.audio.setMenuMode(true);
    this.playerMesh.visible = false;
    const reward = this.rewardAdapter.evaluate(this.score);
    if (reward.granted) {
      console.info("Reward triggered", reward.reward);
    }
  }

  #frame(timestampMs) {
    if (this.lastTimestamp === 0) this.lastTimestamp = timestampMs;
    const wallSeconds = Math.min(0.1, (timestampMs - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestampMs;

    this.timeScale += (this.targetTimeScale - this.timeScale) * Math.min(1, wallSeconds * 4);
    const elapsedSeconds = wallSeconds * this.timeScale;

    if (this.deathSequenceTimer > 0) {
      this.deathSequenceTimer -= wallSeconds;
      if (this.deathSequenceTimer <= 0) {
        this.#endRun();
      }
    }

    if (this.state === GAME_STATES.PLAYING && this.deathSequenceTimer <= 0 && !this.paused) {
      this.accumulator += elapsedSeconds;
      let steps = 0;

      while (this.accumulator >= CONFIG.fixedDeltaSeconds && steps < CONFIG.maxSubSteps) {
        this.previousBody = this.movement.getBodyPosition();
        this.#simulate(CONFIG.fixedDeltaSeconds);
        this.accumulator -= CONFIG.fixedDeltaSeconds;
        steps += 1;
      }

      if (steps >= CONFIG.maxSubSteps && this.accumulator >= CONFIG.fixedDeltaSeconds) {
        this.accumulator = Math.min(this.accumulator, CONFIG.fixedDeltaSeconds);
      }
    }

    const alpha = Math.max(0, Math.min(1, this.accumulator / CONFIG.fixedDeltaSeconds));
    const body = this.movement.interpolate(this.previousBody, alpha);
    if (this.state === GAME_STATES.PLAYING) {
      this.trailSystem?.setRunActive(true);
      if (!this.paused) {
        this.trailSystem?.pushSample(body.x, body.y, body.z);
      }
    } else {
      this.trailSystem?.setRunActive(false);
    }

    this.playerMesh.position.x = body.x;
    this.playerMesh.position.y = body.y;
    this.playerMesh.position.z = body.z;

    const ballRadius = 0.65;
    const rollSpeed = (this.difficulty?.speed ?? 0) * wallSeconds;
    if (this.playerCoreMesh) {
      this.playerCoreMesh.rotation.x -= rollSpeed / ballRadius;
    }

    const lateralTilt = Math.max(-0.45, Math.min(0.45, body.x * 0.18));
    this.playerMesh.rotation.z = -lateralTilt;
    this.playerMesh.rotation.y = 0;

    this.#updateVisualMood(wallSeconds);
    this.cameraSystem.update(body, wallSeconds, { boostActive: this.speedBoostTimer > 0 });
    this.cameraSystem.applyToThree(this.camera);

    this.world.setCamera(this.cameraSystem.getState());
    this.world.syncObstacles(this.obstacles);
    this.world.setMoodIntensity(this.moodIntensity, this.paletteShift);
    this.world.setTrackOffset(body.z);

    this.postFx?.setBoostActive(this.speedBoostTimer > 0);
    this.postFx?.update(wallSeconds);

    this.vfx?.setAnchor(body.x, body.y, body.z);
    this.vfx?.setBoostActive(this.speedBoostTimer > 0);
    this.vfx?.update(wallSeconds);

    this.world.render(wallSeconds);
    this.postFx?.render(wallSeconds);

    this.#trackPerf(wallSeconds);

    requestAnimationFrame((t) => this.#frame(t));
  }

  #trackPerf(wallSeconds) {
    if (!this.postFx?.enabled) return;
    this.frameTimes.push(wallSeconds * 1000);
    if (this.frameTimes.length > 30) {
      this.frameTimes.shift();
    }
    if (this.frameTimes.length === 30) {
      const slow = this.frameTimes.filter((t) => t > 32).length;
      if (slow >= 18) {
        console.warn("PostFX disabled - sustained slow frame rate detected.");
        this.postFx.disable();
      }
    }
  }

  #simulate(deltaSeconds) {
    const commands = this.input.consume();
    commands.forEach((cmd) => {
      const action = this.movement.handleCommand(cmd);
      if (!action) return;
      if (action.moved) this.audio.playMoveSfx();
      if (action.jumped) this.audio.playJumpSfx();
    });

    this.difficulty.tick(deltaSeconds);
    this.speedBoostTimer = Math.max(0, this.speedBoostTimer - deltaSeconds);
    const speedMultiplier =
      1 + (this.speedBoostTimer > 0 ? CONFIG.boost.speedMultiplier : 0);
    const effectiveSpeed = this.difficulty.speed * speedMultiplier;
    this.movement.tick(deltaSeconds, effectiveSpeed);

    const player = this.movement.getBodyPosition();
    this.spawner.tick(player.z, effectiveSpeed, this.obstacles, (spawn) => this.#activateObstacle(spawn));
    this.#updateObstacles(player.z);
    this.#checkBoostPickup(player);

    this._scoreAccum += effectiveSpeed * 0.42;
    const wholePoints = Math.floor(this._scoreAccum);
    if (wholePoints > 0) {
      this.score += wholePoints;
      this._scoreAccum -= wholePoints;
    }
    this.ui.updateHud(this.score, effectiveSpeed);

    if (this.#checkCollision(player)) {
      this.#beginDeathSequence();
    }
  }

  #activateObstacle(spawn) {
    const obstacle =
      this.obstacles.find((entry) => !entry.active && !!entry.isBoost === !!spawn.isBoost) ??
      this.obstacles.find((entry) => !entry.active);
    if (!obstacle) return;
    obstacle.active = true;
    obstacle.x = spawn.x;
    obstacle.z = spawn.z;
    if (obstacle.isBoost) {
      obstacle.scale = 1;
      obstacle.rotationX = 0;
      obstacle.rotationY = this.rng.range(0, Math.PI * 2);
      obstacle.rotationZ = 0;
      return;
    }
    obstacle.scale = this.rng.range(this.theme.geometry.obstacleScaleMin, this.theme.geometry.obstacleScaleMax);
    obstacle.rotationX = this.rng.range(-0.35, 0.35);
    obstacle.rotationY = this.rng.range(0, Math.PI * 2);
    obstacle.rotationZ = this.rng.range(-0.2, 0.2);
  }

  #updateObstacles(playerZ) {
    this.obstacles.forEach((obstacle) => {
      if (!obstacle.active) return;
      if (!obstacle.isBoost) {
        obstacle.rotationY += obstacle.spinRate * CONFIG.fixedDeltaSeconds;
      }
      if (obstacle.z > playerZ + 12) {
        obstacle.active = false;
      }
    });
  }

  #checkCollision(player) {
    const playerBottom = player.y - CONFIG.playerHalfHeight;
    for (const obstacle of this.obstacles) {
      if (!obstacle.active) continue;
      const dx = Math.abs(obstacle.x - player.x);
      const dz = Math.abs(obstacle.z - player.z);
      if (obstacle.isBoost) continue;
      if (dx < 0.72 && dz < 0.72) {
        if (obstacle.unjumpable) return true;
        const obstacleTop = obstacle.colliderHeight;
        if (playerBottom < obstacleTop - 0.08) return true;
      }
    }
    return false;
  }

  #checkBoostPickup(player) {
    for (const obstacle of this.obstacles) {
      if (!obstacle.active || !obstacle.isBoost) continue;
      const dx = Math.abs(obstacle.x - player.x);
      const dz = Math.abs(obstacle.z - player.z);
      const canCollect = dx < 0.88 && dz < 0.88 && player.y <= CONFIG.playerBaseY + 0.25;
      if (!canCollect) continue;
      obstacle.active = false;
      this.speedBoostTimer = Math.max(
        this.speedBoostTimer,
        CONFIG.boost.durationSeconds
      );
      this.audio.playBoostStinger?.();
      this.audio.pulse();
      this.moodIntensity = Math.min(1, this.moodIntensity + 0.18);
      this.cameraSystem.punchFov?.(6, 0.5);
      this.cameraSystem.shake?.(0.14, 0.2);
      this.postFx?.punch({ aberration: 0.005, bloom: 0.25, duration: 0.4 });
      this.score += 100;
      this.ui.spawnScorePopup?.("+100 BOOST", { kind: "boost" });
      this.ui.flashBoost();
    }
  }

  #updateVisualMood(elapsedSeconds) {
    const targetIntensity = Math.min(
      1,
      (this.difficulty.speed - CONFIG.baseForwardSpeed) * CONFIG.mood.speedWeight
    );
    this.moodIntensity += (targetIntensity - this.moodIntensity) * Math.min(1, elapsedSeconds * 2.5);
    this.moodIntensity = Math.max(
      0,
      this.moodIntensity - CONFIG.mood.falloffPerSecond * elapsedSeconds * 0.12
    );
    // Palette switch disabled: scene stays on the dark baseline.
    this.targetPaletteShift = 0;
    this.paletteShift = 0;

    this.ui.setMoodIntensity(this.moodIntensity);
    this.audio.setMoodIntensity(this.moodIntensity, this.difficulty.speed);
    if (this.playerEmissiveMaterials) {
      const intensity =
        this.theme.emissive.playerBase + this.moodIntensity * this.theme.emissive.pulseBoost;
      for (const mat of this.playerEmissiveMaterials) {
        mat.emissiveIntensity = intensity;
      }
    }
  }

  #canvasViewportPx() {
    const el = this.worldCanvas;
    let w = Math.floor(el.clientWidth);
    let h = Math.floor(el.clientHeight);
    if (w < 2 || h < 2) {
      w = Math.max(1, Math.floor(window.innerWidth));
      h = Math.max(1, Math.floor(window.innerHeight));
    }
    return { width: Math.max(1, w), height: Math.max(1, h) };
  }

  #onResize() {
    const { width: w, height: h } = this.#canvasViewportPx();
    const prCap = typeof window.devicePixelRatio === "number" ? Math.min(window.devicePixelRatio, 2) : 1;
    this.renderer.setPixelRatio(prCap);
    this.renderer.setSize(w, h, false);
    this.cameraSystem.setAspect(w / h);
    this.cameraSystem.applyToThree(this.camera);
    this.world.resize(w, h);
    this.postFx?.setSize(w, h);
  }
}
