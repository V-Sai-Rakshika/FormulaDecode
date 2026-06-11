// ══════════════════════════════════════════════════════════════
// FormulaDecode — Authentication & Profile Module
// ══════════════════════════════════════════════════════════════

const SUPABASE_URL = FD_CONFIG.supabaseUrl;
const SUPABASE_ANON_KEY = FD_CONFIG.supabaseAnonKey;

let _fdClient = null;

function initSupabase() {
  if (typeof window.supabase !== "undefined") {
    _fdClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } else {
    console.error("Supabase SDK not loaded.");
  }
}

// ── Auth State ────────────────────────────────────────────────
const FD_Auth = {
  currentUser: null,
  userProfile: null,
  isLoading: false,
  authListeners: [],

  setUser(user) {
    this.currentUser = user;
    this.notifyListeners();
    updateNavAvatar();
  },

  setProfile(profile) {
    this.userProfile = profile;
    this.notifyListeners();
  },

  onAuthChange(callback) {
    this.authListeners.push(callback);
    callback(this.currentUser, this.userProfile);
  },

  notifyListeners() {
    this.authListeners.forEach((cb) => cb(this.currentUser, this.userProfile));
  },

  isLoggedIn() {
    return !!this.currentUser;
  },

  getUserFirstLetter() {
    if (!this.currentUser) return "?";
    const name = this.userProfile?.full_name || this.currentUser.email || "?";
    return name.charAt(0).toUpperCase();
  },
};

// ── Password Validation ───────────────────────────────────────
const passwordRules = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (pw) => pw.length >= 8,
  },
  {
    id: "lowercase",
    label: "At least 1 lowercase letter (a-z)",
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    id: "uppercase",
    label: "At least 1 uppercase letter (A-Z)",
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    id: "number",
    label: "At least 1 number (0-9)",
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    id: "special",
    label: "At least 1 special character",
    test: (pw) => /[^a-zA-Z0-9]/.test(pw),
  },
];

function validatePassword(password) {
  return passwordRules.map((rule) => ({
    ...rule,
    passed: rule.test(password),
  }));
}

function isPasswordValid(password) {
  return passwordRules.every((rule) => rule.test(password));
}

function renderPasswordRequirements(password, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const results = validatePassword(password);
  container.innerHTML = results
    .map(
      (r) => `
    <div class="pw-rule ${r.passed ? "passed" : "failed"}">
      <span class="pw-rule-icon">${r.passed ? "✓" : "✗"}</span>
      <span class="pw-rule-label">${r.label}</span>
    </div>
  `,
    )
    .join("");
}

// ── Sign Up ───────────────────────────────────────────────────
async function signUp(fullName, gender, email, password, confirmPassword) {
  if (!_fdClient)
    return { error: { message: "Auth service not initialized." } };

  if (!fullName || fullName.trim().length < 2)
    return { error: { message: "Full name must be at least 2 characters." } };
  if (!gender) return { error: { message: "Please select your gender." } };
  if (!isPasswordValid(password))
    return { error: { message: "Password does not meet all requirements." } };
  if (password !== confirmPassword)
    return { error: { message: "Passwords do not match." } };

  try {
    const { data, error } = await _fdClient.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim(), gender } },
    });
    if (error) return { error };
    if (data.user) {
      await createUserProfile(data.user.id, {
        full_name: fullName.trim(),
        gender,
        email: email.trim().toLowerCase(),
        onboarding_completed: false,
      });
    }
    return { data };
  } catch (err) {
    return { error: { message: err.message || "Sign up failed." } };
  }
}

// ── Sign In ───────────────────────────────────────────────────
async function signIn(email, password, rememberMe = false) {
  if (!_fdClient)
    return { error: { message: "Auth service not initialized." } };

  try {
    const { data, error } = await _fdClient.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return { error };
    if (data.user) {
      const profile = await fetchUserProfile(data.user.id);
      FD_Auth.setUser(data.user);
      FD_Auth.setProfile(profile);
      handlePostAuth(data.user, profile);
    }
    return { data };
  } catch (err) {
    return { error: { message: err.message || "Sign in failed." } };
  }
}

