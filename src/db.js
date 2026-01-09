const Datastore = require('nedb-promises');
const path = require('path');
const fs = require('fs');

// Создаем папку data, если её нет
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const playersDB = Datastore.create({
  filename: path.join(dataDir, 'players.db'),
  autoload: true
});

const sessionsDB = Datastore.create({
  filename: path.join(dataDir, 'sessions.db'),
  autoload: true
});

module.exports = { playersDB, sessionsDB };
