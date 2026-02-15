@echo off
echo 🚀 Starting Unified StartupHub Docker Build and Export...

echo.
echo 📦 Building Unified App Image (Frontend + Backend + Nginx)...
docker build --no-cache -t stphub-app .
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ ERROR: Docker build failed! 
    echo Please check the error messages above.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo 📦 Pulling MongoDB Image...
docker pull mongo:latest

echo.
echo 🏗️ Packaging Image and Database into .tar file...
docker save -o stphub_unified_deployment.tar stphub-app mongo:latest
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ ERROR: Failed to save Docker images!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ✅ Success! Exported to: stphub_unified_deployment.tar
echo.
echo To deploy on another machine:
echo 1. Copy stphub_unified_deployment.tar and docker-compose.yml to the target.
echo 2. Run: docker load -i stphub_unified_deployment.tar
echo 3. Run: docker-compose up -d
pause
