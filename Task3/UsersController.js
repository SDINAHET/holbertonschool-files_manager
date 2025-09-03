// controllers/UsersController.js
import crypto from 'crypto';
import dbClient from '../utils/db';

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body || {};

    if (!email) return res.status(400).json({ error: 'Missing email' });
    if (!password) return res.status(400).json({ error: 'Missing password' });

    try {
      if (!dbClient.db) return res.status(500).json({ error: 'Database not initialized' });

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
}

export default UsersController;
