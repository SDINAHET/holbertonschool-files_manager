# Task 9 - Image Thumbnail Processing

Cette tâche implémente la génération automatique de vignettes (thumbnails) pour les images uploadées.

## Fonctionnalités

### 1. Queue de traitement (Bull)
- Utilise Redis comme backend pour la queue
- Traite les jobs de génération de thumbnails en arrière-plan

### 2. Worker de traitement d'images
- Génère 3 tailles de vignettes : 100px, 250px, 500px
- Utilise le module `image-thumbnail`
- Sauvegarde les vignettes avec le suffixe `_<taille>`

### 3. Endpoint mis à jour
- GET `/files/:id/data?size=<taille>` retourne la vignette de la taille demandée
- Les tailles supportées : 100, 250, 500
- Retourne l'image originale si aucune taille spécifiée

## Structure des fichiers

```
Task9/
├── utils/
│   ├── queue.js          # Configuration Bull queue
│   ├── db.mjs           # Client MongoDB
│   └── redis.mjs        # Client Redis
├── FilesController.js   # Controller avec queue pour images
├── worker.js           # Worker pour génération thumbnails
├── index.js            # Routes
├── server.js           # Serveur Express
└── README.md           # Cette documentation
```

## Installation et exécution

1. Les packages sont déjà installés dans le projet principal :
   ```bash
   npm install bull image-thumbnail
   ```

2. Démarrer Redis et MongoDB

3. Démarrer le serveur (Terminal 1) :
   ```bash
   npm run start-server
   ```

4. Démarrer le worker (Terminal 2) :
   ```bash
   npm run start-worker
   ```

## Test

1. Se connecter :
   ```bash
   curl 0.0.0.0:5000/connect -H "Authorization: Basic Ym9iQGR5bGFuLmNvbTp0b3RvMTIzNCE="
   ```

2. Uploader une image :
   ```bash
   python image_upload.py image.png <token> <parentId>
   ```

3. Vérifier les thumbnails générées :
   ```bash
   # Image originale
   curl -XGET 0.0.0.0:5000/files/<fileId>/data -so image.png
   
   # Thumbnail 100px
   curl -XGET 0.0.0.0:5000/files/<fileId>/data?size=100 -so image_100.png
   
   # Thumbnail 250px
   curl -XGET 0.0.0.0:5000/files/<fileId>/data?size=250 -so image_250.png
   
   # Thumbnail 500px
   curl -XGET 0.0.0.0:5000/files/<fileId>/data?size=500 -so image_500.png
   ```

## Processus de génération

1. Upload d'une image via POST `/files`
2. Sauvegarde en base et sur disque
3. Ajout d'un job à la queue Bull
4. Le worker traite le job :
   - Vérifie les paramètres
   - Trouve le fichier en base
   - Génère les 3 thumbnails
   - Sauvegarde sur disque

## Gestion d'erreurs

Le worker gère les erreurs suivantes :
- `Missing fileId` - ID de fichier manquant
- `Missing userId` - ID utilisateur manquant  
- `File not found` - Fichier introuvable en base
- Erreurs de traitement d'image
