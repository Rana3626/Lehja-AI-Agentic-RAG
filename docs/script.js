/* ============================================================
   Lehja AI — script.js
   Flow: Login → Placement Test → Preparing → Chat Dashboard
   Frontend connected to one n8n Webhook
============================================================ */

"use strict";

/* ============================================================
   0 · CONFIGURATION
============================================================ */
const CONFIG = {
  // During testing, keep n8n listening for a test event and use /webhook-test/.
  webhookUrl:
    "https://n8n.169.58.245.203.sslip.io/webhook/1eb8fed0-7931-49ad-a769-8f2427743309",

  // After activating the workflow, replace the URL above with the Production URL:
  // webhookUrl: "http://127.0.0.1:5678/webhook/1eb8fed0-7931-49ad-a769-8f2427743309",

  requestTimeoutMs: 180000,
};

/* ============================================================
   1 · APP STATE
============================================================ */
const state = {
  user: {
    id: createId("user"),
    name: "Sami Ahmad",
    email: "sami@example.com",
    testLanguage: "MSA",
    preferredLanguage: "MSA",
  },

  // One session for the chat/memory workflow.
  sessionId: createId("chat"),

  // A separate session for the placement test.
  placementSessionId: null,
  placementLevel: 1,
  currentMicroLevel: 1,
  testLanguage: "MSA",

  mode: "question",
  isSendingMessage: false,

  wordsCompleted: 0,
  wordsTotal: 0,
};

const placementState = {
  selectedAnswer: null,
  currentQuestion: null,
};

/* ============================================================
   2 · DOM REFERENCES
============================================================ */
const screens = {
  login: document.getElementById("screen-login"),
  test: document.getElementById("screen-test"),
  preparing: document.getElementById("screen-preparing"),
  app: document.getElementById("screen-app"),
};

const loginForm =
  document.getElementById("login-form");

const loginEmail =
  document.getElementById("login-email");

const loginPassword =
  document.getElementById("login-password");
const loginSubmitButton = loginForm.querySelector('button[type="submit"]');
const createAccountLink = document.getElementById("create-account-link");
const placementLanguageInputs = [
  ...document.querySelectorAll(
    'input[name="placement-language"]'
  ),
];
const elTestFill = document.getElementById("test-progress-fill");
const elTestLabel = document.getElementById("test-progress-label");
const elTestQuestion = document.getElementById("test-question");
const elTestEyebrow = document.getElementById("test-eyebrow");
const elTestOptions = document.getElementById("test-options");
const elTestCard = document.getElementById("test-card");
const btnTestBack = document.getElementById("test-back");
const btnTestNext = document.getElementById("test-next");

const elMessages = document.getElementById("chat-messages");
const elChips = document.getElementById("prompt-chips");
const elInput = document.getElementById("chat-input");
const composer = document.getElementById("composer");
const composerSubmitButton = composer.querySelector('button[type="submit"]');
const elProgressCard = document.getElementById("progress-card");
const modeBtnQuestion = document.getElementById("mode-question");
const modeBtnLearning = document.getElementById("mode-learning");
const modePill = document.getElementById("mode-pill");

const profileBtn = document.getElementById("profile-btn");
const profileDropdown = document.getElementById("profile-dropdown");
const editName = document.getElementById("edit-name");
const editEmail = document.getElementById("edit-email");
const editPassword = document.getElementById("edit-password");
const saveConfirm = document.getElementById("save-confirm");

