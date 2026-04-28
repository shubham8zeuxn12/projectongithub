const mongoose = require('mongoose');

const ReplySchema = new mongoose.Schema({
  author: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const AnnotationSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  startOffset: { type: Number, required: true },
  endOffset: { type: Number, required: true },
  selectedText: { type: String, required: true },
  comment: { type: String, required: true },
  author: { type: String, required: true },
  color: { type: String, default: '#f59e0b' },
  replies: [ReplySchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Annotation', AnnotationSchema);
