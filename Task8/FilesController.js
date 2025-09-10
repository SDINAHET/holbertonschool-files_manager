// controllers/FilesController.js
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import mimeTypes from 'mime-types';
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

      // Récupération des paramètres query avec gestion des undefined
      const parentIdRaw = req.query ? req.query.parentId : undefined;
      const pageRaw = req.query ? req.query.page : undefined;

      // Gestion de la page (par défaut 0)
      let page = 0;
      if (pageRaw !== undefined) {
        const parsedPage = parseInt(pageRaw, 10);
        if (!Number.isNaN(parsedPage) && parsedPage >= 0) {
          page = parsedPage;
        }
      }

      // Gestion du parentId (par défaut 0 = racine)
      let parentFilter = 0;
      if (parentIdRaw !== undefined && parentIdRaw !== '' && parentIdRaw !== '0') {
        try {
          parentFilter = new ObjectId(parentIdRaw);
        } catch (e) {
          // Si l'ObjectId n'est pas valide, on garde la chaîne
          // Cela ne matchera rien, donc retournera une liste vide
          parentFilter = String(parentIdRaw);
        }
      }

      const pipeline = [
        { $match: { userId, parentId: parentFilter } },
        { $skip: page * 20 },
        { $limit: 20 },
      ];

      const cursor = dbClient.db.collection('files').aggregate(pipeline);
      const docs = await cursor.toArray();

      const list = docs.map(mapFileDoc);
      return res.status(200).json(list);
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