/* ============================================================
   3 · GENERAL HELPERS
============================================================ */
function createId(prefix = "id") {
  const randomPart =
    globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}-${randomPart}`;
}
function getSessionStorageKey(email) {
  return `lehja_session_${String(email ?? "")
    .trim()
    .toLowerCase()}`;
}

function getOrCreateSessionId(email) {
  const key = getSessionStorageKey(email);

  let sessionId = localStorage.getItem(key);

  if (!sessionId) {
    sessionId = createId("chat");
    localStorage.setItem(key, sessionId);
  }

  return sessionId;
}
/* ============================================================
   PERSISTENT LOGIN — 12 HOURS
============================================================ */

const LEHJA_AUTH_KEY = "lehja_auth_session_v1";
const LEHJA_AUTH_DURATION_MS = 12 * 60 * 60 * 1000;

let lehjaAutoLogoutTimer = null;

function getPersistentLogin() {
  const raw = localStorage.getItem(LEHJA_AUTH_KEY);

  if (!raw) {
    return null;
  }

  try {
    const data = JSON.parse(raw);

    if (
      !data ||
      !data.email ||
      !data.userId ||
      !data.expiresAt
    ) {
      localStorage.removeItem(LEHJA_AUTH_KEY);
      return null;
    }

    if (Number(data.expiresAt) <= Date.now()) {
      localStorage.removeItem(LEHJA_AUTH_KEY);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Invalid saved login:", error);

    localStorage.removeItem(LEHJA_AUTH_KEY);
    return null;
  }
}


function savePersistentLogin() {
  const existing = getPersistentLogin();

  /*
    لا نمدد الـ12 ساعة مع كل request.
    إذا في login صالح، نحافظ على نفس expiresAt.
  */
  const expiresAt =
    existing?.expiresAt ??
    (Date.now() + LEHJA_AUTH_DURATION_MS);

  const data = {
    userId: state.user.id,
    email: state.user.email,
    name: state.user.name,

    preferredLanguage:
      state.user.preferredLanguage,

    testLanguage:
      state.testLanguage,

    placementLevel:
      state.placementLevel,

    currentMicroLevel:
      state.currentMicroLevel,

    sessionId:
      state.sessionId,

    mode:
      state.mode,

    wordsCompleted:
      state.wordsCompleted,

    wordsTotal:
      state.wordsTotal,

    expiresAt,
  };

  localStorage.setItem(
    LEHJA_AUTH_KEY,
    JSON.stringify(data)
  );

  scheduleAutoLogout(expiresAt);
}


function scheduleAutoLogout(expiresAt) {
  if (lehjaAutoLogoutTimer) {
    clearTimeout(lehjaAutoLogoutTimer);
  }

  const remaining =
    Number(expiresAt) - Date.now();

  if (remaining <= 0) {
    logoutFromLehja();
    return;
  }

  lehjaAutoLogoutTimer =
    setTimeout(
      logoutFromLehja,
      remaining
    );
}


function logoutFromLehja() {
  localStorage.removeItem(
    LEHJA_AUTH_KEY
  );

  if (lehjaAutoLogoutTimer) {
    clearTimeout(
      lehjaAutoLogoutTimer
    );

    lehjaAutoLogoutTimer = null;
  }

  /*
    نمسح فقط login المحلي.
    لا نمسح learning session أو progress من n8n.
  */
  window.location.reload();
}


function restorePersistentLogin() {
  const saved = getPersistentLogin();

  if (!saved) {
    return false;
  }

  state.user.id =
    saved.userId;

  state.user.email =
    saved.email;

  state.user.name =
    saved.name ||
    getDisplayNameFromEmail(
      saved.email
    );

  state.user.preferredLanguage =
    normalizeInterfaceLanguage(
      saved.preferredLanguage ||
      saved.testLanguage ||
      "MSA"
    );

  state.user.testLanguage =
    normalizeInterfaceLanguage(
      saved.testLanguage ||
      saved.preferredLanguage ||
      "MSA"
    );

  state.testLanguage =
    state.user.testLanguage;

  state.placementLevel =
    Math.max(
      1,
      Number(saved.placementLevel) || 1
    );

  state.currentMicroLevel =
    Math.max(
      1,
      Number(saved.currentMicroLevel) || 1
    );

  state.wordsCompleted =
    Math.max(
      0,
      Number(saved.wordsCompleted) || 0
    );

  state.wordsTotal =
    Math.max(
      state.wordsCompleted,
      Number(saved.wordsTotal) || 0
    );

  state.sessionId =
    saved.sessionId ||
    getOrCreateSessionId(
      saved.email
    );

  state.mode =
    saved.mode === "learning"
      ? "learning"
      : "question";

  refreshProfileUI();
  applyDashboardLanguage();
  updateProgressUI();

  showScreen("app");

  if (state.mode === "learning") {
    setMode("learning", true);
  } else {
    setMode("question", true);
  }

  scheduleAutoLogout(
    saved.expiresAt
  );

  addLogoutButton();

  return true;
}


function addLogoutButton() {
  let button =
    document.getElementById(
      "lehja-logout-btn"
    );

  if (!button) {
    button =
      document.createElement(
        "button"
      );

    button.id =
      "lehja-logout-btn";

    button.type =
      "button";

    button.style.width =
      "100%";

    button.style.marginTop =
      "12px";

    button.style.padding =
      "10px 12px";

    button.style.cursor =
      "pointer";

    button.addEventListener(
      "click",
      logoutFromLehja
    );

    profileDropdown.appendChild(
      button
    );
  }

  button.textContent =
    state.user.preferredLanguage ===
    "English"
      ? "Log out"
      : "تسجيل الخروج";
}
function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[name].classList.add("active");
  window.scrollTo(0, 0);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function getSelectedTestLanguage() {
  const selectedInput = placementLanguageInputs.find(
    (input) => input.checked
  );

  return selectedInput?.value === "English"
    ? "English"
    : "MSA";
}

function normalizeInterfaceLanguage(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized === "english" || normalized === "en"
    ? "English"
    : "MSA";
}

function isArabicPlacementTest() {
  return state.testLanguage === "MSA";
}

function isArabicUI() {
  return state.user.preferredLanguage !== "English";
}

function updateLoginButtonLanguage() {
  const selectedLanguage =
    getSelectedTestLanguage();

  loginSubmitButton.textContent =
    selectedLanguage === "MSA"
      ? "ابدأ الاختبار"
      : "Start test";
}

placementLanguageInputs.forEach((input) => {
  input.addEventListener(
    "change",
    updateLoginButtonLanguage
  );
});

updateLoginButtonLanguage();
function getDisplayNameFromEmail(email) {
  const username = email.split("@")[0].replace(/[._-]+/g, " ").trim();

  if (!username) return "Learner";

  return username
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function initials(name) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join("") || "U"
  );
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return ["true", "1", "yes", "finished", "done"].includes(
      value.trim().toLowerCase()
    );
  }
  return false;
}

function firstDefined(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== ""
  );
}

function tryParseJson(value) {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function unwrapN8nPayload(payload) {
  let result = payload;

  if (Array.isArray(result)) {
    result = result.length === 1 ? result[0] : { items: result };
  }

  result = tryParseJson(result);

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { output: result };
  }

  // Some Respond to Webhook nodes return the actual response inside body/data.
  const body = tryParseJson(result.body);
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    (body.question !== undefined ||
      body.reply !== undefined ||
      body.output !== undefined ||
      body.finished !== undefined ||
      body.options !== undefined)
  ) {
    return body;
  }

  const data = tryParseJson(result.data);
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    (data.question !== undefined ||
      data.reply !== undefined ||
      data.output !== undefined ||
      data.finished !== undefined ||
      data.options !== undefined)
  ) {
    return data;
  }

  return result;
}

async function postToN8n(payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CONFIG.requestTimeoutMs
  );

  try {
    const response = await fetch(CONFIG.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseText = await response.text();
    const parsedResponse = responseText ? tryParseJson(responseText) : {};
    const data = unwrapN8nPayload(parsedResponse);

    if (!response.ok) {
      const message = firstDefined(
        data.error,
        data.message,
        responseText,
        `n8n request failed with HTTP ${response.status}`
      );
      throw new Error(String(message));
    }

    if (data.ok === false) {
      throw new Error(String(firstDefined(data.error, data.message, "Request failed")));
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The n8n request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseOptions(rawOptions) {
  let options = tryParseJson(rawOptions);

  if (options && typeof options === "object" && !Array.isArray(options)) {
    options = Object.values(options);
  }

  if (typeof options === "string") {
    options = options
      .split(/\r?\n|\s*\|\s*|\s*,\s*/)
      .map((option) => option.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(options)) return [];

  return options
    .map((option) => {
      if (option && typeof option === "object") {
        return {
          label: String(
            firstDefined(option.label, option.text, option.option, option.value, "")
          ),
          value: String(
            firstDefined(option.value, option.answer, option.label, option.text, "")
          ),
        };
      }

      return {
        label: String(option),
        value: String(option),
      };
    })
    .filter((option) => option.label);
}

/* ============================================================
   4 · LOGIN AND PLACEMENT TEST
============================================================ */
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = loginEmail.value.trim();
  const password =
  loginPassword.value;
  if (!isValidEmail(email)) {
    loginEmail.focus();
    window.alert(
      "Please enter a valid email address."
    );

    return;
  }
  if (password.length < 4) {
  loginPassword.focus();

  window.alert(
    "Password must contain at least 4 characters."
  );

  return;
}

  // Take the language selected by the user
  state.testLanguage =
    getSelectedTestLanguage();

  state.user.testLanguage =
    state.testLanguage;

  state.user.preferredLanguage =
    normalizeInterfaceLanguage(
      state.testLanguage
    );

  state.user.email = email;
  state.user.name =
    getDisplayNameFromEmail(email);

  state.user.id =
    `user-${email.toLowerCase()}`;
    state.sessionId =
  getOrCreateSessionId(email);

await startPlacementFromServer(password);
});

createAccountLink.addEventListener("click", (event) => {
  event.preventDefault();
  loginForm.requestSubmit();
});

async function startPlacementFromServer(password) {
  const originalButtonText = loginSubmitButton.textContent;
  loginSubmitButton.disabled = true;
  loginSubmitButton.textContent =
  isArabicPlacementTest()
    ? "جاري بدء الاختبار..."
    : "Starting test...";

  state.placementSessionId = createId("placement");
  placementState.selectedAnswer = null;
  placementState.currentQuestion = null;

  try {
    const data = await postToN8n({
      mode: "placement",
      action: "start",
      user_id: state.user.id,
      session_id: state.placementSessionId,
      placement_session_id: state.placementSessionId,
      email: state.user.email,
      password: password,
test_language: state.testLanguage,    });

    const normalized = normalizePlacementResponse(data);

    state.user.preferredLanguage =
      normalizeInterfaceLanguage(
        normalized.preferredLanguage
      );

    if (normalized.sessionId) {
      state.placementSessionId = normalized.sessionId;
    }

    if (normalized.finished) {
      finishPlacement(normalized);
      return;
    }

    renderPlacementQuestion(normalized);
  } catch (error) {
    console.error("Placement start error:", error);
    window.alert(
      `Could not start the placement test.\n\n${error.message}\n\nMake sure n8n is running and the webhook is listening.`
    );
  } finally {
    loginSubmitButton.disabled = false;
    loginSubmitButton.textContent = originalButtonText;
  }
}

function normalizePlacementResponse(data) {
  const parsedOutput =
    tryParseJson(data.output);

  const outputObject =
    parsedOutput &&
    typeof parsedOutput === "object" &&
    !Array.isArray(parsedOutput)
      ? parsedOutput
      : {};

  const roadmap =
    data.roadmap &&
    typeof data.roadmap === "object"
      ? data.roadmap
      : outputObject.roadmap &&
        typeof outputObject.roadmap === "object"
        ? outputObject.roadmap
        : {};

  const returnedPlacementState =
    firstDefined(
      data.placementState,
      data.placement_state,

      outputObject.placementState,
      outputObject.placement_state,

      null
    );

  return {
    raw: data,

    finished: toBoolean(
      firstDefined(
        data.finished,
        data.is_finished,
        data.done,

        outputObject.finished,
        outputObject.is_finished,
        outputObject.done,

        false
      )
    ),

    sessionId: String(
      firstDefined(
        data.sessionId,
        data.session_id,
        data.placement_session_id,

        outputObject.sessionId,
        outputObject.session_id,
        outputObject.placement_session_id,

        state.placementSessionId,
        ""
      )
    ),

    questionId: firstDefined(
      data.questionId,
      data.question_id,
      data.id,

      outputObject.questionId,
      outputObject.question_id,
      outputObject.id,

      ""
    ),

    questionNumber: toNumber(
      firstDefined(
        data.questionNumber,
        data.question_number,
        data.currentQuestionNumber,
        data.current_question_number,

        outputObject.questionNumber,
        outputObject.question_number,
        outputObject.currentQuestionNumber,
        outputObject.current_question_number,

        1
      ),
      1
    ),

    totalQuestions: toNumber(
      firstDefined(
        data.totalQuestions,
        data.total_questions,

        outputObject.totalQuestions,
        outputObject.total_questions,

        20
      ),
      20
    ),

    question: String(
      firstDefined(
        data.question,
        data.question_text,
        data.text,

        outputObject.question,
        outputObject.question_text,
        outputObject.text,

        ""
      )
    ),

    options: parseOptions(
      firstDefined(
        data.options,
        data.choices,
        data.answers,

        outputObject.options,
        outputObject.choices,
        outputObject.answers,

        []
      )
    ),

    level: toNumber(
      firstDefined(
        data.level,
        data.placementLevel,
        data.placement_level,
        data.detected_level,

        outputObject.level,
        outputObject.placementLevel,
        outputObject.placement_level,
        outputObject.detected_level,

        roadmap.startingLevel,
        roadmap.starting_level,

        1
      ),
      1
    ),

    score: toNumber(
      firstDefined(
        data.score,
        outputObject.score,
        0
      ),
      0
    ),

    interfaceLanguage: normalizeInterfaceLanguage(
      firstDefined(
        data.interfaceLanguage,
        data.interface_language,
        data.test_language,

        outputObject.interfaceLanguage,
        outputObject.interface_language,
        outputObject.test_language,

        state.testLanguage,
        "MSA"
      )
    ),

    preferredLanguage: normalizeInterfaceLanguage(
      firstDefined(
        data.preferred_language,
        data.preferredLanguage,

        outputObject.preferred_language,
        outputObject.preferredLanguage,

        data.interface_language,
        outputObject.interface_language,

        state.testLanguage,
        state.user.preferredLanguage,
        "MSA"
      )
    ),

    roadmap,

    /*
      هذه أهم إضافة:
      نخزن حالة الاختبار التي أعادها n8n
      حتى نعيد إرسالها مع الإجابة التالية.
    */
    placementState:
      returnedPlacementState,
  };
  
}

function renderPlacementQuestion(questionData) {
  if (questionData.preferredLanguage) {
    state.user.preferredLanguage =
      normalizeInterfaceLanguage(
        questionData.preferredLanguage
      );
  }

  if (!questionData.question) {
    throw new Error(
      "n8n did not return a question. Expected a field named question."
    );
  }

  if (!questionData.options.length) {
    throw new Error(
      "n8n did not return answer options. Expected a field named options."
    );
  }

  placementState.selectedAnswer = null;
  placementState.currentQuestion = questionData;

  showScreen("test");

  const questionNumber = Math.max(1, questionData.questionNumber);
  const totalQuestions = Math.max(questionNumber, questionData.totalQuestions);
  const progress = Math.min(
    100,
    Math.max(0, ((questionNumber - 1) / totalQuestions) * 100)
  );

  elTestFill.style.width = `${progress}%`;
 const arabicTest =
  isArabicPlacementTest();

elTestEyebrow.textContent =
  arabicTest
    ? "اختبار تحديد المستوى"
    : "Placement test";

elTestLabel.textContent =
  arabicTest
   ? `السؤال ${questionNumber}`
: `Question ${questionNumber}`;

elTestQuestion.textContent =
  questionData.question;

elTestQuestion.dir =
  arabicTest ? "rtl" : "ltr";

elTestOptions.dir =
  arabicTest ? "rtl" : "ltr";
  elTestOptions.innerHTML = "";

  btnTestNext.disabled = true;
btnTestNext.textContent =
  arabicTest
    ? "التالي"
    : "Next";  btnTestBack.style.visibility = "hidden";

  questionData.options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option";
    button.textContent = option.label;
    button.setAttribute("dir", "auto");

    button.addEventListener("click", () => {
      elTestOptions
        .querySelectorAll(".option")
        .forEach((item) => item.classList.remove("selected"));

      button.classList.add("selected");
      placementState.selectedAnswer = option;
      btnTestNext.disabled = false;
    });

    elTestOptions.appendChild(button);
  });

  elTestCard.classList.remove("slide");
  void elTestCard.offsetWidth;
  elTestCard.classList.add("slide");
}

btnTestNext.addEventListener("click", () => {
  if (!placementState.selectedAnswer) return;
  submitPlacementAnswer(placementState.selectedAnswer);
});

async function submitPlacementAnswer(
  selectedOption
) {
  const currentQuestion =
    placementState.currentQuestion;

  if (!currentQuestion) {
    return;
  }

  /*
    الحالة التي رجعتها Adaptive Placement Engine
    مع السؤال الحالي.
  */
  

  btnTestNext.disabled = true;

  btnTestNext.textContent =
    isArabicPlacementTest()
      ? "جاري التحقق..."
      : "Checking...";

  elTestOptions
    .querySelectorAll(".option")
    .forEach((button) => {
      button.disabled = true;
    });

  try {
    const data = await postToN8n({
      mode: "placement",
      action: "answer",

      user_id:
        state.user.id,

      session_id:
        state.placementSessionId,

      placement_session_id:
        state.placementSessionId,

      email:
        state.user.email,

      test_language:
        state.testLanguage,

      question_id:
        currentQuestion.questionId,

      question_number:
        currentQuestion.questionNumber,

      question:
        currentQuestion.question,

      answer:
        selectedOption.value,

      selected_option:
        selectedOption.value,

      selected_option_label:
        selectedOption.label,

      /*
        هذه أهم إضافة:
        نعيد حالة الاختبار كاملة إلى n8n.
      */
     
    });

    const normalized =
      normalizePlacementResponse(data);

    state.user.preferredLanguage =
      normalizeInterfaceLanguage(
        normalized.preferredLanguage
      );

    if (normalized.sessionId) {
      state.placementSessionId =
        normalized.sessionId;
    }

    if (normalized.finished) {
      finishPlacement(normalized);
      return;
    }

    /*
      فحص واضح قبل محاولة عرض السؤال.
    */
    if (!normalized.question) {
      throw new Error(
        isArabicPlacementTest()
          ? "لم يُرجع n8n نص السؤال التالي."
          : "n8n did not return the next question."
      );
    }

    if (!normalized.options.length) {
      throw new Error(
        isArabicPlacementTest()
          ? "لم يُرجع n8n خيارات السؤال التالي."
          : "n8n did not return answer options."
      );
    }

    

    renderPlacementQuestion(
      normalized
    );
  } catch (error) {
    console.error(
      "Placement answer error:",
      error
    );

    window.alert(
      isArabicPlacementTest()
        ? `تعذر إرسال الإجابة.\n\n${error.message}`
        : `Could not submit your answer.\n\n${error.message}`
    );

    btnTestNext.textContent =
      isArabicPlacementTest()
        ? "التالي"
        : "Next";

    btnTestNext.disabled = false;

    elTestOptions
      .querySelectorAll(".option")
      .forEach((button) => {
        button.disabled = false;
      });
  }
}

function finishPlacement(result) {
  state.user.preferredLanguage =
    normalizeInterfaceLanguage(
      result.preferredLanguage ??
      result.raw?.preferred_language ??
      result.raw?.preferredLanguage ??
      state.user.preferredLanguage
    );

  state.placementLevel =
    Math.max(1, result.level || 1);

  const roadmap = result.roadmap || {};
  state.wordsCompleted = Math.max(
    0,
    toNumber(
      firstDefined(
        roadmap.wordsCompleted,
        roadmap.words_completed,
        result.raw.wordsCompleted,
        result.raw.words_completed
      ),
      0
    )
  );

  state.wordsTotal = Math.max(
    state.wordsCompleted,
    toNumber(
      firstDefined(
        roadmap.wordsTotal,
        roadmap.words_total,
        result.raw.wordsTotal,
        result.raw.words_total
      ),
      0
    )
  );

  elTestFill.style.width = "100%";
updateProgressUI();

savePersistentLogin();

startPreparingScreen();
}

/* ============================================================
   5 · PREPARING SCREEN
============================================================ */
const PREP_STEPS = [
  "Analyzing your placement results…",
  "Selecting Levantine words for your level…",
  "Building your lesson plan…",
  "Almost ready…",
];

function startPreparingScreen() {
  document.getElementById(
    "prep-badge"
  ).textContent = `Level ${state.placementLevel} detected`;

  const fill = document.getElementById("prep-bar-fill");
  const stepElement = document.getElementById("prep-step");

  fill.style.width = "0%";
  showScreen("preparing");

  const marks = [12, 38, 64, 86, 100];
  marks.forEach((width, index) => {
    setTimeout(() => {
      fill.style.width = `${width}%`;
    }, 120 + index * 420);
  });

  PREP_STEPS.forEach((text, index) => {
    setTimeout(() => {
      stepElement.classList.add("fade");
      setTimeout(() => {
        stepElement.textContent = text;
        stepElement.classList.remove("fade");
      }, 200);
    }, index * 520);
  });

  setTimeout(enterDashboard, 2300);
}

/* ============================================================
   6 · MAIN DASHBOARD AND MODES
============================================================ */
const UI_TEXT = {
  English: {
    questionMode: "Question Mode",
    learningMode: "Learning Mode",

    questionGreeting:
      "Hey! I'm Lehja — your Levantine Arabic tutor. Ask me how to say something, translate a phrase, or check whether a word is Levantine.",

    questionPlaceholder:
      "Ask anything about Levantine Arabic...",

    questionChips: [
      'How do I say "good morning" politely?',
      'Is the word "بدي" Levantine?',
      'How to say in Levantine:"See you tomorrow?"',
    ],

    learningChips: [
      "Got it",
      "I don't understand",
      "Give me an example",
    ],

    currentLevel: "Current level",
    wordsCompleted: "Words completed",
    wordsRemaining: "Words remaining",
    levelProgress: "Level progress",
    levelWord: "Level",

    composerHint:
      "Lehja may make mistakes. Verify important phrases.",

    noReply:
      "No reply received from n8n.",

    wordLabel: "Word",
    meaningLabel: "Meaning",
    pronunciationLabel: "Pronunciation",
    exampleLabel: "Example",

    learningStartError:
      "Sorry, I could not start Learning Mode.",

    connectionError:
      "Sorry, I could not connect to the server.",
  },

  MSA: {
    questionMode: "وضع الأسئلة",
    learningMode: "وضع التعلّم",

    questionGreeting:
      "مرحبًا! أنا لهجة، معلّمك للغة العربية الشامية. اسألني كيف تقول عبارة، أو اطلب ترجمة، أو تحقّق إن كانت الكلمة شامية.",

    questionPlaceholder:
      "اسأل عن اللهجة الشامية...",

    questionChips: [
      'كيف أقول "صباح الخير" بطريقة مهذبة؟',
      'هل كلمة "بدي" من اللهجة الشامية؟',
      'ترجم: "أراك غدًا"',
    ],

    learningChips: [
      "فهمت",
      "لم أفهم",
      "أعطني مثالًا",
    ],

    currentLevel: "المستوى الحالي",
    wordsCompleted: "الكلمات المكتملة",
    wordsRemaining: "الكلمات المتبقية",
    levelProgress: "تقدّم المستوى",
    levelWord: "المستوى",

    composerHint:
      "قد تُخطئ لهجة أحيانًا. تحقّق من العبارات المهمة.",

    noReply:
      "لم يصل رد من n8n.",

    wordLabel: "الكلمة",
    meaningLabel: "المعنى",
    pronunciationLabel: "النطق",
    exampleLabel: "مثال",

    learningStartError:
      "تعذّر بدء وضع التعلّم.",

    connectionError:
      "تعذّر الاتصال بالخادم.",
  },
};

function getUIText() {
  return state.user.preferredLanguage === "English"
    ? UI_TEXT.English
    : UI_TEXT.MSA;
}
function syncInterfaceLanguageFromServer(data) {
  const returnedLanguage = firstDefined(
    data?.preferred_language,
    data?.preferredLanguage,
    data?.interface_language,
    data?.interfaceLanguage
  );

  if (returnedLanguage) {
    state.user.preferredLanguage =
      normalizeInterfaceLanguage(returnedLanguage);
  }

  // The learner's explicit English selection has priority.
  if (state.testLanguage === "English") {
    state.user.preferredLanguage = "English";
  }

  applyDashboardLanguage();
}

function applyDashboardLanguage() {
  const ui = getUIText();
  const arabicUI = isArabicUI();

  document.documentElement.lang =
    arabicUI ? "ar" : "en";

  modeBtnQuestion.textContent =
    ui.questionMode;

  modeBtnLearning.textContent =
    ui.learningMode;

  elInput.placeholder =
    ui.questionPlaceholder;

  elInput.dir =
    arabicUI ? "rtl" : "ltr";

  elChips.dir =
    arabicUI ? "rtl" : "ltr";

  const statLabels = [
    ...document.querySelectorAll(
      "#progress-card .stat-label"
    ),
  ];

  const translatedLabels = [
    ui.currentLevel,
    ui.wordsCompleted,
    ui.wordsRemaining,
    ui.levelProgress,
  ];

  statLabels.forEach((label, index) => {
    if (translatedLabels[index]) {
      label.textContent =
        translatedLabels[index];
    }
  });

  const composerHint =
    document.querySelector(
      ".composer-hint"
    );

  if (composerHint) {
    composerHint.textContent =
      ui.composerHint;

    composerHint.dir =
      arabicUI ? "rtl" : "ltr";
  }

  const surveyLink =
    document.getElementById(
      "experience-survey-link"
    );

  if (surveyLink) {
    surveyLink.textContent =
      arabicUI
        ? "استبيان تقييم التجربة"
        : "Experience survey";

    surveyLink.dir =
      arabicUI ? "rtl" : "ltr";
  }
}

function enterDashboard() {
  // Keep the dashboard interface consistent with the language
  // selected by the learner for the placement test.
  state.user.preferredLanguage =
    normalizeInterfaceLanguage(
      state.user.preferredLanguage ||
      state.testLanguage
    );

  // If the learner explicitly selected English,
  // never let the dashboard fall back to MSA.
  if (state.testLanguage === "English") {
    state.user.preferredLanguage = "English";
  }

  refreshProfileUI();
  applyDashboardLanguage();
  updateProgressUI();
  showScreen("app");
  setMode("question", true);
  requestAnimationFrame(positionModePill);
  addLogoutButton();
savePersistentLogin();
}

function positionModePill() {
  const activeButton =
    state.mode === "question"
      ? modeBtnQuestion
      : modeBtnLearning;

  modePill.style.left =
    `${activeButton.offsetLeft}px`;

  modePill.style.width =
    `${activeButton.offsetWidth}px`;
}

window.addEventListener("resize", () => {
  if (
    screens.app.classList.contains("active")
  ) {
    positionModePill();
  }
});

modeBtnQuestion.addEventListener(
  "click",
  () => setMode("question")
);

modeBtnLearning.addEventListener(
  "click",
  () => setMode("learning")
);

function setMode(mode, force = false) {
  if (!force && state.mode === mode) {
    return;
  }

  state.mode = mode;
savePersistentLogin();
  const ui = getUIText();
  const arabicUI = isArabicUI();

  applyDashboardLanguage();

  modeBtnQuestion.classList.toggle(
    "active",
    mode === "question"
  );

  modeBtnLearning.classList.toggle(
    "active",
    mode === "learning"
  );

  modeBtnQuestion.setAttribute(
    "aria-selected",
    String(mode === "question")
  );

  modeBtnLearning.setAttribute(
    "aria-selected",
    String(mode === "learning")
  );

  elProgressCard.hidden =
    mode !== "learning";

  clearChat();
  positionModePill();

  elMessages.dir =
    arabicUI ? "rtl" : "ltr";

  if (mode === "question") {
    renderChips(
      ui.questionChips
    );

    addAIMessage(
      ui.questionGreeting
    );
  } else {
    renderChips(
      ui.learningChips
    );

    void startLearningModeFromServer();
  }
}

function clearChat() {
  elMessages.innerHTML = "";
}

function renderChips(chips) {
  elChips.innerHTML = "";

  chips.forEach((text) => {
    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "prompt-chip";

    button.textContent =
      text;

    button.addEventListener(
      "click",
      () =>
        sendUserMessage(text)
    );

    elChips.appendChild(
      button
    );
  });
}

/* ============================================================
   7 · MESSAGE RENDERING
============================================================ */
function makeMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg ${role}`;

  const avatar = document.createElement("span");
  avatar.className = "msg-avatar";
  avatar.textContent = role === "ai" ? "AI" : initials(state.user.name);

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.setAttribute("dir", "auto");
  bubble.textContent = text;

  wrapper.append(avatar, bubble);
  return { wrapper, bubble };
}

