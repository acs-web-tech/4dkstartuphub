# 🐳 Unified StartupHub Docker Guide

I have condensed your entire application into a **Single Unified Dockerfile**. This image now contains the Frontend, the Backend, and Nginx all working together in perfect harmony.

## 🚀 One-Command Build & Export

Run the updated script to generate your deployment package:
```cmd
.\export-docker.bat
```
This generates **`stphub_unified_deployment.tar`**.

---

## 🏗️ How to Deploy (The "One File" Way)

On your target server, you only need two files:
1.  `stphub_unified_deployment.tar`
2.  `docker-compose.yml`

### 1. Requirements
- Docker and Docker Compose installed.
- **Git LFS**: If you are cloning the repository, ensure you have [Git LFS installed](https://git-lfs.com/) and run:
  ```bash
  git lfs pull
  ```
  *(Otherwise the `.tar` file will just be a small pointer file and won't load!)*

### 2. Load the Package
```bash
docker load -i stphub_unified_deployment.tar
```

### 3. Start Everything
```bash
docker-compose up -d
```
This single command launches your entire platform including the Database.

---

## 🛠️ Combined Architecture

| Component | Responsibility |
| :--- | :--- |
| **Nginx** | Listens on Port 80, serves React files, and proxies API calls locally. |
| **Node.js** | Runs the backend logic on Port 5000 (private to the container). |
| **MongoDB**| Separate container for data stability (linked via Docker network). |

### Configuration
- **Access**: Visit `http://localhost` (Nginx handles everything).
- **Storage**: User uploads are saved in a persistent volume `./stp_uploads`.
- **Database**: Mongo data is kept safe in a Docker volume.

---

## 📝 Troubleshooting
- **Logs**: `docker-compose logs -f app`
- **Restart**: `docker-compose restart app`
- **Stop**: `docker-compose down`
