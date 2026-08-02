```plaintext
mil-unesco/
├── frontend/                 # All TypeScript/JS files
│   ├── assets/               # Icons, fonts, images
│   ├── popup/                # UI Layer (The Dashboard)
│   │   ├── popup.html        # Main dashboard interface
│   │   └── popup.js          # Logic for displaying stats/gamification
│   ├── core/                 # The "Front-end Engine"
│   │   ├── scanner.js        # The DOM tree walker & noise filtering
│   │   ├── bridge.js         # WebSocket management & message passing
│   │   └── state.js          # Handles caching (scannedTextCache) & IDs
│   ├── ui-components/        # Reusable UI elements (Tooltips/Gamified badges)
│   │   ├── tooltip.js        # The "AI-Coach" interaction layer
│   │   └── injector.css      # Shared styles for injected tooltips/highlights
│   └── background.js         # The service worker (The persistent connection)
└── manifest.json             # Extension configuration
```
