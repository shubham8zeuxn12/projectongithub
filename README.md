# Annotate — Collaborative Document Annotation System

A real-time collaborative annotation platform built with **Node.js + Express + MongoDB + Socket.io**.

---

## ✨ Features

| Feature | Description |
|---|---|
| 📄 Document Upload | Upload `.txt` / `.md` files (up to 5MB) |
| 🖊️ Text Annotation | Select any text → add a linked comment with colour tag |
| 💬 Threaded Replies | Reply to comments forming discussion threads |
| ✅ Resolve / Reopen | Mark comments as resolved |
| ⚡ Real-time Sync | All changes broadcast instantly via Socket.io |
| 🕐 History Log | Complete chronological audit trail of all actions |
| 🌑 Dark UI | Premium glassmorphism dark theme |

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+ — [nodejs.org](https://nodejs.org)
- **MongoDB** v6+ — [mongodb.com](https://www.mongodb.com/try/download/community)  
  *(Must be running on `mongodb://localhost:27017`)*

### Steps

```bash
# 1. Install dependencies (already done)
npm install

# 2. Make sure MongoDB is running, then:
npm start

# 3. Open browser
# http://localhost:3001
```

Or just double-click **`start.bat`** on Windows.

---

## 📁 Project Structure

```
folder_2/
├── server.js              ← Express + Socket.io server
├── models/
│   ├── Document.js        ← Mongoose: uploaded documents
│   ├── Annotation.js      ← Mongoose: annotations + replies
│   └── HistoryLog.js      ← Mongoose: full audit trail
├── public/
│   ├── index.html         ← Single-page app
│   ├── style.css          ← Dark glassmorphism design
│   └── app.js             ← All frontend logic (vanilla JS)
├── uploads/               ← Stored document files
├── start.bat              ← Windows quick-start
└── package.json
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload a document |
| `GET` | `/api/documents` | List all documents |
| `GET` | `/api/documents/:id` | Get document with content |
| `DELETE` | `/api/documents/:id` | Delete document |
| `GET` | `/api/documents/:id/annotations` | Get all annotations |
| `POST` | `/api/documents/:id/annotations` | Create annotation |
| `POST` | `/api/annotations/:id/replies` | Add reply |
| `PUT` | `/api/annotations/:id/resolve` | Toggle resolve |
| `DELETE` | `/api/annotations/:id` | Delete annotation |
| `GET` | `/api/history` | Get full history log |

## 🔄 Socket.io Events

| Event | Direction | Description |
|---|---|---|
| `document:new` | Server → Client | New doc uploaded |
| `annotation:new` | Server → Client | New annotation added |
| `annotation:updated` | Server → Client | Annotation/reply updated |
| `annotation:deleted` | Server → Client | Annotation removed |
| `history:new` | Server → Client | New history entry |
| `join:document` | Client → Server | Subscribe to doc room |