function addAIMessage(text, extraBuilder) {
  const { wrapper, bubble } = makeMessage("ai", text);

  if (typeof extraBuilder === "function") {
    extraBuilder(bubble);
  }

  elMessages.appendChild(wrapper);
  scrollChat();
  return bubble;
}

function addUserMessage(text) {
  const { wrapper } = makeMessage("user", text);
  elMessages.appendChild(wrapper);
  scrollChat();
}

function addTyping() {
  const wrapper = document.createElement("div");
  wrapper.className = "msg ai";
  wrapper.innerHTML =
    '<span class="msg-avatar">AI</span><div class="msg-bubble"><span class="typing"><i></i><i></i><i></i></span></div>';

  elMessages.appendChild(wrapper);
  scrollChat();
  return wrapper;
}

function scrollChat() {
  elMessages.scrollTop = elMessages.scrollHeight;
}

function extractReply(data) {
  const output = tryParseJson(data.output);

  if (typeof output === "string" && output.trim()) {
    return output.trim();
  }

  if (output && typeof output === "object") {
    const nestedReply = firstDefined(
      output.reply,
      output.message,
      output.answer,
      output.text,
      output.content
    );
    if (nestedReply) return String(nestedReply);
  }

  const directReply = firstDefined(
    data.reply,
    data.response,
    data.answer,
    data.message,
    data.text,
    data.content
  );

  if (directReply && typeof directReply !== "object") {
    return String(directReply);
  }

  // Optional structured learning response from n8n.
  const word = firstDefined(
    data.word,
    data.levantine,
    data.levantine_word
  );

  if (word) {
    const ui = getUIText();

    const parts = [
      `${ui.wordLabel}: ${word}`,
    ];

    const meaning = firstDefined(
      data.meaning,
      data.english,
      data.translation
    );

    const pronunciation = firstDefined(
      data.pronunciation,
      data.pron
    );

    const example = firstDefined(
      data.example,
      data.example_sentence
    );

    if (meaning) {
      parts.push(
        `${ui.meaningLabel}: ${meaning}`
      );
    }

    if (pronunciation) {
      parts.push(
        `${ui.pronunciationLabel}: ${pronunciation}`
      );
    }

    if (example) {
      parts.push(
        `${ui.exampleLabel}: ${example}`
      );
    }

    return parts.join("\n");
  }

  return getUIText().noReply;
}

