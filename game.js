/* ═══════════════════════════════════════════
   POLSKIE SŁÓWKA — logika gry
   ═══════════════════════════════════════════ */

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#27ae60', '#f39c12'];
const PLAYER_DEFAULTS = ['Gracz 1', 'Gracz 2', 'Gracz 3', 'Gracz 4'];
const SUGGESTION_LETTERS = ['A', 'B', 'C', 'D'];
const MAX_TIME = 90;
const TOTAL_ROUNDS = 2;
const MAX_WRONG = 7;

let playerCount = 2;
let players = [];
let currentPlayerIdx = 0;

// Faza 1
let p1Questions = [];
let p1Index = 0;
let p1Round = 0;
let p1Answered = false;
let timeLeft = MAX_TIME;
let timerInterval = null;

// Faza 2
let p2Words = [];
let p2RoundIdx = 0;
let p2TotalRounds = 0;
let p2State = null; // { word, category, revealed: Set, wrong: Set, solved: bool }

// Faza 3
const P3_TURNS_PER_PLAYER = 2;
const P3_POINTS_EXACT = 7;
const P3_POINTS_NORMALIZED = 5;
let p3Words = [];
let p3Index = 0;
let p3Round = 0;
let p3Answered = false;

// Faza 4: Quiz o Polsce
const PQ_TURNS_PER_PLAYER = 2;
const PQ_POINTS = 5;
let pqQuestions = [];
let pqIndex = 0;
let pqRound = 0;
let pqAnswered = false;

// Jaka akcja po kliknięciu "Gotowy" na handoff
let handoffCallback = null;

// Battle rounds
let battleRound = 0; // 0-3 (after phases 1-4)
let phaseScoreSnapshot = []; // score at start of each word phase
let cInitialized = false; // true after first battle round inits terrain/castles
const BATTLE_PHASE_NAMES = ['Faza 1', 'Faza 2', 'Faza 3', 'Faza 4'];
// What to do after each battle round:
const AFTER_BATTLE = [
    () => showScreen('transition-screen'),   // after battle 1 → Phase 2
    () => showScreen('transition2-screen'),   // after battle 2 → Phase 3
    () => showScreen('transition-quiz-screen'), // after battle 3 → Phase 4
    () => showEndScreen()                     // after battle 4 → End
];

/* ═══════════════════════════════════════════
   NARZĘDZIA
   ═══════════════════════════════════════════ */

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/* Podział polskiego tekstu na sylaby i kolorowanie */
const VOWELS = 'aeiouyąęóAEIOUYĄĘÓ';
function isVowel(ch) { return VOWELS.includes(ch); }

function syllabifyWord(word) {
    if (word.length <= 2) return [word];
    // Find vowel positions
    const vpos = [];
    for (let i = 0; i < word.length; i++) {
        if (isVowel(word[i])) vpos.push(i);
    }
    if (vpos.length <= 1) return [word];

    // Split between consecutive vowels
    const cuts = [];
    for (let k = 0; k < vpos.length - 1; k++) {
        const v1 = vpos[k], v2 = vpos[k + 1];
        const gap = v2 - v1 - 1; // consonants between
        if (gap === 0) {
            cuts.push(v1 + 1); // split right between vowels
        } else if (gap === 1) {
            cuts.push(v1 + 1); // single consonant goes to next syllable
        } else {
            cuts.push(v2 - 1); // multiple consonants: last goes to next syllable
        }
    }

    const syls = [];
    let prev = 0;
    for (const c of cuts) {
        syls.push(word.substring(prev, c));
        prev = c;
    }
    syls.push(word.substring(prev));
    return syls;
}

function colorSyllables(text) {
    let syllableIdx = 0;
    const colors = ['#9b59b6', '#222', '#9b59b6'];
    return text.split(/(\s+)/).map(token => {
        if (/^\s+$/.test(token)) return token;
        // Preserve HTML tags and special tokens like ___
        if (token.includes('<') || token === '___') return token;
        const syls = syllabifyWord(token);
        return syls.map(s => {
            const c = colors[syllableIdx % colors.length];
            syllableIdx++;
            return `<span style="color:${c}">${s}</span>`;
        }).join('');
    }).join('');
}

function normalize(str) {
    return str.toLowerCase().trim()
        .replace(/ą/g,'a').replace(/ć/g,'c').replace(/ę/g,'e')
        .replace(/ł/g,'l').replace(/ń/g,'n').replace(/ó/g,'o')
        .replace(/ś/g,'s').replace(/ź/g,'z').replace(/ż/g,'z');
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const target = document.getElementById(id);
    target.classList.add('active');
    target.style.display = 'block';
}

function insertCharTo(inputId, ch) {
    const input = document.getElementById(inputId);
    if (!input || input.disabled) return;
    const s = input.selectionStart, e = input.selectionEnd;
    input.value = input.value.substring(0, s) + ch + input.value.substring(e);
    input.selectionStart = input.selectionEnd = s + 1;
    input.focus();
}

function renderScoreboard(containerId) {
    const sb = document.getElementById(containerId);
    sb.innerHTML = '';
    players.forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'sb-player' + (i === currentPlayerIdx ? ' current' : '');
        div.innerHTML =
            `<span class="sb-dot" style="background:${p.color}"></span>` +
            `<span>${p.name}: <strong>${p.score}</strong> pkt</span>`;
        sb.appendChild(div);
    });
}

function setBanner(bannerId, player) {
    const b = document.getElementById(bannerId);
    b.textContent = player.name;
    b.style.background = player.color;
}

/* ═══════════════════════════════════════════
   SETUP
   ═══════════════════════════════════════════ */

function setPlayerCount(n) {
    playerCount = n;
    document.querySelectorAll('#count-btns button').forEach(b => b.classList.remove('selected'));
    document.getElementById('cnt-' + n).classList.add('selected');
    renderPlayerInputs();
}

function renderPlayerInputs() {
    const c = document.getElementById('player-inputs');
    c.innerHTML = '';
    for (let i = 0; i < playerCount; i++) {
        const row = document.createElement('div');
        row.className = 'player-input-row';
        row.innerHTML =
            `<div class="player-dot" style="background:${PLAYER_COLORS[i]}"></div>` +
            `<input type="text" id="pname-${i}" placeholder="${PLAYER_DEFAULTS[i]}" maxlength="16">`;
        c.appendChild(row);
    }
}

function startGame() {
    players = [];
    for (let i = 0; i < playerCount; i++) {
        const inp = document.getElementById('pname-' + i);
        const name = (inp && inp.value.trim()) || PLAYER_DEFAULTS[i];
        players.push({ name, color: PLAYER_COLORS[i], score: 0 });
    }
    currentPlayerIdx = 0;
    battleRound = 0;
    cInitialized = false;
    phaseScoreSnapshot = players.map(p => p.score);
    startPhase1();
}

/* ═══════════════════════════════════════════
   HANDOFF (przekazanie urządzenia)
   ═══════════════════════════════════════════ */

function showHandoff(subtitle, callback) {
    const p = players[currentPlayerIdx];
    document.getElementById('handoff-name').textContent = p.name;
    document.getElementById('handoff-name').style.color = p.color;
    document.getElementById('handoff-sub').textContent = subtitle || 'Twoja kolej! Przygotuj się.';
    handoffCallback = callback;
    showScreen('handoff-screen');
}

document.getElementById('handoff-btn').addEventListener('click', () => {
    if (handoffCallback) handoffCallback();
});

