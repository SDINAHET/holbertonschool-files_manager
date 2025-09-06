// controllers/FilesController.js
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import mimeTypes from 'mime-types';
import mongodb from 'mongodb';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';
import fileQueue from '../utils/queue';

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
      const fileId = result.insertedId;

      // Task 9: Add thumbnail generation job for images
      if (type === 'image') {
        try {
          await fileQueue.add('generateThumbnails', {
            fileId: fileId.toString(),
            userId: userId.toString(),
          });
        } catch (queueError) {
          console.error('Error adding job to queue:', queueError);
          // Don't fail the upload if queue fails
        }
      }

      return res.status(201).json({
        id: fileId.toString(),
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

      const doc = await dbClient.db.collection('files').findOne({
        _id: fileId,
        userId,
      });

      if (!doc) return res.status(404).json({ error: 'Not found' });

      return res.json(mapFileDoc(doc));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('FilesController.getShow error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // Tâche 6 — GET /files
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

      const { parentId = 0, page = 0 } = req.query;
      const pageNum = parseInt(page, 10) || 0;
      const limit = 20;
      const skip = pageNum * limit;

      let parentRef = 0;
      if (parentId && parentId !== '0') {
        try {
          parentRef = new ObjectId(parentId);
        } catch (e) {
          return res.status(200).json([]);
        }
      }

      const matchQuery = { userId };
      if (parentRef === 0) {
        matchQuery.parentId = 0;
      } else {
        matchQuery.parentId = parentRef;
      }

      const docs = await dbClient.db
        .collection('files')
        .find(matchQuery)
        .skip(skip)
        .limit(limit)
        .toArray();

      const mappedDocs = docs.map(mapFileDoc);
      return res.json(mappedDocs);
    } catch (err) {
      // eslint-disable-next-line no-console
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

      const filter = { _id: fileId, userId };
      const update = { $set: { isPublic: true } };
      const options = { returnDocument: 'after' };

      const result = await dbClient.db.collection('files').findOneAndUpdate(filter, update, options);

      if (!result.value) return res.status(404).json({ error: 'Not found' });

      return res.json(mapFileDoc(result.value));
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

      const filter = { _id: fileId, userId };
      const update = { $set: { isPublic: false } };
      const options = { returnDocument: 'after' };

      const result = await dbClient.db.collection('files').findOneAndUpdate(filter, update, options);

      if (!result.value) return res.status(404).json({ error: 'Not found' });

      return res.json(mapFileDoc(result.value));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('FilesController.putUnpublish error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // Tâche 8 — GET /files/:id/data
  static async getFile(req, res) {
    try {
      const { id } = req.params;
      const { size } = req.query;

      // Validation de l'ID
      let fileId;
      try {
        fileId = new ObjectId(id);
      } catch (e) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Recherche du fichier
      const doc = await dbClient.db.collection('files').findOne({ _id: fileId });
      if (!doc) return res.status(404).json({ error: 'Not found' });

      // Vérifier si le fichier est accessible
      const token = req.header('X-Token');
      let isOwner = false;

      if (token) {
        const userIdStr = await redisClient.get(`auth_${token}`);
        if (userIdStr) {
          try {
            const userId = new ObjectId(userIdStr);
            isOwner = doc.userId.equals(userId);
          } catch (e) {
            // Token invalide, pas le propriétaire
          }
        }
      }

      // Si le fichier n'est pas public et l'utilisateur n'est pas authentifié/propriétaire
      if (!doc.isPublic && !isOwner) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Vérifier que ce n'est pas un dossier
      if (doc.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      // Construire le chemin du fichier
      let filePath = doc.localPath;

      // Si une taille est demandée, chercher le fichier avec suffixe
      if (size && ['100', '250', '500'].includes(size)) {
        const dirname = path.dirname(filePath);
        const basename = path.basename(filePath);
        filePath = path.join(dirname, `${basename}_${size}`);
      }

      // Vérifier que le fichier existe sur le disque
      try {
        await fs.access(filePath);
      } catch (e) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Déterminer le MIME type
      const mimeType = mimeTypes.lookup(doc.name) || 'application/octet-stream';

      // Lire et retourner le contenu du fichier
      const fileContent = await fs.readFile(filePath);
      res.setHeader('Content-Type', mimeType);
      return res.send(fileContent);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('FilesController.getFile error:', (err && err.message) ? err.message : err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default FilesController;
