const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// Serve HTML files directly from root — no subfolder needed
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'host.html')));
app.get('/host.html', (req, res) => res.sendFile(path.join(__dirname, 'host.html')));
app.get('/player', (req, res) => res.sendFile(path.join(__dirname, 'player.html')));
app.get('/player.html', (req, res) => res.sendFile(path.join(__dirname, 'player.html')));

// ── Load all card data into memory at startup ─────────────────────────────────

const { themes, cards } = require('./seed');

// ── Active sessions ───────────────────────────────────────────────────────────

const activeSessions = {};

// ── REST API ──────────────────────────────────────────────────────────────────

app.get('/api/themes', (req, res) => {
  res.json(themes);
});

app.post('/api/session', (req, res) => {
  const { venueCode, themeSlug, setLetter, round, winConditions } = req.body;
  const code = (venueCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code || code.length < 3) return res.status(400).json({ error: 'Invalid venue code' });

  activeSessions[code] = {
    venueCode: code,
    themeSlug,
    setLetter,
    round,
    winConditions: winConditions || ['line', 'twolines', 'full'],
    songsCalled: [],
    players: {},
    status: 'registration'
  };

  console.log(`Session created: ${code} | ${themeSlug} Set ${setLetter} Round ${round}`);
  res.json({ success: true, venueCode: code });
});