// ── Google OAuth ──────────────────────────────────────────────
async function signInWithGoogle() {
  if (!_fdClient)
    return { error: { message: "Auth service not initialized." } };

  try {
    const { data, error } = await _fdClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    return { data, error };
  } catch (err) {
    return { error: { message: err.message || "Google sign in failed." } };
  }
}

// ── Forgot Password ───────────────────────────────────────────
async function sendPasswordReset(email) {
  if (!_fdClient)
    return { error: { message: "Auth service not initialized." } };

  try {
    const { data, error } = await _fdClient.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo:
          window.location.origin + window.location.pathname + "?reset=true",
      },
    );
    return { data, error };
  } catch (err) {
    return { error: { message: err.message || "Password reset failed." } };
  }
}

// ── Sign Out ──────────────────────────────────────────────────
async function signOut() {
  if (!_fdClient) return;
  await _fdClient.auth.signOut();
  FD_Auth.setUser(null);
  FD_Auth.setProfile(null);
  updateNavAvatar();
  showPage("dashboard");
  renderDashboard();
}

// ── User Profile CRUD ─────────────────────────────────────────
async function createUserProfile(userId, data) {
  if (!_fdClient) return null;

  const { data: profile, error } = await _fdClient
    .from("user_profiles")
    .upsert({
      id: userId,
      full_name: data.full_name,
      gender: data.gender,
      email: data.email,
      onboarding_completed: data.onboarding_completed ?? false,
      skin_profile: null,
      onboarding_answers: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) console.error("Profile creation error:", error);
  return profile;
}

async function fetchUserProfile(userId) {
  if (!_fdClient) return null;

  const { data, error } = await _fdClient
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Profile fetch error:", error);
  }
  return data || null;
}

async function updateUserProfile(userId, updates) {
  if (!_fdClient) return { error: { message: "Not initialized." } };

  const { data, error } = await _fdClient
    .from("user_profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();

  if (!error) FD_Auth.setProfile(data);
  return { data, error };
}

async function saveOnboardingAnswers(userId, answers, skinProfile) {
  if (!_fdClient) return { error: { message: "Not initialized." } };

  const { data, error } = await _fdClient
    .from("user_profiles")
    .update({
      onboarding_completed: true,
      onboarding_answers: answers,
      skin_profile: skinProfile,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select()
    .single();

  if (!error) FD_Auth.setProfile(data);
  return { data, error };
}

// ── Chat History ──────────────────────────────────────────────
async function saveChatMessage(userId, role, content) {
  if (!_fdClient || !userId) return;
  await _fdClient.from("chat_history").insert({
    user_id: userId,
    role,
    content,
    created_at: new Date().toISOString(),
  });
}

async function fetchChatHistory(userId, limit = 50) {
  if (!_fdClient || !userId) return [];
  const { data } = await _fdClient
    .from("chat_history")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(limit);
  return data || [];
}

// ── Auth State Listener ───────────────────────────────────────
function initAuthListener() {
  if (!_fdClient) return;

  _fdClient.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      FD_Auth.setUser(session.user);

      let profile = await fetchUserProfile(session.user.id);

      // New Google user — create profile from metadata
      if (!profile && session.user.app_metadata?.provider === "google") {
        const meta = session.user.user_metadata || {};
        profile = await createUserProfile(session.user.id, {
          full_name: meta.full_name || meta.name || session.user.email,
          gender: "",
          email: session.user.email,
          onboarding_completed: false,
        });
      }

      FD_Auth.setProfile(profile);
      handlePostAuth(session.user, profile);
    } else if (event === "SIGNED_OUT") {
      FD_Auth.setUser(null);
      FD_Auth.setProfile(null);
      updateNavAvatar();
      showPage("dashboard");
      renderDashboard();
    } else if (event === "PASSWORD_RECOVERY") {
      showAuthPage("reset-password");
    }
  });
}

// ── Post-auth routing ─────────────────────────────────────────
function handlePostAuth(user, profile) {
  hideAuthModal();
  showMainApp();
  showPage("dashboard");
  renderDashboard();
  updateNavAvatar();
}

