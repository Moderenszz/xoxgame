import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    collection, 
    onSnapshot, 
    increment 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ==========================================
// KONFIGURASI FIREBASE KAMU
// (Ganti dengan kredensial dari Firebase Console kamu)
// ==========================================
const firebaseConfig = {
    apiKey: "GANTI_DENGAN_API_KEY_KAMU",
    authDomain: "GANTI_DENGAN_AUTH_DOMAIN_KAMU",
    projectId: "GANTI_DENGAN_PROJECT_ID_KAMU",
    storageBucket: "GANTI_DENGAN_STORAGE_BUCKET_KAMU",
    messagingSenderId: "GANTI_DENGAN_MESSAGING_SENDER_ID_KAMU",
    appId: "GANTI_DENGAN_APP_ID_KAMU"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// State Global
let currentUser = null;
let currentPlayerData = null;
let activeMatchId = null;
let mySymbol = ''; 

// Elemen DOM Auth
const authScreen = document.getElementById('auth-screen');
const loginBox = document.getElementById('login-box');
const registerBox = document.getElementById('register-box');

const linkToRegister = document.getElementById('link-to-register');
const linkToLogin = document.getElementById('link-to-login');

// Elemen Register
const regUsername = document.getElementById('register-username');
const regEmail = document.getElementById('register-email');
const regPassword = document.getElementById('register-password');
const btnRegister = document.getElementById('btn-register');
const regError = document.getElementById('register-error');

// Elemen Login
const logEmail = document.getElementById('login-email');
const logPassword = document.getElementById('login-password');
const btnLogin = document.getElementById('btn-login');
const logError = document.getElementById('login-error');

// Elemen Game
const gameScreen = document.getElementById('game-screen');
const btnLogout = document.getElementById('btn-logout');
const displayUsername = document.getElementById('display-username');
const myAvatar = document.getElementById('my-avatar');
const statWins = document.getElementById('stat-wins');
const statLoses = document.getElementById('stat-loses');
const statTotal = document.getElementById('stat-total');

const playerListEl = document.getElementById('player-list');
const searchPlayerInput = document.getElementById('search-player');

const welcomeBanner = document.querySelector('.welcome-banner');
const gameBoardContainer = document.getElementById('game-board-container');
const matchStatus = document.getElementById('match-status');
const cells = document.querySelectorAll('.cell');
const btnQuitMatch = document.getElementById('btn-quit-match');

// ==========================================
// 1. TOGGLE FORM LOGIN / REGISTER
// ==========================================
linkToRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginBox.classList.add('hidden');
    registerBox.classList.remove('hidden');
    logError.textContent = "";
});

linkToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerBox.classList.add('hidden');
    loginBox.classList.remove('hidden');
    regError.textContent = "";
});

// ==========================================
// 2. SISTEM REGISTER (Username, Gmail, Password)
// ==========================================
btnRegister.addEventListener('click', async () => {
    const username = regUsername.value.trim();
    const email = regEmail.value.trim();
    const password = regPassword.value.trim();

    if (!username || !email || !password) {
        regError.textContent = "Semua kolom harus diisi!";
        return;
    }

    if (password.length < 6) {
        regError.textContent = "Password minimal 6 karakter!";
        return;
    }

    try {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        
        await setDoc(doc(db, "users", userCred.user.uid), {
            username: username,
            email: email,
            uid: userCred.user.uid,
            wins: 0,
            loses: 0,
            total: 0,
            status: "online"
        });

        regError.textContent = "";
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            regError.textContent = "Email sudah terdaftar!";
        } else {
            regError.textContent = error.message;
        }
    }
});

// ==========================================
// 3. SISTEM LOGIN (Email & Password)
// ==========================================
btnLogin.addEventListener('click', async () => {
    const email = logEmail.value.trim();
    const password = logPassword.value.trim();

    if (!email || !password) {
        logError.textContent = "Email dan password harus diisi!";
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        logError.textContent = "";
    } catch (error) {
        logError.textContent = "Login gagal: Email atau password salah.";
    }
});

// LOGOUT
btnLogout.addEventListener('click', async () => {
    if (currentUser) {
        await updateDoc(doc(db, "users", currentUser.uid), { status: "offline" });
    }
    signOut(auth);
});

// PANTAU STATUS LOGIN
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        authScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');

        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            currentPlayerData = userDoc.data();
            displayUsername.textContent = currentPlayerData.username;
            myAvatar.textContent = currentPlayerData.username.charAt(0).toUpperCase();
            updateStatsUI(currentPlayerData);

            await updateDoc(userDocRef, { status: "online" });
        }

        loadOnlinePlayers();
    } else {
        currentUser = null;
        currentPlayerData = null;
        gameScreen.classList.add('hidden');
        authScreen.classList.remove('hidden');
        
        regPassword.value = '';
        logPassword.value = '';
    }
});

