require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Document = require('./models/Document');
const Annotation = require('./models/Annotation');
const HistoryLog = require('./models/HistoryLog');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── MongoDB: Atlas/Local if MONGO_URI set, else in-memory ────────────────────
async function startDB() {
  const uri = process.env.MONGO_URI;
  if (uri && uri.trim() !== '') {
    await mongoose.connect(uri.trim());
    console.log('✅ MongoDB connected (PERSISTENT):', uri.trim().split('@').pop());
    console.log('   Data will survive server restarts.');
  } else {
    const memServer = await MongoMemoryServer.create();
    await mongoose.connect(memServer.getUri());
    console.log('⚠️  MongoDB running IN-MEMORY (data resets on restart).');
    console.log('   Set MONGO_URI in .env for persistent storage.');
  }
}
startDB().catch(err => console.error('❌ DB start error:', err));

// ─── Multer Setup ──────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only .txt and .md files are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ─── Helper: Log History ───────────────────────────────────────────────────────
async function logHistory(action, author, opts = {}) {
  const entry = await HistoryLog.create({ action, author, ...opts });
  io.emit('history:new', entry);
  return entry;
}

// ─── REST API: Documents ───────────────────────────────────────────────────────

// Upload document
app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    const { author } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!author) return res.status(400).json({ error: 'Author name required' });

    const content = fs.readFileSync(req.file.path, 'utf8');
    const wordCount = content.trim().split(/\s+/).length;

    const doc = await Document.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      content,
      uploadedBy: author,
      size: req.file.size,
      wordCount
    });

    await logHistory('DOCUMENT_UPLOADED', author, {
      documentId: doc._id,
      documentName: doc.originalName,
      details: `Uploaded "${doc.originalName}" (${wordCount} words)`
    });

    io.emit('document:new', doc);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all documents
app.get('/api/documents', async (req, res) => {
  try {
    const docs = await Document.find().sort({ uploadedAt: -1 }).select('-content');
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single document with content
app.get('/api/documents/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete document
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const doc = await Document.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    // Also remove file and annotations
    const filePath = path.join(__dirname, 'uploads', doc.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await Annotation.deleteMany({ documentId: req.params.id });
    io.emit('document:deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REST API: Annotations ────────────────────────────────────────────────────

// Get annotations for a document
app.get('/api/documents/:id/annotations', async (req, res) => {
  try {
    const annotations = await Annotation.find({ documentId: req.params.id }).sort({ createdAt: 1 });
    res.json(annotations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create annotation
app.post('/api/documents/:id/annotations', async (req, res) => {
  try {
    const { startOffset, endOffset, selectedText, comment, author, color } = req.body;
    if (!comment || !author || !selectedText) {
      return res.status(400).json({ error: 'comment, author, and selectedText are required' });
    }

    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const annotation = await Annotation.create({
      documentId: req.params.id,
      startOffset,
      endOffset,
      selectedText,
      comment,
      author,
      color: color || '#f59e0b'
    });

    await logHistory('ANNOTATION_CREATED', author, {
      documentId: req.params.id,
      documentName: doc.originalName,
      annotationId: annotation._id,
      details: `Commented on "${selectedText.substring(0, 50)}${selectedText.length > 50 ? '…' : ''}"`
    });

    io.emit('annotation:new', annotation);
    res.json(annotation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add reply to annotation
app.post('/api/annotations/:id/replies', async (req, res) => {
  try {
    const { author, content } = req.body;
    if (!author || !content) return res.status(400).json({ error: 'author and content required' });

    const annotation = await Annotation.findById(req.params.id);
    if (!annotation) return res.status(404).json({ error: 'Annotation not found' });

    annotation.replies.push({ author, content });
    annotation.updatedAt = new Date();
    await annotation.save();

    const doc = await Document.findById(annotation.documentId).select('originalName');

    await logHistory('REPLY_ADDED', author, {
      documentId: annotation.documentId,
      documentName: doc?.originalName,
      annotationId: annotation._id,
      details: `Replied to annotation on "${annotation.selectedText.substring(0, 40)}…"`
    });

    io.emit('annotation:updated', annotation);
    res.json(annotation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle resolve annotation
app.put('/api/annotations/:id/resolve', async (req, res) => {
  try {
    const { author } = req.body;
    const annotation = await Annotation.findById(req.params.id);
    if (!annotation) return res.status(404).json({ error: 'Annotation not found' });

    annotation.resolved = !annotation.resolved;
    annotation.updatedAt = new Date();
    await annotation.save();

    await logHistory('ANNOTATION_RESOLVED', author || 'System', {
      documentId: annotation.documentId,
      annotationId: annotation._id,
      details: `${annotation.resolved ? 'Resolved' : 'Reopened'} annotation on "${annotation.selectedText.substring(0, 40)}"`
    });

    io.emit('annotation:updated', annotation);
    res.json(annotation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete annotation
app.delete('/api/annotations/:id', async (req, res) => {
  try {
    const { author } = req.body;
    const annotation = await Annotation.findByIdAndDelete(req.params.id);
    if (!annotation) return res.status(404).json({ error: 'Annotation not found' });

    await logHistory('ANNOTATION_DELETED', author || 'System', {
      documentId: annotation.documentId,
      annotationId: annotation._id,
      details: `Deleted annotation on "${annotation.selectedText.substring(0, 40)}"`
    });

    io.emit('annotation:deleted', { id: req.params.id, documentId: annotation.documentId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REST API: History ────────────────────────────────────────────────────────

app.get('/api/history', async (req, res) => {
  try {
    const { documentId, limit = 100 } = req.query;
    const filter = documentId ? { documentId } : {};
    const logs = await HistoryLog.find(filter).sort({ timestamp: -1 }).limit(parseInt(limit));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join:document', (documentId) => {
    socket.join(`doc:${documentId}`);
    console.log(`📄 ${socket.id} joined doc:${documentId}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📂 Uploads stored in: ${path.join(__dirname, 'uploads')}`);
});
