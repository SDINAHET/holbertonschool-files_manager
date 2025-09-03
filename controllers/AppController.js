// controllers/AppController.js
import dbClient from '../utils/db.mjs';
import redisClient from '../utils/redis.mjs';

class AppController {
  static getStatus(req, res) {
    return res.status(200).json({
      redis: redisClient.isAlive(),
      db: dbClient.isAlive(),
    });
  }

  static async getStats(req, res) {
    try {
      const users = await dbClient.nbUsers();
      const files = await dbClient.nbFiles();
      return res.status(200).json({ users, files });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Stats error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default AppController;