/* ═══════════════════════════════════════════
   FAZA 1 — uzupełnianie zdań
   ═══════════════════════════════════════════ */

function startPhase1() {
    phaseScoreSnapshot = players.map(p => p.score);
    p1Questions = shuffle(QUESTIONS).slice(0, TOTAL_ROUNDS * playerCount);
    p1Index = 0;
    p1Round = 1;
    document.getElementById('p1-rounds-total').textContent = TOTAL_ROUNDS;

    if (playerCount === 1) {
        showScreen('phase1-screen');
        p1ShowQuestion();
    } else {
        showHandoff('Faza 1: Uzupełnij brakujące słowo!', p1BeginTurn);
    }
}

function p1BeginTurn() {
    showScreen('phase1-screen');
    p1ShowQuestion();
}

function p1ShowQuestion() {
    const q = p1Questions[p1Index];
    const parts = q.sentence.split('___');
    document.getElementById('sentence').innerHTML =
        colorSyllables(parts[0]) + '<span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>' + colorSyllables(parts[1] || '');
    document.getElementById('p1-hint').innerHTML = 'Podpowiedź: ' + colorSyllables(q.hint);
    document.getElementById('p1-round').textContent = p1Round;

    const p = players[currentPlayerIdx];
    setBanner('p1-banner', p);
    document.getElementById('p1-score').textContent = p.score;

    const input = document.getElementById('p1-answer');
    input.value = '';
    input.disabled = false;
    input.className = '';
    document.getElementById('p1-check-btn').disabled = false;
    document.getElementById('p1-feedback').className = 'feedback';
    document.getElementById('p1-next-btn').classList.add('hidden');

    // Sugestie
    const pool = p1Questions.map(q => q.answer).filter(a => normalize(a) !== normalize(q.answer));
    const distractors = shuffle(pool).slice(0, 3);
    const options = shuffle([q.answer, ...distractors]);
    const sugC = document.getElementById('suggestions');
    sugC.innerHTML = '';
    options.forEach((opt, i) => {
        const div = document.createElement('div');
        div.className = 'suggestion';
        div.dataset.answer = opt;
        div.innerHTML = `<span class="suggestion-letter">${SUGGESTION_LETTERS[i]}</span>${opt}`;
        sugC.appendChild(div);
    });

    renderScoreboard('p1-scoreboard');
    p1Answered = false;
    p1StartTimer();
    input.focus();
}

function p1RevealSuggestions(correctAnswer) {
    document.querySelectorAll('#suggestions .suggestion').forEach(div => {
        const isCorrect = normalize(div.dataset.answer) === normalize(correctAnswer);
        div.className = 'suggestion ' + (isCorrect ? 'reveal-correct' : 'reveal-wrong');
    });
}

/* Timer */
function p1StartTimer() {
    clearInterval(timerInterval);
    timeLeft = MAX_TIME;
    p1UpdateTimerUI();
    timerInterval = setInterval(() => {
        timeLeft--;
        p1UpdateTimerUI();
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            p1OnTimeout();
        }
    }, 1000);
}

function p1UpdateTimerUI() {
    const pct = timeLeft / MAX_TIME;
    const d = document.getElementById('timer-display');
    const b = document.getElementById('timer-bar');
    const cls = pct > 0.4 ? '' : pct > 0.2 ? 'warn' : 'danger';
    d.textContent = timeLeft;
    d.className = 'timer-display ' + cls;
    b.style.width = (pct * 100) + '%';
    b.className = 'timer-bar-fill ' + cls;
}

function p1OnTimeout() {
    if (p1Answered) return;
    p1Answered = true;
    const q = p1Questions[p1Index];
    document.getElementById('p1-answer').disabled = true;
    document.getElementById('p1-check-btn').disabled = true;
    const fb = document.getElementById('p1-feedback');
    fb.textContent = '⏰ Czas minął! Poprawna odpowiedź: ' + q.answer;
    fb.className = 'feedback timeout';
    p1RevealSuggestions(q.answer);
    document.getElementById('p1-next-btn').classList.remove('hidden');
    document.getElementById('p1-next-btn').focus();
}

/* Sprawdzenie odpowiedzi */
function p1CheckAnswer() {
    if (p1Answered) return;
    const input = document.getElementById('p1-answer');
    const val = input.value.trim();
    if (val === '') return;

    clearInterval(timerInterval);
    p1Answered = true;

    const q = p1Questions[p1Index];
    const isCorrect = normalize(val) === normalize(q.answer);
    const fb = document.getElementById('p1-feedback');
    const p = players[currentPlayerIdx];

    if (isCorrect) {
        const bonus = Math.max(1, Math.ceil(9 * timeLeft / MAX_TIME));
        const pts = 10 + bonus;
        p.score += pts;
        document.getElementById('p1-score').textContent = p.score;
        input.className = 'correct';
        fb.innerHTML = '✅ Brawo! +' + pts + ' pkt (10 + ' + bonus + ' za czas)' + (bonus >= 8 ? ' 🎉' : '');
        fb.className = 'feedback correct';
    } else {
        input.className = 'wrong';
        fb.textContent = '❌ Niestety! Poprawna odpowiedź: ' + q.answer;
        fb.className = 'feedback wrong';
    }

    input.disabled = true;
    document.getElementById('p1-check-btn').disabled = true;
    p1RevealSuggestions(q.answer);
    renderScoreboard('p1-scoreboard');
    document.getElementById('p1-next-btn').classList.remove('hidden');
    document.getElementById('p1-next-btn').focus();
}

/* Następna tura / faza */
function p1Next() {
    p1Index++;
    if (p1Index >= p1Questions.length) {
        // koniec fazy 1 → bitwa łuczników
        clearInterval(timerInterval);
        showBattleTransition();
        return;
    }

    currentPlayerIdx = (currentPlayerIdx + 1) % players.length;
    if (currentPlayerIdx === 0) p1Round++;

    if (playerCount > 1) {
        showHandoff('Faza 1: Uzupełnij brakujące słowo!', p1BeginTurn);
    } else {
        p1ShowQuestion();
    }
}

/* ═══════════════════════════════════════════
   FAZA 2 — szubienica
   ═══════════════════════════════════════════ */

function startPhase2() {
    phaseScoreSnapshot = players.map(p => p.score);
    p2TotalRounds = 2 * playerCount;
    p2Words = shuffle(HANGMAN_WORDS).slice(0, p2TotalRounds);
    p2RoundIdx = 0;
    currentPlayerIdx = 0;

    if (playerCount > 1) {
        showHandoff('Faza 2: Szubienica! Podaj literę.', p2BeginRound);
    } else {
        showScreen('phase2-screen');
        p2InitRound();
    }
}

function p2BeginRound() {
    showScreen('phase2-screen');
    p2InitRound();
}

function p2InitRound() {
    const entry = p2Words[p2RoundIdx];
    const wordLower = entry.word.toLowerCase();
    p2State = {
        word: wordLower,
        category: entry.category,
        revealed: new Set(),
        wrong: new Set(),
        solved: false,
        failed: false
    };

    document.getElementById('p2-round').textContent = p2RoundIdx + 1;
    document.getElementById('p2-rounds-total').textContent = p2TotalRounds;
    document.getElementById('p2-hint').innerHTML = 'Kategoria: ' + colorSyllables(entry.category);
    document.getElementById('p2-feedback').className = 'feedback';
    document.getElementById('p2-next-btn').classList.add('hidden');
    document.getElementById('p2-play-area').style.display = '';

    const wordInput = document.getElementById('p2-word-input');
    if (wordInput) { wordInput.value = ''; wordInput.disabled = false; }

    // Zamknij details (zgadnij całe słowo)
    const details = document.querySelector('#phase2-screen details');
    if (details) details.open = false;

    p2RenderWord();
    p2RenderWrongCounter();
    p2RenderAlphabet();
    p2UpdateUI();
}

