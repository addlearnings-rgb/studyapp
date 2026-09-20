// app.js / exam_engine.js - Enhanced Exam Runtime, Telemetry, Gamification & LMS Engine

let currentQuestionIdx = 0;
let studentName = "";
let correctTally = 0;
let incorrectTally = 0;
let questionStartTime = 0;
let countdownTimerInterval = null;
let secondsLeft = 0;
let isTimerFrozen = false;
let freezeTimeoutId = null;

let selectedOptionIndex = null;
let hasSubmittedCurrentAnswer = false;

// Gamification & Telemetry State
let currentScore = 0;
let currentStreak = 0;
let maxStreak = 0;
const sessionTelemetry = [];
const incorrectQuestionsLog = [];

// Lifeline Inventory State
let lifelinesRemaining = {
    fiftyFifty: 1,
    aiHint: 2,
    freezeTimer: 1
};

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

document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const modeBtn = document.getElementById('theme-switcher-btn');
    if (modeBtn) modeBtn.innerText = "☀️ Light Mode";
});

function toggleUIMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    const modeBtn = document.getElementById('theme-switcher-btn');
    if (modeBtn) modeBtn.innerText = newTheme === 'light' ? "🌙 Dark Mode" : "☀️ Light Mode";
}

function startExamEngine() {
    const input = document.getElementById('username');
    if (!input) return;
    const formatted = input.value.trim();
    if (!formatted) {
        alert("Access Denied: Please provide a valid student identifier.");
        return;
    }
    
    studentName = formatted;

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

function injectGamificationHUD() {
    const examScreen = document.getElementById('exam-screen');
    const metaRow = examScreen.querySelector('.meta-row');
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

function initializeClock(minutes) {
    secondsLeft = parseInt(minutes, 10) * 60;
    const clockDisplay = document.getElementById('clock-display');
    if (!clockDisplay) return;

    countdownTimerInterval = setInterval(() => {
        if (isTimerFrozen) return;
        if (secondsLeft <= 0) {
            clearInterval(countdownTimerInterval);
            alert("Time expired! Submitting session records automatically.");
            terminateSession();
            return;
        }
        secondsLeft--;
        const min = Math.floor(secondsLeft / 60);
        const sec = secondsLeft % 60;
        clockDisplay.innerText = `⏱️ Time Left: ${min}:${sec < 10 ? '0' : ''}${sec}`;
    }, 1000);
}

function renderQuestionNode() {
    if (currentQuestionIdx >= examQuestions.length) {
        clearInterval(countdownTimerInterval);
        terminateSession();
        return;
    }
    
    selectedOptionIndex = null;
    hasSubmittedCurrentAnswer = false;
    
    const submitBtn = document.getElementById('btn-submit-answer');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "Submit Answer";
    }

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
        btn.onclick = () => selectOptionNode(optIndex, btn);
        container.appendChild(btn);
    });
    
    questionStartTime = Date.now();
}

function selectOptionNode(optIndex, clickedBtn) {
    if (hasSubmittedCurrentAnswer) return;
    
    selectedOptionIndex = optIndex;
    const allButtons = document.getElementById('options-container').querySelectorAll('button');
    allButtons.forEach(b => b.classList.remove('option-selected'));
    
    clickedBtn.classList.add('option-selected');
    
    const submitBtn = document.getElementById('btn-submit-answer');
    if (submitBtn) submitBtn.disabled = false;
}

