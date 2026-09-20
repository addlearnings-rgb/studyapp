// exam_engine.js - Enhanced Exam Runtime, Gamification & HUD Engine

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

// Gamification State
let currentScore = 0;
let currentStreak = 0;
let maxStreak = 0;
const sessionTelemetry = [];
const incorrectQuestionsLog = [];

// Gamification Defaults
const activeGamification = {
    scoring: { basePointsPerCorrect: 100, timeBonus: { maxBonusPoints: 50, speedBenchmarkSeconds: 15 }, streakMultiplier: { streakThreshold: 3, multiplierIncrement: 0.25, maxMultiplier: 2.5 } },
    ranks: [
        { name: "Novice", minScore: 0, badge: "🌱" },
        { name: "Scholar", minScore: 1200, badge: "⚡" },
        { name: "Master", minScore: 2800, badge: "🔥" },
        { name: "Grandmaster", minScore: 4500, badge: "👑" }
    ]
};

document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.setAttribute('data-theme', 'dark');
});

function toggleUIMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
}

function startExamEngine() {
    const input = document.getElementById('username');
    if (!input) return;
    const formatted = input.value.trim();
    if (!formatted) return alert("Access Denied: Please enter your student handle.");
    
    studentName = formatted;

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('exam-layout').classList.remove('hidden');
    document.getElementById('progress-bar-container').classList.remove('hidden');
    document.getElementById('profile-btn').classList.remove('hidden');
    document.getElementById('top-rank-display').classList.remove('hidden');

    initializeClock(examConfig.timeLimitMinutes);
    renderQuestionNode();
    fetchGlobalStudentProfile(); 
}

document.addEventListener('keydown', (e) => {
    if (document.getElementById('exam-layout').classList.contains('hidden')) return;
    if (hasSubmittedCurrentAnswer) {
        if (e.key === 'Enter') {
            const btn = document.getElementById('btn-submit-answer');
            if (btn && !btn.disabled) btn.click();
        }
        return;
    }
    if (['1', '2', '3', '4'].includes(e.key)) {
        const idx = parseInt(e.key) - 1;
        const optionBtns = document.querySelectorAll('.option-btn');
        if (optionBtns[idx] && !optionBtns[idx].disabled) {
            optionBtns[idx].click();
        }
    } else if (e.key === 'Enter' && selectedOptionIndex !== null) {
        commitStudentAnswer();
    }
});

function initializeClock(minutes) {
    secondsLeft = parseInt(minutes, 10) * 60;
    const clockDisplay = document.getElementById('clock-display');
    const timerBox = document.getElementById('timer-box');
    
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
        clockDisplay.innerText = `${min}:${sec < 10 ? '0' : ''}${sec}`;

        if (secondsLeft < 60) {
            timerBox.style.borderColor = "var(--error)";
            clockDisplay.style.color = "var(--error)";
        }
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
    submitBtn.disabled = true;
    submitBtn.innerText = "Submit Answer (Enter)";
    
    document.getElementById('hint-display-box').classList.add('hidden');
    document.getElementById('hint-display-box').innerHTML = "";

    const node = examQuestions[currentQuestionIdx];
    document.getElementById('progress-text').innerText = `Question ${currentQuestionIdx + 1} of ${examQuestions.length}`;
    document.getElementById('question-text').innerText = node.q;
    
    const progressPct = (currentQuestionIdx / examQuestions.length) * 100;
    document.getElementById('progress-bar-fill').style.width = `${progressPct}%`;
    
    const container = document.getElementById('options-container');
    container.innerHTML = "";
    
    node.options.forEach((optText, optIndex) => {
        const btn = document.createElement('button');
        btn.className = "option-btn";
        btn.innerHTML = `<strong style="color:var(--primary); margin-right:8px;">${optIndex + 1}.</strong> ${optText}`;
        btn.setAttribute('data-opt-index', optIndex);
        btn.onclick = () => selectOptionNode(optIndex, btn);
        container.appendChild(btn);
    });
    
    questionStartTime = Date.now();
}

