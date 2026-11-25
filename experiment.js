// =====================================================================
// experiment.js — 자기참조 부호화가 정확한 재인과 유사 단어 오재인에 미치는 영향
// 도구: jsPsych 8 (화면 제시·반응 기록) + DataPipe (자료를 OSF 비공개 프로젝트에 저장)
// ---------------------------------------------------------------------
// 흐름
//  1. 설명문·동의 → 2. 만 19세 확인 → 3. 1차 과제 안내
//  4. 1차 단어 제시 20개 = 완충 2 + 본 단어 16 + 완충 2 (+ 0.5초 / 단어 3초 / 쉬는 시간 0.5초)
//  5. 간격 과제(일상 설문 3문항) → 6. 2차 과제 안내
//  7. 2차 재인 검사 30개 = 본 단어 16 + 유사 미끼 8 + 새 단어 6 (+ 0.5초 / 단어 3초 / 쉬는 시간 0.5초)
//  ※ 단어 화면에는 남은 시간을 보여 주는 막대와 숫자(3→2→1)가 두 조건에 똑같이 나옴
//  8. 사후 질문 → 9. 디브리핑 → 10. 자료 사용 재동의 → 11. 저장(동의한 경우만)
// =====================================================================

// ------------------------------ 설정 ---------------------------------
const CONFIG = {
  // DataPipe에서 실험을 만들면 나오는 실험 ID(영문·숫자 12자 정도)를 넣으세요.
  // 이 값을 바꾸기 전에는 자동으로 '테스트 모드'(자료를 보내지 않음)로 작동합니다.
  DATAPIPE_ID: "여기에_DataPipe_실험_ID",

  // 설명문에 들어갈 연구자 연락처 (식별 정보가 아니라 연구자 본인 연락처)
  CONTACT: "lss1109@snu.ac.kr",

  // 참여 확인 코드의 확인용 글자를 만드는 비밀 숫자. verify_code.py의 값과 같아야 함.
  // (아무 숫자로 바꿔도 되지만, 바꾸면 두 파일 모두 바꾸세요.)
  CODE_SALT: 7319,

  // 제시 시간(밀리초) — 두 조건에 똑같이 적용됩니다.
  FIX_MS: 500,     // + 표시
  WORD_MS: 3000,   // 단어 + 질문 + 응답 버튼 (남은 시간 표시 포함)
  ISI_MS: 500,     // 단어 사이 쉬는 시간(빈 화면)

  LURES_PER_VALENCE: 2,    // 목록(조건)마다 미끼를 긍정 2 + 부정 2개 선택 → 조건당 4개, 총 8개
  MAX_SAME_CONDITION_RUN: 3, // 1차 제시에서 같은 질문이 연속으로 나오는 최대 횟수
};

// 두 가지 부호화 질문 (조건명 → 화면 문구)
const QUESTIONS = {
  self: "이 단어가 나를 잘 묘사하나요?",      // 자기참조 조건
  semantic: "이 단어는 긍정적인 의미인가요?", // 의미 판단(대조) 조건
};
const TEST_QUESTION = "앞에서 이 단어가 소개되었나요?";

// ------------------------- 테스트 모드 판단 --------------------------
// 주소 끝에 ?test=1 을 붙이거나 DATAPIPE_ID를 아직 넣지 않았으면 테스트 모드.
// 테스트 모드에서는 자료를 서버로 보내지 않고, 마지막 화면에서 CSV를 내려받을 수 있습니다.
// 테스트 모드에서만 ?version=1 또는 ?version=2 로 버전을 고정해 볼 수 있습니다.
const urlParams = new URLSearchParams(window.location.search);
const TEST_MODE =
  urlParams.get("test") === "1" || CONFIG.DATAPIPE_ID.startsWith("여기에");

// --------------------------- jsPsych 시작 ----------------------------
const jsPsych = initJsPsych({
  // 기본 설정으로 충분함. (자료 저장은 맨 끝의 save_trial에서 직접 처리)
});

// 참여자 코드: 이름·학번이 아닌 무작위 10자 코드 (파일 이름으로만 사용)
const participantId = jsPsych.randomization.randomID(10);

