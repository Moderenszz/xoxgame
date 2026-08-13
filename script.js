// Import Firebase SDK (Menggunakan CDN v9+ Modular)
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
    arrayUnion, 
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

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// State Global
let currentUser = null;
let currentPlayerData = null;
let activeMatchId = null;
let mySymbol = ''; // 'X' atau 'O'

// Elemen DOM
const authScreen = document.getElementById('auth-screen');
const gameScreen = document.getElementById('game-screen');
const usernameInput = document.getElementById('auth-username');
const passwordInput = document.getElementById('auth-password');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const authError = document.getElementById('auth-error');
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
// 1. SISTEM AUTENTIKASI (LOGIN & REGISTER)
// ==========================================
// Karena Firebase Auth butuh format email, kita akali dengan mengubah username jadi email palsu (contoh: username@xoxarena.com)

btnRegister.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        authError.textContent = "Username dan password harus diisi!";
        return;
    }

    const email = `${username.toLowerCase()}@xoxarena.com`;
    try {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        // Buat data profil user di Firestore
        await setDoc(doc(db, "users", userCred.user.uid), {
            username: username,
            uid: userCred.user.uid,
            wins: 0,
            loses: 0,
            total: 0,
            status: "online"
        });
        authError.textContent = "";
    } catch (error) {
        authError.textContent = error.message;
    }
});

btnLogin.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        authError.textContent = "Username dan password harus diisi!";
        return;
    }

    const email = `${username.toLowerCase()}@xoxarena.com`;
    try {
        await signInWithEmailAndPassword(auth, email, password);
        authError.textContent = "";
    } catch (error) {
        authError.textContent = "Login gagal: Username atau password salah.";
    }
});

btnLogout.addEventListener('click', async () => {
    if (currentUser) {
        await updateDoc(doc(db, "users", currentUser.uid), { status: "offline" });
    }
    signOut(auth);
});

// Pantau Status Auth
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        authScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');

        // Ambil data user dari Firestore
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            currentPlayerData = userDoc.data();
            displayUsername.textContent = currentPlayerData.username;
            myAvatar.textContent = currentPlayerData.username.charAt(0).toUpperCase();
            updateStatsUI(currentPlayerData);

            // Set status jadi online
            await updateDoc(userDocRef, { status: "online" });
        }

        // Mulai listen daftar pemain online
        loadOnlinePlayers();
    } else {
        currentUser = null;
        currentPlayerData = null;
        gameScreen.classList.add('hidden');
        authScreen.classList.remove('hidden');
    }
});

// ==========================================
// 2. DAFTAR PEMAIN ONLINE & SEARCH
// ==========================================
function loadOnlinePlayers() {
    const usersCol = collection(db, "users");
    onSnapshot(usersCol, (snapshot) => {
        playerListEl.innerHTML = '';
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            // Jangan tampilkan diri sendiri di list
            if (currentUser && data.uid !== currentUser.uid) {
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

// Fitur Search Player
searchPlayerInput.addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    const items = playerListEl.querySelectorAll('.player-item');
    items.forEach(item => {
        const name = item.querySelector('span').textContent.toLowerCase();
        if (name.includes(keyword)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
});

// ==========================================
// 3. SISTEM TANTANGAN & PERTARUNGAN 1V1
// ==========================================
window.challengePlayer = async (targetUid) => {
    // Buat match baru di koleksi 'matches'
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

// Listener Real-time Pertandingan
function listenToMatch(matchId) {
    onSnapshot(doc(db, "matches", matchId), (docSnap) => {
        if (!docSnap.exists()) return;
        const matchData = docSnap.data();

        // Update Papan Game
        matchData.board.forEach((val, idx) => {
            cells[idx].textContent = val;
        });

        // Cek Status Giliran
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

// Aksi Klik Kotak X-O-X
cells.forEach((cell, index) => {
    cell.addEventListener('click', async () => {
        if (!activeMatchId) return;

        const matchRef = doc(db, "matches", activeMatchId);
        const matchDoc = await getDoc(matchRef);
        const matchData = matchDoc.data();

        // Validasi giliran & kotak kosong
        if (matchData.status !== 'playing') return;
        if (matchData.turn !== mySymbol) return;
        if (matchData.board[index] !== "") return;

        // Update papan lokal & database
        let newBoard = matchData.board;
        newBoard[index] = mySymbol;

        const nextTurn = mySymbol === 'X' ? 'O' : 'X';
        const winner = checkWinner(newBoard);

        if (winner) {
            await updateDoc(matchRef, {
                board: newBoard,
                status: 'finished',
                winner: winner
            });
            updateStatsInDB(winner);
        } else {
            await updateDoc(matchRef, {
                board: newBoard,
                turn: nextTurn
            });
        }
    });
});

// Logika Cek Pemenang Tic-Tac-Toe
function checkWinner(board) {
    const winPatterns = [
        [0,1,2], [3,4,5], [6,7,8], // Baris
        [0,3,6], [1,4,7], [2,5,8], // Kolom
        [0,4,8], [2,4,6]  // Diagonal
    ];

    for (let pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }

    if (!board.includes("")) return 'draw';
    return null;
}

// Update Statistik ke Database
async function updateStatsInDB(winner) {
    const userRef = doc(db, "users", currentUser.uid);
    if (winner === mySymbol) {
        await updateDoc(userRef, {
            wins: increment(1),
            total: increment(1)
        });
    } else if (winner !== 'draw') {
        await updateDoc(userRef, {
            loses: increment(1),
            total: increment(1)
        });
    } else {
        await updateDoc(userRef, {
            total: increment(1)
        });
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