function renderServerReply(data) {
  const suggestedActions =
    Array.isArray(data.suggested_actions)
      ? data.suggested_actions
      : [];

  /*
    دائمًا حدّث الـchips.
    إذا القائمة فاضية، بتنمسح الأزرار القديمة.
  */
  renderChips(suggestedActions);

  const reply =
    extractReply(data);

  const options =
    parseOptions(
      firstDefined(
        data.options,
        data.choices,
        data.quiz_options,
        []
      )
    );

  const postTestCompleted =
    data.action ===
      "post_test_completed" ||
    data.post_test_finished === true;

  const preferredLanguage =
    String(
      data.preferred_language || "MSA"
    ).toLowerCase();

  addAIMessage(reply, (bubble) => {
    if (options.length) {
      const optionsWrapper =
        document.createElement("div");

      optionsWrapper.className =
        "quiz-options";

      options.forEach((option) => {
        const button =
          document.createElement("button");

        button.type =
          "button";

        button.className =
          "quiz-opt";

        button.textContent =
          option.label;

        button.setAttribute(
          "dir",
          "auto"
        );

        button.addEventListener(
          "click",
          () => {
            optionsWrapper
              .querySelectorAll(
                ".quiz-opt"
              )
              .forEach(
                (item) =>
                  (item.disabled = true)
              );

            sendUserMessage(
              option.value
            );
          }
        );

        optionsWrapper.appendChild(
          button
        );
      });

      bubble.appendChild(
        optionsWrapper
      );
    }

    /*
      بعد انتهاء الـPost-test فقط:
      نظهر زر الاستبيان.
  */
    if (postTestCompleted) {
      const surveyButton =
        document.createElement(
          "button"
        );

      surveyButton.type =
        "button";

      surveyButton.className =
        "quiz-opt";

      surveyButton.textContent =
        preferredLanguage === "english"
          ? "Take the survey"
          : "املأ الاستبيان";

      surveyButton.addEventListener(
        "click",
        () => {
          window.open(
            "https://docs.google.com/forms/d/e/1FAIpQLScWG2wX6wkCUz5MediGguxrea1z5PYJ3EJrRq_ozFnGEJ6vng/viewform",
            "_blank",
            "noopener,noreferrer"
          );
        }
      );

      bubble.appendChild(
        surveyButton
      );
    }
  });
}

