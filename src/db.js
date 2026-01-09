const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  name: String,
  age: Number,
  history: [
    {
      role: { type: String, enum: ['system', 'user', 'assistant'] },
      content: String
    }
  ],
  stats: {
    hp: { type: Number, default: 100 },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 }
  },
  createdAt: { type: Date, default: Date.now }
});

const Player = mongoose.model('Player', playerSchema);

async function connectDB(uri) {
  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
}

module.exports = { connectDB, Player };