function selectOptionNode(optIndex, clickedBtn) {
    if (hasSubmittedCurrentAnswer) return;
    selectedOptionIndex = optIndex;
    
    document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('option-selected'));
    clickedBtn.classList.add('option-selected');
    document.getElementById('btn-submit-answer').disabled = false;
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

        const basePts = activeGamification.scoring.basePointsPerCorrect;
        let streakMult = 1.0;
        if (currentStreak >= activeGamification.scoring.streakMultiplier.streakThreshold) {
            streakMult = Math.min(1.0 + ((currentStreak - activeGamification.scoring.streakMultiplier.streakThreshold + 1) * activeGamification.scoring.streakMultiplier.multiplierIncrement), activeGamification.scoring.streakMultiplier.maxMultiplier);
        }
        
        let timeBonus = 0;
        const targetSec = activeGamification.scoring.timeBonus.speedBenchmarkSeconds;
        if (elapsedSeconds < targetSec) {
            timeBonus = Math.round(((targetSec - elapsedSeconds) / targetSec) * activeGamification.scoring.timeBonus.maxBonusPoints);
        }

        pointsAwarded = Math.round((basePts * streakMult) + timeBonus);
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

    document.querySelectorAll('.option-btn').forEach((btn, index) => {
        btn.disabled = true;
        if (index === node.correct) {
            btn.classList.add('reveal-correct');
        } else if (index === selectedOptionIndex && !isCorrect) {
            btn.classList.add('reveal-incorrect');
        }
    });

    if (node.explanation) {
        const hintBox = document.getElementById('hint-display-box');
        hintBox.classList.remove('hidden');
        hintBox.innerHTML = `📘 <strong>Explanation:</strong> ${node.explanation}`;
    }

    const submitBtn = document.getElementById('btn-submit-answer');
    submitBtn.innerText = "Next Question → (Enter)";
    submitBtn.onclick = () => {
        currentQuestionIdx++;
        submitBtn.onclick = commitStudentAnswer;
        renderQuestionNode();
    };
}

function updateHUDMetrics() {
    document.getElementById('hud-score-val').innerText = currentScore;
    document.getElementById('hud-streak-val').innerText = `${currentStreak}🔥`;

    let currentRank = activeGamification.ranks[0];
    activeGamification.ranks.forEach(r => {
        if (currentScore >= r.minScore) currentRank = r;
    });
    document.getElementById('hud-rank-val').innerText = `${currentRank.badge} ${currentRank.name}`;
}

function activateFiftyFifty() {
    let span = document.getElementById('count-5050');
    let count = parseInt(span.innerText);
    if (count <= 0) return;
    
    const node = examQuestions[currentQuestionIdx];
    const btns = Array.from(document.querySelectorAll('.option-btn'));
    const incorrectBtns = btns.filter((btn, idx) => idx !== node.correct && !btn.disabled);
    if (incorrectBtns.length < 2) return;

    incorrectBtns.sort(() => Math.random() - 0.5);
    incorrectBtns.slice(0, 2).forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = "0.2";
        btn.style.textDecoration = "line-through";
    });

    span.innerText = count - 1;
    if (count - 1 === 0) document.getElementById('btn-life-5050').disabled = true;
}

function activateSocraticHint() {
    let span = document.getElementById('count-hint');
    let count = parseInt(span.innerText);
    if (count <= 0) return;

    const hintBox = document.getElementById('hint-display-box');
    hintBox.classList.remove('hidden');
    hintBox.innerHTML = `💡 <strong>Hint:</strong> ${examQuestions[currentQuestionIdx].hint || "Analyze the keywords carefully."}`;

    span.innerText = count - 1;
    if (count - 1 === 0) document.getElementById('btn-life-hint').disabled = true;
}