/* ============================================================
   8 · QUESTION MODE AND LEARNING MODE → n8n
============================================================ */
composer.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = elInput.value.trim();
  if (!text || state.isSendingMessage) return;

  elInput.value = "";
  sendUserMessage(text);
});

async function startLearningModeFromServer() {
  const typing = addTyping();

  try {
    const data = await postToN8n({
      mode: "learning",
      action: "start",
      user_id: state.user.id,
      session_id: state.sessionId,
      email: state.user.email,
      current_level: state.placementLevel,
      placement_level: state.placementLevel,
      preferred_language:
        state.user.preferredLanguage,
      interface_language:
        state.user.preferredLanguage,
    });

    typing.remove();

syncInterfaceLanguageFromServer(data);
updateProgressFromServer(data);
renderServerReply(data);
  } catch (error) {
    typing.remove();
    console.error("Learning start error:", error);
    addAIMessage(
      `${getUIText().learningStartError}\n${error.message}`
    );
  }
}

async function sendUserMessage(text) {
  if (state.isSendingMessage) return;

  state.isSendingMessage = true;
  composerSubmitButton.disabled = true;
  elInput.disabled = true;

  addUserMessage(text);
  const typing = addTyping();

  try {
    const data = await postToN8n({
  mode: state.mode,
  action: "message",

  user_id:
    state.user.id,

  session_id:
    state.sessionId,

  email:
    state.user.email,

  message:
    text,

  current_level:
    state.placementLevel,

  placement_level:
    state.placementLevel,

  preferred_language:
    state.user.preferredLanguage,

  interface_language:
    state.user.preferredLanguage,

    });

    typing.remove();

syncInterfaceLanguageFromServer(data);
updateProgressFromServer(data);
renderServerReply(data);
  } catch (error) {
    typing.remove();
    console.error("n8n connection error:", error);
    addAIMessage(
      `${getUIText().connectionError}\n${error.message}`
    );
  } finally {
    state.isSendingMessage = false;
    composerSubmitButton.disabled = false;
    elInput.disabled = false;
    elInput.focus();
  }
}

