.PHONY: deploy init down help setup env-setup terraform-init terraform-plan terraform-apply terraform-destroy

help: ## Show this help message
	@echo 'Usage:'
	@echo '  make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

env-setup: ## Setup environment from .env.example if .env doesn't exist
	@if [ ! -f .env ]; then \
		echo "Creating .env file from .env.example..."; \
		cp .env.example .env; \
		echo "⚠️  Please update .env with your actual values"; \
		exit 1; \
	fi

init: env-setup ## Initialize server with Nginx and SSL configuration
	@echo "Initializing server configuration..."
	@chmod +x scripts/load-env.sh scripts/init.sh
	@source scripts/load-env.sh && load_env && ./scripts/init.sh
	@echo "👋 Server initialized successfully."

deploy: env-setup ## Deploy the application
	@echo "Deploying application..."
	@chmod +x scripts/load-env.sh scripts/deploy.sh
	@source scripts/load-env.sh && load_env && ./scripts/deploy.sh
	@echo "👋 Application deployed successfully."
	
down: env-setup ## Stop all server services
	@echo "Stopping server services..."
	@chmod +x scripts/load-env.sh scripts/down.sh
	@source scripts/load-env.sh && load_env && ./scripts/down.sh
	@echo "👋 Server services stopped successfully."

setup: init deploy ## Complete setup: initialize server and deploy application 
	@echo "🚀 Setup complete! Server is ready to use."

terraform-init: ## Initialize Terraform
	@echo "Initializing Terraform..."
	@cd terraform && terraform init
	@echo "👋 Terraform initialized successfully."

terraform-plan: ## Plan Terraform changes
	@echo "Planning Terraform changes..."
	@cd terraform && terraform plan
	@echo "👋 Terraform plan completed."

terraform-apply: ## Apply Terraform changes
	@echo "Applying Terraform changes..."
	@cd terraform && terraform apply
	@echo "🚀 Infrastructure deployed successfully!"

terraform-destroy: ## Destroy Terraform infrastructure
	@echo "Destroying Terraform infrastructure..."
	@cd terraform && terraform destroy
	@echo "👋 Infrastructure destroyed successfully."

terraform-setup: terraform-init terraform-apply ## Complete Terraform setup: initialize and apply
	@echo "🚀 Terraform setup complete! Infrastructure is ready to use."

