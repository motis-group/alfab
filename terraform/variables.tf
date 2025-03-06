variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "us-east-1"
}

variable "instance_ami" {
  description = "AMI ID for the EC2 instance (Ubuntu Server 22.04 LTS)"
  type        = string
  default     = "ami-0c7217cdde317cfec"  # Ubuntu 22.04 LTS in us-east-1
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t2.micro"
}

variable "instance_name" {
  description = "Name tag for the EC2 instance"
  type        = string
  default     = "nextjs-server"
}

variable "volume_size" {
  description = "Size of the root volume in GB"
  type        = number
  default     = 20
}

variable "key_name" {
  description = "Name of the key pair for SSH access"
  type        = string
  default     = "nextjs-deployer-key"
}

variable "public_key_path" {
  description = "Path to the public key for SSH access"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "private_key_path" {
  description = "Path to the private key for SSH access"
  type        = string
  default     = "~/.ssh/id_rsa"
}

variable "supabase_url" {
  description = "Supabase URL for the NextJS application"
  type        = string
  default     = "http://api.alfabvic.com.au"
}

variable "supabase_anon_key" {
  description = "Supabase anon key for the NextJS application"
  type        = string
  default     = ""  # This should be provided when applying Terraform
  sensitive   = true
} 