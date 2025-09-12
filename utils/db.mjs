// utils/db.mjs
import mongodb from 'mongodb';

const { MongoClient } = mongodb;

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';

    this.dbName = database;
    this.connected = false;
    this.db = null;

    const url = `mongodb://${host}:${port}`;
    // this.client = new MongoClient(url);
    this.client = new MongoClient(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    this.client.connect()
      .then(() => {
        this.db = this.client.db(this.dbName);
        this.connected = true;
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        // console.error('MongoDB client error:', err?.message || err);
        console.error('MongoDB client error:', (err && err.message) ? err.message : err);
        this.connected = false;
      });
  }

  isAlive() {
    return this.connected;
  }

  async nbUsers() {
    if (!this.db) return 0;
    return this.db.collection('users').countDocuments();
  }

  async nbFiles() {
    if (!this.db) return 0;
    return this.db.collection('files').countDocuments();
  }
}

const dbClient = new DBClient();

export { DBClient };
export default dbClient;
