# Terraform for NextJS on AWS EC2

This directory contains Terraform configuration to deploy the NextJS application to an AWS EC2 instance.

## Prerequisites

1. [Terraform](https://www.terraform.io/downloads.html) installed (v1.2.0 or newer)
2. AWS credentials configured
3. SSH key pair for SSH access to the EC2 instance

## Getting Started

1. Copy the example variables file:

```bash
cp terraform.tfvars.example terraform.tfvars
```

2. Edit `terraform.tfvars` with your actual values:

   - Update AWS region if needed
   - Set your SSH key paths
   - Update Supabase configuration if needed

3. Initialize Terraform:

```bash
terraform init
```

4. Plan the deployment:

```bash
terraform plan
```

5. Apply the configuration:

```bash
terraform apply
```

6. After successful deployment, you'll see the public IP of your EC2 instance.

## Destroying the Infrastructure

To destroy all resources created by Terraform:

```bash
terraform destroy
```

## Configuration

- `main.tf`: Defines the AWS infrastructure resources
- `variables.tf`: Defines variables used in the configuration
- `deploy.tf`: Handles the NextJS application deployment
- `scripts/user_data.sh`: Script to initialize the EC2 instance
- `scripts/deploy.sh`: Script to deploy the NextJS application

## Outputs

- `instance_public_ip`: Public IP address of the EC2 instance
- `ssh_command`: SSH command to access the EC2 instance