function commitStudentAnswer() {
    if (selectedOptionIndex === null || hasSubmittedCurrentAnswer) return;
    hasSubmittedCurrentAnswer = true;

    const elapsedSeconds = parseFloat(((Date.now() - questionStartTime) / 1000).toFixed(2));
    const node = examQuestions[currentQuestionIdx];
    const isCorrect = (selectedOptionIndex === node.correct);
    let pointsAwarded = 0;
    
    if (isCorrect) {
        correctTally++;
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;

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
        incorrectQuestionsLog.push(node);
    }

    updateHUDMetrics();

    sessionTelemetry.push({
        idx: currentQuestionIdx + 1,
        question: node.q,
        selected: node.options[selectedOptionIndex],
        status: isCorrect ? "Correct" : "Incorrect",
        time: elapsedSeconds,
        points: pointsAwarded,
        difficulty: node.difficulty || "medium"
    });

    const allButtons = document.getElementById('options-container').querySelectorAll('button');
    allButtons.forEach((btn, index) => {
        btn.onclick = null;
        if (index === node.correct) {
            btn.classList.add('reveal-correct');
        }
    });

    if (!isCorrect) {
        const selectedBtn = document.querySelector(`[data-opt-index="${selectedOptionIndex}"]`);
        if (selectedBtn) selectedBtn.classList.add('reveal-incorrect');
    }

    if (node.explanation) {
        const hintBox = document.getElementById('hint-display-box');
        if (hintBox) {
            hintBox.classList.remove('hidden');
            hintBox.innerHTML = `📘 <strong>Explanation:</strong> ${node.explanation}`;
        }
    }

    const submitBtn = document.getElementById('btn-submit-answer');
    if (submitBtn) submitBtn.innerText = "Next Question →";
    submitBtn.onclick = () => {
        currentQuestionIdx++;
        submitBtn.innerText = "Submit Answer";
        submitBtn.onclick = commitStudentAnswer;
        renderQuestionNode();
    };
}

function updateHUDMetrics() {
    const scoreVal = document.getElementById('hud-score-val');
    const streakVal = document.getElementById('hud-streak-val');
    const rankVal = document.getElementById('hud-rank-val');

    if (scoreVal) scoreVal.innerText = currentScore;
    if (streakVal) streakVal.innerText = currentStreak;

    if (rankVal && activeGamification.ranks) {
        let currentRank = activeGamification.ranks[0];
        activeGamification.ranks.forEach(r => {
            if (currentScore >= r.minScore) currentRank = r;
        });
        rankVal.innerText = `${currentRank.badge} ${currentRank.name}`;
    }
}

// ==========================================
// LIFELINES & EXAM CONTROLS
// ==========================================

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

    const hintText = node.hint || "Analyze the question keywords carefully.";
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
    if (!('speechSynthesis' in window)) return alert("Text-to-speech not supported.");
    window.speechSynthesis.cancel();
    const node = examQuestions[currentQuestionIdx];
    const utterance = new SpeechSynthesisUtterance(`${node.q}. Options: ${node.options.join(', ')}`);
    window.speechSynthesis.speak(utterance);
}

function forceEndExam() {
    if (confirm("Are you sure you want to submit your exam early?")) {
        clearInterval(countdownTimerInterval);
        terminateSession();
    }
}

// ==========================================
// SESSION TERMINATION & CLOUD SYNCING
// ==========================================

async function terminateSession() {
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

    const payload = {
        uniqueExamId: examConfig.uniqueExamId,
        studentId: studentName,
        subject: examConfig.subject,
        topic: examConfig.topic,
        grade: examConfig.grade,
        difficulty: examConfig.difficulty,
        score: correctTally,
        total: examQuestions.length,
        points: currentScore,
        ratio: ratio,
        timestamp: new Date().toISOString(),
        telemetry: sessionTelemetry
    };

    document.getElementById('stats-summary').innerHTML = `
        <div style="background: var(--background); padding: 16px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 15px;">
            <p style="margin: 4px 0;"><strong>Student:</strong> ${studentName}</p>
            <p style="margin: 4px 0;"><strong>Final Accuracy:</strong> ${correctTally} / ${examQuestions.length}</p>
            <p style="margin: 4px 0;"><strong>Correct-to-Incorrect Ratio:</strong> ${ratio}</p>
            <hr style="border: 0; border-top: 1px solid var(--border); margin: 8px 0;">
            <p style="margin: 4px 0; color:var(--primary);"><strong>Total Points:</strong> ${currentScore} XP</p>
            <p style="margin: 4px 0;"><strong>Longest Streak:</strong> ${maxStreak} 🔥</p>
            <p style="margin: 4px 0;"><strong>Rank:</strong> ${earnedRank.badge} ${earnedRank.name}</p>
        </div>
    `;

    // Sync telemetry to Master Analytics Gist automatically
    if (examConfig.masterAnalyticsGistId && examConfig.githubPat) {
        await syncTelemetryToCloudGist(payload);
    }
}