function p2UpdateUI() {
    const p = players[currentPlayerIdx];
    setBanner('p2-banner', p);
    document.getElementById('p2-score').textContent = p.score;
    renderScoreboard('p2-scoreboard');
}

function p2RenderWord() {
    const container = document.getElementById('word-display');
    container.innerHTML = '';
    for (const ch of p2State.word) {
        const div = document.createElement('div');
        div.className = 'word-letter';
        if (p2State.revealed.has(ch)) {
            div.textContent = ch;
            div.classList.add('revealed');
        } else if (p2State.failed) {
            div.textContent = ch;
            div.classList.add('fail');
        }
        container.appendChild(div);
    }
}

function p2RenderWrongCounter() {
    const el = document.getElementById('wrong-counter');
    const wrongArr = [...p2State.wrong];
    el.innerHTML = 'Błędy: <span class="wrong-x">' + p2State.wrong.size + '</span> / ' + MAX_WRONG;
    if (wrongArr.length > 0) {
        el.innerHTML += '&nbsp;&nbsp;(' + wrongArr.join(', ') + ')';
    }
}

function p2RenderAlphabet() {
    const grid = document.getElementById('alphabet-grid');
    grid.innerHTML = '';
    for (const letter of POLISH_ALPHABET) {
        const btn = document.createElement('button');
        btn.className = 'alpha-btn';
        btn.textContent = letter;
        btn.dataset.letter = letter;

        if (p2State.revealed.has(letter)) {
            btn.classList.add('hit');
            btn.disabled = true;
        } else if (p2State.wrong.has(letter)) {
            btn.classList.add('miss');
            btn.disabled = true;
        }

        btn.addEventListener('click', () => p2GuessLetter(letter));
        grid.appendChild(btn);
    }
}

function p2IsWordSolved() {
    for (const ch of p2State.word) {
        if (!p2State.revealed.has(ch)) return false;
    }
    return true;
}

function p2GuessLetter(letter) {
    if (p2State.solved || p2State.failed) return;
    letter = letter.toLowerCase();

    if (p2State.revealed.has(letter) || p2State.wrong.has(letter)) return;

    const fb = document.getElementById('p2-feedback');
    const p = players[currentPlayerIdx];

    if (p2State.word.includes(letter)) {
        // Trafiona litera
        p2State.revealed.add(letter);
        const count = [...p2State.word].filter(c => c === letter).length;
        const pts = count * 2;
        p.score += pts;

        fb.innerHTML = '✅ Litera „' + letter + '" — +' + pts + ' pkt!';
        fb.className = 'feedback correct';

        // Zaznacz przycisk
        const btn = document.querySelector(`.alpha-btn[data-letter="${letter}"]`);
        if (btn) { btn.classList.add('hit'); btn.disabled = true; }

        if (p2IsWordSolved()) {
            p2State.solved = true;
            p.score += 5; // bonus za ukończenie
            fb.innerHTML = '🎉 Słowo odgadnięte! Bonus +5 pkt!';
            fb.className = 'feedback correct';
            p2EndRound();
        } else {
            // Przy trafieniu — kolejka pozostaje u tego samego gracza (nie rotujemy)
        }
    } else {
        // Pudło
        p2State.wrong.add(letter);

        const btn = document.querySelector(`.alpha-btn[data-letter="${letter}"]`);
        if (btn) { btn.classList.add('miss'); btn.disabled = true; }

        if (p2State.wrong.size >= MAX_WRONG) {
            p2State.failed = true;
            fb.innerHTML = '💀 Koniec szans! Słowo: <strong>' + p2State.word + '</strong>';
            fb.className = 'feedback wrong';
            p2EndRound();
        } else {
            fb.innerHTML = '❌ Nie ma litery „' + letter + '"!';
            fb.className = 'feedback wrong';
        }
    }

    p2RenderWord();
    p2RenderWrongCounter();
    p2UpdateUI();
}

function p2GuessWord() {
    if (p2State.solved || p2State.failed) return;
    const input = document.getElementById('p2-word-input');
    const val = input.value.trim();
    if (val === '') return;

    const fb = document.getElementById('p2-feedback');
    const p = players[currentPlayerIdx];

    if (normalize(val) === normalize(p2State.word)) {
        // Zgadnięte!
        p2State.solved = true;
        // Punkty za nieodkryte litery + bonus
        const unrevealed = new Set();
        for (const ch of p2State.word) {
            if (!p2State.revealed.has(ch)) unrevealed.add(ch);
        }
        const pts = unrevealed.size * 2 + 10;
        p.score += pts;

        // Odkryj wszystkie litery
        for (const ch of p2State.word) p2State.revealed.add(ch);

        fb.innerHTML = '🎉 Brawo! Całe słowo zgadnięte! +' + pts + ' pkt!';
        fb.className = 'feedback correct';
        p2RenderWord();
        p2EndRound();
    } else {
        // Błędne zgadnięcie całego słowa — liczy się jak pudło
        p2State.wrong.add('(' + val + ')');

        if (p2State.wrong.size >= MAX_WRONG) {
            p2State.failed = true;
            fb.innerHTML = '💀 Koniec szans! Słowo: <strong>' + p2State.word + '</strong>';
            fb.className = 'feedback wrong';
            // Odkryj słowo
            for (const ch of p2State.word) p2State.revealed.add(ch);
            p2RenderWord();
            p2EndRound();
        } else {
            fb.innerHTML = '❌ To nie to słowo!';
            fb.className = 'feedback wrong';
        }
    }

    input.value = '';
    p2RenderWrongCounter();
    p2UpdateUI();
}

function p2EndRound() {
    // Zablokuj interfejs
    document.getElementById('p2-play-area').style.display = 'none';
    document.getElementById('p2-next-btn').classList.remove('hidden');
    document.getElementById('p2-next-btn').focus();
}

function p2NextRound() {
    p2RoundIdx++;
    if (p2RoundIdx >= p2TotalRounds) {
        showBattleTransition();
        return;
    }
    currentPlayerIdx = (currentPlayerIdx + 1) % players.length;

    if (playerCount > 1) {
        showHandoff('Faza 2: Szubienica! Odgadnij słowo.', p2BeginRound);
    } else {
        p2InitRound();
    }
}

/* ═══════════════════════════════════════════
   FAZA 3 — tłumaczenie z angielskiego
   ═══════════════════════════════════════════ */

function startPhase3() {
    phaseScoreSnapshot = players.map(p => p.score);
    const totalWords = P3_TURNS_PER_PLAYER * playerCount;
    p3Words = shuffle(TRANSLATION_WORDS).slice(0, totalWords);
    p3Index = 0;
    p3Round = 1;
    currentPlayerIdx = 0;

    document.getElementById('p3-rounds-total').textContent = P3_TURNS_PER_PLAYER;

    if (playerCount === 1) {
        showScreen('phase3-screen');
        p3ShowQuestion();
    } else {
        showHandoff('Faza 3: Przetłumacz słowo na polski!', p3BeginTurn);
    }
}

