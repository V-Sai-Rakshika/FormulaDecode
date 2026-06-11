// ══════════════════════════════════════════════════════════════
// FormulaDecode — Groq Chatbot Integration
// Replaces the Anthropic API call with Groq's llama3-70b model
// Context-aware: uses skin profile for logged-in users
// ══════════════════════════════════════════════════════════════

function getGroqKey() {
  return typeof FD_CONFIG !== "undefined" && FD_CONFIG.groqApiKey
    ? FD_CONFIG.groqApiKey
    : "";
}
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
// ── Build system prompt ────────────────────────────────────────
function buildGroqSystemPrompt() {
  const isLoggedIn = FD_Auth?.isLoggedIn();
  const profile = FD_Auth?.userProfile;
  const ddProfile = DD?.profile;
  const currentProduct = DD?.state?.currentProduct;

  let systemPrompt = `You are FormulaAI, the expert skincare ingredient analyst for FormulaDecode. You are knowledgeable, evidence-based, and genuinely helpful. You explain complex ingredient science in plain, friendly language.

Your areas of expertise:
- Skincare ingredient analysis and safety
- Product recommendations based on skin type
- Skincare routine building and sequencing
- Ingredient interactions (synergies and conflicts)
- Skin concern guidance (acne, hyperpigmentation, aging, sensitivity)
- Decoding cosmetic labels and marketing claims

Keep responses concise (2-4 sentences for simple questions, up to 150 words for complex ones). Always be specific and actionable.`;

  // Add product context if viewing an analysis
  if (currentProduct) {
    systemPrompt += `\n\nThe user is currently viewing: "${currentProduct.name}" by ${currentProduct.brand}.`;
    if (currentProduct.fullIngredients?.length) {
      systemPrompt += `\nIngredients: ${currentProduct.fullIngredients.join(", ")}.`;
    }
    if (currentProduct.scores) {
      systemPrompt += `\nScores — Overall: ${currentProduct.scores.overall}, Skin Compat: ${currentProduct.scores.skinCompatibility}, Risk: ${currentProduct.scores.risk}.`;
    }
  }

  // Personalized context for logged-in users
  if (isLoggedIn && ddProfile) {
    const skinType = ddProfile.skinType?.skinTypeSelf || "";
    const concerns = ddProfile.concerns?.biggestConcerns?.join(", ") || "";
    const sensitivities = getDisplaySensitivities(ddProfile).join(", ");
    const issueIngredients = (
      ddProfile.productCompatibility?.issueIngredients || []
    )
      .filter((i) => i !== "None" && i !== "Not Sure")
      .join(", ");
    const goals = (ddProfile.productCompatibility?.skincareGoal || []).join(
      ", ",
    );
    const allergies = (ddProfile.allergies || []).join(", ");
    const fragranceSensitive =
      ddProfile.sensitivity?.fragranceSensitive === "Yes";
    const acneFrequency = ddProfile.acneBreakouts?.acneFrequency || "";
    const sensitivityLevel = ddProfile.sensitivity?.sensitivityLevel || "";
    const activeExperience = ddProfile.bonusAI?.activeExperience || "";
    const fitzpatrick = ddProfile.bonusAI?.fitzpatrick || "";

    systemPrompt += `\n\nPERSONALIZED USER PROFILE — Tailor all advice to this specific profile:
- Skin Type: ${skinType || "Not specified"}
- Concerns: ${concerns || "None specified"}
- Sensitivities: ${sensitivities || "None"}${fragranceSensitive ? " (fragrance sensitive)" : ""}
- Problematic Ingredients: ${issueIngredients || "None reported"}
- Skincare Goals: ${goals || "General skin health"}
- Allergies: ${allergies || "None"}
- Acne frequency: ${acneFrequency || "Not specified"}
- Sensitivity level: ${sensitivityLevel || "Not specified"}
- Active ingredient experience: ${activeExperience || "Not specified"}
- Fitzpatrick tone: ${fitzpatrick || "Not specified"}

Always consider these factors when recommending products, routines, or ingredients. Flag anything from their sensitivity list. Be extra careful with fragrance if they are sensitive.`;
  } else {
    systemPrompt += `\n\nThe user is browsing without a profile. Provide general, broadly-safe skincare guidance. Mention that logging in will unlock personalized advice tailored to their specific skin.`;
  }

  // Add onboarding answers if available for deeper context
  if (isLoggedIn && FD_Auth.userProfile?.onboarding_answers) {
    const answers = FD_Auth.userProfile.onboarding_answers;
    systemPrompt += `\n\nDetailed onboarding data: ${JSON.stringify(answers)}`;
  }

  return systemPrompt;
}

