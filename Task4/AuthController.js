// controllers/AuthController.js
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AuthController {
  static async getConnect(req, res) {
    try {
      const authHeader = req.header('Authorization') || '';
      if (!authHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const base64Creds = authHeader.split(' ')[1];
      let decoded = '';
      try {
        decoded = Buffer.from(base64Creds, 'base64').toString('utf-8');
      } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const colonIndex = decoded.indexOf(':');
      if (colonIndex === -1) return res.status(401).json({ error: 'Unauthorized' });

      const email = decoded.slice(0, colonIndex);
      const password = decoded.slice(colonIndex + 1);
      const hashed = crypto.createHash('sha1').update(password).digest('hex');

      const user = await dbClient.db.collection('users').findOne({ email, password: hashed });
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const token = uuidv4();
      const key = `auth_${token}`;
      // TTL 24h
      await redisClient.set(key, user._id.toString(), 24 * 60 * 60);

      return res.status(200).json({ token });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('AuthController.getConnect error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getDisconnect(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      await redisClient.del(key);
      return res.status(204).send();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('AuthController.getDisconnect error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default AuthController;
