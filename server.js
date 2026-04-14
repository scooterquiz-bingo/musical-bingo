const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

  res.json({
    venueCode: code,
    cardNumber: parseInt(cardNumber),
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
    console.log(`Player card ${cardNumber} joined: ${code}`);
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

    let verifiedType = null;
    if (isFullCard && session.winConditions.includes('full')) verifiedType = 'full';
    else if (completedLines.length >= 2 && session.winConditions.includes('twolines')) verifiedType = 'twolines';
    else if (completedLines.length >= 1 && session.winConditions.includes('line')) verifiedType = 'line';

    if (!verifiedType) {
      socket.emit('bingo:rejected', { reason: 'Claim not verified — keep playing!' });
      return;
    }

    io.to('host:' + code).emit('bingo:claim_received', {
      cardNumber,
      claimType: verifiedType,
      socketId: socket.id,
      completedLines
    });
    socket.emit('bingo:pending', { message: 'Claim sent to host — waiting for confirmation...' });
    console.log(`Bingo claim from card ${cardNumber} in ${code}: ${verifiedType}`);
  });

  socket.on('host:bingo_resolve', ({ venueCode, targetSocketId, confirmed, cardNumber }) => {
    const code = venueCode.toUpperCase();
    if (confirmed) {
      io.to(targetSocketId).emit('bingo:confirmed', { cardNumber });
      io.to('session:' + code).emit('session:winner', { cardNumber });
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
