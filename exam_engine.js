// app.js - Enhanced Exam Runtime, Telemetry, Gamification & Lifeline Engine

let currentQuestionIdx = 0;
let studentName = "";
let correctTally = 0;
let incorrectTally = 0;
let questionStartTime = 0;
let countdownTimerInterval = null;
let secondsLeft = 0;
let isTimerFrozen = false;
let freezeTimeoutId = null;

// Gamification & Telemetry State
let currentScore = 0;
let currentStreak = 0;
let maxStreak = 0;
const sessionTelemetry = [];

// Lifeline Inventory State
let lifelinesRemaining = {
    fiftyFifty: 1,
    aiHint: 2,
    freezeTimer: 1
};

// Fallback gamification configuration if not embedded in examConfig
const activeGamification = (typeof examConfig !== 'undefined' && examConfig.gamification) ? examConfig.gamification : {
    enabled: true,
    scoring: {
        basePointsPerCorrect: 100,
        timeBonus: { enabled: true, maxBonusPoints: 50, speedBenchmarkSeconds: 15 },
        streakMultiplier: { enabled: true, streakThreshold: 3, multiplierIncrement: 0.25, maxMultiplier: 2.5 }
    },
    lifelines: { fiftyFiftyCount: 1, aiHintCount: 2, freezeTimerCount: 1, freezeDurationSeconds: 30 },
    ranks: [
        { name: "Novice", minScore: 0, badge: "🌱" },
        { name: "Scholar", minScore: 1200, badge: "⚡" },
        { name: "Master", minScore: 2800, badge: "🔥" },
        { name: "Grandmaster", minScore: 4500, badge: "👑" }
    ]
};

// Initialize theme on window execution
document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const modeBtn = document.getElementById('theme-switcher-btn');
    if (modeBtn) modeBtn.innerText = "☀️ Light Mode";
});

/**
 * Toggles the application theme state
 */
function toggleUIMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    
    const modeBtn = document.getElementById('theme-switcher-btn');
    if (modeBtn) {
        modeBtn.innerText = newTheme === 'light' ? "🌙 Dark Mode" : "☀️ Light Mode";
    }
}

/**
 * Validates the student credentials, initializes gamification counters, and launches assessment
 */
function startExamEngine() {
    const input = document.getElementById('username');
    if (!input) return;
    
    const formatted = input.value.trim();
    if (!formatted) {
        alert("Access Denied: Please provide a valid username or verification handle to start.");
        return;
    }
    
    studentName = formatted;

    // Initialize Lifeline counts from configuration
    if (activeGamification && activeGamification.lifelines) {
        lifelinesRemaining.fiftyFifty = activeGamification.lifelines.fiftyFiftyCount ?? 1;
        lifelinesRemaining.aiHint = activeGamification.lifelines.aiHintCount ?? 2;
        lifelinesRemaining.freezeTimer = activeGamification.lifelines.freezeTimerCount ?? 1;
    }

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('exam-screen').classList.remove('hidden');
    
    injectGamificationHUD();
    initializeClock(examConfig.timeLimitMinutes);
    renderQuestionNode();
}

/**
 * Injects HUD for dynamic score, streaks, audio read aloud, power-up lifelines, and early submission
 */
