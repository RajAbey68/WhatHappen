#!/bin/bash

# WhatHappen Pre-Production Deployment Script
# This script deploys the application to pre-production staging environment

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="whathappen"
STAGING_PORT=3001
DOCKER_IMAGE="whathappen:staging"

echo -e "${BLUE}🚀 Starting WhatHappen Pre-Production Deployment${NC}"

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    print_status "All prerequisites are satisfied"
}

# Run tests
run_tests() {
    print_status "Running tests..."
    
    if npm test; then
        print_status "All tests passed"
    else
        print_error "Tests failed. Deployment aborted."
        exit 1
    fi
}

# Build the application
build_application() {
    print_status "Building application..."
    
    # Install dependencies
    print_status "Installing dependencies..."
    npm run install:all
    
    # Build client
    print_status "Building React client..."
    cd client && npm run build && cd ..
    
    # Build Docker image
    print_status "Building Docker image..."
    docker build -t $DOCKER_IMAGE .
    
    print_status "Application built successfully"
}

# Stop existing containers
stop_existing_containers() {
    print_status "Stopping existing containers..."
    
    # Stop and remove existing containers
    docker-compose down --remove-orphans || true
    
    # Remove old images
    docker image prune -f || true
    
    print_status "Existing containers stopped"
}

# Deploy the application
deploy_application() {
    print_status "Deploying application..."
    
    # Create necessary directories
    mkdir -p logs uploads
    
    # Set proper permissions
    chmod 755 logs uploads
    
    # Start the application
    docker-compose up -d --build
    
    print_status "Application deployed successfully"
}

# Health check
health_check() {
    print_status "Performing health check..."
    
    # Wait for application to start
    sleep 10
    
    # Check if application is responding
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s http://localhost:$STAGING_PORT/api/health > /dev/null; then
            print_status "Health check passed"
            return 0
        fi
        
        print_warning "Health check attempt $attempt/$max_attempts failed, retrying..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "Health check failed after $max_attempts attempts"
    return 1
}

# Display deployment information
show_deployment_info() {
    echo -e "${BLUE}📊 Deployment Information${NC}"
    echo -e "${GREEN}Application:${NC} $APP_NAME"
    echo -e "${GREEN}URL:${NC} http://localhost:$STAGING_PORT"
    echo -e "${GREEN}Health Check:${NC} http://localhost:$STAGING_PORT/api/health"
    echo -e "${GREEN}Docker Image:${NC} $DOCKER_IMAGE"
    echo ""
    echo -e "${YELLOW}Useful Commands:${NC}"
    echo -e "  View logs: ${BLUE}docker-compose logs -f whathappen${NC}"
    echo -e "  Stop app:  ${BLUE}docker-compose down${NC}"
    echo -e "  Restart:   ${BLUE}docker-compose restart whathappen${NC}"
}

# Main deployment process
main() {
    echo -e "${BLUE}Starting deployment at $(date)${NC}"
    
    check_prerequisites
    run_tests
    build_application
    stop_existing_containers
    deploy_application
    
    if health_check; then
        print_status "Deployment completed successfully!"
        show_deployment_info
    else
        print_error "Deployment failed during health check"
        echo -e "${YELLOW}Checking logs for more information...${NC}"
        docker-compose logs whathappen
        exit 1
    fi
}

# Handle script interruption
trap 'print_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main "$@"