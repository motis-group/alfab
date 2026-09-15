.PHONY: help terraform-init terraform-plan terraform-apply terraform-destroy

# Single-app repository operations

help: ## Show this help message
	@echo 'Usage:'
	@echo '  make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

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