function injectGamificationHUD() {
    const examScreen = document.getElementById('exam-screen');
    const metaRow = examScreen.querySelector('.meta-row');
    
    // Prevent duplicate injection
    if (document.getElementById('hud-gamification-bar')) return;

    const hudContainer = document.createElement('div');
    hudContainer.id = 'hud-gamification-bar';
    hudContainer.style.cssText = "margin-bottom: 14px; padding: 10px; background: var(--background); border: 1px solid var(--border); border-radius: 6px;";

    hudContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px;">
            <div>🏆 <strong>Score:</strong> <span id="hud-score-val" style="color:var(--primary); font-weight:700;">0</span></div>
            <div>🔥 <strong>Streak:</strong> <span id="hud-streak-val" style="color:#f59e0b; font-weight:700;">0</span></div>
            <div>🎖️ <strong>Rank:</strong> <span id="hud-rank-val">🌱 Novice</span></div>
        </div>
        <div id="lifeline-control-row" style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button id="btn-life-5050" class="btn btn-secondary" style="flex:1; margin:0; padding:6px 8px; font-size:12px;" onclick="activateFiftyFifty()">✂️ 50/50 (<span id="count-5050">${lifelinesRemaining.fiftyFifty}</span>)</button>
            <button id="btn-life-hint" class="btn btn-secondary" style="flex:1; margin:0; padding:6px 8px; font-size:12px;" onclick="activateSocraticHint()">💡 Hint (<span id="count-hint">${lifelinesRemaining.aiHint}</span>)</button>
            <button id="btn-life-freeze" class="btn btn-secondary" style="flex:1; margin:0; padding:6px 8px; font-size:12px;" onclick="activateFreezeTimer()">❄️ Freeze (<span id="count-freeze">${lifelinesRemaining.freezeTimer}</span>)</button>
            <button id="btn-life-tts" class="btn btn-secondary" style="width:auto; margin:0; padding:6px 10px; font-size:12px;" onclick="readQuestionAloud()">🔊 Listen</button>
            <button id="btn-end-exam" class="btn btn-secondary" style="background:#dc2626; color:white; width:auto; border:none; margin:0; padding:6px 10px; font-size:12px;" onclick="forceEndExam()">⏹️ Submit</button>
        </div>
        <div id="hint-display-box" class="hidden" style="margin-top:8px; padding:8px; background:rgba(37,99,235,0.15); border-left:3px solid var(--primary); font-size:12px; border-radius:4px;"></div>
    `;

    metaRow.parentNode.insertBefore(hudContainer, metaRow.nextSibling);
}

/**
 * Runs countdown clock with support for freeze lifeline
 */
function initializeClock(minutes) {
    secondsLeft = parseInt(minutes, 10) * 60;
    const clockDisplay = document.getElementById('clock-display');
    if (!clockDisplay) return;

    countdownTimerInterval = setInterval(() => {
        if (isTimerFrozen) return;

        if (secondsLeft <= 0) {
            clearInterval(countdownTimerInterval);
            alert("Time has expired! Submitting your exam records automatically.");
            terminateSession();
            return;
        }
        secondsLeft--;
        const min = Math.floor(secondsLeft / 60);
        const sec = secondsLeft % 60;
        clockDisplay.innerText = `⏱️ Time Left: ${min}:${sec < 10 ? '0' : ''}${sec}`;
    }, 1000);
}

/**
 * Renders the question item stem and interactive response variants
 */
function renderQuestionNode() {
    if (currentQuestionIdx >= examQuestions.length) {
        clearInterval(countdownTimerInterval);
        terminateSession();
        return;
    }
    
    // Hide hint box from previous question
    const hintBox = document.getElementById('hint-display-box');
    if (hintBox) {
        hintBox.classList.add('hidden');
        hintBox.innerText = "";
    }

    const node = examQuestions[currentQuestionIdx];
    document.getElementById('progress-text').innerText = `Question ${currentQuestionIdx + 1} of ${examQuestions.length}`;
    document.getElementById('question-text').innerText = node.q;
    
    const container = document.getElementById('options-container');
    container.innerHTML = "";
    
    node.options.forEach((optText, optIndex) => {
        const btn = document.createElement('button');
        btn.className = "btn option-btn";
        btn.innerText = optText;
        btn.setAttribute('data-opt-index', optIndex);
        btn.onclick = () => processUserSelection(optIndex, btn);
        container.appendChild(btn);
    });
    
    questionStartTime = Date.now();
}

/**
 * Processes selection logic, computes score with speed and streak multipliers, and records telemetry
 */
function processUserSelection(selectedIndex, clickedBtn) {
    const elapsedSeconds = parseFloat(((Date.now() - questionStartTime) / 1000).toFixed(2));
    const node = examQuestions[currentQuestionIdx];
    const isCorrect = (selectedIndex === node.correct);
    let pointsAwarded = 0;
    
    if (isCorrect) {
        correctTally++;
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;

        // Calculate Points
        const basePoints = activeGamification.scoring?.basePointsPerCorrect ?? 100;
        let streakMultiplier = 1.0;

        if (activeGamification.scoring?.streakMultiplier?.enabled) {
            const threshold = activeGamification.scoring.streakMultiplier.streakThreshold ?? 3;
            const increment = activeGamification.scoring.streakMultiplier.multiplierIncrement ?? 0.25;
            const maxMult = activeGamification.scoring.streakMultiplier.maxMultiplier ?? 2.5;

            if (currentStreak >= threshold) {
                streakMultiplier = Math.min(1.0 + ((currentStreak - threshold + 1) * increment), maxMult);
            }
        }

        let timeBonus = 0;
        if (activeGamification.scoring?.timeBonus?.enabled) {
            const targetSec = activeGamification.scoring.timeBonus.speedBenchmarkSeconds ?? 15;
            const maxBonus = activeGamification.scoring.timeBonus.maxBonusPoints ?? 50;
            if (elapsedSeconds < targetSec) {
                timeBonus = Math.round(((targetSec - elapsedSeconds) / targetSec) * maxBonus);
            }
        }

        pointsAwarded = Math.round((basePoints * streakMultiplier) + timeBonus);
        currentScore += pointsAwarded;
    } else {
        incorrectTally++;
        currentStreak = 0;
    }

    updateHUDMetrics();

    sessionTelemetry.push({
        idx: currentQuestionIdx + 1,
        question: node.q,
        selected: node.options[selectedIndex],
        status: isCorrect ? "Correct" : "Incorrect",
        time: elapsedSeconds,
        points: pointsAwarded,
        difficulty: node.difficulty || "medium"
    });

    if (examConfig.showCorrectOnSubmit === "yes") {
        const allButtons = document.getElementById('options-container').querySelectorAll('button');
        allButtons.forEach((btn, index) => {
            btn.onclick = null; // Prevent subsequent clicks
            if (index === node.correct) {
                btn.classList.add('reveal-correct');
            }
        });
        
        if (!isCorrect) {
            clickedBtn.classList.add('reveal-incorrect');
        }

        // Show brief explanation if available in schema
        if (node.explanation) {
            const hintBox = document.getElementById('hint-display-box');
            if (hintBox) {
                hintBox.classList.remove('hidden');
                hintBox.innerHTML = `📘 <strong>Insight:</strong> ${node.explanation}`;
            }
        }
        
        setTimeout(() => {
            currentQuestionIdx++;
            renderQuestionNode();
        }, 1800);
    } else {
        currentQuestionIdx++;
        renderQuestionNode();
    }
}

/**
 * Updates dynamic HUD elements (Score, Streak, and Rank badge)
 */
function updateHUDMetrics() {
    const scoreVal = document.getElementById('hud-score-val');
    const streakVal = document.getElementById('hud-streak-val');
    const rankVal = document.getElementById('hud-rank-val');

    if (scoreVal) scoreVal.innerText = currentScore;
    if (streakVal) streakVal.innerText = currentStreak;

    if (rankVal && activeGamification.ranks) {
        let currentRank = activeGamification.ranks[0];
        activeGamification.ranks.forEach(r => {
            if (currentScore >= r.minScore) {
                currentRank = r;
            }
        });
        rankVal.innerText = `${currentRank.badge} ${currentRank.name}`;
    }
}

// ==========================================================================
// LIFELINES & EXAM CONTROLS
// ==========================================================================

function activateFiftyFifty() {
    if (lifelinesRemaining.fiftyFifty <= 0) return alert("No 50/50 power-ups remaining!");
    
    const node = examQuestions[currentQuestionIdx];
    const optionButtons = Array.from(document.getElementById('options-container').querySelectorAll('button'));
    
    const incorrectButtons = optionButtons.filter((btn, idx) => idx !== node.correct && !btn.disabled);
    if (incorrectButtons.length < 2) return;

    incorrectButtons.sort(() => Math.random() - 0.5);
    incorrectButtons.slice(0, 2).forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = "0.2";
        btn.style.textDecoration = "line-through";
        btn.style.cursor = "not-allowed";
    });

    lifelinesRemaining.fiftyFifty--;
    document.getElementById('count-5050').innerText = lifelinesRemaining.fiftyFifty;
    if (lifelinesRemaining.fiftyFifty === 0) document.getElementById('btn-life-5050').disabled = true;
}

function activateSocraticHint() {
    if (lifelinesRemaining.aiHint <= 0) return alert("No Socratic Hints remaining!");

    const node = examQuestions[currentQuestionIdx];
    const hintBox = document.getElementById('hint-display-box');
    if (!hintBox) return;

    const hintText = node.hint || "Carefully analyze the keywords in the question stem and rule out options that are fundamentally mismatched.";
    
    hintBox.classList.remove('hidden');
    hintBox.innerHTML = `💡 <strong>Socratic Hint:</strong> ${hintText}`;

    lifelinesRemaining.aiHint--;
    document.getElementById('count-hint').innerText = lifelinesRemaining.aiHint;
    if (lifelinesRemaining.aiHint === 0) document.getElementById('btn-life-hint').disabled = true;
}

function activateFreezeTimer() {
    if (lifelinesRemaining.freezeTimer <= 0) return alert("No Time Freeze power-ups remaining!");
    if (isTimerFrozen) return;

    const duration = activeGamification.lifelines?.freezeDurationSeconds ?? 30;
    isTimerFrozen = true;

    const clockDisplay = document.getElementById('clock-display');
    clockDisplay.style.color = "#38bdf8";
    clockDisplay.innerText = `❄️ FROZEN (${duration}s)`;

    lifelinesRemaining.freezeTimer--;
    document.getElementById('count-freeze').innerText = lifelinesRemaining.freezeTimer;
    if (lifelinesRemaining.freezeTimer === 0) document.getElementById('btn-life-freeze').disabled = true;

    freezeTimeoutId = setTimeout(() => {
        isTimerFrozen = false;
        clockDisplay.style.color = "var(--primary)";
    }, duration * 1000);
}

function readQuestionAloud() {
    if (!('speechSynthesis' in window)) {
        return alert("Text-to-speech is not supported in this browser.");
    }
    
    window.speechSynthesis.cancel();
    const node = examQuestions[currentQuestionIdx];
    const textToSpeak = `${node.q}. Option A: ${node.options[0]}. Option B: ${node.options[1]}. Option C: ${node.options[2]}. Option D: ${node.options[3]}.`;
    
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
}

function forceEndExam() {
    if (confirm("Are you sure you want to submit your exam early? Unanswered questions will not be scored.")) {
        clearInterval(countdownTimerInterval);
        terminateSession();
    }
}

/**
 * Displays summary evaluation totals and gamification metrics upon exam end
 */
function terminateSession() {
    if (freezeTimeoutId) clearTimeout(freezeTimeoutId);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    document.getElementById('exam-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.remove('hidden');
    
    const ratio = incorrectTally === 0 ? correctTally : (correctTally / incorrectTally).toFixed(2);
    
    let earnedRank = { name: "Novice", badge: "🌱" };
    if (activeGamification.ranks) {
        activeGamification.ranks.forEach(r => {
            if (currentScore >= r.minScore) earnedRank = r;
        });
    }

    document.getElementById('stats-summary').innerHTML = `
        <div style="background: var(--background); padding: 16px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 15px;">
            <p style="margin: 4px 0;"><strong>Student:</strong> ${studentName}</p>
            <p style="margin: 4px 0;"><strong>Final Accuracy:</strong> ${correctTally} / ${examQuestions.length}</p>
            <p style="margin: 4px 0;"><strong>Correct-to-Incorrect Ratio:</strong> ${ratio}</p>
            <hr style="border: 0; border-top: 1px solid var(--border); margin: 8px 0;">
            <p style="margin: 4px 0; color:var(--primary);"><strong>Total Gamified Points:</strong> ${currentScore} XP</p>
            <p style="margin: 4px 0;"><strong>Longest Streak:</strong> ${maxStreak} 🔥</p>
            <p style="margin: 4px 0;"><strong>Standing Rank:</strong> ${earnedRank.badge} ${earnedRank.name}</p>
        </div>
        <p style="color: var(--text-muted); font-size: 14px; line-height: 1.5;">
            Assessment records completed. Export your complete telemetry and performance logs using the button below.
        </p>
    `;
}

/**
 * Flattens telemetry matrices including gamified scores and speeds out to CSV download format
 */
function downloadExamCSV() {
    const ratio = incorrectTally === 0 ? correctTally : (correctTally / incorrectTally).toFixed(2);
    const sanitizedStudentName = studentName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    let csv = "data:text/csv;charset=utf-8,Student ID," + studentName + "\nScore," + correctTally + "/" + examQuestions.length + "\nPoints," + currentScore + "\nRatio," + ratio + "\n\nIndex,Question,Chosen Answer,Status,Difficulty,Points,Seconds Taken\n";
    
    sessionTelemetry.forEach(r => {
        csv += `${r.idx},"${r.question.replace(/"/g, '""')}","${r.selected.replace(/"/g, '""')}",${r.status},${r.difficulty},${r.points},${r.time}\n`;
    });
    
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", `ExamResults_${sanitizedStudentName}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}