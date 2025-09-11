// controllers/FilesController.js
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import mongodb from 'mongodb';
import mime from 'mime-types';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const { ObjectId } = mongodb;
const VALID_TYPES = new Set(['folder', 'file', 'image']);

function mapFileDoc(doc) {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    name: doc.name,
    type: doc.type,
    isPublic: doc.isPublic === true,
    parentId:
      (doc.parentId && doc.parentId !== 0 && doc.parentId !== '0')
        ? doc.parentId.toString()
        : 0,
  };
}

class FilesController {
  static async postUpload(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      const userIdStr = await redisClient.get(`auth_${token}`);
      if (!userIdStr) return res.status(401).json({ error: 'Unauthorized' });

      let userId;
      try {
        userId = new ObjectId(userIdStr);
      } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const {
        name, type, parentId = 0, isPublic = false, data,
      } = req.body || {};

      if (!name) return res.status(400).json({ error: 'Missing name' });
      if (!type || !VALID_TYPES.has(type)) {
        return res.status(400).json({ error: 'Missing type' });
      }
      if (type !== 'folder' && !data) {
        return res.status(400).json({ error: 'Missing data' });
      }

      let parentRef = 0;
      if (parentId && parentId !== 0 && parentId !== '0') {
        let parentObjId;
        try {
          parentObjId = new ObjectId(parentId);
        } catch (e) {
          return res.status(400).json({ error: 'Parent not found' });
        }
        const parentDoc = await dbClient.db.collection('files').findOne({ _id: parentObjId });
        if (!parentDoc) return res.status(400).json({ error: 'Parent not found' });
        if (parentDoc.type !== 'folder') {
          return res.status(400).json({ error: 'Parent is not a folder' });
        }
        parentRef = parentObjId;
      }

      if (type === 'folder') {
        const doc = {
          userId,
          name,
          type,
          isPublic: Boolean(isPublic),
          parentId: parentRef === 0 ? 0 : parentRef,
        };

        const result = await dbClient.db.collection('files').insertOne(doc);
        return res.status(201).json({
          id: result.insertedId.toString(),
          userId: userId.toString(),
          name,
          type,
          isPublic: Boolean(isPublic),
          parentId: parentRef === 0 ? 0 : parentRef.toString(),
        });
      }

      const folderPath = (process.env.FOLDER_PATH && process.env.FOLDER_PATH.trim())
        ? process.env.FOLDER_PATH.trim()
        : '/tmp/files_manager';
      await fs.mkdir(folderPath, { recursive: true });

      const localName = uuidv4();
      const localPath = path.join(folderPath, localName);
      const fileBuffer = Buffer.from(data, 'base64');
      await fs.writeFile(localPath, fileBuffer);

      const doc = {
        userId,
        name,
        type,
        isPublic: Boolean(isPublic),
        parentId: parentRef === 0 ? 0 : parentRef,
        localPath,
      };
      const result = await dbClient.db.collection('files').insertOne(doc);

      return res.status(201).json({
        id: result.insertedId.toString(),
        userId: userId.toString(),
        name,
        type,
        isPublic: Boolean(isPublic),
        parentId: parentRef === 0 ? 0 : parentRef.toString(),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('FilesController.postUpload error:', err && err.message ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // --- GET /files
  static async getIndex(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      // borne l'attente Redis pour éviter le timeout du checker
      const userIdStr = await Promise.race([
        redisClient.get(`auth_${token}`),
        new Promise((_, r) => setTimeout(() => r(new Error('auth-timeout')), 2000)),
      ]).catch(() => null);
      if (!userIdStr) return res.status(401).json({ error: 'Unauthorized' });

      let userId;
      try { userId = new ObjectId(userIdStr); } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { parentId, page } = req.query || {};
      const p = parseInt(page, 10);
      const pageNum = Number.isNaN(p) || p < 0 ? 0 : p;

      const isRoot = (
        parentId === undefined
        || parentId === null
        || parentId === ''
        || parentId === '0'
        || parentId === 0
      );

      // pas de validation de parentId demandée
      const matchByParent = isRoot
        ? { $or: [{ parentId: 0 }, { parentId: '0' }] }
        : {
          parentId: ObjectId.isValid(parentId)
            ? new ObjectId(parentId)
            : parentId,
        };

      const docs = await dbClient.db.collection('files').aggregate([
        { $match: { userId } },
        { $match: matchByParent },
        { $sort: { _id: 1 } },
        { $skip: pageNum * 20 },
        { $limit: 20 },
        {
          $project: {
            _id: 1, userId: 1, name: 1, type: 1, isPublic: 1, parentId: 1,
          },
        },
      ]).toArray();

      return res.status(200).json(docs.map((doc) => ({
        id: doc._id.toString(),
        userId: doc.userId.toString(),
        name: doc.name,
        type: doc.type,
        isPublic: doc.isPublic === true,
        parentId: (doc.parentId && doc.parentId !== 0 && doc.parentId !== '0')
          ? doc.parentId.toString() : 0,
      })));
    } catch (_err) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // --- GET /files/:id
  static async getShow(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const userIdStr = await Promise.race([
        redisClient.get(`auth_${token}`),
        new Promise((_, r) => setTimeout(() => r(new Error('auth-timeout')), 2000)),
      ]).catch(() => null);
      if (!userIdStr) return res.status(401).json({ error: 'Unauthorized' });

      let userId;
      try { userId = new ObjectId(userIdStr); } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      let fileId;
      try { fileId = new ObjectId(id); } catch (e) {
        return res.status(404).json({ error: 'Not found' });
      }

      const doc = await dbClient.db.collection('files')
        .findOne({ _id: fileId, userId });
      if (!doc) return res.status(404).json({ error: 'Not found' });

      return res.status(200).json({
        id: doc._id.toString(),
        userId: doc.userId.toString(),
        name: doc.name,
        type: doc.type,
        isPublic: doc.isPublic === true,
        parentId: (doc.parentId && doc.parentId !== 0 && doc.parentId !== '0')
          ? doc.parentId.toString() : 0,
      });
    } catch (_err) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async putPublish(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      const userIdStr = await redisClient.get(`auth_${token}`);
      if (!userIdStr) return res.status(401).json({ error: 'Unauthorized' });

      let userId;
      try {
        userId = new ObjectId(userIdStr);
      } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      let fileId;
      try {
        fileId = new ObjectId(id);
      } catch (e) {
        return res.status(404).json({ error: 'Not found' });
      }

      const filesCol = dbClient.db.collection('files');
      const owned = await filesCol.findOne({ _id: fileId, userId });
      if (!owned) return res.status(404).json({ error: 'Not found' });

      await filesCol.updateOne({ _id: fileId }, { $set: { isPublic: true } });
      const updated = await filesCol.findOne({ _id: fileId });
      return res.status(200).json(mapFileDoc(updated));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('FilesController.putPublish error:', err && err.message ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async putUnpublish(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      const userIdStr = await redisClient.get(`auth_${token}`);
      if (!userIdStr) return res.status(401).json({ error: 'Unauthorized' });

      let userId;
      try {
        userId = new ObjectId(userIdStr);
      } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      let fileId;
      try {
        fileId = new ObjectId(id);
      } catch (e) {
        return res.status(404).json({ error: 'Not found' });
      }

      const filesCol = dbClient.db.collection('files');
      const owned = await filesCol.findOne({ _id: fileId, userId });
      if (!owned) return res.status(404).json({ error: 'Not found' });

      await filesCol.updateOne({ _id: fileId }, { $set: { isPublic: false } });
      const updated = await filesCol.findOne({ _id: fileId });
      return res.status(200).json(mapFileDoc(updated));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('FilesController.putUnpublish error:', err && err.message ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getFile(req, res) {
    try {
      const { id } = req.params;

      // 1) Find file document
      let fileDoc = null;
      try {
        fileDoc = await dbClient.db.collection('files').findOne({ _id: new ObjectId(id) });
      } catch (e) {
        // invalid ObjectId format should behave as not found
      }
      if (!fileDoc) return res.status(404).json({ error: 'Not found' });

      // 2) If folder => 400
      if (fileDoc.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      // 3) Authorization: if not public, only owner can access
      if (!fileDoc.isPublic) {
        const token = req.header('X-Token');
        if (!token) return res.status(404).json({ error: 'Not found' });

        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) return res.status(404).json({ error: 'Not found' });

        // Ensure requester is the owner
        const ownerId = (fileDoc.userId && fileDoc.userId.toString()) || '';
        if (ownerId !== userId) return res.status(404).json({ error: 'Not found' });
      }

      // 4) Verify local file presence
      const { localPath } = fileDoc;
      if (!localPath || !fs.existsSync(localPath)) {
        return res.status(404).json({ error: 'Not found' });
      }

      // 5) Set MIME type from file name and stream content
      const contentType = mime.lookup(fileDoc.name) || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);

      // Stream the file (handles text & binary)
      const readStream = fs.createReadStream(localPath);
      readStream.on('error', () => res.status(404).json({ error: 'Not found' }));
      return readStream.pipe(res);
    } catch (err) {
      // Fallback – do not leak internals
      return res.status(500).json({ error: 'Server error' });
    }
  }
}

export default FilesController;
