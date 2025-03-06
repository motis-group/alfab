# This file defines the deployment process for the NextJS application
# It will be used by the 'terraform apply' command after the infrastructure is created

resource "null_resource" "deploy_nextjs" {
  depends_on = [aws_instance.nextjs_server, aws_eip.nextjs_eip]

  # Wait for the instance to be fully initialized
  provisioner "local-exec" {
    command = "sleep 60"
  }

  # Deploy the NextJS application
  provisioner "local-exec" {
    command = "bash ${path.module}/scripts/deploy.sh"
    
    environment = {
      PUBLIC_IP    = aws_eip.nextjs_eip.public_ip
      SSH_KEY_PATH = var.private_key_path
      APP_PATH     = "${path.root}/../web-app"
      NEXT_PUBLIC_SUPABASE_URL      = var.supabase_url
      NEXT_PUBLIC_SUPABASE_ANON_KEY = var.supabase_anon_key
    }
  }

  # Add triggers to redeploy when the application changes
  triggers = {
    always_run = timestamp()
  }
} 