// --------------------- 뒤로 가기 막기 / 이탈 경고 ---------------------
// 실험은 한 페이지 안에서 진행되므로, 브라우저 '뒤로 가기'를 누르면
// 같은 주소를 다시 넣어 이동하지 않게 합니다.
history.pushState(null, "", window.location.href);
window.addEventListener("popstate", () => {
  history.pushState(null, "", window.location.href);
});
// 실험 도중 창을 닫거나 새로고침하려 하면 경고(일부 모바일 브라우저는 무시함)
function warnBeforeLeave(e) {
  e.preventDefault();
  e.returnValue = "";
}

// 같은 기기에서 이전에 1차 과제를 시작한 적이 있는지(새로고침·재참여 확인용).
// 개인 식별 정보가 아니라 '이 브라우저에서 시작한 적 있음' 표시만 남깁니다.
let priorAttempt = false;
try {
  priorAttempt = window.localStorage.getItem("sre_started") === "1";
} catch (e) {
  priorAttempt = false;
}

// ------------------------- 보조 함수들 -------------------------------
// 배열에서 같은 key 값이 연속으로 몇 번까지 나오는지 계산
function maxRun(arr, key) {
  let best = 0, run = 0;
  for (let i = 0; i < arr.length; i++) {
    run = i > 0 && arr[i][key] === arr[i - 1][key] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

// 조건(list, condition)에 따라 무작위로 n개 뽑기
function sampleN(arr, n) {
  return jsPsych.randomization.shuffle(arr).slice(0, n);
}

// ------------------------- 1차 제시 목록 만들기 ------------------------
// version 1: 목록 A = 자기참조, 목록 B = 의미 판단
// version 2: 목록 A = 의미 판단, 목록 B = 자기참조
function buildEncodingList(version) {
  const selfList = version === 1 ? "A" : "B";

  // 본 단어 16개
  const targets = [
    ...STIMULI.listA.map((s) => ({ ...s, list: "A" })),
    ...STIMULI.listB.map((s) => ({ ...s, list: "B" })),
  ].map((s) => ({
    word: s.word,
    valence: s.valence,
    list: s.list,
    word_type: "target",
    condition: s.list === selfList ? "self" : "semantic",
  }));

  // 같은 질문이 너무 길게 이어지지 않도록 조건을 만족할 때까지 다시 섞기.
  // 전체 20개 중 자기참조 10개, 의미 판단 10개가 되도록 완충 단어 4개는 2:2로 배정.
  let sequence;
  for (let attempt = 0; attempt < 10000; attempt++) {
    const middle = jsPsych.randomization.shuffle(targets);
    const bufConds = jsPsych.randomization.shuffle(["self", "self", "semantic", "semantic"]);
    const buffers = STIMULI.buffers.map((b, i) => ({
      word: b.word,
      valence: b.valence,
      list: "buffer",
      word_type: "buffer",
      condition: bufConds[i],
    }));
    sequence = [buffers[0], buffers[1], ...middle, buffers[2], buffers[3]];
    if (maxRun(sequence, "condition") <= CONFIG.MAX_SAME_CONDITION_RUN) break;
  }
  // 제시 순서(1~20) 기록
  return sequence.map((item, i) => ({ ...item, serial_position: i + 1 }));
}

// ------------------------- 2차 검사 목록 만들기 ------------------------
function buildTestList(encodingList) {
  // (1) 본 단어 16개: 1차 제시에서 가운데 16개(완충 단어 제외) 그대로, 조건도 그대로
  const targets = encodingList
    .filter((it) => it.word_type === "target")
    .map((it) => ({
      word: it.word,
      valence: it.valence,
      list: it.list,
      word_type: "target",
      condition: it.condition,
      paired_target: "",
    }));

  // (2) 유사 미끼 8개: 목록마다 긍정 2 + 부정 2개의 본 단어를 무작위로 골라
  //     그 짝 미끼를 제시. 미끼의 조건 = 짝 단어의 조건.
  const lures = [];
  for (const listName of ["A", "B"]) {
    const src = listName === "A" ? STIMULI.listA : STIMULI.listB;
    const cond = targets.find((t) => t.list === listName).condition;
    for (const val of ["pos", "neg"]) {
      const chosen = sampleN(src.filter((s) => s.valence === val), CONFIG.LURES_PER_VALENCE);
      for (const s of chosen) {
        lures.push({
          word: s.lure,
          valence: s.valence,
          list: listName,
          word_type: "lure",
          condition: cond,
          paired_target: s.word,
        });
      }
    }
  }

  // (3) 새 단어 6개: 조건 없음(기준선)
  const news = STIMULI.newWords.map((s) => ({
    word: s.word,
    valence: s.valence,
    list: "new",
    word_type: "new",
    condition: "none",
    paired_target: "",
  }));

  // 섞기: 미끼가 짝 단어 바로 앞뒤에 오지 않게, 같은 단어 유형이 4개 넘게 이어지지 않게
  const all = [...targets, ...lures, ...news];
  let order;
  for (let attempt = 0; attempt < 10000; attempt++) {
    order = jsPsych.randomization.shuffle(all);
    let adjacentPair = false;
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1], b = order[i];
      if ((a.word_type === "lure" && a.paired_target === b.word) ||
          (b.word_type === "lure" && b.paired_target === a.word)) {
        adjacentPair = true;
        break;
      }
    }
    if (!adjacentPair && maxRun(order, "word_type") <= 4) break;
  }
  return order.map((item, i) => ({ ...item, test_position: i + 1 }));
}