function p3BeginTurn() {
    showScreen('phase3-screen');
    p3ShowQuestion();
}

function p3ShowQuestion() {
    const entry = p3Words[p3Index];
    document.getElementById('p3-english-word').innerHTML = colorSyllables(entry.en);
    document.getElementById('p3-round').textContent = p3Round;

    const p = players[currentPlayerIdx];
    setBanner('p3-banner', p);
    document.getElementById('p3-score').textContent = p.score;

    const input = document.getElementById('p3-answer');
    input.value = '';
    input.disabled = false;
    input.className = '';
    document.getElementById('p3-check-btn').disabled = false;
    document.getElementById('p3-feedback').className = 'feedback';
    document.getElementById('p3-next-btn').classList.add('hidden');

    renderScoreboard('p3-scoreboard');
    p3Answered = false;
    input.focus();
}

function p3CheckAnswer() {
    if (p3Answered) return;
    const input = document.getElementById('p3-answer');
    const val = input.value.trim();
    if (val === '') return;

    p3Answered = true;
    const entry = p3Words[p3Index];
    const fb = document.getElementById('p3-feedback');
    const p = players[currentPlayerIdx];

    // Sprawdź dokładne dopasowanie (z polskimi znakami)
    const exactMatch = entry.pl.some(ans => val.toLowerCase() === ans.toLowerCase());
    // Sprawdź dopasowanie znormalizowane (bez polskich znaków)
    const normalizedMatch = entry.pl.some(ans => normalize(val) === normalize(ans));

    if (exactMatch) {
        p.score += P3_POINTS_EXACT;
        document.getElementById('p3-score').textContent = p.score;
        input.className = 'correct';
        fb.innerHTML = '✅ Brawo! +' + P3_POINTS_EXACT + ' pkt!';
        fb.className = 'feedback correct';
    } else if (normalizedMatch) {
        p.score += P3_POINTS_NORMALIZED;
        document.getElementById('p3-score').textContent = p.score;
        input.className = 'correct';
        fb.innerHTML = '✅ Dobrze! +' + P3_POINTS_NORMALIZED + ' pkt — ale pamiętaj o polskich znakach: <strong>' + entry.pl[0] + '</strong>';
        fb.className = 'feedback correct';
    } else {
        input.className = 'wrong';
        fb.innerHTML = '❌ Niestety! Poprawna odpowiedź: <strong>' + entry.pl[0] + '</strong>';
        fb.className = 'feedback wrong';
    }

    input.disabled = true;
    document.getElementById('p3-check-btn').disabled = true;
    renderScoreboard('p3-scoreboard');
    document.getElementById('p3-next-btn').classList.remove('hidden');
    document.getElementById('p3-next-btn').focus();
}

function p3Next() {
    p3Index++;
    if (p3Index >= p3Words.length) {
        showBattleTransition();
        return;
    }

    currentPlayerIdx = (currentPlayerIdx + 1) % players.length;
    if (currentPlayerIdx === 0) p3Round++;

    if (playerCount > 1) {
        showHandoff('Faza 3: Przetłumacz słowo na polski!', p3BeginTurn);
    } else {
        p3ShowQuestion();
    }
}

/* ═══════════════════════════════════════════
   FAZA 4 — quiz o Polsce
   ═══════════════════════════════════════════ */

function startQuiz() {
    phaseScoreSnapshot = players.map(p => p.score);
    const total = PQ_TURNS_PER_PLAYER * playerCount;
    pqQuestions = shuffle(POLAND_QUIZ).slice(0, total);
    pqIndex = 0;
    pqRound = 1;
    currentPlayerIdx = 0;

    document.getElementById('pq-rounds-total').textContent = PQ_TURNS_PER_PLAYER;

    if (playerCount === 1) {
        showScreen('quiz-screen');
        pqShowQuestion();
    } else {
        showHandoff('Faza 4: Wiedza o Polsce!', pqBeginTurn);
    }
}

function pqBeginTurn() {
    showScreen('quiz-screen');
    pqShowQuestion();
}

function pqShowQuestion() {
    const q = pqQuestions[pqIndex];
    document.getElementById('pq-question').innerHTML = colorSyllables(q.question);
    document.getElementById('pq-round').textContent = pqRound;

    const p = players[currentPlayerIdx];
    setBanner('pq-banner', p);
    document.getElementById('pq-score').textContent = p.score;

    document.getElementById('pq-feedback').className = 'feedback';
    document.getElementById('pq-next-btn').classList.add('hidden');

    // Render options
    const letters = ['A', 'B', 'C', 'D'];
    const container = document.getElementById('pq-options');
    container.innerHTML = '';
    q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option-btn';
        btn.innerHTML = `<span class="opt-letter">${letters[i]}</span>${opt}`;
        btn.onclick = () => pqAnswer(i);
        container.appendChild(btn);
    });

    renderScoreboard('pq-scoreboard');
    pqAnswered = false;
}

function pqAnswer(chosen) {
    if (pqAnswered) return;
    pqAnswered = true;

    const q = pqQuestions[pqIndex];
    const fb = document.getElementById('pq-feedback');
    const p = players[currentPlayerIdx];
    const btns = document.querySelectorAll('#pq-options .quiz-option-btn');

    // Disable all buttons
    btns.forEach(b => b.disabled = true);

    // Highlight correct and wrong
    btns[q.correct].classList.add('correct');
    if (chosen !== q.correct) {
        btns[chosen].classList.add('wrong');
    }

    if (chosen === q.correct) {
        p.score += PQ_POINTS;
        document.getElementById('pq-score').textContent = p.score;
        fb.innerHTML = '✅ Brawo! +' + PQ_POINTS + ' pkt!';
        fb.className = 'feedback correct';
    } else {
        fb.innerHTML = '❌ Niestety! Poprawna odpowiedź: <strong>' + q.options[q.correct] + '</strong>';
        fb.className = 'feedback wrong';
    }

    renderScoreboard('pq-scoreboard');
    document.getElementById('pq-next-btn').classList.remove('hidden');
    document.getElementById('pq-next-btn').focus();
}

function pqNext() {
    pqIndex++;
    if (pqIndex >= pqQuestions.length) {
        showBattleTransition();
        return;
    }

    currentPlayerIdx = (currentPlayerIdx + 1) % players.length;
    if (currentPlayerIdx === 0) pqRound++;

    if (playerCount > 1) {
        showHandoff('Faza 4: Wiedza o Polsce!', pqBeginTurn);
    } else {
        pqShowQuestion();
    }
}

/* ═══════════════════════════════════════════
   PRZEJŚCIE DO BITWY ŁUCZNIKÓW
   ═══════════════════════════════════════════ */

function showBattleTransition() {
    // Przy jednym graczu pomijamy bitwę
    if (playerCount === 1) {
        afterBattleRound();
        return;
    }

    // Oblicz strzały z punktów zdobytych w tej fazie
    players.forEach((p, i) => {
        const phasePoints = p.score - phaseScoreSnapshot[i];
        p.shots = Math.max(1, Math.floor(phasePoints / 5));
    });

    // Aktualizuj tytuł
    document.getElementById('battle-transition-title').textContent =
        'Bitwa po ' + BATTLE_PHASE_NAMES[battleRound] + '!';

    const container = document.getElementById('shots-summary');
    container.innerHTML = '';
    players.forEach((p, i) => {
        const phasePoints = p.score - phaseScoreSnapshot[i];
        const row = document.createElement('div');
        row.className = 'shots-row';
        row.innerHTML =
            `<span class="sb-dot" style="background:${p.color}"></span>` +
            `<span>${p.name}: +${phasePoints} pkt → <strong>${p.shots} strzał${p.shots === 1 ? '' : p.shots < 5 ? 'y' : 'ów'}</strong></span>`;
        container.appendChild(row);
    });

    showScreen('battle-transition-screen');
}