function activateFreezeTimer() {
    let span = document.getElementById('count-freeze');
    let count = parseInt(span.innerText);
    if (count <= 0 || isTimerFrozen) return;

    isTimerFrozen = true;
    document.getElementById('clock-display').style.color = "#38bdf8";
    
    span.innerText = count - 1;
    if (count - 1 === 0) document.getElementById('btn-life-freeze').disabled = true;

    freezeTimeoutId = setTimeout(() => {
        isTimerFrozen = false;
        document.getElementById('clock-display').style.color = "var(--primary)";
    }, 30000);
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

async function terminateSession() {
    if (freezeTimeoutId) clearTimeout(freezeTimeoutId);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    document.getElementById('exam-layout').classList.add('hidden');
    document.getElementById('progress-bar-container').classList.add('hidden');
    document.getElementById('result-screen').classList.remove('hidden');
    
    const ratio = incorrectTally === 0 ? correctTally : (correctTally / incorrectTally).toFixed(2);
    
    const payload = {
        uniqueExamId: examConfig.uniqueExamId,
        studentId: studentName,
        subject: examConfig.subject,
        topic: examConfig.topic,
        score: correctTally,
        total: examQuestions.length,
        points: currentScore,
        ratio: ratio,
        timestamp: new Date().toISOString()
    };

    document.getElementById('stats-summary').innerHTML = `
        <div style="background: var(--surface); padding: 24px; border: 1px solid var(--border); border-radius: 12px;">
            <h3 style="margin-bottom:16px;">Mission Accomplished, ${studentName}!</h3>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:16px;">
                <div style="background:var(--background); padding:12px; border-radius:8px;">
                    <div style="font-size:12px; color:var(--text-muted); text-transform:uppercase;">Accuracy</div>
                    <div style="font-size:24px; font-weight:700; color:var(--success);">${correctTally}/${examQuestions.length}</div>
                </div>
                <div style="background:var(--background); padding:12px; border-radius:8px;">
                    <div style="font-size:12px; color:var(--text-muted); text-transform:uppercase;">Total XP Earned</div>
                    <div style="font-size:24px; font-weight:700; color:var(--primary);">${currentScore}</div>
                </div>
            </div>
        </div>
    `;

    if (examConfig.masterAnalyticsGistId && examConfig.obfuscatedPat) {
        try {
            const token = atob(examConfig.obfuscatedPat);
            const res = await fetch(`https://api.github.com/gists/${examConfig.masterAnalyticsGistId}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (res.ok) {
                const data = await res.json();
                const fileContent = data.files['student_telemetry.json']?.content || "[]";
                let records = [];
                try { records = JSON.parse(fileContent); } catch(e){}
                records.push(payload);
                await fetch(`https://api.github.com/gists/${examConfig.masterAnalyticsGistId}`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files: { 'student_telemetry.json': { content: JSON.stringify(records, null, 2) } } })
                });
            }
        } catch (e) { console.warn("Could not sync telemetry."); }
    }
}

function triggerReportModal() { document.getElementById('report-modal').classList.remove('hidden'); }

async function submitQuestionReport() {
    const reason = document.getElementById('report-reason-input').value.trim();
    if (!reason) return alert("Please provide a brief reason.");
    if (!examConfig.obfuscatedPat || !examConfig.githubRepo) return alert("GitHub repo config missing.");

    const token = atob(examConfig.obfuscatedPat);
    const node = examQuestions[currentQuestionIdx] || examQuestions[0];
    const issueTitle = `[Reported Q] ${examConfig.subject} - ${examConfig.topic}`;
    const issueBody = `Question: "${node.q}"\nReason: ${reason}\nStudent: ${studentName}\nExam ID: ${examConfig.uniqueExamId}`;

    try {
        const res = await fetch(`https://api.github.com/repos/${examConfig.githubRepo}/issues`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: issueTitle, body: issueBody, labels: ['question-error'] })
        });
        if (res.ok) {
            alert("Report submitted to the AI training queue!");
            document.getElementById('report-modal').classList.add('hidden');
            document.getElementById('report-reason-input').value = "";
        }
    } catch (e) {}
}

