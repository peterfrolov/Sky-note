# ✈️ Fly Note

> **Lynhurtigt, fjerlet note-program med to-vejs sky-synkronisering mellem PC og mobil.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-purple.svg)](https://web.dev/progressive-web-apps/)
[![RAM Usage](https://img.shields.io/badge/RAM-%3C25MB-brightgreen.svg)](#)

---

## ✨ Funktioner

- **⚡ Indlæser på <50ms**: Bygget uden tunge frameworks (React/Electron-bloat) for maksimal ydeevne og minimalt hukommelsesforbrug (<25MB RAM).
- **☁️ Live Sky-Synkronisering**: Skriv på PC'en, og se teksten dukke op på din telefon med det samme i realtid – og vice versa!
- **📱 Øjeblikkelig Mobil-Parring**: Tryk på *"Forbind mobil"* på PC'en for at få en QR-kode. Peg telefonens kamera mod skærmen, og du er i gang på 3 sekunder.
- **📲 PWA (Progressive Web App)**: Kan installeres som en ægte app på både iPhone (Safari ➔ *Føj til hjemmeskærm*) og Android (*Installer app*) samt Windows (*Installer app i proceslinjen*).
- **💾 100% Offline-sikker**: Alt gemmes lokalt med det samme (`localStorage`). Hvis forbindelsen ryger, kan du skrive videre uden afbrydelse – noten synkroniserer automatisk, så snart du er online igen.
- **☑️ Interaktive Tjeklister & Markdown**: Tjek punkter af direkte på skærmen, lav overskrifter, punktopstillinger, fed/kursiv tekst og tidsstempler.
- **🌓 Mørkt & Lyst Tema**: Automatisk tilpasning til systemets tema samt hurtig skifteknap.
- **📤 Eksport**: Hent dine noter som Markdown (`.md`), ren tekst (`.txt`) eller udskriv/gem som PDF (`Ctrl+P`).
- **🔒 Nul afhængigheder (Zero-deps)**: Serveren kører på ren Node.js uden et bjerg af eksterne pakker.

---

## 🚀 Hurtig opstart (Lokalt på PC + Mobil)

### 1. Start programmet
Åbn en terminal i projektmappen og kør:
```bash
node server.js
```
*(eller `npm start`)*

Du vil se følgende i terminalen:
```text
==============================================================
  ✈️  FLY NOTE ER KLAR!
==============================================================

  💻 Åbn på PC:
     http://localhost:3000

  📱 Åbn på Mobil (samme Wi-Fi):
     http://192.168.1.90:3000

  ✨ Tip: Tryk på "Forbind mobil" i appen for at scanne QR-kode!
==============================================================
```

### 2. Forbind din telefon
1. Åbn `http://localhost:3000` i din browser på PC'en.
2. Klik på den blå knap **📱 Forbind mobil** øverst til højre.
3. Åbn kameraet på din telefon og scan QR-koden på skærmen.
4. Tryk på linket, der dukker op på telefonen.
5. **Tip til app-ikon på telefonen:**
   - **iPhone (Safari):** Tryk på **Del** (firkant med pil op) ➔ Vælg **"Føj til hjemmeskærm"**.
   - **Android (Chrome):** Tryk på menuen (de 3 prikker) ➔ Vælg **"Installer app"** eller **"Føj til startskærm"**.

---

## 🌐 Gratis Cloud-Hosting (Adgang overalt via 4G/5G)

Hvis du vil have adgang til dine noter, når du **ikke** er på samme Wi-Fi som computeren:

### Gratis 1-klik deploy på Render.com:
1. Opret en gratis konto på [Render.com](https://render.com).
2. Opret et nyt **Web Service** og forbind dit GitHub repository `peterfrolov/fly-note`.
3. Render bruger automatisk den medfølgende `render.yaml`.
4. Du får din egen faste webadresse (f.eks. `https://fly-note.onrender.com`), som du kan bogmærke på både PC og mobil!

---

## ⌨️ Genvejstaster

| Genvej | Handling |
| :--- | :--- |
| `Ctrl + S` | Tving øjeblikkelig synkronisering til skyen |
| `Ctrl + N` | Opret ny note |
| `Ctrl + B` | Gør markeret tekst fed |
| `Ctrl + I` | Gør markeret tekst kursiv |
| `Ctrl + P` | Udskriv eller gem som PDF |

---

## 🛠️ Teknisk arkitektur

```text
┌─────────────────┐       WebSocket (RFC 6455)       ┌─────────────────┐
│     PC Client   │ ◄──────────────────────────────► │  Fly Note Server │
│   (PWA / Web)   │                                  │   (Node.js HTTP  │
└─────────────────┘                                  │    + In-Memory   │
                                                     │    JSON Storage) │
┌─────────────────┐       WebSocket (RFC 6455)       │                  │
│   Mobil Client  │ ◄──────────────────────────────► │                  │
│   (iPhone/Andr) │                                  └─────────────────┘
└─────────────────┘
```

- **Frontend**: Ren semantisk HTML5, responsiv CSS3 med CSS Custom Properties, Vanilla ES6+ JavaScript, Service Worker (Cache-first offline engine), ren SVG QR-kodemotor.
- **Backend**: Native Node.js `http` server, asynkron filskrivning, standard RFC 6455 WebSocket framing, lokal IP-detektering for zero-friction parring.

---

## 📄 Licens

Udgivet under [MIT License](LICENSE).  
Copyright (c) 2026 peterfrolov.
