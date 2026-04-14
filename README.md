# Musical Bingo

Live musical bingo platform — host dashboard + player card view with real-time song detection.

## Files in this project

```
musical-bingo/
├── server.js          — the main app server
├── seed.js            — loads card data into the database
├── package.json       — app dependencies
├── railway.toml       — hosting configuration
└── public/
    ├── index.html     — home page (choose host or player)
    ├── host.html      — host dashboard (your iPad)
    └── player.html    — player card view (guests' phones)
```

## How to upload to GitHub (step by step)

1. Go to your `musical-bingo` repository on github.com
2. Click **"uploading an existing file"** (or drag files in)
3. Upload ALL files — keep the folder structure:
   - Upload `server.js`, `seed.js`, `package.json`, `railway.toml` to the root
   - Create a `public` folder and upload the three HTML files inside it
4. Click **"Commit changes"** at the bottom

## How to deploy on Railway

1. Go to railway.app and sign up with your GitHub account
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `musical-bingo` repository
4. Railway will detect the settings and deploy automatically
5. Click **"Generate Domain"** to get your permanent URL

## On the night

- **Host URL:** yourdomain.railway.app/host.html (open on your iPad)
- **Player URL:** yourdomain.railway.app/player.html (players open on their phones)
- Display the player URL as a QR code on a screen at the venue

## URLs at the event

Put the player URL on a sign, screen, or QR code at the venue.
Players open it on their phone, type the venue code and card number, and they're in.

## Adding ACRCloud (real song detection)

1. Sign up free at acrcloud.com
2. Create a project — choose "Audio & Video Recognition"
3. Copy your Access Key and Access Secret
4. In `host.html`, replace `YOUR_ACCESS_KEY_HERE` and `YOUR_ACCESS_SECRET_HERE`
5. Download the ACRCloud JavaScript SDK from their docs
6. Follow their browser integration guide to replace the `simulateDetection()` function