// --------------------------- 화면 조각 -------------------------------
// + 표시 (0.5초)
function fixationTrial() {
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: '<div class="fixation">+</div>',
    choices: "NO_KEYS",
    trial_duration: CONFIG.FIX_MS,
    data: { task: "fixation" },
  };
}
// 쉬는 시간 빈 화면 (0.5초)
function blankTrial() {
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: '<div class="blank"></div>',
    choices: "NO_KEYS",
    trial_duration: CONFIG.ISI_MS,
    data: { task: "blank" },
  };
}

// 누른 버튼을 색으로 표시 (응답이 기록되었음을 알 수 있게).
// 플러그인이 응답 후 모든 버튼을 비활성화하므로 두 번 누를 수 없음.
function highlightChosenButton() {
  document
    .querySelectorAll("#jspsych-html-button-response-btngroup button")
    .forEach((btn) => btn.addEventListener("click", () => btn.classList.add("chosen")));
}

// 남은 시간 표시: 줄어드는 막대 + 숫자(3→2→1).
// 숫자는 jsPsych 타이머로 바꾸므로 화면이 끝나면 자동으로 정리됨.
const TIMER_HTML =
  '<div class="timer"><div class="timer-track"><div class="timer-bar"></div></div>' +
  '<div class="timer-num"></div></div>';

function startCountdown() {
  const total = Math.round(CONFIG.WORD_MS / 1000);
  const num = document.querySelector(".timer-num");
  const bar = document.querySelector(".timer-bar");
  bar.style.animationDuration = CONFIG.WORD_MS + "ms"; // 막대가 WORD_MS 동안 줄어듦
  num.textContent = total;
  for (let s = 1; s < total; s++) {
    jsPsych.pluginAPI.setTimeout(() => { num.textContent = total - s; }, s * 1000);
  }
}

// 단어 + 질문 + 예/아니오 버튼 (3초 고정).
// 응답해도 3초가 다 지날 때까지 화면이 유지되어 모든 단어의 제시 시간이 같음.
function wordTrial(item, question, task) {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus:
      TIMER_HTML +
      `<div class="question">${question}</div>` +
      `<div class="word">${item.word}</div>`,
    choices: ["예", "아니오"],
    button_html: (choice) => `<button class="resp-btn">${choice}</button>`,
    trial_duration: CONFIG.WORD_MS,
    response_ends_trial: false,
    data: { ...item, task: task, question: question },
    on_load: () => { highlightChosenButton(); startCountdown(); },
    on_finish: (data) => {
      // response: 0 = 예, 1 = 아니오, null = 3초 안에 응답 없음
      data.response_label =
        data.response === 0 ? "예" : data.response === 1 ? "아니오" : "무응답";
      data.timed_out = data.response === null;
      // rt: 단어가 나타난 순간부터 버튼을 누를 때까지의 시간(ms)
      if (task === "test") {
        data.test_outcome = judgeTest(data.word_type, data.response);
        data.retention_ms = retentionMs;
        // 1차 제시 때 이 단어(미끼라면 짝 단어)에 한 응답
        const key = data.word_type === "lure" ? data.paired_target : data.word;
        data.enc_response = encodingResponses[key] || "";
      } else if (task === "encoding") {
        encodingResponses[data.word] = data.response_label;
        if (data.serial_position === 1) {
          // 1차 과제를 시작했다는 표시 (새로고침 후 재참여 확인용)
          try { window.localStorage.setItem("sre_started", "1"); } catch (e) {}
        }
      }
    },
  };
}