async function syncTelemetryToCloudGist(payload) {
    try {
        const res = await fetch(`https://api.github.com/gists/${examConfig.masterAnalyticsGistId}`, {
            headers: { 'Authorization': `Bearer ${examConfig.githubPat}`, 'Accept': 'application/vnd.github.v3+json' }
        });
        if (res.ok) {
            const data = await res.json();
            const fileContent = data.files['student_telemetry.json']?.content || "[]";
            let records = [];
            try { records = JSON.parse(fileContent); } catch(e){}
            records.push(payload);

            await fetch(`https://api.github.com/gists/${examConfig.masterAnalyticsGistId}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${examConfig.githubPat}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
                body: JSON.stringify({
                    files: { 'student_telemetry.json': { content: JSON.stringify(records, null, 2) } }
                })
            });
        }
    } catch (e) {
        console.warn("Could not sync telemetry to Gist:", e);
    }
}

function triggerReportModal() {
    document.getElementById('report-modal').classList.remove('hidden');
}

async function submitQuestionReport(token, repo) {
    const reason = document.getElementById('report-reason-input').value.trim();
    if (!reason) return alert("Please provide a brief reason for the report.");
    if (!token || !repo) return alert("GitHub repository credentials missing.");

    const node = examQuestions[currentQuestionIdx] || examQuestions[0];
    const issueTitle = `[Reported Q] ${examConfig.subject} - ${examConfig.topic}`;
    const issueBody = `Question: "${node.q}"\nReason: ${reason}\nStudent: ${studentName}\nExam ID: ${examConfig.uniqueExamId}`;

    try {
        const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
            body: JSON.stringify({ title: issueTitle, body: issueBody, labels: ['question-error'] })
        });

        if (res.ok) {
            alert("Thank you! Your report has been submitted as a GitHub Issue to improve future AI generations.");
            document.getElementById('report-modal').classList.add('hidden');
            document.getElementById('report-reason-input').value = "";
        } else {
            throw new Error("GitHub API error.");
        }
    } catch (e) {
        alert("Failed to submit issue: " + e.message);
    }
}

function generateRemediationTestFromIncorrect() {
    if (incorrectQuestionsLog.length === 0) return alert("No incorrect questions recorded in this session. Great job!");
    
    const remediationHtml = assembleRemediationHtml(incorrectQuestionsLog);
    const blob = new Blob([remediationHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remediation_${examConfig.topic.toLowerCase().replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function assembleRemediationHtml(incorrectList) {
    return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head><meta charset="UTF-8"><title>Remediation Review: ${examConfig.subject}</title></head>
<body style="font-family:sans-serif; background:#000; color:#fff; padding:40px;">
    <h2>🔄 Remediation Review Test</h2>
    <p>Targeted review of questions missed by ${studentName} in ${examConfig.subject} (${examConfig.topic}).</p>
    <hr style="border-color:#333; margin:20px 0;">
    ${incorrectList.map((item, idx) => `
        <div style="margin-bottom:20px; padding:15px; border:1px solid #333; border-radius:6px; background:#121212;">
            <p><strong>Q${idx+1}:${item.q}</strong></p>
            <p style="color:#22c55e;"><strong>Correct Answer:</strong> ${item.options[item.correct]}</p>
            <p style="color:#9ca3af; font-size:13px;"><strong>Explanation:</strong> ${item.explanation || "Review fundamental principles."}</p>
        </div>
    `).join('')}
</body>
</html>`;
}

function downloadExamJSON() {
    const payload = {
        uniqueExamId: examConfig.uniqueExamId,
        studentId: studentName,
        subject: examConfig.subject,
        topic: examConfig.topic,
        grade: examConfig.grade,
        difficulty: examConfig.difficulty,
        score: correctTally,
        total: examQuestions.length,
        points: currentScore,
        telemetry: sessionTelemetry
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ExamPerformance_${studentName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}