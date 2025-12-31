@echo off
REM Threads Auto-Post Docker Startup Script for Windows
REM This script provides an easy way to start the entire application with Docker

setlocal enabledelayedexpansion

REM Check prerequisites
echo.
echo ========================================
echo Checking Prerequisites
echo ========================================
echo.

docker --version >nul 2>&1
if errorlevel 1 (
    echo [X] Docker is not installed
    echo Please install Docker Desktop from: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)
echo [OK] Docker is installed

docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [X] Docker Compose is not installed
    echo Please install Docker Desktop which includes Docker Compose
    pause
    exit /b 1
)
echo [OK] Docker Compose is installed

docker ps >nul 2>&1
if errorlevel 1 (
    echo [X] Docker daemon is not running
    echo Please start Docker Desktop
    pause
    exit /b 1
)
echo [OK] Docker daemon is running

REM Menu
:menu
echo.
echo ========================================
echo Threads Auto-Post Docker Setup
echo ========================================
echo.
echo What would you like to do?
echo 1) Build and start all services
echo 2) Start services (without rebuilding)
echo 3) Stop services
echo 4) View logs
echo 5) Restart services
echo 6) Clean up (remove containers and volumes)
echo 7) Exit
echo.

set /p choice="Enter your choice (1-7): "

if "%choice%"=="1" goto build_and_start
if "%choice%"=="2" goto start_only
if "%choice%"=="3" goto stop_services
if "%choice%"=="4" goto view_logs
if "%choice%"=="5" goto restart_services
if "%choice%"=="6" goto cleanup
if "%choice%"=="7" goto exit_script

echo Invalid choice
goto menu

:build_and_start
echo.
echo ========================================
echo Building Docker Images
echo ========================================
echo.
docker-compose build --no-cache
if errorlevel 1 (
    echo Failed to build Docker images
    pause
    goto menu
)

echo.
echo ========================================
echo Starting Services
echo ========================================
echo.
docker-compose up -d
if errorlevel 1 (
    echo Failed to start containers
    pause
    goto menu
)

echo.
echo ========================================
echo Service Status
echo ========================================
echo.
docker-compose ps

echo.
echo ========================================
echo Access Your Application
echo ========================================
echo.
echo Frontend (React App): http://localhost
echo Backend API: http://localhost:3001
echo MongoDB: mongodb://localhost:27017
echo Redis: redis://localhost:6379
echo.
echo View logs: docker-compose logs -f
echo Stop services: docker-compose down
echo.
pause
goto menu

:start_only
echo.
echo ========================================
echo Starting Services
echo ========================================
echo.
docker-compose up -d
if errorlevel 1 (
    echo Failed to start containers
    pause
    goto menu
)

echo.
echo ========================================
echo Service Status
echo ========================================
echo.
docker-compose ps
echo.
pause
goto menu

:stop_services
echo.
echo ========================================
echo Stopping Services
echo ========================================
echo.
docker-compose down
echo Services stopped
echo.
pause
goto menu

:view_logs
echo.
echo ========================================
echo Docker Logs (Press Ctrl+C to exit)
echo ========================================
echo.
docker-compose logs -f
goto menu

:restart_services
echo.
echo ========================================
echo Restarting Services
echo ========================================
echo.
docker-compose restart
echo Services restarted
echo.
docker-compose ps
echo.
pause
goto menu

:cleanup
echo.
echo ========================================
echo Clean Up
echo ========================================
echo.
echo This will remove all containers and volumes.
set /p confirm="Continue? (y/N): "
if /i "%confirm%"=="y" (
    docker-compose down -v
    echo Cleanup completed
) else (
    echo Cleanup cancelled
)
echo.
pause
goto menu

:exit_script
echo Goodbye!
exit /b 0