// 2차 검사 응답 판정
//  본 단어 + 예   → hit(적중)          본 단어 + 아니오 → miss(누락)
//  미끼   + 예   → lure_fa(유사 오재인) 미끼   + 아니오 → lure_cr(정기각)
//  새단어 + 예   → new_fa(새 단어 오재인) 새단어 + 아니오 → new_cr(정기각)
//  응답 없음      → no_response
function judgeTest(wordType, response) {
  if (response === null || response === undefined) return "no_response";
  const yes = response === 0;
  if (wordType === "target") return yes ? "hit" : "miss";
  if (wordType === "lure") return yes ? "lure_fa" : "lure_cr";
  if (wordType === "new") return yes ? "new_fa" : "new_cr";
  return "";
}

// 1차 응답 저장용, 보존 기간(1차 끝 → 2차 첫 단어) 계산용 변수
const encodingResponses = {};
let encodingEndTime = null;
let retentionMs = null;

// --------------------------- 문구(텍스트) ----------------------------
const CONSENT_HTML = `
<div class="text-page">
  <h2>연구 참여 설명문</h2>
  <p><b>연구 제목:</b> 단어 판단과 일상 습관에 관한 실험</p>
  <p>이 실험은 서울대학교 '실험심리입문 및 실험' 수업의 기말 개인 과제를 위해 진행됩니다.
     <b>수업 과제이므로 생명윤리위원회(IRB) 심의를 받지 않았습니다.</b></p>
  <h3>절차와 소요 시간</h3>
  <p>화면에 나타나는 성격 형용사에 대해 '예/아니오'로 답하는 단어 과제 두 가지와,
     수면·스마트폰 사용 같은 일상 습관에 관한 짧은 설문으로 이루어져 있습니다.
     <b>약 7분</b>이 걸립니다. 휴대폰 화면의 버튼을 눌러 응답하며,
     조용한 곳에서 알림을 끄고 참여해 주세요.</p>
  <h3>자발적 참여와 중단할 권리</h3>
  <p>참여는 전적으로 자유 의사에 따릅니다. 참여하지 않거나 중간에 그만두어도
     어떠한 불이익도 없습니다. 언제든 브라우저 창을 닫으면 참여가 중단되며,
     이 경우 그때까지의 응답은 <b>저장되지 않습니다</b>.</p>
  <h3>위험과 이익</h3>
  <p>일상생활 수준을 넘는 위험은 없습니다.</p>
  <p>실험을 마치면 화면에 <b>참여 확인 코드</b>가 나옵니다. 실험 참여 이후 이 코드를
     연구자 이메일(${CONFIG.CONTACT})로 남겨 주시면, <b>추첨을 통해 5분께 5천 원 상당의 사례</b>를
     드리겠습니다. 참여 확인 코드는 응답 자료와 함께 저장되지 않으므로, 이메일을 보내셔도
     응답 내용과 연결되지 않습니다. 보내 주신 이메일 주소는 추첨과 사례 지급에만 쓰고,
     지급이 끝나면 삭제합니다.</p>
  <h3>자료 관리</h3>
  <p>이름, 학번, 연락처 등 개인을 알아볼 수 있는 정보는 수집하지 않습니다.
     응답은 무작위 코드로만 구분되며, <b>수업 과제 목적으로만</b> 사용됩니다.
     자료는 연구자만 접근할 수 있는 비공개 저장소에 보관되고 온라인에 공개하지 않으며,
     <b>성적 확정 후 삭제</b>합니다.</p>
  <h3>연락처</h3>
  <p>궁금한 점은 연구자에게 연락해 주세요: ${CONFIG.CONTACT}</p>
  <p class="emph">위 내용을 읽고 이해했으며, 실험 참여에 동의하십니까?</p>
</div>`;

const AGE_HTML = `
<div class="text-page">
  <p class="emph">참여자는 성인으로 한정됩니다.</p>
  <p class="emph">현재 만 19세 이상이십니까?</p>
</div>`;