// ── Groq API call ──────────────────────────────────────────────
async function callGroqAPI(messages, systemPrompt) {
  const key = getGroqKey();
  if (!key) {
    throw new Error(
      "Groq API key not configured. Please add your key to config.js.",
    );
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 512,
      temperature: 0.7,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Groq API error: ${response.status}`,
    );
  }

  const data = await response.json();
  return (
    data.choices?.[0]?.message?.content ||
    "I couldn't get a response. Please try again."
  );
}

// ── Anthropic fallback (existing sendChat logic) ───────────────
async function callAnthropicFallback(messages, systemPrompt) {
  // Anthropic API blocks browser requests (CORS).
  // This means GROQ_API_KEY is missing — remind user to set it.
  throw new Error(
    "Groq API key not configured. Please add your key to config.js.",
  );
}

// ── Main sendChat override ─────────────────────────────────────
// Replaces the original sendChat in script.js
async function sendChat() {
  const input = document.getElementById("chat-input");
  const text = input?.value?.trim();
  if (!text) return;
  input.value = "";

  addUserMessage(text);
  showTyping();

  // Persist user message to DB if logged in
  if (FD_Auth?.isLoggedIn()) {
    saveChatMessage(FD_Auth.currentUser.id, "user", text);
  }

  // Build message history (last 8 turns = 4 user + 4 assistant)
  const recentMessages = DD.state.chatMessages
    .slice(-8)
    .map((m) => ({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text,
    }))
    .filter((m) => m.content && m.content !== text); // Avoid duplicating the current message

  const messages = [...recentMessages, { role: "user", content: text }];
  const systemPrompt = buildGroqSystemPrompt();

  try {
    const reply = await callGroqAPI(messages, systemPrompt);
    hideTyping();
    addAIMessage(reply);

    // Persist AI response to DB if logged in
    if (FD_Auth?.isLoggedIn()) {
      saveChatMessage(FD_Auth.currentUser.id, "assistant", reply);
    }
  } catch (err) {
    hideTyping();
    console.error("Chat API error:", err);
    let errorMsg =
      "Sorry, I'm having trouble connecting right now. Please try again in a moment.";
    if (err.message?.includes("401")) {
      errorMsg = "Invalid Groq API key. Please check your config.js.";
    } else if (err.message?.includes("429")) {
      errorMsg = "Too many requests. Please wait a moment and try again.";
    } else if (err.message?.includes("not configured")) {
      errorMsg =
        "Chat is not configured yet. Please add your Groq API key to config.js.";
    }
    addAIMessage(errorMsg);
  }
}

// ── Load chat history for logged-in users ─────────────────────
async function loadChatHistory() {
  if (!FD_Auth?.isLoggedIn()) return;

  const history = await fetchChatHistory(FD_Auth.currentUser.id, 20);
  if (!history.length) return;

  // Populate state
  DD.state.chatMessages = history.map((m) => ({
    role: m.role === "assistant" ? "ai" : "user",
    text: m.content,
  }));

  // Render in UI
  const msgs = document.getElementById("chat-messages");
  if (!msgs) return;
  msgs.innerHTML = "";
  DD.state.chatMessages.forEach((m) => {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${m.role}`;
    bubble.textContent = m.text;
    msgs.appendChild(bubble);
  });
  msgs.scrollTop = msgs.scrollHeight;
}

// ── Override openChatModal to personalize greeting ─────────────
const _originalOpenChatModal = window.openChatModal;
window.openChatModal = function () {
  document.getElementById("chat-modal").classList.add("open");
  document.getElementById("chat-fab")?.classList.add("hidden");
  DD.state.chatOpen = true;

  if (DD.state.chatMessages.length === 0) {
    const isLoggedIn = FD_Auth?.isLoggedIn();
    const name = FD_Auth?.userProfile?.full_name?.split(" ")[0] || "";
    const skinType = DD?.profile?.skinType?.skinTypeSelf || "";

    let greeting;
    if (isLoggedIn && skinType) {
      greeting = `Hi${name ? " " + name : ""}! 👋 I'm FormulaAI. I can see you have ${skinType.toLowerCase()} skin — ask me anything about ingredients, your routine, or the product you're viewing and I'll give you personalized advice!`;
    } else if (isLoggedIn) {
      greeting = `Hi${name ? " " + name : ""}! 👋 I'm FormulaAI, your skincare assistant. Ask me anything about ingredients, product recommendations, or skincare routines!`;
    } else {
      greeting =
        "Hi! I'm FormulaAI 🧬 Ask me anything about skincare ingredients, product recommendations, or routines. Sign in for personalized advice based on your skin profile!";
    }
    addAIMessage(greeting);
  }

  // Load DB history (async, non-blocking)
  loadChatHistory();
};
