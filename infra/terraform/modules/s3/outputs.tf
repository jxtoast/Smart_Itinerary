# Values the ECS module (tools-service env) and IAM policies need.

output "bucket_name" {
  description = "Globally-unique bucket name — tools-service's S3_BUCKET env on AWS."
  value       = aws_s3_bucket.exports.bucket
}

output "bucket_arn" {
  description = "Bucket ARN for the tools-service task role's S3 policy."
  value       = aws_s3_bucket.exports.arn
}