const ENCODING_INSTR_HTML = `
<div class="text-page">
  <h2>첫 번째 단어 과제</h2>
  <p>화면 가운데에 <b>+</b> 표시가 잠깐 나온 뒤, 성격을 나타내는 단어가 하나씩 나타납니다.</p>
  <p>단어 위에는 아래 두 질문 중 하나가 나옵니다. 단어마다 질문이 바뀌니,
     <b>질문을 잘 읽고</b> 예/아니오 버튼을 눌러 주세요.</p>
  <ul>
    <li>${QUESTIONS.self}</li>
    <li>${QUESTIONS.semantic}</li>
  </ul>
  <p><b>응답은 단어가 나타난 뒤 3초 안에</b> 해 주세요. 3초가 지나면 자동으로 넘어갑니다.
     화면 위쪽의 막대와 숫자가 남은 시간을 보여 줍니다.
     버튼을 누른 뒤에도 3초가 끝날 때까지 단어가 화면에 남아 있으며,
     단어 사이에는 짧은 쉬는 시간이 있습니다.</p>
  <p>정답은 없으니 떠오르는 대로 빠르게 답해 주세요.
     과제가 시작되면 앞 화면으로 돌아갈 수 없습니다.</p>
</div>`;

const INTERVAL_INSTR_HTML = `
<div class="text-page">
  <h2>생활 습관 설문</h2>
  <p>다음은 평소 생활 습관에 관한 짧은 설문입니다. 해당하는 답을 골라 주세요.</p>
</div>`;

const TEST_INSTR_HTML = `
<div class="text-page">
  <h2>두 번째 단어 과제</h2>
  <p>이번에도 단어가 하나씩 나타납니다. 각 단어가
     <b>첫 번째 단어 과제에서 나왔던 단어인지</b> 판단해 주세요.</p>
  <p>나왔던 단어라면 <b>예</b>, 나오지 않았던 단어라면 <b>아니오</b>를 누릅니다.</p>
  <p>이번에도 <b>응답은 3초 안에</b> 해 주세요. 막대와 숫자가 남은 시간을 보여 주고,
     3초가 지나면 자동으로 넘어가며, 단어 사이에는 짧은 쉬는 시간이 있습니다.</p>
</div>`;

const DEBRIEF_HTML = `
<div class="text-page">
  <h2>실험의 실제 목적 안내</h2>
  <p>참여해 주셔서 감사합니다. 이 실험은 단어를 <b>'나'와 관련지어 판단할 때</b>
     (예: "이 단어가 나를 잘 묘사하나요?") 단어의 의미만 판단할 때보다
     <b>더 잘 기억되는지</b>, 그리고 그와 함께 <b>뜻이 비슷한 다른 단어를 본 것으로
     잘못 기억하는 일</b>도 더 많아지는지를 알아보는 실험이었습니다.</p>
  <p>두 번째 과제에는 첫 번째 과제의 단어 외에, 그 단어들과 <b>뜻이 비슷한 단어</b>와
     <b>완전히 새로운 단어</b>가 섞여 있었습니다.</p>
  <h3>기억 검사를 미리 알리지 않은 이유</h3>
  <p>기억 검사가 있다는 것을 미리 알면 단어를 외우려고 따로 애쓰게 됩니다.
     그러면 두 질문 방식의 차이가 아니라 각자의 암기 전략 차이가 결과에 섞이기 때문에,
     처음에는 '단어 판단 과제'라고만 안내했습니다. 미리 말씀드리지 못한 점 양해 부탁드립니다.</p>
  <p>첫 번째 과제에서 '나를 묘사하는지'에 대해 하신 응답은 기억 성적을 계산하는 데에만
     쓰이며, 개인의 성격을 평가하거나 해석하는 데 쓰이지 않습니다.</p>
  <h3>부탁드립니다</h3>
  <p>다른 분들도 이 실험에 참여할 예정입니다. 결과가 왜곡되지 않도록
     <b>과제 마감(2026년 12월) 전까지 실험 내용과 목적을 다른 사람에게 말하지 말아 주세요.</b></p>
  <p>문의: ${CONFIG.CONTACT}</p>
</div>`;

const REUSE_CONSENT_HTML = `
<div class="text-page">
  <h2>자료 사용 동의 확인</h2>
  <p>실험의 실제 목적을 들으신 뒤, 오늘 응답하신 자료를 수업 과제 분석에 사용하는 데
     동의하십니까?</p>
  <p>동의하지 않으시면 오늘의 응답은 <b>저장되지 않고 바로 폐기</b>되며,
     어떠한 불이익도 없습니다.</p>
</div>`;

// 텍스트 페이지 + 버튼 화면을 만드는 함수 (시간 제한 없음)
function textPage(html, choices, data) {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: html,
    choices: choices,
    button_html: (choice) => `<button class="page-btn">${choice}</button>`,
    data: data || { task: "instruction" },
  };
}