app.post('/api/join', (req, res) => {
  const { venueCode, cardNumber } = req.body;
  const code = (venueCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const session = activeSessions[code];
  if (!session) return res.status(404).json({ error: 'Session not found. Check your venue code.' });
  if (session.status === 'ended') return res.status(400).json({ error: 'This round has ended.' });

  const cardKey = `${session.themeSlug}|${session.setLetter}|${parseInt(cardNumber)}`;
  const songs = cards.get(cardKey);
  if (!songs) return res.status(404).json({ error: 'Card not found. Check your card number.' });

  const theme = themes.find(t => t.slug === session.themeSlug);
  const playerName = (req.body.playerName || 'Player').trim().slice(0, 30);

  res.json({
    venueCode: code,
    cardNumber: parseInt(cardNumber),
    playerName,
    songs,
    themeName: theme ? theme.name : session.themeSlug,
    setLetter: session.setLetter,
    round: session.round,
    winConditions: session.winConditions,
    songsCalled: session.songsCalled
  });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {

  socket.on('host:join', ({ venueCode }) => {
    const code = venueCode.toUpperCase();
    socket.join('host:' + code);
    socket.join('session:' + code);
    socket.venueCode = code;
    socket.role = 'host';
    console.log(`Host joined: ${code}`);
  });

  socket.on('player:join', ({ venueCode, cardNumber, playerName }) => {
    const code = venueCode.toUpperCase();
    socket.join('session:' + code);
    socket.venueCode = code;
    socket.cardNumber = cardNumber;
    socket.playerName = playerName || 'Player';
    socket.role = 'player';

    const session = activeSessions[code];
    if (session) {
      // Multiple players can share the same card number — each gets their own socket entry
      session.players[socket.id] = { cardNumber, playerName: socket.playerName, socketId: socket.id };
      const count = Object.keys(session.players).length;
      io.to('host:' + code).emit('session:player_count', { count });
      io.to('host:' + code).emit('session:player_joined', { cardNumber, playerName: socket.playerName, count });
    }
    console.log(`Player ${socket.playerName} (card ${cardNumber}) joined: ${code}`);
  });

  socket.on('host:start', ({ venueCode }) => {
    const code = venueCode.toUpperCase();
    const session = activeSessions[code];
    if (!session) return;
    session.status = 'active';
    io.to('session:' + code).emit('session:started', {});
    console.log(`Session started: ${code}`);
  });

  socket.on('host:song_called', ({ venueCode, song }) => {
    const code = venueCode.toUpperCase();
    const session = activeSessions[code];
    if (!session) return;
    if (session.songsCalled.find(s => s.title === song.title)) return;
    session.songsCalled.push(song);
    io.to('session:' + code).emit('session:song_called', {
      song,
      totalCalled: session.songsCalled.length
    });
    console.log(`Song called in ${code}: ${song.title}`);
  });

  socket.on('player:bingo_claim', ({ venueCode, cardNumber, claimType, markedSquares }) => {
    const code = venueCode.toUpperCase();
    const session = activeSessions[code];
    if (!session) return;

    // Allow up to 7 winners per round — check if this player already won
    if (!session.winners) session.winners = [];
    const alreadyWon = session.winners.find(w => w.socketId === socket.id);
    if (alreadyWon) {
      socket.emit('bingo:already_won', { message: 'You have already claimed a win this round!' });
      return;
    }

    const cardKey = `${session.themeSlug}|${session.setLetter}|${parseInt(cardNumber)}`;
    const songs = cards.get(cardKey);
    if (!songs) return;

    const calledTitles = new Set(session.songsCalled.map(s => s.title));
    const validMarks = (markedSquares || []).filter(idx => {
      if (idx === 12) return true;
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
    const isFullCard = validMarks.length >= 25;

    // Work out what the player has achieved
    let achievedType = null;
    if (isFullCard) achievedType = 'full';
    else if (completedLines.length >= 2) achievedType = 'twolines';
    else if (completedLines.length >= 1) achievedType = 'line';

    if (!achievedType) {
      socket.emit('bingo:rejected', { reason: 'Claim not verified — keep playing!' });
      return;
    }

    // Check if this player has already won at this level or higher
    if (!session.winners) session.winners = [];
    const winLevels = { line: 1, twolines: 2, full: 3 };
    const playerWins = session.winners.filter(w => w.socketId === socket.id);
    const highestWin = playerWins.reduce((max, w) => Math.max(max, winLevels[w.claimType] || 0), 0);
    const achievedLevel = winLevels[achievedType] || 0;

    // Already won at this level — ignore
    if (achievedLevel <= highestWin) {
      socket.emit('bingo:already_won', { message: 'You have already claimed this win!' });
      return;
    }

    // Is this a selected win condition (actual prize) or just a progress alert?
    const isWin = session.winConditions.includes(achievedType);

    // Always alert host — flag whether it's a prize win or progress info
    io.to('host:' + code).emit('bingo:claim_received', {
      cardNumber,
      playerName: socket.playerName || ('Card ' + cardNumber),
      claimType: achievedType,
      socketId: socket.id,
      completedLines,
      isWin  // true = real prize win, false = progress alert only
    });

    if (isWin) {
      socket.emit('bingo:pending', { message: 'Claim sent to host — waiting for confirmation...' });
    } else {
      // Progress alert — auto-acknowledge, no player action needed
      socket.emit('bingo:progress', { claimType: achievedType, message: 'Keep going — you need more to win!' });
    }
    console.log(`${isWin ? 'WIN' : 'PROGRESS'} claim from ${socket.playerName} card ${cardNumber} in ${code}: ${achievedType}`);
  });

  socket.on('host:bingo_resolve', ({ venueCode, targetSocketId, confirmed, cardNumber, playerName, claimType }) => {
    const code = venueCode.toUpperCase();
    const session = activeSessions[code];
    if (confirmed) {
      if (session) {
        if (!session.winners) session.winners = [];
        session.winners.push({ socketId: targetSocketId, cardNumber, playerName, claimType, time: Date.now() });
        const winnerCount = session.winners.length;
        console.log(`Winner ${winnerCount}: ${playerName} card ${cardNumber} (${claimType}) in ${code}`);
        io.to('session:' + code).emit('session:winner_announced', {
          playerName, cardNumber, claimType, winnerNumber: winnerCount
        });
      }
      // Player screen locks as winner
      io.to(targetSocketId).emit('bingo:confirmed', { cardNumber, playerName, claimType });
    } else {
      io.to(targetSocketId).emit('bingo:rejected', { reason: 'Not quite — keep playing!' });
    }
  });

  socket.on('host:end_round', ({ venueCode }) => {
    const code = venueCode.toUpperCase();
    const session = activeSessions[code];
    if (session) {
      session.status = 'ended';
      io.to('session:' + code).emit('session:ended', {});
      delete activeSessions[code];
    }
    console.log(`Session ended: ${code}`);
  });

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

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Musical Bingo running on port ${PORT}`);
  console.log(`Themes: ${themes.map(t => t.name).join(', ')}`);
  console.log(`Cards in memory: ${cards.size}`);
});
