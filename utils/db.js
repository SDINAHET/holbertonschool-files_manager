// CommonJS shim compatible avec le test
const { MongoClient } = require('mongodb');

const host = process.env.DB_HOST || '127.0.0.1';
const port = process.env.DB_PORT || '27017';
const database = process.env.DB_DATABASE || 'files_manager';
const uri = process.env.DB_URI || `mongodb://${host}:${port}/${database}`;

class DBClient {
  constructor() {
    // driver 3.x
    this.client = new MongoClient(uri, { useUnifiedTopology: true });
    this.db = null;

    this.ready = this.client.connect()
      .then(() => {
        // si DB_URI inclut déjà la DB, on garde process.env.DB_DATABASE pour rester cohérent avec les projets Holberton
        this.db = this.client.db(database);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('MongoDB client error:', err && err.message ? err.message : err);
      });
  }

  isAlive() {
    // driver 3.x
    try {
      return this.client && this.client.isConnected();
    } catch (_e) {
      return !!this.db;
    }
  }

  async nbUsers() {
    await this.ready;
    return this.db.collection('users').countDocuments();
  }

  async nbFiles() {
    await this.ready;
    return this.db.collection('files').countDocuments();
  }

  // helper pratique si ton code l’utilise
  collection(name) {
    return this.db.collection(name);
  }
}

const instance = new DBClient();

// Compat CommonJS + ESM
module.exports = instance;
module.exports.default = instance;
