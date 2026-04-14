// seed.js — builds all card data in memory at startup.
// No database required. Returns { themes, cards } where:
//   themes = array of { name, slug }
//   cards  = Map of "themeSlug|setLetter|cardNumber" -> songs array

const songs80s = [
  { title: "You Might Think", artist: "Cars" },
  { title: "When Doves Cry", artist: "Prince" },
  { title: "Sweet Dreams", artist: "Eurythmics" },
  { title: "Maniac", artist: "Michael Sembello" },
  { title: "Flashdance", artist: "Irena Cara" },
  { title: "Don't Worry Be Happy", artist: "Bobby Mcferrin" },
  { title: "Mickey", artist: "Toni Basil" },
  { title: "Shout", artist: "Tears For Fears" },
  { title: "The Power", artist: "Snap" },
  { title: "We're Not Going To Take It", artist: "Twisted Sister" },
  { title: "Cold As Ice", artist: "Foreigner" },
  { title: "99 Luft Balloons", artist: "Nena" },
  { title: "We Built This City", artist: "Starship" },
  { title: "Heaven Is A Place On Earth", artist: "Belinda Carlyle" },
  { title: "500 Miles", artist: "Proclaimers" },
  { title: "Like A Prayer", artist: "Madonna" },
  { title: "Fame", artist: "Irena Cara" },
  { title: "Rock Lobster", artist: "The B-52's" },
  { title: "Caribbean Queen", artist: "Billy Ocean" },
  { title: "Lets Hear It For The Boy", artist: "Denice Williams" },
  { title: "Blame It On The Rain", artist: "Milli Vanilli" },
  { title: "Living On A Prayer", artist: "Bon Jovi" },
  { title: "Why Can't This Be Love", artist: "Van Halen" },
  { title: "Take On Me", artist: "A-Ha" },
  { title: "Tarzan Boy", artist: "Baltimora" },
  { title: "Jessies Girl", artist: "Rick Springfield" },
  { title: "Safety Dance", artist: "Men Without Hats" },
  { title: "Ride On Time", artist: "Black Box" },
  { title: "Hit Me With Your Best Shot", artist: "Pat Benatar" },
  { title: "I've Had The Time Of My Life", artist: "Medley And Warnes" },
  { title: "Faith", artist: "George Michael" },
  { title: "Wake Me Up Before You Go Go", artist: "Wham" },
  { title: "What's Love Got To Do With It", artist: "Tina Turner" },
  { title: "I Need A Lover", artist: "John Cougar" },
  { title: "Boys Of Summer", artist: "Don Henley" },
  { title: "Fight For Your Right", artist: "Beastie Boys" },
  { title: "Footloose", artist: "Kenny Loggins" },
  { title: "Send Me An Angel", artist: "Real Life" },
  { title: "Blister In The Sun", artist: "Violent Femmes" },
  { title: "Pride In The Name Of Love", artist: "U2" },
  { title: "The Final Countdown", artist: "Europe" },
  { title: "Walk Like An Egyptian", artist: "Bangles" },
  { title: "Karma Chameleon", artist: "Culture Club" },
  { title: "Run Run Away", artist: "Slade" },
  { title: "Sunglasses At Night", artist: "Corey Hart" },
  { title: "Africa", artist: "Toto" },
  { title: "Cruel Summer", artist: "Bananarama" },
  { title: "Total Eclipse Of The Heart", artist: "Bonnie Tyler" },
  { title: "Money For Nothing", artist: "Dire Straits" },
  { title: "I Think We're Alone Now", artist: "Tiffany" },
  { title: "Video Killed The Radio Star", artist: "Buggles" },
  { title: "Billie Jean", artist: "Michael Jackson" },
  { title: "Tainted Love", artist: "Soft Cell" },
  { title: "Manic Monday", artist: "Bangles" },
  { title: "Jump", artist: "Van Halen" },
  { title: "All Night Long", artist: "Lionel Richie" },
  { title: "Summer Of 69", artist: "Brian Adams" },
  { title: "Ghostbusters", artist: "Ray Parker Jr" },
  { title: "The Look", artist: "Roxette" },
  { title: "Pop Goes The World", artist: "Men Without Hats" },
  { title: "I Ran", artist: "Flock Of Seagulls" },
  { title: "Simply Irresistible", artist: "Robert Palmer" },
  { title: "Rio", artist: "Duran Duran" },
  { title: "Relax", artist: "Frankie Goes To Hollywood" },
  { title: "Don't Stop Believing", artist: "Journey" },
  { title: "Girls Just Want To Have Fun", artist: "Cyndi Lauper" },
  { title: "Material Girl", artist: "Madonna" },
  { title: "Kokomo", artist: "Beach Boys" },
  { title: "Head Over Heels", artist: "Go-Gos" },
  { title: "I Touch Myself", artist: "Divinyls" },
  { title: "Working For The Weekend", artist: "Loverboy" },
  { title: "Stars On 45 Medley", artist: "Stars On 45" },
  { title: "Black Dog", artist: "Led Zeppelin" },
  { title: "Come On Eileen", artist: "Dexy's Midnight Runners" },
  { title: "Who Can It Be Now", artist: "Men At Work" },
];