function afterBattleRound() {
    battleRound++;
    // Snapshot scores for next phase
    phaseScoreSnapshot = players.map(p => p.score);
    if (battleRound < 4) {
        AFTER_BATTLE[battleRound - 1]();
    } else {
        AFTER_BATTLE[3]();
    }
}

/* ═══════════════════════════════════════════
   FAZA 4 — oblężenie zamków
   ═══════════════════════════════════════════ */

const C_GRAVITY = 0.15;
const C_HITS_TO_WIN = 7;
const C_CW = 36, C_CH = 42;

let cCanvas, cCtx, cW, cH;
let cTerrain = [];
let cCastles = [];
let cProjectile = null;
let cParticles = [];
let cTrail = [];
let cWind = 0;
let cCanFire = true;
let cGameOver = false;
let cAimDir = 1;
let cAlivePlayers = [];
let cBaseGround;
let cFireArrow = false; // true = paląca strzała (dmg 2, koszt 2)

let cLayout = []; // generated randomly each game

function startBattleRound() {
    cCanvas = document.getElementById('castle-canvas');
    cCtx = cCanvas.getContext('2d');
    cW = cCanvas.width;
    cH = cCanvas.height;
    cBaseGround = cH - 50;

    if (!cInitialized) {
        // First battle round: generate terrain and castles
        cGenerateLayout();
        cBuildTerrain();
        cInitCastles();
        cInitialized = true;
    } else {
        // Subsequent rounds: regenerate terrain, reposition castles, keep HP/items
        cGenerateLayout();
        cBuildTerrain();
        // Update castle positions while preserving HP, shield, armor
        cLayout.forEach((cfg, i) => {
            const gy = cTerrainAt(cfg.x);
            cCastles[i].x = cfg.x - C_CW / 2;
            cCastles[i].y = gy - C_CH;
            cCastles[i].groundY = gy;
        });
    }

    cAlivePlayers = [];
    for (let i = 0; i < playerCount; i++) {
        if (cCastles[i].alive) cAlivePlayers.push(i);
    }

    // Find first alive player with shots
    currentPlayerIdx = cAlivePlayers.find(i => players[i].shots > 0) || cAlivePlayers[0];
    cAimDir = 1;
    cGameOver = false;
    cProjectile = null;
    cParticles = [];
    cTrail = [];
    cCanFire = true;

    cRandomWind();
    cSetDefaultDir();
    cResetArrowToggle();
    cUpdateTurnUI();
    showScreen('phase4-screen');
    cDraw();

    // Slider events
    document.getElementById('castle-angle').oninput = function() {
        document.getElementById('castle-angle-val').textContent = this.value + '°';
        cDraw();
    };
    document.getElementById('castle-power').oninput = function() {
        document.getElementById('castle-power-val').textContent = this.value;
        cDraw();
    };
}

function cGenerateLayout() {
    // Losowe pozycje zamków z minimalnym odstępem
    const margin = 70;        // od krawędzi
    const minGap = 120;       // minimalny odstęp między zamkami
    const positions = [];

    for (let i = 0; i < playerCount; i++) {
        let attempts = 0;
        let cx;
        do {
            cx = margin + Math.random() * (cW - 2 * margin);
            attempts++;
        } while (attempts < 200 && positions.some(px => Math.abs(px - cx) < minGap));
        positions.push(cx);
    }

    // Sortuj pozycje od lewej do prawej
    positions.sort((a, b) => a - b);

    // Losowe wzgórza (0-70px)
    cLayout = positions.map(cx => ({
        x: cx,
        hill: Math.random() * 70
    }));
}

function cBuildTerrain() {
    cTerrain = new Array(cW);
    for (let x = 0; x < cW; x++) cTerrain[x] = cBaseGround;

    cLayout.forEach(cfg => {
        if (cfg.hill > 10) {
            const hillWidth = 80 + Math.random() * 40;
            for (let x = 0; x < cW; x++) {
                const dist = Math.abs(x - cfg.x);
                if (dist < hillWidth) {
                    const t = 1 - dist / hillWidth;
                    cTerrain[x] -= cfg.hill * (0.5 + 0.5 * Math.cos(Math.PI * (1 - t)));
                }
            }
        }
    });

    // Delikatne nierówności
    const seed1 = Math.random() * 10, seed2 = Math.random() * 10;
    for (let x = 0; x < cW; x++) {
        cTerrain[x] += Math.sin(x * 0.015 + seed1) * 3 + Math.sin(x * 0.04 + seed2) * 1.5;
    }
}

function cTerrainAt(x) {
    return cTerrain[Math.max(0, Math.min(cW - 1, Math.round(x)))];
}

function cInitCastles() {
    cCastles = cLayout.map((cfg, i) => {
        const gy = cTerrainAt(cfg.x);
        return {
            x: cfg.x - C_CW / 2, y: gy - C_CH, groundY: gy,
            w: C_CW, h: C_CH, hp: C_HITS_TO_WIN, maxHp: C_HITS_TO_WIN,
            color: players[i].color, alive: true,
            hasShield: false, hasArmor: false
        };
    });
}

/* ─── Castle drawing ─── */

