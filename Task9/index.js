import express from 'express';
import FilesController from './FilesController.js'; // Ensure .js extension
import AuthController from '../controllers/AuthController.js'; // Ensure .js extension
import UsersController from '../controllers/UsersController.js'; // Ensure .js extension
import AppController from '../controllers/AppController.js'; // Ensure .js extension

const router = express.Router();

// Task 3
router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);

// Task 4
router.post('/users', UsersController.postNew);

// Task 5
router.get('/connect', AuthController.getConnect);
router.get('/disconnect', AuthController.getDisconnect);
router.get('/users/me', UsersController.getMe);

// Task 6-7
router.post('/files', FilesController.postUpload);
router.get('/files/:id', FilesController.getShow);
router.get('/files', FilesController.getIndex);
router.put('/files/:id/publish', FilesController.putPublish);
router.put('/files/:id/unpublish', FilesController.putUnpublish);

// Task 8-9
router.get('/files/:id/data', FilesController.getFile);

export default router;
