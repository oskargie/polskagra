/* ═══════════════════════════════════════════
   POLSKIE SŁÓWKA — logika gry
   ═══════════════════════════════════════════ */

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#27ae60', '#f39c12'];
const PLAYER_DEFAULTS = ['Gracz 1', 'Gracz 2', 'Gracz 3', 'Gracz 4'];
const SUGGESTION_LETTERS = ['A', 'B', 'C', 'D'];
const MAX_TIME = 90;
const TOTAL_ROUNDS = 5;
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
const P3_TURNS_PER_PLAYER = 3;
const P3_POINTS_EXACT = 7;
const P3_POINTS_NORMALIZED = 5;
let p3Words = [];
let p3Index = 0;
let p3Round = 0;
let p3Answered = false;

// Jaka akcja po kliknięciu "Gotowy" na handoff
let handoffCallback = null;

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
        parts[0] + '<span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>' + (parts[1] || '');
    document.getElementById('p1-hint').textContent = 'Podpowiedź: ' + q.hint;
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
        const pts = Math.max(1, Math.round(10 * timeLeft / MAX_TIME));
        p.score += pts;
        document.getElementById('p1-score').textContent = p.score;
        input.className = 'correct';
        fb.innerHTML = '✅ Brawo! +' + pts + ' pkt' + (pts >= 9 ? ' 🎉' : '');
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
        // koniec fazy 1 → przejście do fazy 2
        clearInterval(timerInterval);
        showScreen('transition-screen');
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
    document.getElementById('p2-hint').textContent = 'Kategoria: ' + entry.category;
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

            // Rotacja do następnego gracza
            if (playerCount > 1) {
                currentPlayerIdx = (currentPlayerIdx + 1) % players.length;
            }
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
            if (playerCount > 1) {
                currentPlayerIdx = (currentPlayerIdx + 1) % players.length;
            }
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
        showScreen('transition2-screen');
        return;
    }
    currentPlayerIdx = (currentPlayerIdx + 1) % players.length;

    if (playerCount > 1) {
        showHandoff('Faza 2: Szubienica! Runda ' + (p2RoundIdx + 1), p2BeginRound);
    } else {
        p2InitRound();
    }
}

/* ═══════════════════════════════════════════
   FAZA 3 — tłumaczenie z angielskiego
   ═══════════════════════════════════════════ */

function startPhase3() {
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
    document.getElementById('p3-english-word').textContent = entry.en;
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
        showEndScreen();
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
    if (e.key !== 'Enter') return;
    const active = document.querySelector('.screen.active');
    if (!active) return;

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
    }
});

/* ═══════════════════════════════════════════
   INICJALIZACJA
   ═══════════════════════════════════════════ */

renderPlayerInputs();
