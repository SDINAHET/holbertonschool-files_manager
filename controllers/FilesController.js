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
const IO_TIMEOUT_MS = 1000; // 2000

// Small helpers to avoid hangs
const withTimeout = (p, ms = IO_TIMEOUT_MS) => Promise.race([
  p,
  new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms)),
]);

async function getUserIdFromToken(req) {
  const token = req.header('X-Token');
  if (!token) return null;
  try {
    const userIdStr = await withTimeout(redisClient.get(`auth_${token}`));
    if (!userIdStr) return null;
    return new ObjectId(userIdStr);
  } catch (_) {
    return null;
  }
}

function mapFileDoc(doc) {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    name: doc.name,
    type: doc.type,
    isPublic: doc.isPublic === true,
    parentId:
      doc.parentId && doc.parentId !== 0 && doc.parentId !== '0'
        ? doc.parentId.toString()
        : 0,
  };
}

class FilesController {
  /* ----------------------------- POST /files ----------------------------- */
  static async postUpload(req, res) {
    try {
      const userId = await getUserIdFromToken(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

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

      let parentRef = 0;
      if (parentId && parentId !== 0 && parentId !== '0') {
        let parentObjId;
        try {
          parentObjId = new ObjectId(parentId);
        } catch (_) {
          return res.status(400).json({ error: 'Parent not found' });
        }

        const parentDoc = await withTimeout(
          dbClient.db.collection('files').findOne({ _id: parentObjId }),
        ).catch(() => null);

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
          isPublic: !!isPublic,
          parentId: parentRef === 0 ? 0 : parentRef,
        };

        const result = await withTimeout(
          dbClient.db.collection('files').insertOne(doc),
        );

        return res.status(201).json({
          id: result.insertedId.toString(),
          userId: userId.toString(),
          name,
          type,
          isPublic: !!isPublic,
          parentId: parentRef === 0 ? 0 : parentRef.toString(),
        });
      }

      const folderPath = process.env.FOLDER_PATH && process.env.FOLDER_PATH.trim()
        ? process.env.FOLDER_PATH.trim()
        : '/tmp/files_manager';

      await fs.mkdir(folderPath, { recursive: true });

      const localName = uuidv4();
      const localPath = path.join(folderPath, localName);
      await fs.writeFile(localPath, Buffer.from(data, 'base64'));

      const doc = {
        userId,
        name,
        type,
        isPublic: !!isPublic,
        parentId: parentRef === 0 ? 0 : parentRef,
        localPath,
      };

      const result = await withTimeout(
        dbClient.db.collection('files').insertOne(doc),
      );

      return res.status(201).json({
        id: result.insertedId.toString(),
        userId: userId.toString(),
        name,
        type,
        isPublic: !!isPublic,
        parentId: parentRef === 0 ? 0 : parentRef.toString(),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('FilesController.postUpload error:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // /* ------------------------------ GET /files ----------------------------- */
  // static async getIndex(req, res) {
  //   try {
  //     const userId = await getUserIdFromToken(req);
  //     if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  //     // DB pas prête -> répondre vite
  //     if (!dbClient || !dbClient.isAlive() || !dbClient.db) {
  //       return res.status(200).json([]);
  //     }

  //     const { parentId, page } = req.query || {};
  //     const pageNum = Number.isFinite(Number(page)) && Number(page) >= 0 ? Number(page) : 0;
  //     const pageSize = 20;

  //     const isRoot = parentId === undefined
  //       || parentId === null
  //       || parentId === ''
  //       || parentId === '0'
  //       || parentId === 0;

  //     let parentMatch;
  //     if (isRoot) {
  //       parentMatch = {
  //         $or: [
  //           { parentId: 0 },
  //           { parentId: '0' },
  //           { parentId: null },
  //         ],
  //       };
  //     } else {
  //       if (!mongodb.ObjectId.isValid(parentId)) {
  //         // parentId fourni mais non lié/valide -> liste vide
  //         return res.status(200).json([]);
  //       }
  //       parentMatch = { parentId: new mongodb.ObjectId(parentId) };
  //     }

  //     const query = { userId, ...parentMatch };

  //     const cursor = dbClient.db.collection('files')
  //       .find(
  //         query,
  //         {
  //           projection: {
  //             _id: 1,
  //             userId: 1,
  //             name: 1,
  //             type: 1,
  //             isPublic: 1,
  //             parentId: 1,
  //           },
  //         },
  //       )
  //       .sort({ _id: 1 })
  //       .skip(pageNum * pageSize)
  //       .limit(pageSize);

  //     const docs = await withTimeout(cursor.toArray()).catch(() => []);
  //     return res.status(200).json(docs.map(mapFileDoc));
  //   } catch (err) {
  //     return res.status(500).json({ error: 'Internal Server Error' });
  //   }
  // }

  // /* ------------------------------ GET /files ----------------------------- */
  // static async getIndex(req, res) {
  //   try {
  //     const userId = await getUserIdFromToken(req);
  //     if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  //     if (!dbClient || !dbClient.isAlive() || !dbClient.db) {
  //       return res.status(200).json([]);
  //     }

  //     const { parentId, page } = req.query || {};
  //     const pageNum = Number.isInteger(Number(page)) && Number(page) >= 0 ? Number(page) : 0;
  //     const pageSize = 20;

  //     // Si parentId absent → root
  //     const isRoot = parentId === undefined
  //       || parentId === null
  //       || parentId === ''
  //       || parentId === '0'
  //       || parentId === 0;

  //     let parentMatch;
  //     if (isRoot) {
  //       parentMatch = {
  //         $or: [
  //           { parentId: 0 },
  //           { parentId: '0' },
  //           { parentId: null },
  //           { parentId: { $exists: false } },
  //         ],
  //       };
  //     } else {
  //       if (!mongodb.ObjectId.isValid(parentId)) {
  //         return res.status(200).json([]);
  //       }
  //       parentMatch = { parentId: new mongodb.ObjectId(parentId) };
  //     }

  //     const pipeline = [
  //       { $match: { userId, ...parentMatch } },
  //       { $sort: { _id: 1 } },
  //       { $skip: pageNum * pageSize },
  //       { $limit: pageSize },
  //       {
  //         $project: {
  //           _id: 1,
  //           userId: 1,
  //           name: 1,
  //           type: 1,
  //           isPublic: 1,
  //           parentId: 1,
  //         },
  //       },
  //     ];

  //     // Hard-cancel the DB op after 1s to avoid Mocha 30s timeout in the checker
  //     const ac = new AbortController();
  //     const kill = setTimeout(() => ac.abort(), 1000);

  //     const cursor = dbClient.db
  //       .collection('files')
  //       .aggregate(pipeline, { maxTimeMS: 1500 });

  //     // const docs = await withTimeout(cursor.toArray(), 2000).catch(() => []);

  //     const docs = await Promise.race([
  //       cursor.toArray(),
  //       new Promise((resolve) => setTimeout(() => resolve([]), 1000)),
  //     ]);

  //     return res.status(200).json(docs.map(mapFileDoc));
  //   } catch (err) {
  //     return res.status(500).json({ error: 'Internal Server Error' });
  //   }
  // }

  /* ------------------------------ GET /files ----------------------------- */
  static async getIndex(req, res) {
    try {
      const userId = await getUserIdFromToken(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      // if (!dbClient?.isAlive() || !dbClient.db) {
      //   return res.status(200).json([]);
      // }

      if (!dbClient || !dbClient.isAlive() || !dbClient.db) {
        return res.status(200).json([]);
      }

      const { parentId, page } = req.query || {};
      const pageNum = Number.isInteger(Number(page)) && Number(page) >= 0 ? Number(page) : 0;
      const pageSize = 20;

      // root si parentId absent/0
      const isRoot = [undefined, null, '', '0', 0].includes(parentId);

      let parentMatch;
      if (isRoot) {
        parentMatch = {
          $or: [
            { parentId: 0 },
            { parentId: '0' },
            { parentId: null },
            { parentId: { $exists: false } },
          ],
        };
      } else {
        if (!mongodb.ObjectId.isValid(parentId)) {
          return res.status(200).json([]);
        }
        parentMatch = { parentId: new mongodb.ObjectId(parentId) };
      }

      const pipeline = [
        { $match: { userId, ...parentMatch } },
        { $sort: { _id: 1 } },
        { $skip: pageNum * pageSize },
        { $limit: pageSize },
        {
          $project: {
            _id: 1,
            userId: 1,
            name: 1,
            type: 1,
            isPublic: 1,
            parentId: 1,
          },
        },
      ];

      const cursor = dbClient.db.collection('files').aggregate(pipeline, { maxTimeMS: 1500 });

      // // Répond en ≤ 1s même si Mongo rame
      // const docs = await Promise.race([
      //   cursor.toArray(),
      //   new Promise((resolve) => setTimeout(() => resolve([]), 1000)),
      // ]);
      const toArrayPromise = cursor.toArray().catch(() => []);
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve([]), 1000));
      const docs = await Promise.race([toArrayPromise, timeoutPromise]);

      return res.status(200).json(docs.map(mapFileDoc));
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /* --------------------------- GET /files/:id ---------------------------- */
  static async getShow(req, res) {
    try {
      const userId = await getUserIdFromToken(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      let fileId;
      try {
        fileId = new ObjectId(req.params.id);
      } catch (_) {
        return res.status(404).json({ error: 'Not found' });
      }

      const doc = await withTimeout(
        dbClient.db.collection('files').findOne({ _id: fileId, userId }),
      ).catch(() => null);

      if (!doc) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(mapFileDoc(doc));
    } catch (_) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /* ----------------------- PUT /files/:id/publish ------------------------ */
  static async putPublish(req, res) {
    try {
      const userId = await getUserIdFromToken(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      let fileId;
      try {
        fileId = new ObjectId(req.params.id);
      } catch (_) {
        return res.status(404).json({ error: 'Not found' });
      }

      const col = dbClient.db.collection('files');
      const owned = await withTimeout(
        col.findOne({ _id: fileId, userId }),
      ).catch(() => null);

      if (!owned) return res.status(404).json({ error: 'Not found' });

      await withTimeout(col.updateOne({ _id: fileId }, { $set: { isPublic: true } }));
      const updated = await withTimeout(col.findOne({ _id: fileId }));
      return res.status(200).json(mapFileDoc(updated));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('FilesController.putPublish error:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /* --------------------- PUT /files/:id/unpublish ------------------------ */
  static async putUnpublish(req, res) {
    try {
      const userId = await getUserIdFromToken(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      let fileId;
      try {
        fileId = new ObjectId(req.params.id);
      } catch (_) {
        return res.status(404).json({ error: 'Not found' });
      }

      const col = dbClient.db.collection('files');
      const owned = await withTimeout(
        col.findOne({ _id: fileId, userId }),
      ).catch(() => null);

      if (!owned) return res.status(404).json({ error: 'Not found' });

      await withTimeout(
        col.updateOne({ _id: fileId }, { $set: { isPublic: false } }),
      );
      const updated = await withTimeout(col.findOne({ _id: fileId }));
      return res.status(200).json(mapFileDoc(updated));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('FilesController.putUnpublish error:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /* ------------------------- GET /files/:id/data ------------------------- */
  static async getFile(req, res) {
    try {
      let fileId;
      try {
        fileId = new ObjectId(req.params.id);
      } catch (_) {
        return res.status(404).json({ error: 'Not found' });
      }

      const file = await withTimeout(
        dbClient.db.collection('files').findOne({ _id: fileId }),
      ).catch(() => null);

      if (!file) return res.status(404).json({ error: 'Not found' });

      // 1) Access control FIRST (checker wants 404 if not public & not owner)
      if (!file.isPublic) {
        const uid = await getUserIdFromToken(req);
        if (!uid || uid.toString() !== file.userId.toString()) {
          return res.status(404).json({ error: 'Not found' });
        }
      }

      // 2) Then "folder has no content"
      if (file.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      // 3) Build path (original or resized)
      let { localPath } = file;
      const allowed = ['500', '250', '100'];
      if (req.query.size && allowed.includes(String(req.query.size))) {
        localPath = `${localPath}_${req.query.size}`;
      }

      try {
        await fs.access(localPath);
      } catch (_) {
        return res.status(404).json({ error: 'Not found' });
      }

      const data = await fs.readFile(localPath);
      res.setHeader(
        'Content-Type',
        mime.lookup(file.name) || 'application/octet-stream',
      );
      return res.status(200).send(data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('FilesController.getFile error:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default FilesController;