// ==========================================
// 4. DAFTAR PEMAIN ONLINE & SEARCH
// ==========================================
function loadOnlinePlayers() {
    const usersCol = collection(db, "users");
    onSnapshot(usersCol, (snapshot) => {
        playerListEl.innerHTML = '';
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (currentUser && data.uid !== currentUser.uid && data.status === "online") {
                renderPlayerItem(data);
            }
        });
    });
}

function renderPlayerItem(player) {
    const li = document.createElement('li');
    li.className = 'player-item';
    li.innerHTML = `
        <span>${player.username}</span>
        <button onclick="window.challengePlayer('${player.uid}')">Tantang</button>
    `;
    playerListEl.appendChild(li);
}

searchPlayerInput.addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    const items = playerListEl.querySelectorAll('.player-item');
    items.forEach(item => {
        const name = item.querySelector('span').textContent.toLowerCase();
        item.style.display = name.includes(keyword) ? 'flex' : 'none';
    });
});

// ==========================================
// 5. SISTEM GAME X-O-X (Tantangan & Real-time)
// ==========================================
window.challengePlayer = async (targetUid) => {
    const matchRef = doc(collection(db, "matches"));
    await setDoc(matchRef, {
        playerX: currentUser.uid,
        playerO: targetUid,
        board: Array(9).fill(""),
        turn: 'X',
        status: 'playing',
        winner: null
    });

    activeMatchId = matchRef.id;
    mySymbol = 'X';
    startMatchUI();
    listenToMatch(activeMatchId);
};

function startMatchUI() {
    welcomeBanner.classList.add('hidden');
    gameBoardContainer.classList.remove('hidden');
    btnQuitMatch.classList.remove('hidden');
    clearBoardUI();
}

function clearBoardUI() {
    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('x', 'o');
    });
}

function listenToMatch(matchId) {
    onSnapshot(doc(db, "matches", matchId), (docSnap) => {
        if (!docSnap.exists()) return;
        const matchData = docSnap.data();

        matchData.board.forEach((val, idx) => {
            cells[idx].textContent = val;
        });

        if (matchData.status === 'playing') {
            if (matchData.turn === mySymbol) {
                matchStatus.textContent = "Giliran kamu! Silahkan klik kotak.";
            } else {
                matchStatus.textContent = "Menunggu giliran lawan...";
            }
        } else if (matchData.status === 'finished') {
            if (matchData.winner === 'draw') {
                matchStatus.textContent = "Pertandingan Berakhir: SERI!";
            } else if (matchData.winner === mySymbol) {
                matchStatus.textContent = "Selamat! Kamu MENANG!";
            } else {
                matchStatus.textContent = "Sayang sekali, Kamu KALAH!";
            }
            btnQuitMatch.classList.remove('hidden');
        }
    });
}

cells.forEach((cell, index) => {
    cell.addEventListener('click', async () => {
        if (!activeMatchId) return;

        const matchRef = doc(db, "matches", activeMatchId);
        const matchDoc = await getDoc(matchRef);
        const matchData = matchDoc.data();

        if (matchData.status !== 'playing' || matchData.turn !== mySymbol || matchData.board[index] !== "") return;

        let newBoard = matchData.board;
        newBoard[index] = mySymbol;

        const nextTurn = mySymbol === 'X' ? 'O' : 'X';
        const winner = checkWinner(newBoard);

        if (winner) {
            await updateDoc(matchRef, { board: newBoard, status: 'finished', winner: winner });
            updateStatsInDB(winner);
        } else {
            await updateDoc(matchRef, { board: newBoard, turn: nextTurn });
        }
    });
});

function checkWinner(board) {
    const winPatterns = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (let [a, b, c] of winPatterns) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    if (!board.includes("")) return 'draw';
    return null;
}

async function updateStatsInDB(winner) {
    const userRef = doc(db, "users", currentUser.uid);
    if (winner === mySymbol) {
        await updateDoc(userRef, { wins: increment(1), total: increment(1) });
    } else if (winner !== 'draw') {
        await updateDoc(userRef, { loses: increment(1), total: increment(1) });
    } else {
        await updateDoc(userRef, { total: increment(1) });
    }
}

function updateStatsUI(data) {
    statWins.textContent = data.wins || 0;
    statLoses.textContent = data.loses || 0;
    statTotal.textContent = data.total || 0;
}

btnQuitMatch.addEventListener('click', () => {
    activeMatchId = null;
    gameBoardContainer.classList.add('hidden');
    welcomeBanner.classList.remove('hidden');
    btnQuitMatch.classList.add('hidden');
    matchStatus.textContent = "Menunggu lawan...";
});
