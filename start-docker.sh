#!/bin/bash

# Threads Auto-Post Docker Startup Script
# This script provides an easy way to start the entire application with Docker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
        exit 1
    fi
    print_success "Docker is installed"
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        echo "Please install Docker Desktop which includes Docker Compose"
        exit 1
    fi
    print_success "Docker Compose is installed"
    
    if ! docker ps &> /dev/null; then
        print_error "Docker daemon is not running"
        echo "Please start Docker Desktop"
        exit 1
    fi
    print_success "Docker daemon is running"
}

# Build containers
build_containers() {
    print_header "Building Docker Images"
    
    echo "Building backend and frontend images..."
    docker-compose build --no-cache
    
    if [ $? -eq 0 ]; then
        print_success "Docker images built successfully"
    else
        print_error "Failed to build Docker images"
        exit 1
    fi
}

# Start containers
start_containers() {
    print_header "Starting Services"
    
    echo "Starting MongoDB, Redis, Backend (API + Worker), and Frontend..."
    docker-compose up -d
    
    if [ $? -eq 0 ]; then
        print_success "Containers started successfully"
    else
        print_error "Failed to start containers"
        exit 1
    fi
}

# Wait for services
wait_for_services() {
    print_header "Waiting for Services to Be Ready"
    
    local max_attempts=30
    local attempt=0
    
    # Wait for backend
    echo "Checking backend health..."
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:3001/health &> /dev/null; then
            print_success "Backend is ready"
            break
        fi
        attempt=$((attempt + 1))
        if [ $attempt -lt $max_attempts ]; then
            echo "Waiting for backend... ($attempt/$max_attempts)"
            sleep 2
        fi
    done
    
    if [ $attempt -eq $max_attempts ]; then
        print_warning "Backend took longer than expected to start"
    fi
    
    # Wait for frontend
    attempt=0
    echo "Checking frontend health..."
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost/health &> /dev/null; then
            print_success "Frontend is ready"
            break
        fi
        attempt=$((attempt + 1))
        if [ $attempt -lt $max_attempts ]; then
            echo "Waiting for frontend... ($attempt/$max_attempts)"
            sleep 2
        fi
    done
    
    if [ $attempt -eq $max_attempts ]; then
        print_warning "Frontend took longer than expected to start"
    fi
}

# Show status
show_status() {
    print_header "Service Status"
    
    docker-compose ps
}

# Show access information
show_access_info() {
    print_header "Access Your Application"
    
    echo "📱 Frontend (React App):"
    print_info "http://localhost"
    echo ""
    
    echo "🔌 Backend API:"
    print_info "http://localhost:3001"
    echo ""
    
    echo "🗄️  MongoDB:"
    print_info "mongodb://localhost:27017"
    echo ""
    
    echo "⚡ Redis:"
    print_info "redis://localhost:6379"
    echo ""
    
    echo "📋 View Logs:"
    print_info "docker-compose logs -f"
    echo ""
    
    echo "🛑 Stop Services:"
    print_info "docker-compose down"
    echo ""
}

# Main menu
show_menu() {
    echo ""
    echo "What would you like to do?"
    echo "1) Build and start all services"
    echo "2) Start services (without rebuilding)"
    echo "3) Stop services"
    echo "4) View logs"
    echo "5) Restart services"
    echo "6) Clean up (remove containers and volumes)"
    echo "7) Exit"
    echo ""
    read -p "Enter your choice (1-7): " choice
}

# Handle menu selection
handle_menu_selection() {
    case $choice in
        1)
            check_prerequisites
            build_containers
            start_containers
            wait_for_services
            show_status
            show_access_info
            ;;
        2)
            check_prerequisites
            start_containers
            wait_for_services
            show_status
            show_access_info
            ;;
        3)
            print_header "Stopping Services"
            docker-compose down
            print_success "Services stopped"
            ;;
        4)
            docker-compose logs -f
            ;;
        5)
            print_header "Restarting Services"
            docker-compose restart
            print_success "Services restarted"
            wait_for_services
            show_status
            ;;
        6)
            print_header "Cleaning Up"
            read -p "This will remove all containers and volumes. Continue? (y/N): " confirm
            if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
                docker-compose down -v
                print_success "Cleanup completed"
            else
                print_info "Cleanup cancelled"
            fi
            ;;
        7)
            echo "Goodbye!"
            exit 0
            ;;
        *)
            print_error "Invalid choice"
            show_menu
            handle_menu_selection
            ;;
    esac
}

# Main script
main() {
    print_header "🚀 Threads Auto-Post Docker Setup"
    
    # Check if running first time setup or interactive mode
    if [ "$1" = "--build" ]; then
        check_prerequisites
        build_containers
        start_containers
        wait_for_services
        show_status
        show_access_info
    elif [ "$1" = "--start" ]; then
        check_prerequisites
        start_containers
        wait_for_services
        show_status
        show_access_info
    elif [ "$1" = "--stop" ]; then
        docker-compose down
        print_success "Services stopped"
    elif [ "$1" = "--logs" ]; then
        docker-compose logs -f
    else
        # Interactive mode
        while true; do
            show_menu
            handle_menu_selection
        done
    fi
}

# Run main
main "$@"