const songsRock = [
  { title: "Another Brick In The Wall", artist: "Pink Floyd" },
  { title: "The Joker", artist: "Steve Miller Band" },
  { title: "Rosanna", artist: "Toto" },
  { title: "Dust In The Wind", artist: "Kansas" },
  { title: "Low Rider", artist: "War" },
  { title: "Hot Blooded", artist: "Foreigner" },
  { title: "Here I Go Again", artist: "Whitesnake" },
  { title: "I Can't Get No Satisfaction", artist: "Rolling Stones" },
  { title: "Cars", artist: "Gary Numan" },
  { title: "You Ain't Seen Nothing Yet", artist: "BTO" },
  { title: "I Want You To Want Me", artist: "Cheap Trick" },
  { title: "More Than A Feeling", artist: "Boston" },
  { title: "With A Little Help From My Friends", artist: "Joe Cocker" },
  { title: "Fire And Rain", artist: "James Taylor" },
  { title: "Black Betty", artist: "Ram Jam" },
  { title: "Paranoid", artist: "Black Sabbath" },
  { title: "Waiting For A Girl Like You", artist: "Foreigner" },
  { title: "Space Ship Superstar", artist: "Prism" },
  { title: "Old Time Rock And Roll", artist: "Bob Segar" },
  { title: "Papa Was A Rolling Stone", artist: "Temptations" },
  { title: "Rock Of Ages", artist: "Def Leppard" },
  { title: "Jack And Diane", artist: "John Mellencamp" },
  { title: "Take Me Home", artist: "Joe Cocker" },
  { title: "We Will Rock You", artist: "Queen" },
  { title: "Smoke On The Water", artist: "Deep Purple" },
  { title: "Born To Run", artist: "Bruce Springsteen" },
  { title: "Hotel California", artist: "Eagles" },
  { title: "Stairway To Heaven", artist: "Led Zeppelin" },
  { title: "Sweet Home Alabama", artist: "Lynyrd Skynyrd" },
  { title: "Dream On", artist: "Aerosmith" },
  { title: "Don't Stop Me Now", artist: "Queen" },
  { title: "Eye Of The Tiger", artist: "Survivor" },
  { title: "Jump", artist: "Van Halen" },
  { title: "Livin On A Prayer", artist: "Bon Jovi" },
  { title: "Pour Some Sugar On Me", artist: "Def Leppard" },
  { title: "Welcome To The Jungle", artist: "Guns N Roses" },
  { title: "Sweet Child O Mine", artist: "Guns N Roses" },
  { title: "Back In Black", artist: "AC/DC" },
  { title: "Highway To Hell", artist: "AC/DC" },
  { title: "Whole Lotta Love", artist: "Led Zeppelin" },
  { title: "Black Dog", artist: "Led Zeppelin" },
  { title: "Roxanne", artist: "The Police" },
  { title: "Every Breath You Take", artist: "The Police" },
  { title: "Don't You Forget About Me", artist: "Simple Minds" },
  { title: "Money For Nothing", artist: "Dire Straits" },
  { title: "Sultans Of Swing", artist: "Dire Straits" },
  { title: "Layla", artist: "Derek And The Dominos" },
  { title: "Free Bird", artist: "Lynyrd Skynyrd" },
  { title: "Carry On Wayward Son", artist: "Kansas" },
  { title: "Owner Of A Lonely Heart", artist: "Yes" },
  { title: "Running With The Devil", artist: "Van Halen" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function seededShuffle(arr, seed) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(seed) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildCardGrid(pool, seed) {
  const shuffled = seededShuffle(pool, seed);
  const picked = shuffled.slice(0, 24);
  // Insert free space at position 12 (centre)
  return [...picked.slice(0, 12), null, ...picked.slice(12)];
}

function generateSet(cards, themeSlug, setLetter, pool, numberSequence) {
  const seedBase = themeSlug.charCodeAt(0) * 1000 + setLetter.charCodeAt(0) * 100;
  numberSequence.forEach((cardNum, pageIdx) => {
    const grid = buildCardGrid(pool, seedBase + pageIdx + 1);
    cards.set(`${themeSlug}|${setLetter}|${cardNum}`, grid);
  });
}

// ── Build all cards ───────────────────────────────────────────────────────────

const themes = [
  { name: 'Hit the 80s', slug: '80s' },
  { name: 'Old School Rock', slug: 'rock' },
];

const cards = new Map();
const sequential = Array.from({ length: 140 }, (_, i) => i + 1);

// 80s theme — 4 sets
generateSet(cards, '80s', 'A', songs80s, sequential);
generateSet(cards, '80s', 'B', songs80s, seededShuffle(sequential, 8001));
generateSet(cards, '80s', 'C', songs80s, seededShuffle(sequential, 8002));
generateSet(cards, '80s', 'D', songs80s, seededShuffle(sequential, 8003));

// Rock theme — 4 sets
generateSet(cards, 'rock', 'A', songsRock, sequential);
generateSet(cards, 'rock', 'B', songsRock, seededShuffle(sequential, 9001));
generateSet(cards, 'rock', 'C', songsRock, seededShuffle(sequential, 9002));
generateSet(cards, 'rock', 'D', songsRock, seededShuffle(sequential, 9003));

module.exports = { themes, cards };