function downloadExamJSON() {
    const blob = new Blob([JSON.stringify(sessionTelemetry, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `ExamPerformance.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function fetchGlobalStudentProfile() {
    if (!examConfig.masterAnalyticsGistId || !examConfig.obfuscatedPat) return;
    try {
        const token = atob(examConfig.obfuscatedPat);
        const res = await fetch(`https://api.github.com/gists/${examConfig.masterAnalyticsGistId}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
        });
        if (res.ok) {
            const data = await res.json();
            const telemetryStr = data.files['student_telemetry.json']?.content || "[]";
            const allRecords = JSON.parse(telemetryStr);
            
            const myRecords = allRecords.filter(r => r.studentId.toLowerCase() === studentName.toLowerCase());
            
            if (myRecords.length === 0) {
                document.getElementById('profile-content-area').innerHTML = `<p style="color:var(--text-muted); text-align:center; padding-top:40px;">No previous records found for <strong>${studentName}</strong>.</p>`;
                return;
            }

            let totalXp = 0;
            let totalCorrect = 0;
            let totalQuestions = 0;
            const subjects = {};

            myRecords.forEach(r => {
                totalXp += (r.points || 0);
                totalCorrect += (r.score || 0);
                totalQuestions += (r.total || 0);
                if (!subjects[r.subject]) subjects[r.subject] = { exams: 0, score: 0, total: 0 };
                subjects[r.subject].exams++;
                subjects[r.subject].score += r.score;
                subjects[r.subject].total += r.total;
            });

            const globalAccuracy = Math.round((totalCorrect / totalQuestions) * 100) || 0;

            let globalRank = activeGamification.ranks[0];
            activeGamification.ranks.forEach(r => { if (totalXp >= r.minScore) globalRank = r; });

            let html = `
                <div style="display:flex; align-items:center; gap:16px; margin-bottom:24px;">
                    <div style="font-size:48px;">${globalRank.badge}</div>
                    <div>
                        <h2 style="margin:0; font-size:24px;">${studentName}</h2>
                        <p style="margin:0; color:var(--primary); font-weight:600;">${globalRank.name} • ${totalXp.toLocaleString()} Lifetime XP</p>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:24px;">
                    <div style="background:var(--background); padding:16px; border-radius:8px; border:1px solid var(--border);">
                        <div style="font-size:12px; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Global Accuracy</div>
                        <div style="font-size:24px; font-weight:700;">${globalAccuracy}%</div>
                    </div>
                    <div style="background:var(--background); padding:16px; border-radius:8px; border:1px solid var(--border);">
                        <div style="font-size:12px; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Exams Completed</div>
                        <div style="font-size:24px; font-weight:700;">${myRecords.length}</div>
                    </div>
                </div>
                <h4 style="margin-bottom:12px;">Subject Mastery</h4>
                <div style="display:flex; flex-direction:column; gap:8px; max-height:200px; overflow-y:auto;">
            `;

            for (const [subj, data] of Object.entries(subjects)) {
                const acc = Math.round((data.score / data.total) * 100);
                html += `
                    <div style="display:flex; justify-content:space-between; padding:12px; background:var(--background); border-radius:6px; border:1px solid var(--border);">
                        <div><strong>${subj}</strong> <span style="color:var(--text-muted); font-size:12px;">(${data.exams} exams)</span></div>
                        <div style="font-weight:600; color:${acc >= 70 ? 'var(--success)' : 'var(--warning)'}">${acc}% Acc</div>
                    </div>
                `;
            }

            html += `</div>`;
            document.getElementById('profile-content-area').innerHTML = html;
        }
    } catch (e) { console.warn("Failed to fetch student profile."); }
}

function openStudentProfile() {
    document.getElementById('profile-modal').classList.remove('hidden');
}