/* ============================================================
   9 · LEARNING PROGRESS
============================================================ */
function updateProgressFromServer(data) {
  const roadmap =
    data.roadmap && typeof data.roadmap === "object" ? data.roadmap : {};

  const returnedLevel = toNumber(
    firstDefined(
      data.current_level,
      data.currentLevel,
      data.level,
      roadmap.current_level,
      roadmap.currentLevel,
      roadmap.starting_level,
      roadmap.startingLevel
    )
  );

  const returnedMicroLevel = toNumber(
    firstDefined(
      data.current_micro_level,
      data.currentMicroLevel,
      data.response?.current_micro_level,
      data.response?.currentMicroLevel,
      data.session_row?.current_micro_level,
      data.session_row?.currentMicroLevel
    )
  );

  const returnedCompleted = toNumber(
    firstDefined(
      data.words_completed,
      data.wordsCompleted,
      data.completed_words,
      roadmap.words_completed,
      roadmap.wordsCompleted
    )
  );

  const returnedTotal = toNumber(
    firstDefined(
      data.words_total,
      data.wordsTotal,
      data.total_words,
      roadmap.words_total,
      roadmap.wordsTotal
    )
  );

  const returnedRemaining = toNumber(
    firstDefined(
      data.words_remaining,
      data.wordsRemaining,
      data.remaining_words,
      roadmap.words_remaining,
      roadmap.wordsRemaining
    )
  );

  if (returnedLevel !== null) {
    state.placementLevel = Math.max(1, returnedLevel);
  }

  if (returnedMicroLevel !== null) {
    state.currentMicroLevel =
      Math.max(1, returnedMicroLevel);
  }

  if (returnedCompleted !== null) {
    state.wordsCompleted = Math.max(0, returnedCompleted);
  }

  if (returnedTotal !== null) {
    state.wordsTotal = Math.max(state.wordsCompleted, returnedTotal);
  } else if (returnedRemaining !== null) {
    state.wordsTotal = state.wordsCompleted + Math.max(0, returnedRemaining);
  }

  updateProgressUI();

savePersistentLogin();
}

