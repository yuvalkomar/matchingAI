# Docker Setup Guide

This guide explains how to run the Transaction Reconciliation project using Docker and Docker Compose.

## Prerequisites

- **Docker Desktop** installed and running on your system
  - Download from: https://www.docker.com/products/docker-desktop
  - Make sure Docker Desktop is running before proceeding

## Quick Start

1. **Navigate to the project root directory**
   ```powershell
   cd path/to/project
   ```

2. **Build and start the containers**
   ```powershell
   docker-compose up --build
   ```

3. **Access the application**
   - Frontend: http://localhost (port 80)
   - Backend API: http://localhost:8000
   - Backend API Docs: http://localhost:8000/docs

## What's Included

The Docker setup includes:

- **Backend Service** (`transaction-reconciliation-backend`)
  - Python 3.11 with FastAPI
  - Runs on port 8000
  - Auto-reloads on code changes (development mode)

- **Frontend Service** (`transaction-reconciliation-frontend`)
  - React + TypeScript application
  - Built and served via Nginx
  - Runs on port 80

## Environment Variables (Optional)

If you want to enable LLM features (vendor normalization, semantic similarity):

1. Create a `.env` file in the project root:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

2. The `.env` file will be automatically mounted into the backend container.

**Note**: The application works without the API key, but LLM features will be disabled.

## Common Commands

### Start the services
```powershell
docker-compose up
```

### Start in detached mode (background)
```powershell
docker-compose up -d
```

### Rebuild containers after code changes
```powershell
docker-compose up --build
```

### Stop the services
```powershell
docker-compose down
```

### Stop and remove volumes
```powershell
docker-compose down -v
```

### View logs
```powershell
# All services
docker-compose logs

# Specific service
docker-compose logs backend
docker-compose logs frontend

# Follow logs (like tail -f)
docker-compose logs -f
```

### Restart a specific service
```powershell
docker-compose restart backend
docker-compose restart frontend
```

## Development Workflow

The Docker setup is configured for development:

- **Backend**: Code changes are automatically detected and the server reloads (volume mount + auto-reload enabled)
- **Frontend**: Rebuild required after changes (run `docker-compose up --build frontend`)

### Making Changes

1. **Backend changes**: Edit files in `backend/` - changes are automatically detected and the server reloads (no restart needed)
2. **Frontend changes**: Edit files in `frontend/`, then rebuild:
   ```powershell
   docker-compose up --build frontend
   ```

## Troubleshooting

### Port Already in Use

If you get an error about ports being in use:

- **Port 8000** (backend): Change it in `docker-compose.yml`:
  ```yaml
  ports:
    - "8001:8000"  # Change 8001 to any available port
  ```

- **Port 80** (frontend): Change it in `docker-compose.yml`:
  ```yaml
  ports:
    - "8080:80"  # Change 8080 to any available port
  ```

### Container Won't Start

1. Check Docker Desktop is running
2. Check logs: `docker-compose logs`
3. Try rebuilding: `docker-compose up --build`

### Backend Not Connecting to Frontend

- Verify both containers are running: `docker-compose ps`
- Check backend logs: `docker-compose logs backend`
- Verify backend is accessible: Visit http://localhost:8000/docs

### CORS Errors

The backend CORS is configured to allow:
- `http://localhost:5173` (Vite dev server)
- `http://localhost:3000` (Alternative port)
- `http://localhost` (Docker frontend)

If you're accessing from a different URL, you may need to update `backend/main.py` CORS settings.

## Production Deployment

For production deployment:

1. Remove volume mounts from `docker-compose.yml` (code changes shouldn't be live)
2. Consider using environment-specific configuration
3. Set up proper secrets management for API keys
4. Use a reverse proxy (like Traefik or Nginx) for SSL/TLS
5. Configure resource limits in `docker-compose.yml`

## File Structure

```
.
├── docker-compose.yml          # Orchestrates both services
├── .dockerignore               # Files excluded from Docker builds
├── backend/
│   └── Dockerfile             # Backend container definition
├── frontend/
│   ├── Dockerfile             # Frontend container definition
│   └── nginx.conf             # Nginx configuration for frontend
└── DOCKER.md                  # This file
```

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)


1. View the frontend: Open `http://localhost` in your browser to see the Transaction Reconciliation home page.
2. Test the backend: Visit `http://localhost:8000/docs` to see the interactive API documentation (Swagger UI) where you can test API endpoints.
3. Check health: Visit `http://localhost:8000` to see the backend health check response.

Useful commands
- View logs:
  ```
  docker logs transaction-reconciliation-backend  docker logs transaction-reconciliation-frontend
  ```
- Stop the services:
  ```
  docker-compose down
  ```
- Restart a service:
  ```
  docker restart transaction-reconciliation-backend  docker restart transaction-reconciliation-frontend
  ```