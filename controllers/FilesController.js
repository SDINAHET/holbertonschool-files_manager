// controllers/FilesController.js
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import mongodb from 'mongodb';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const { ObjectId } = mongodb;
const VALID_TYPES = new Set(['folder', 'file', 'image']);

// Formate les documents renvoyés par l'API
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
      // 1) Auth via X-Token -> userId en Redis
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

      // 2) Inputs
      const {
        name,
        type,
        parentId = 0,
        isPublic = false,
        data,
      } = req.body || {};

      if (!name) return res.status(400).json({ error: 'Missing name' });
      if (!type || !VALID_TYPES.has(type)) {
        return res.status(400).json({ error: 'Missing type' });
      }
      if (type !== 'folder' && !data) {
        return res.status(400).json({ error: 'Missing data' });
      }

      // 3) parentId validations
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

      // 4) Si dossier -> insert direct
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

      // 5) Sinon (file|image) -> écrire en disque puis insert
      const folderPath = process.env.FOLDER_PATH && process.env.FOLDER_PATH.trim()
        ? process.env.FOLDER_PATH.trim()
        : '/tmp/files_manager';

      // Crée le dossier si absent
      await fs.mkdir(folderPath, { recursive: true });

      const localName = uuidv4();
      const localPath = path.join(folderPath, localName);

      // data est en Base64 → écrire en clair
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
      console.error('FilesController.postUpload error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // Tâche 6 — GET /files/:id
  static async getShow(req, res) {
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

      const doc = await dbClient.db.collection('files').findOne({ _id: fileId, userId });
      if (!doc) return res.status(404).json({ error: 'Not found' });

      return res.status(200).json(mapFileDoc(doc));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('FilesController.getShow error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getIndex(req, res) {
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

      const { parentId, page } = req.query || {};
      const pageNum = Number.isFinite(+page) ? Math.max(0, Math.trunc(+page)) : 0;

      let parentFilter = 0;
      if (parentId && parentId !== '0' && parentId !== 0) {
        try {
          parentFilter = new ObjectId(parentId);
        } catch (e) {
          parentFilter = '__no_match__'; // garantira []
        }
      }

      const docs = await dbClient.db.collection('files')
        .aggregate([
          { $match: { userId, parentId: parentFilter } },
          { $sort: { _id: 1 } },
          { $skip: pageNum * 20 },
          { $limit: 20 },
        ])
        .toArray();

      return res.status(200).json(docs.map(mapFileDoc));
    } catch (err) {
      console.error('FilesController.getIndex error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // Tâche 7 — PUT /files/:id/publish
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
      console.error('FilesController.putPublish error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // Tâche 7 — PUT /files/:id/unpublish
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
      console.error('FilesController.putUnpublish error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default FilesController;