// ------------------------------ 저장 ---------------------------------
// 저장할 행: 동의/연령/1차/간격 설문/2차/사후 설문/재동의 (+표시·빈 화면·안내는 제외)
const SAVE_TASKS = ["consent", "age", "encoding", "interval_survey", "test",
                    "post_survey", "reuse_consent"];

function getCsv() {
  return jsPsych.data
    .get()
    .filterCustom((t) => SAVE_TASKS.includes(t.task))
    .ignore(["stimulus", "internal_node_id", "trial_type", "plugin_version"])
    .csv();
}

// DataPipe로 CSV 전송 (201 = 저장됨, 202 = 대기열에 들어감 → 둘 다 성공으로 처리)
async function sendToDataPipe(csv) {
  const filename = `${participantId}.csv`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch("https://pipe.jspsych.org/api/data/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "*/*" },
        body: JSON.stringify({
          experimentID: CONFIG.DATAPIPE_ID,
          filename: filename,
          data: csv,
        }),
      });
      if (res.status === 201 || res.status === 202) return { ok: true, attempt };
      const text = await res.text();
      if (attempt === 3) return { ok: false, error: `HTTP ${res.status} ${text}` };
    } catch (err) {
      if (attempt === 3) return { ok: false, error: String(err) };
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt)); // 잠시 후 재시도
  }
}

// DataPipe의 '조건 배정' 기능으로 버전(1/2)을 번갈아 배정 → 두 버전 인원이 비슷해짐.
// 실패하면 무작위 배정으로 대신하고 그 사실을 자료에 남김.
async function getVersion() {
  if (TEST_MODE) {
    const v = parseInt(urlParams.get("version"), 10);
    if (v === 1 || v === 2) return { version: v, source: "url_test" };
    return { version: Math.random() < 0.5 ? 1 : 2, source: "random_test" };
  }
  try {
    const res = await fetch("https://pipe.jspsych.org/api/condition/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "*/*" },
      body: JSON.stringify({ experimentID: CONFIG.DATAPIPE_ID }),
    });
    const json = await res.json();
    if (typeof json.condition === "number") {
      return { version: json.condition + 1, source: "datapipe" }; // 0→버전1, 1→버전2
    }
    throw new Error(JSON.stringify(json));
  } catch (err) {
    return { version: Math.random() < 0.5 ? 1 : 2, source: "random_fallback" };
  }
}

// ------------------------- 참여 확인 코드 ------------------------------
// 형식: ABCD-EF (앞 4글자는 무작위, 뒤 2글자는 앞 4글자와 CODE_SALT로 계산한 확인용 글자)
// 헷갈리기 쉬운 글자(I, L, O, 0, 1)는 뺌. verify_code.py로 진짜 코드인지 확인할 수 있음.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31글자

function codeCheck(body) {
  let s = CONFIG.CODE_SALT % 961;
  for (let i = 0; i < body.length; i++) {
    s = (s * 31 + CODE_CHARS.indexOf(body[i]) * (i + 7)) % 961; // 961 = 31 × 31
  }
  return CODE_CHARS[Math.floor(s / 31)] + CODE_CHARS[s % 31];
}

function makeCompletionCode() {
  const r = new Uint32Array(4);
  window.crypto.getRandomValues(r);
  const body = Array.from(r, (x) => CODE_CHARS[x % CODE_CHARS.length]).join("");
  return body + "-" + codeCheck(body);
}

