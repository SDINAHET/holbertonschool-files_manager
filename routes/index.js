// routes/index.js
import { Router } from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController'; // <-- ajouté task3
import AuthController from '../controllers/AuthController'; // <-- ajouté task4
import FilesController from '../controllers/FilesController'; // <-- add task5

const router = Router();

router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);

// Task 3
router.post('/users', UsersController.postNew); // <-- ajouté task3

// Task 4
router.get('/connect', AuthController.getConnect); // <-- ajouté task4
router.get('/disconnect', AuthController.getDisconnect); // <-- ajouté task4
router.get('/users/me', UsersController.getMe); // <-- ajouté task4

// Task 5
router.post('/files', FilesController.postUpload); // <-- add task5

// Task 6
router.get('/files/:id', FilesController.getShow); // <-- add task6
router.get('/files', FilesController.getIndex); // <-- add task6

// Task 7
router.put('/files/:id/publish', FilesController.putPublish); // <-- add task7
router.put('/files/:id/unpublish', FilesController.putUnpublish); // <-- add task7

export default router;
