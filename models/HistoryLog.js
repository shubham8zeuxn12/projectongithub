const mongoose = require('mongoose');

const HistoryLogSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['DOCUMENT_UPLOADED', 'ANNOTATION_CREATED', 'REPLY_ADDED'],
    required: true
  },
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  documentName: { type: String },
  annotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Annotation' },
  author: { type: String, required: true },
  details: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('HistoryLog', HistoryLogSchema);