// ── Personalized Analysis CTA ─────────────────────────────────
function handlePersonalizedCTA() {
  if (FD_Auth.isLoggedIn()) {
    startPersonalizedFlow(FD_Auth.currentUser, FD_Auth.userProfile);
  } else {
    window._pendingPersonalizedFlow = true;
    showAuthModal("login");
  }
}

function startPersonalizedFlow(user, profile) {
  if (profile?.onboarding_completed && profile?.onboarding_answers) {
    DD.profile = buildProfileFromAnswers(profile.onboarding_answers);
    showMainApp();
    showPage("dashboard");
    renderDashboard();
  } else {
    showMainApp();
    document.getElementById("nav").style.display = "none";
    showPage("onboarding");
    initOnboarding();
  }
}

// ── UI helpers ────────────────────────────────────────────────
function showMainApp() {
  document.getElementById("app").style.display = "block";
  const overlay = document.getElementById("auth-overlay");
  if (overlay) overlay.style.display = "none";
  document.getElementById("nav").style.display = "flex";
  updateNavAvatar();
}

function showAuthOverlay(mode = "login") {
  const overlay = document.getElementById("auth-overlay");
  if (overlay) overlay.style.display = "flex";
  document.getElementById("app").style.display = "none";
  document.getElementById("nav").style.display = "none";
  showAuthPage(mode);
}

function showAuthModal(mode = "login") {
  const modal = document.getElementById("auth-modal");
  if (modal) {
    modal.style.display = "flex";
  }
  showAuthPage(mode, "modal");
}

function hideAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.style.display = "none";
}

function showAuthPage(mode, context = "overlay") {
  const prefix = context === "modal" ? "modal" : "auth";
  ["login", "signup", "forgot", "reset-password"].forEach((p) => {
    const el = document.getElementById(`${prefix}-panel-${p}`);
    if (el) el.style.display = "none";
  });
  const target = document.getElementById(`${prefix}-panel-${mode}`);
  if (target) target.style.display = "block";
}

// ── Nav Avatar ────────────────────────────────────────────────
function updateNavAvatar() {
  const avatar = document.getElementById("nav-avatar");
  if (!avatar) return;
  if (FD_Auth.isLoggedIn()) {
    avatar.textContent = FD_Auth.getUserFirstLetter();
    avatar.style.cursor = "pointer";
    avatar.onclick = () => {
      showPage("profile");
      renderProfile();
    };
  } else {
    avatar.textContent = "?";
    avatar.onclick = () => showAuthModal("login");
  }
}

// ── Init ──────────────────────────────────────────────────────
async function initAuth() {
  initSupabase();
  initAuthListener();

  // Load persisted state BEFORE rendering dashboard
  if (typeof loadState === "function") loadState();

  showMainApp();
  showPage("dashboard");
  renderDashboard();

  if (!_fdClient) return;

  const {
    data: { session },
  } = await _fdClient.auth.getSession();
  if (session?.user) {
    FD_Auth.setUser(session.user);
    const profile = await fetchUserProfile(session.user.id);
    FD_Auth.setProfile(profile);
    updateNavAvatar();
  }

  // Re-render after state + session both loaded
  renderDashboard();
  // If user is on history page, refresh it too
  if (typeof renderHistory === "function") renderHistory();
}

// ── Onboarding save to DB ─────────────────────────────────────
const _originalCompleteOnboarding = window.completeOnboarding;
window.completeOnboardingWithSave = async function () {
  const overlay = document.getElementById("onboard-complete-overlay");
  if (overlay) overlay.style.display = "flex";

  DD.profile = buildProfileFromAnswers(onboardAnswers);

  if (FD_Auth.isLoggedIn()) {
    const skinProfileData = {
      skinType: DD.profile.skinType,
      concerns: DD.profile.concerns,
      sensitivity: DD.profile.sensitivity,
    };
    await saveOnboardingAnswers(
      FD_Auth.currentUser.id,
      onboardAnswers,
      skinProfileData,
    );
  }

  setTimeout(() => {
    if (overlay) overlay.style.display = "none";
    document.getElementById("page-onboarding").classList.remove("active");
    document.getElementById("nav").style.display = "flex";
    showPage("dashboard");
    renderDashboard();
  }, 2000);
};
