// controllers/UsersController.js
import crypto from 'crypto';
import mongodb from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const { ObjectId } = mongodb;

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body || {};

    if (!email) return res.status(400).json({ error: 'Missing email' });
    if (!password) return res.status(400).json({ error: 'Missing password' });

    try {
      // if (!dbClient.db) return res.status(500).json({ error: 'Database not initialized' });

      const usersCol = dbClient.db.collection('users');

      const existing = await usersCol.findOne({ email });
      if (existing) return res.status(400).json({ error: 'Already exist' });

      const hashed = crypto.createHash('sha1').update(password).digest('hex');

      const result = await usersCol.insertOne({ email, password: hashed });

      return res.status(201).json({ id: result.insertedId.toString(), email });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('UsersController.postNew error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getMe(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      let _id;
      try {
        _id = new ObjectId(userId);
      } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const user = await dbClient.db.collection('users').findOne({ _id });
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      return res.status(200).json({ id: user._id.toString(), email: user.email });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('UsersController.getMe error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default UsersController;