function cDarken(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = Math.max(0, (n >> 16) - amt);
    let g = Math.max(0, ((n >> 8) & 0xff) - amt);
    let b = Math.max(0, (n & 0xff) - amt);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function cDrawSky() {
    const grad = cCtx.createLinearGradient(0, 0, 0, cBaseGround);
    grad.addColorStop(0, '#0a1628');
    grad.addColorStop(0.5, '#1a3050');
    grad.addColorStop(1, '#2a5080');
    cCtx.fillStyle = grad;
    cCtx.fillRect(0, 0, cW, cH);

    cCtx.fillStyle = '#fff';
    for (let i = 0; i < 35; i++) {
        const sx = (i * 137 + 50) % cW;
        const sy = (i * 97 + 20) % (cBaseGround - 70);
        cCtx.fillRect(sx, sy, (i % 3 === 0) ? 2 : 1, (i % 3 === 0) ? 2 : 1);
    }

    cCtx.beginPath(); cCtx.arc(cW / 2, 40, 18, 0, Math.PI * 2);
    cCtx.fillStyle = '#ffe9a0'; cCtx.fill();
    cCtx.beginPath(); cCtx.arc(cW / 2 + 6, 37, 14, 0, Math.PI * 2);
    cCtx.fillStyle = '#0a1628'; cCtx.fill();
}

function cDrawTerrain() {
    cCtx.beginPath();
    cCtx.moveTo(0, cH);
    for (let x = 0; x < cW; x++) cCtx.lineTo(x, cTerrain[x]);
    cCtx.lineTo(cW, cH);
    cCtx.closePath();
    const gG = cCtx.createLinearGradient(0, cBaseGround - 70, 0, cH);
    gG.addColorStop(0, '#3d7a2a');
    gG.addColorStop(0.3, '#2d5a1e');
    gG.addColorStop(1, '#1a3a10');
    cCtx.fillStyle = gG;
    cCtx.fill();

    cCtx.strokeStyle = '#5a9a38'; cCtx.lineWidth = 2;
    cCtx.beginPath(); cCtx.moveTo(0, cTerrain[0]);
    for (let x = 1; x < cW; x += 2) cCtx.lineTo(x, cTerrain[x]);
    cCtx.stroke();
}

function cDrawCastle(c, idx) {
    if (!c.alive) return;
    const dmg = C_HITS_TO_WIN - c.hp;
    const cx = c.x + c.w / 2;
    const baseY = c.groundY;
    const col = cDarken(c.color, dmg * 10);

    // Legs
    cCtx.strokeStyle = col; cCtx.lineWidth = 3;
    cCtx.beginPath();
    cCtx.moveTo(cx - 6, baseY); cCtx.lineTo(cx - 2, baseY - 16);
    cCtx.moveTo(cx + 6, baseY); cCtx.lineTo(cx + 2, baseY - 16);
    cCtx.stroke();

    // Body (torso)
    cCtx.fillStyle = col;
    cCtx.fillRect(cx - 7, baseY - 32, 14, 16);

    // Arms
    cCtx.strokeStyle = col; cCtx.lineWidth = 2.5;
    cCtx.beginPath();
    cCtx.moveTo(cx - 7, baseY - 28); cCtx.lineTo(cx - 14, baseY - 22);
    cCtx.moveTo(cx + 7, baseY - 28); cCtx.lineTo(cx + 14, baseY - 22);
    cCtx.stroke();

    // Head
    cCtx.fillStyle = '#f5cfa0';
    cCtx.beginPath(); cCtx.arc(cx, baseY - 37, 6, 0, Math.PI * 2); cCtx.fill();

    // Hat/helmet
    cCtx.fillStyle = col;
    cCtx.beginPath();
    cCtx.moveTo(cx - 7, baseY - 37); cCtx.lineTo(cx, baseY - 47); cCtx.lineTo(cx + 7, baseY - 37);
    cCtx.fill();

    // Shield (drawn on left side of body)
    if (c.hasShield) {
        cCtx.fillStyle = 'rgba(100,149,237,0.6)';
        cCtx.strokeStyle = '#4169e1'; cCtx.lineWidth = 1.5;
        cCtx.beginPath();
        cCtx.moveTo(cx - 14, baseY - 30);
        cCtx.lineTo(cx - 20, baseY - 28);
        cCtx.lineTo(cx - 20, baseY - 20);
        cCtx.lineTo(cx - 14, baseY - 16);
        cCtx.closePath();
        cCtx.fill(); cCtx.stroke();
    }

    // Armor (drawn as a breastplate on torso)
    if (c.hasArmor) {
        cCtx.fillStyle = 'rgba(192,192,192,0.5)';
        cCtx.strokeStyle = '#888'; cCtx.lineWidth = 1;
        cCtx.fillRect(cx - 6, baseY - 31, 12, 14);
        cCtx.strokeRect(cx - 6, baseY - 31, 12, 14);
        // Cross detail
        cCtx.beginPath();
        cCtx.moveTo(cx, baseY - 31); cCtx.lineTo(cx, baseY - 17);
        cCtx.moveTo(cx - 6, baseY - 24); cCtx.lineTo(cx + 6, baseY - 24);
        cCtx.stroke();
    }

    // Damage indicators (X marks on body)
    cCtx.strokeStyle = '#ff0000'; cCtx.lineWidth = 1.5;
    const maxHp = c.maxHp || C_HITS_TO_WIN;
    const dmgMarks = maxHp - c.hp;
    for (let i = 0; i < Math.min(dmgMarks, 7); i++) {
        const dx = cx - 4 + (i % 3) * 4;
        const dy = baseY - 30 + Math.floor(i / 3) * 5;
        cCtx.beginPath();
        cCtx.moveTo(dx - 2, dy - 2); cCtx.lineTo(dx + 2, dy + 2);
        cCtx.moveTo(dx + 2, dy - 2); cCtx.lineTo(dx - 2, dy + 2);
        cCtx.stroke();
    }

    // HP bar
    const bw = 36, bh = 5;
    const bx = cx - bw / 2, by = baseY - 56;
    cCtx.fillStyle = 'rgba(0,0,0,0.5)'; cCtx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    cCtx.fillStyle = '#444'; cCtx.fillRect(bx, by, bw, bh);
    const pct = c.hp / maxHp;
    cCtx.fillStyle = pct > 0.4 ? '#2ecc71' : pct > 0.2 ? '#f39c12' : '#e74c3c';
    cCtx.fillRect(bx, by, bw * pct, bh);

    cCtx.fillStyle = '#fff'; cCtx.font = 'bold 9px sans-serif'; cCtx.textAlign = 'center';
    cCtx.fillText(c.hp + '/' + maxHp, cx, by - 2);

    // Name
    cCtx.fillStyle = c.color; cCtx.font = 'bold 11px sans-serif';
    cCtx.fillText(players[idx].name, cx, by - 13);

    // Highlight current
    if (idx === currentPlayerIdx && cCanFire && !cGameOver) {
        cCtx.strokeStyle = '#ffd700'; cCtx.lineWidth = 1.5; cCtx.setLineDash([3, 3]);
        cCtx.strokeRect(cx - 16, baseY - 50, 32, 52);
        cCtx.setLineDash([]);
    }
}

function cDrawCannon(idx) {
    const c = cCastles[idx];
    if (!c.alive) return;
    const cx = c.x + c.w / 2;
    const cy = c.groundY - 28; // hand height
    const isActive = idx === currentPlayerIdx && cCanFire && !cGameOver;
    const angle = isActive ? parseInt(document.getElementById('castle-angle').value) : 45;
    const dir = isActive ? cAimDir : (c.x < cW / 2 ? 1 : -1);
    const rad = -angle * Math.PI / 180;
    const bx = Math.cos(rad) * dir, by = Math.sin(rad);
    const aimAngle = Math.atan2(by, bx);

    // Bow
    cCtx.save();
    cCtx.translate(cx, cy);
    cCtx.rotate(aimAngle);

    // Bow arc
    cCtx.strokeStyle = '#8B4513'; cCtx.lineWidth = 2.5;
    cCtx.beginPath();
    cCtx.arc(0, 0, 14, -1.2, 1.2);
    cCtx.stroke();

    // Bowstring
    cCtx.strokeStyle = '#ccc'; cCtx.lineWidth = 1;
    cCtx.beginPath();
    cCtx.moveTo(14 * Math.cos(-1.2), 14 * Math.sin(-1.2));
    cCtx.lineTo(0, 0);
    cCtx.lineTo(14 * Math.cos(1.2), 14 * Math.sin(1.2));
    cCtx.stroke();

    // Arrow
    cCtx.strokeStyle = '#654321'; cCtx.lineWidth = 1.5;
    cCtx.beginPath(); cCtx.moveTo(-4, 0); cCtx.lineTo(20, 0); cCtx.stroke();
    // Arrowhead
    cCtx.fillStyle = '#888';
    cCtx.beginPath();
    cCtx.moveTo(20, 0); cCtx.lineTo(16, -3); cCtx.lineTo(16, 3);
    cCtx.fill();

    cCtx.restore();
}

function cDrawProjectile() {
    if (!cProjectile) return;
    const isFire = cProjectile.isFire;

    // Trail
    if (isFire) {
        cTrail.forEach(tp => {
            cCtx.fillStyle = 'rgba(255,' + Math.floor(100 + tp.life * 100) + ',0,' + (tp.life * 0.7) + ')';
            cCtx.beginPath(); cCtx.arc(tp.x, tp.y, 2.5 * tp.life, 0, Math.PI * 2); cCtx.fill();
        });
    } else {
        cCtx.fillStyle = 'rgba(180,140,80,0.4)';
        cTrail.forEach(tp => {
            cCtx.beginPath(); cCtx.arc(tp.x, tp.y, 1.5 * tp.life, 0, Math.PI * 2); cCtx.fill();
        });
    }

    // Arrow in flight
    const vx = cProjectile.vx, vy = cProjectile.vy;
    const fAngle = Math.atan2(vy, vx);
    cCtx.save();
    cCtx.translate(cProjectile.x, cProjectile.y);
    cCtx.rotate(fAngle);
    // Shaft
    cCtx.strokeStyle = isFire ? '#8B2500' : '#654321'; cCtx.lineWidth = 1.5;
    cCtx.beginPath(); cCtx.moveTo(-10, 0); cCtx.lineTo(8, 0); cCtx.stroke();
    // Head
    cCtx.fillStyle = isFire ? '#ff4400' : '#888';
    cCtx.beginPath(); cCtx.moveTo(8, 0); cCtx.lineTo(5, -2.5); cCtx.lineTo(5, 2.5); cCtx.fill();
    // Fletching
    cCtx.fillStyle = isFire ? '#ff6600' : '#cc4444';
    cCtx.beginPath(); cCtx.moveTo(-10, 0); cCtx.lineTo(-7, -3); cCtx.lineTo(-7, 0); cCtx.fill();
    cCtx.beginPath(); cCtx.moveTo(-10, 0); cCtx.lineTo(-7, 3); cCtx.lineTo(-7, 0); cCtx.fill();
    // Fire glow
    if (isFire) {
        cCtx.fillStyle = 'rgba(255,100,0,0.4)';
        cCtx.beginPath(); cCtx.arc(4, 0, 5, 0, Math.PI * 2); cCtx.fill();
    }
    cCtx.restore();
}

function cDrawParticles() {
    cParticles.forEach(p => {
        cCtx.fillStyle = p.color; cCtx.globalAlpha = p.life;
        cCtx.fillRect(p.x, p.y, p.size, p.size);
    });
    cCtx.globalAlpha = 1;
}

function cDraw() {
    cCtx.clearRect(0, 0, cW, cH);
    cDrawSky();
    cDrawTerrain();
    cCastles.forEach((c, i) => cDrawCastle(c, i));
    cCastles.forEach((_, i) => cDrawCannon(i));
    cDrawProjectile();
    cDrawParticles();
}

/* ─── Castle controls ─── */

function castleToggleArrow() {
    cFireArrow = !cFireArrow;
    const btn = document.getElementById('castle-arrow-btn');
    if (cFireArrow) {
        btn.textContent = '🔥 Paląca (2)';
        btn.className = 'castle-arrow-btn fire';
    } else {
        btn.textContent = '🏹 Zwykła (1)';
        btn.className = 'castle-arrow-btn';
    }
}

function cResetArrowToggle() {
    cFireArrow = false;
    const btn = document.getElementById('castle-arrow-btn');
    btn.textContent = '🏹 Zwykła (1)';
    btn.className = 'castle-arrow-btn';
}

function castleToggleDir() {
    cAimDir *= -1;
    document.getElementById('castle-dir-btn').textContent = cAimDir === -1 ? '← Lewo' : 'Prawo →';
    cDraw();
}

function cSetDefaultDir() {
    const c = cCastles[currentPlayerIdx];
    cAimDir = (c.x + c.w / 2 < cW / 2) ? 1 : -1;
    document.getElementById('castle-dir-btn').textContent = cAimDir === -1 ? '← Lewo' : 'Prawo →';
}

function cRandomWind() {
    cWind = (Math.random() - 0.5) * 0.12;
    const dir = cWind > 0 ? '→' : '←';
    const s = Math.abs(cWind);
    const str = s < 0.02 ? 'Słaby' : s < 0.04 ? 'Umiarkowany' : 'Silny';
    document.getElementById('castle-wind').textContent = 'Wiatr: ' + str + ' ' + dir;
}

function castleBuyShield() {
    if (!cCanFire || cGameOver) return;
    const p = players[currentPlayerIdx];
    if (p.shots < 3) return;
    p.shots -= 3;
    const c = cCastles[currentPlayerIdx];
    c.hp += 1;
    c.maxHp += 1;
    c.hasShield = true;
    cUpdateTurnUI();
    cDraw();
}

function castleBuyArmor() {
    if (!cCanFire || cGameOver) return;
    const p = players[currentPlayerIdx];
    if (p.shots < 3) return;
    p.shots -= 3;
    const c = cCastles[currentPlayerIdx];
    c.hp += 1;
    c.maxHp += 1;
    c.hasArmor = true;
    cUpdateTurnUI();
    cDraw();
}

function cUpdateShopButtons() {
    const p = players[currentPlayerIdx];
    document.getElementById('castle-buy-shield').disabled = !cCanFire || cGameOver || p.shots < 3;
    document.getElementById('castle-buy-armor').disabled = !cCanFire || cGameOver || p.shots < 3;
}

function cUpdateTurnUI() {
    const p = players[currentPlayerIdx];
    const el = document.getElementById('castle-turn-name');
    el.textContent = p.name;
    el.style.color = p.color;
    document.getElementById('castle-shots-left').textContent = p.shots;
    cUpdateShopButtons();
}

/* ─── Castle fire ─── */

function castleFire() {
    if (!cCanFire || cGameOver) return;
    const p = players[currentPlayerIdx];
    const cost = cFireArrow ? 2 : 1;
    if (p.shots < cost) return;

    cCanFire = false;
    document.getElementById('castle-fire-btn').disabled = true;
    p.shots -= cost;
    document.getElementById('castle-shots-left').textContent = p.shots;

    const c = cCastles[currentPlayerIdx];
    const cx = c.x + c.w / 2, cy = c.groundY - 28;
    const angle = parseInt(document.getElementById('castle-angle').value);
    const power = parseInt(document.getElementById('castle-power').value) * 0.3;
    const rad = -angle * Math.PI / 180;
    const bx = Math.cos(rad) * cAimDir, by = Math.sin(rad);

    cProjectile = {
        x: cx + bx * 24, y: cy + by * 24,
        vx: bx * power, vy: by * power,
        isFire: cFireArrow,
        damage: cFireArrow ? 2 : 1
    };
    cTrail = [];
    requestAnimationFrame(cUpdateProjectile);
}

function cUpdateProjectile() {
    if (!cProjectile) return;

    cProjectile.vx += cWind;
    cProjectile.vy += C_GRAVITY;
    cProjectile.x += cProjectile.vx;
    cProjectile.y += cProjectile.vy;

    cTrail.push({ x: cProjectile.x, y: cProjectile.y, r: 2.5 + Math.random() * 1.5, life: 1 });
    cTrail = cTrail.filter(tp => { tp.life -= 0.05; return tp.life > 0; });

    // Hit check
    for (let i = 0; i < cCastles.length; i++) {
        if (i === currentPlayerIdx || !cCastles[i].alive) continue;
        const oc = cCastles[i];
        if (cProjectile.x > oc.x && cProjectile.x < oc.x + oc.w &&
            cProjectile.y > oc.y && cProjectile.y < oc.y + oc.h) {
            oc.hp -= cProjectile.damage;
            if (oc.hp < 0) oc.hp = 0;
            const hitColor = cProjectile.isFire ? '#ff4400' : players[currentPlayerIdx].color;
            cSpawnExplosion(cProjectile.x, cProjectile.y, hitColor);
            if (cProjectile.isFire) cSpawnExplosion(cProjectile.x, cProjectile.y, '#ff8800');
            cProjectile = null;
            if (oc.hp <= 0) {
                oc.alive = false;
                cAlivePlayers = cAlivePlayers.filter(p => p !== i);
                cSpawnExplosion(oc.x + oc.w / 2, oc.y + oc.h / 2, oc.color);
            }
            if (cAlivePlayers.length <= 1) {
                setTimeout(() => cEndGame(cAlivePlayers[0]), 500);
            } else {
                setTimeout(cNextTurn, 700);
            }
            cDraw();
            return;
        }
    }

    // Ground / OOB
    const groundHere = cTerrainAt(cProjectile.x);
    if (cProjectile.y > groundHere || cProjectile.x < -20 || cProjectile.x > cW + 20) {
        if (cProjectile.y >= groundHere - 4 && cProjectile.x > 0 && cProjectile.x < cW) {
            cSpawnExplosion(cProjectile.x, groundHere - 2, '#8B7355');
        }
        cProjectile = null;
        setTimeout(cNextTurn, 500);
        cDraw();
        return;
    }

    cDraw();
    requestAnimationFrame(cUpdateProjectile);
}

function cSpawnExplosion(x, y, color) {
    for (let i = 0; i < 24; i++) {
        cParticles.push({
            x, y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5 - 1.5,
            size: 2 + Math.random() * 3,
            life: 1,
            color: i % 3 === 0 ? color : i % 3 === 1 ? '#ff9900' : '#ffcc00'
        });
    }
    cAnimateParticles();
}

function cAnimateParticles() {
    if (cParticles.length === 0) return;
    cParticles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= 0.03; });
    cParticles = cParticles.filter(p => p.life > 0);
    cDraw();
    if (cParticles.length > 0) requestAnimationFrame(cAnimateParticles);
}