function getLevelDisplayName(level) {
  const numericLevel =
    Math.max(1, Number(level) || 1);

  const names = isArabicUI()
    ? {
        1: "مبتدئ",
        2: "متوسط",
        3: "متقدم",
        4: "خبير",
      }
    : {
        1: "Beginner",
        2: "Intermediate",
        3: "Advanced",
        4: "Expert",
      };

  return names[numericLevel] ??
    (isArabicUI()
      ? `المستوى ${numericLevel}`
      : `Level ${numericLevel}`);
}

function updateProgressUI() {
  const total = Math.max(0, state.wordsTotal);
  const completed =
    total > 0 ? Math.min(Math.max(0, state.wordsCompleted), total) : 0;
  const remaining = total > 0 ? Math.max(0, total - completed) : 0;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  const ui = getUIText();

  document.getElementById(
    "stat-level"
  ).textContent =
    getLevelDisplayName(
      state.placementLevel
    );

  const microLevelElement =
    document.getElementById(
      "stat-micro-level"
    );

  if (microLevelElement) {
    microLevelElement.textContent =
      isArabicUI()
        ? `المرحلة ${state.currentMicroLevel}`
        : `Stage ${state.currentMicroLevel}`;
  }

  document.getElementById("stat-words").textContent = `${completed} / ${total}`;
  document.getElementById("stat-remaining").textContent = String(remaining);
  document.getElementById("stat-progress").textContent = `${percentage}%`;
  document.getElementById(
    "progress-card-fill"
  ).style.width = `${percentage}%`;
}

