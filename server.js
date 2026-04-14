const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database setup ───────────────────────────────────────────────────────────

const db = new Database(path.join(__dirname, 'bingo.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS themes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_slug TEXT NOT NULL,
    set_letter TEXT NOT NULL,
    card_number INTEGER NOT NULL,
    songs TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    theme_slug TEXT NOT NULL,
    set_letter TEXT NOT NULL,
    round INTEGER NOT NULL,
    win_conditions TEXT NOT NULL,
    songs_called TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'registration',
    created_at INTEGER NOT NULL
  );
`);

// Seed demo data if no themes exist yet
const themeCount = db.prepare('SELECT COUNT(*) as c FROM themes').get();
if (themeCount.c === 0) {
  require('./seed')(db);
}

// ── Session state (in memory for speed) ─────────────────────────────────────

let activeSessions = {};

// ── REST API ─────────────────────────────────────────────────────────────────

// Get all themes
app.get('/api/themes', (req, res) => {
  const themes = db.prepare('SELECT * FROM themes').all();
  res.json(themes);
});

// Create a new session (host opens registration)
app.post('/api/session', (req, res) => {
  const { venueCode, themeSlug, setLetter, round, winConditions } = req.body;
  const code = venueCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code || code.length < 3) return res.status(400).json({ error: 'Invalid venue code' });

  // Close any existing session with this code
  db.prepare('DELETE FROM sessions WHERE id = ?').run(code);

  db.prepare(`
    INSERT INTO sessions (id, theme_slug, set_letter, round, win_conditions, songs_called, status, created_at)
    VALUES (?, ?, ?, ?, ?, '[]', 'registration', ?)
  `).run(code, themeSlug, setLetter, round, JSON.stringify(winConditions), Date.now());

  activeSessions[code] = {
    venueCode: code,
    themeSlug,
    setLetter,
    round,
    winConditions,
    songsCalled: [],
    players: {},
    status: 'registration'
  };

  res.json({ success: true, venueCode: code });
});

// Player joins — look up their card
app.post('/api/join', (req, res) => {
  const { venueCode, cardNumber } = req.body;
  const code = venueCode.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const session = activeSessions[code];
  if (!session) return res.status(404).json({ error: 'Session not found. Check your venue code.' });
  if (session.status === 'ended') return res.status(400).json({ error: 'This round has ended.' });

  const card = db.prepare(`
    SELECT * FROM cards
    WHERE theme_slug = ? AND set_letter = ? AND card_number = ?
  `).get(session.themeSlug, session.setLetter, parseInt(cardNumber));

  if (!card) return res.status(404).json({ error: 'Card not found. Check your card number.' });

  const songs = JSON.parse(card.songs);
  const themeName = db.prepare('SELECT name FROM themes WHERE slug = ?').get(session.themeSlug)?.name || session.themeSlug;

  res.json({
    venueCode: code,
    cardNumber: parseInt(cardNumber),
    songs,
    themeName,
    setLetter: session.setLetter,
    round: session.round,
    winConditions: session.winConditions,
    songsCalled: session.songsCalled
  });
});

// Get session info (host polling)
app.get('/api/session/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const session = activeSessions[code];
  if (!session) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...session,
    playerCount: Object.keys(session.players).length
  });
});

// ── Socket.io real-time ───────────────────────────────────────────────────────

io.on('connection', (socket) => {

  // Host joins their session room
  socket.on('host:join', ({ venueCode }) => {
    const code = venueCode.toUpperCase();
    socket.join('host:' + code);
    socket.join('session:' + code);
    socket.venueCode = code;
    socket.role = 'host';
    console.log(`Host joined session ${code}`);
  });

  // Player joins their session room
  socket.on('player:join', ({ venueCode, cardNumber }) => {
    const code = venueCode.toUpperCase();
    socket.join('session:' + code);
    socket.venueCode = code;
    socket.cardNumber = cardNumber;
    socket.role = 'player';

    const session = activeSessions[code];
    if (session) {
      session.players[socket.id] = { cardNumber, socketId: socket.id };
      const count = Object.keys(session.players).length;
      io.to('host:' + code).emit('session:player_count', { count });
      io.to('host:' + code).emit('session:player_joined', { cardNumber, count });
    }

    console.log(`Player card ${cardNumber} joined session ${code}`);
  });

  // Host starts the game
  socket.on('host:start', ({ venueCode }) => {
    const code = venueCode.toUpperCase();
    const session = activeSessions[code];
    if (!session) return;
    session.status = 'active';
    db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('active', code);
    io.to('session:' + code).emit('session:started', {});
    console.log(`Session ${code} started`);
  });

  // Host calls a song (from ACRCloud detection)
  socket.on('host:song_called', ({ venueCode, song }) => {
    const code = venueCode.toUpperCase();
    const session = activeSessions[code];
    if (!session) return;

    // Avoid duplicates
    const alreadyCalled = session.songsCalled.find(s => s.title === song.title);
    if (alreadyCalled) return;

    session.songsCalled.push(song);
    db.prepare('UPDATE sessions SET songs_called = ? WHERE id = ?')
      .run(JSON.stringify(session.songsCalled), code);

    // Broadcast to all players in this session
    io.to('session:' + code).emit('session:song_called', {
      song,
      totalCalled: session.songsCalled.length
    });

    console.log(`Song called in ${code}: ${song.title}`);
  });

  // Player claims bingo
  socket.on('player:bingo_claim', ({ venueCode, cardNumber, claimType, markedSquares }) => {
    const code = venueCode.toUpperCase();
    const session = activeSessions[code];
    if (!session) return;

    // Verify claim server-side
    const card = db.prepare(`
      SELECT songs FROM cards
      WHERE theme_slug = ? AND set_letter = ? AND card_number = ?
    `).get(session.themeSlug, session.setLetter, cardNumber);

    if (!card) return;

    const songs = JSON.parse(card.songs);
    const calledTitles = new Set(session.songsCalled.map(s => s.title));

    // Check each marked square is actually a called song
    const validMarks = markedSquares.filter(idx => {
      if (idx === 12) return true; // free square
      const song = songs[idx];
      return song && calledTitles.has(song.title);
    });

    const markedSet = new Set(validMarks);
    const LINES = [
      [0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24],
      [0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24],
      [0,6,12,18,24],[4,8,12,16,20]
    ];

    const completedLines = LINES.filter(line => line.every(i => markedSet.has(i)));
    const isFullCard = validMarks.length >= 24 + 1; // all 24 + free

    let verifiedType = null;
    if (isFullCard && session.winConditions.includes('full')) verifiedType = 'full';
    else if (completedLines.length >= 2 && session.winConditions.includes('twolines')) verifiedType = 'twolines';
    else if (completedLines.length >= 1 && session.winConditions.includes('line')) verifiedType = 'line';

    if (!verifiedType) {
      socket.emit('bingo:rejected', { reason: 'Claim not verified — keep playing!' });
      return;
    }

    // Send to host for final human confirmation
    io.to('host:' + code).emit('bingo:claim_received', {
      cardNumber,
      claimType: verifiedType,
      socketId: socket.id,
      completedLines
    });

    socket.emit('bingo:pending', { message: 'Claim sent to host — waiting for confirmation...' });
    console.log(`Bingo claim from card ${cardNumber} in session ${code}: ${verifiedType}`);
  });

  // Host confirms or rejects a bingo claim
  socket.on('host:bingo_resolve', ({ venueCode, targetSocketId, confirmed, cardNumber }) => {
    const code = venueCode.toUpperCase();
    if (confirmed) {
      io.to(targetSocketId).emit('bingo:confirmed', { cardNumber });
      io.to('session:' + code).emit('session:winner', { cardNumber });
    } else {
      io.to(targetSocketId).emit('bingo:rejected', { reason: 'Not quite — keep playing!' });
    }
  });

  // Host ends round
  socket.on('host:end_round', ({ venueCode }) => {
    const code = venueCode.toUpperCase();
    const session = activeSessions[code];
    if (session) {
      session.status = 'ended';
      db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('ended', code);
      io.to('session:' + code).emit('session:ended', {});
      delete activeSessions[code];
    }
    console.log(`Session ${code} ended`);
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    if (socket.role === 'player' && socket.venueCode) {
      const session = activeSessions[socket.venueCode];
      if (session && session.players[socket.id]) {
        delete session.players[socket.id];
        const count = Object.keys(session.players).length;
        io.to('host:' + socket.venueCode).emit('session:player_count', { count });
      }
    }
  });
});

// ── Start server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Musical Bingo server running on port ${PORT}`);
});