/* ─── Castle turns ─── */

function cNextTurn() {
    // Sprawdź czy ktokolwiek ma jeszcze strzały
    const anyShots = cAlivePlayers.some(i => players[i].shots > 0);
    if (!anyShots) {
        // Gra się kończy — wygrywa zamek z największym HP
        let bestIdx = cAlivePlayers[0];
        let bestHp = cCastles[bestIdx].hp;
        for (const i of cAlivePlayers) {
            if (cCastles[i].hp > bestHp) { bestHp = cCastles[i].hp; bestIdx = i; }
        }
        cEndGame(bestIdx);
        return;
    }

    // Następny żywy gracz z strzałami
    let next = currentPlayerIdx;
    do {
        next = (next + 1) % playerCount;
    } while (!cCastles[next].alive || players[next].shots <= 0);

    currentPlayerIdx = next;
    cRandomWind();
    cSetDefaultDir();
    cResetArrowToggle();
    cUpdateTurnUI();
    cCanFire = true;
    document.getElementById('castle-fire-btn').disabled = false;
    cDraw();
}

function cEndGame(winnerIdx) {
    cGameOver = true;

    // If someone was eliminated (only 1 left), bonus points
    if (cAlivePlayers.length <= 1 && winnerIdx !== undefined) {
        players[winnerIdx].score += 10;
    }

    const wc = cCastles[winnerIdx !== undefined ? winnerIdx : 0];
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            cSpawnExplosion(wc.x + Math.random() * wc.w, wc.y - 15 - Math.random() * 30, '#ffd700');
        }, i * 200);
    }

    // If all opponents eliminated, final winner — go to end screen
    if (cAlivePlayers.length <= 1) {
        players[winnerIdx].score += 20;
        setTimeout(showEndScreen, 1500);
    } else {
        // Shots depleted — proceed to next word phase
        setTimeout(afterBattleRound, 1200);
    }
}

