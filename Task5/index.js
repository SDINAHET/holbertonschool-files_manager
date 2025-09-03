// routes/index.js
import { Router } from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController'; // <-- ajouté task3
import AuthController from '../controllers/AuthController'; // <-- ajouté task4
import FilesController from '../controllers/FilesController'; // <-- add task5

const router = Router();

router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);

router.post('/users', UsersController.postNew); // <-- ajouté task3

router.get('/connect', AuthController.getConnect); // <-- ajouté task4
router.get('/disconnect', AuthController.getDisconnect); // <-- ajouté task4
router.get('/users/me', UsersController.getMe); // <-- ajouté task4

router.post('/files', FilesController.postUpload); // <-- add task5

export default router;