// --------------------------- 실험 조립 -------------------------------
async function main() {
  if (TEST_MODE) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<div id="test-banner">테스트 모드 — 자료가 서버로 전송되지 않습니다</div>'
    );
  }

  const { version, source } = await getVersion();
  const encodingList = buildEncodingList(version);
  const testList = buildTestList(encodingList);

  // 모든 행에 공통으로 붙는 참여자 수준 정보
  jsPsych.data.addProperties({
    participant_id: participantId,
    version: version,               // 1: A=자기참조, 2: B=자기참조
    version_source: source,         // datapipe / random_fallback / *_test
    test_mode: TEST_MODE,
    prior_attempt_on_device: priorAttempt,
    screen_w: window.screen.width,
    screen_h: window.screen.height,
  });

  const timeline = [];

  // 1. 설명문·동의
  timeline.push({
    ...textPage(CONSENT_HTML, ["동의합니다", "동의하지 않습니다"], { task: "consent" }),
    on_finish: (data) => {
      data.response_label = data.response === 0 ? "동의" : "비동의";
      if (data.response !== 0) {
        jsPsych.abortExperiment(
          '<div class="text-page"><p class="emph">참여하지 않기로 하셨습니다.</p>' +
          "<p>아무 자료도 저장되지 않았습니다. 창을 닫으셔도 됩니다. 감사합니다.</p></div>"
        );
      }
    },
  });

  // 2. 만 19세 확인
  timeline.push({
    ...textPage(AGE_HTML, ["예, 만 19세 이상입니다", "아니요"], { task: "age" }),
    on_finish: (data) => {
      data.response_label = data.response === 0 ? "19세 이상" : "19세 미만";
      if (data.response !== 0) {
        jsPsych.abortExperiment(
          '<div class="text-page"><p class="emph">이 실험은 만 19세 이상만 참여할 수 있습니다.</p>' +
          "<p>아무 자료도 저장되지 않았습니다. 관심 가져 주셔서 감사합니다.</p></div>"
        );
      } else {
        window.addEventListener("beforeunload", warnBeforeLeave);
      }
    },
  });

  // 3. 1차 과제 안내
  timeline.push(textPage(ENCODING_INSTR_HTML, ["시작하기"]));

  // 4. 1차 단어 제시 20개
  for (const item of encodingList) {
    timeline.push(fixationTrial());
    timeline.push(wordTrial(item, QUESTIONS[item.condition], "encoding"));
    timeline.push(blankTrial());
  }
  timeline.push({
    type: jsPsychCallFunction,
    func: () => { encodingEndTime = performance.now(); },
    data: { task: "marker" },
  });

  // 5. 간격 과제: 실험과 무관한 일상 설문 3문항
  timeline.push(textPage(INTERVAL_INSTR_HTML, ["다음"]));
  timeline.push({
    type: jsPsychSurveyMultiChoice,
    preamble: "<p>해당하는 답을 하나씩 골라 주세요.</p>",
    questions: [
      { name: "sleep_hours", prompt: "평소 하루 수면 시간은 어느 정도인가요?",
        options: ["5시간 미만", "5~6시간", "6~7시간", "7~8시간", "8시간 이상"], required: true },
      { name: "phone_hours", prompt: "하루 스마트폰 사용 시간은 어느 정도인가요?",
        options: ["2시간 미만", "2~4시간", "4~6시간", "6~8시간", "8시간 이상"], required: true },
      { name: "exercise", prompt: "일주일에 운동(30분 이상)을 몇 번 하나요?",
        options: ["안 함", "1~2번", "3~4번", "5번 이상"], required: true },
    ],
    button_label: "다음",
    data: { task: "interval_survey" },
    on_finish: (data) => {
      // 응답을 열(column)로 풀어서 저장
      for (const [k, v] of Object.entries(data.response)) data["q_" + k] = v;
      data.response = "";
    },
  });
  // 6. 2차 과제 안내
  timeline.push(textPage(TEST_INSTR_HTML, ["시작하기"]));

  // 7. 2차 재인 검사 30개
  testList.forEach((item, i) => {
    timeline.push(fixationTrial());
    const t = wordTrial(item, TEST_QUESTION, "test");
    if (i === 0) {
      // 1차 마지막 단어가 끝난 뒤 ~ 2차 첫 단어가 나타날 때까지의 시간(ms)
      t.on_start = () => { retentionMs = Math.round(performance.now() - encodingEndTime); };
    }
    timeline.push(t);
    timeline.push(blankTrial());
  });

  // 8. 사후 질문
  timeline.push({
    type: jsPsychSurveyMultiChoice,
    preamble: "<p>마지막으로 몇 가지만 여쭙겠습니다.</p>",
    questions: [
      { name: "device", prompt: "어떤 기기로 참여하셨나요?",
        options: ["스마트폰", "태블릿", "컴퓨터(PC·노트북)"], required: true },
      { name: "expected_memory_test",
        prompt: "첫 번째 단어 과제를 하는 동안, 나중에 단어 기억 검사가 있을 거라고 예상하셨나요?",
        options: ["예", "아니오"], required: true },
      { name: "heard_hypothesis",
        prompt: "참여 전에 이 실험의 목적이나 가설을 다른 사람에게 들은 적이 있나요?",
        options: ["예", "아니오"], required: true },
    ],
    button_label: "다음",
    data: { task: "post_survey" },
    on_finish: (data) => {
      for (const [k, v] of Object.entries(data.response)) data["q_" + k] = v;
      data.response = "";
    },
  });

  // 9. 디브리핑
  timeline.push(textPage(DEBRIEF_HTML, ["다음"]));

  // 10. 자료 사용 재동의
  let reuseConsent = false;
  timeline.push({
    ...textPage(REUSE_CONSENT_HTML,
      ["동의합니다 (자료 사용)", "동의하지 않습니다 (자료 폐기)"],
      { task: "reuse_consent" }),
    on_finish: (data) => {
      reuseConsent = data.response === 0;
      data.response_label = reuseConsent ? "동의" : "비동의";
      window.removeEventListener("beforeunload", warnBeforeLeave);
    },
  });

  // 11. 저장 (재동의한 경우에만 전송)
  let saveResult = null;
  timeline.push({
    type: jsPsychCallFunction,
    async: true,
    data: { task: "save" },
    func: async (done) => {
      if (!reuseConsent || TEST_MODE) { done(); return; }
      jsPsych.getDisplayElement().innerHTML =
        '<div class="text-page"><p class="emph">응답을 저장하고 있습니다…</p>' +
        "<p>창을 닫지 말고 잠시만 기다려 주세요.</p></div>";
      saveResult = await sendToDataPipe(getCsv());
      done();
    },
  });

  // 12. 마지막 화면 (+ 참여 확인 코드)
  // 끝까지 참여한 사람은 자료 사용 동의 여부와 상관없이 코드를 받음(사례 추첨에 불이익 없음).
  // 코드는 이 화면에만 보이고 응답 자료(CSV)에는 저장하지 않음 → 이메일과 응답이 연결되지 않음.
  timeline.push({
    type: jsPsychHtmlButtonResponse,
    choices: [],
    stimulus: () => {
      const code = makeCompletionCode();
      let status;
      if (!reuseConsent) {
        status = '<p class="emph">자료 사용에 동의하지 않으셔서 오늘의 응답은 저장되지 않았습니다.</p>' +
          "<p>자료를 폐기해도 사례 추첨에는 그대로 참여하실 수 있습니다.</p>";
      } else if (TEST_MODE) {
        status = '<p class="emph">테스트 모드: 자료를 전송하지 않았습니다.</p>' +
          '<p><button class="page-btn" id="dl-btn">CSV 내려받기</button></p>';
      } else if (saveResult && saveResult.ok) {
        status = '<p class="emph">응답이 저장되었습니다. 참여해 주셔서 감사합니다.</p>';
      } else {
        status = '<p class="emph">죄송합니다. 응답 저장에 실패했습니다.</p>' +
          "<p>인터넷 연결 문제일 수 있습니다. 번거로우시겠지만 코드를 보내실 때 " +
          "'저장 실패'라고 함께 적어 주시면 감사하겠습니다.</p>";
      }
      const mailto = `mailto:${CONFIG.CONTACT}?subject=${encodeURIComponent("실험 참여 확인 코드")}` +
        `&body=${encodeURIComponent("참여 확인 코드: " + code)}`;
      return '<div class="text-page">' + status +
        '<div class="code-box"><div class="code-label">참여 확인 코드</div>' +
        `<div class="code" id="completion-code">${code}</div>` +
        '<button class="page-btn" id="copy-btn">코드 복사</button>' +
        `<a class="page-btn mail-btn" href="${mailto}">이메일로 보내기</a></div>` +
        `<p>위 코드를 <b>${CONFIG.CONTACT}</b>로 보내 주시면 사례 추첨(5분, 5천 원 상당)에 참여됩니다. ` +
        "코드는 응답 자료와 연결되지 않습니다. 화면을 캡처해 두셔도 됩니다.</p>" +
        "<p>이제 창을 닫으셔도 됩니다.</p></div>";
    },
    on_load: () => {
      const copyBtn = document.getElementById("copy-btn");
      copyBtn.addEventListener("click", () => {
        const code = document.getElementById("completion-code").textContent;
        try {
          navigator.clipboard.writeText(code).then(() => { copyBtn.textContent = "복사됨"; });
        } catch (e) {
          copyBtn.textContent = "길게 눌러 직접 복사해 주세요";
        }
      });
      const btn = document.getElementById("dl-btn");
      if (btn) {
        btn.addEventListener("click", () => {
          const blob = new Blob(["﻿" + getCsv()], { type: "text/csv;charset=utf-8" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `TEST_${participantId}.csv`;
          a.click();
        });
      }
    },
    data: { task: "end" },
  });

  jsPsych.run(timeline);
}

main();