/* ═══════════════════════════════════════════
   EKRAN KOŃCOWY
   ═══════════════════════════════════════════ */

function showEndScreen() {
    clearInterval(timerInterval);
    showScreen('end-screen');

    const sorted = [...players].sort((a, b) => b.score - a.score);
    const ranks = ['🥇', '🥈', '🥉', '4.'];
    const lb = document.getElementById('leaderboard');
    lb.innerHTML = '';

    sorted.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'lb-row' + (i === 0 ? ' first' : '');
        row.innerHTML =
            `<span class="lb-rank">${ranks[i] || (i + 1) + '.'}</span>` +
            `<span class="sb-dot" style="background:${p.color}"></span>` +
            `<span class="lb-name">${p.name}</span>` +
            `<span class="lb-score">${p.score} pkt</span>`;
        lb.appendChild(row);
    });
}

function backToSetup() {
    showScreen('setup-screen');
}

/* ═══════════════════════════════════════════
   KLAWIATURA
   ═══════════════════════════════════════════ */

document.addEventListener('keydown', e => {
    const active = document.querySelector('.screen.active');
    if (!active) return;

    // Strzałki dla fazy zamków
    if (active.id === 'phase4-screen') {
        const aEl = document.getElementById('castle-angle');
        const pEl = document.getElementById('castle-power');
        if (e.key === 'ArrowUp') { aEl.value = Math.min(85, +aEl.value + 1); aEl.oninput(); return; }
        if (e.key === 'ArrowDown') { aEl.value = Math.max(5, +aEl.value - 1); aEl.oninput(); return; }
        if (e.key === 'ArrowRight') { pEl.value = Math.min(100, +pEl.value + 2); pEl.oninput(); return; }
        if (e.key === 'ArrowLeft') { pEl.value = Math.max(10, +pEl.value - 2); pEl.oninput(); return; }
        if (e.key === 'd' || e.key === 'D') { castleToggleDir(); return; }
        if (e.key === 'f' || e.key === 'F') { castleToggleArrow(); return; }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); castleFire(); return; }
    }

    if (e.key !== 'Enter') return;

    if (active.id === 'handoff-screen') {
        if (handoffCallback) handoffCallback();
    } else if (active.id === 'phase1-screen') {
        if (!p1Answered) p1CheckAnswer();
        else p1Next();
    } else if (active.id === 'transition-screen') {
        startPhase2();
    } else if (active.id === 'phase2-screen') {
        if (p2State && (p2State.solved || p2State.failed)) {
            p2NextRound();
        }
    } else if (active.id === 'transition2-screen') {
        startPhase3();
    } else if (active.id === 'phase3-screen') {
        if (!p3Answered) p3CheckAnswer();
        else p3Next();
    } else if (active.id === 'transition-quiz-screen') {
        startQuiz();
    } else if (active.id === 'quiz-screen') {
        if (pqAnswered) pqNext();
    } else if (active.id === 'battle-transition-screen') {
        startBattleRound();
    }
});

/* ═══════════════════════════════════════════
   INICJALIZACJA
   ═══════════════════════════════════════════ */

renderPlayerInputs();