/* ============================================================
   10 · PROFILE DROPDOWN
============================================================ */
function refreshProfileUI() {
  document.getElementById("profile-name").textContent = state.user.name;
  document.getElementById("profile-email").textContent = state.user.email;
  document.getElementById("profile-avatar").textContent = initials(
    state.user.name
  );
}

profileBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  const isOpen = !profileDropdown.hidden;

  if (isOpen) {
    closeProfileDropdown();
    return;
  }

  editName.value = state.user.name;
  editEmail.value = state.user.email;
  editPassword.value = "";
  saveConfirm.hidden = true;
  profileDropdown.hidden = false;
  profileBtn.setAttribute("aria-expanded", "true");
});

function closeProfileDropdown() {
  profileDropdown.hidden = true;
  profileBtn.setAttribute("aria-expanded", "false");
}

document.addEventListener("click", (event) => {
  if (
    !profileDropdown.hidden &&
    !profileDropdown.contains(event.target) &&
    !profileBtn.contains(event.target)
  ) {
    closeProfileDropdown();
  }
});

profileDropdown.addEventListener("click", (event) => event.stopPropagation());

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeProfileDropdown();
});

document.getElementById("save-profile").addEventListener("click", () => {
  const name = editName.value.trim();
  const email = editEmail.value.trim();

  if (email && !isValidEmail(email)) {
    editEmail.focus();
    window.alert("Please enter a valid email address.");
    return;
  }

  if (name) state.user.name = name;
  if (email) {
    state.user.email = email;
    state.user.id = `user-${email.toLowerCase()}`;
  }

  refreshProfileUI();

savePersistentLogin();
addLogoutButton();

saveConfirm.hidden = false;
  setTimeout(closeProfileDropdown, 900);
});
/* ============================================================
   RESTORE LOGIN ON PAGE LOAD
============================================================ */

restorePersistentLogin();
