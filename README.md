# 🚨 Shortage Tracker — Deployment Guide

## Files to upload to GitHub
Upload ALL of these files keeping the same folder structure:

```
shortage-tracker/
├── public/
│   └── index.html
├── src/
│   ├── App.js
│   ├── firebase.js
│   └── index.js
├── .env.example
├── .gitignore
└── package.json
```

---

## Step-by-step deployment

### 1. Upload to GitHub
1. Go to github.com → New repository → name it `shortage-tracker`
2. Click "uploading an existing file"
3. Upload all the files above (keeping folder structure)
4. Click "Commit changes"

---

### 2. Add Firebase config to Vercel
When importing your repo on Vercel, add these Environment Variables
(copy the values from Firebase Console → Project Settings → Your Apps):

| Variable Name                          | Where to find it         |
|----------------------------------------|--------------------------|
| REACT_APP_FIREBASE_API_KEY             | Firebase config → apiKey |
| REACT_APP_FIREBASE_AUTH_DOMAIN         | authDomain               |
| REACT_APP_FIREBASE_PROJECT_ID          | projectId                |
| REACT_APP_FIREBASE_STORAGE_BUCKET      | storageBucket            |
| REACT_APP_FIREBASE_MESSAGING_SENDER_ID | messagingSenderId        |
| REACT_APP_FIREBASE_APP_ID              | appId                    |

---

### 3. Deploy on Vercel
1. Go to vercel.com → Add New Project
2. Import your `shortage-tracker` GitHub repo
3. Paste the 6 environment variables above
4. Click Deploy → done! ✅

Your live URL will be something like: https://shortage-tracker.vercel.app
