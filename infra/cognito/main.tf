# Amazon Cognito user pool for Smart Itinerary (diagram: "Amazon Cognito").
# One pool, Google as the only federated identity provider, and a public
# (PKCE) app client for the web app. Costs $0 while it exists (see the free
# tier note in RUNBOOK.md) — destroy it after demos.

locals {
  # The issuer every service verifies JWTs against
  # (packages/shared/src/adapters/jwt.ts, TOKEN_VERIFY_MODE=cognito).
  issuer           = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  hosted_ui_domain = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

resource "aws_cognito_user_pool" "main" {
  name = var.pool_name

  # Federation-only pool: people sign in with their Google account, so there
  # is no self-service password flow. The policy below only matters if an
  # admin creates a local test user (RUNBOOK.md "Creating a local test user").
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

# Google as the single identity provider. The client id/secret come from the
# lead's Google Cloud OAuth client. Google must allow Cognito's redirect URI
# — https://<hosted-ui-domain>/oauth2/idpresponse — which is only known after
# the first apply, hence RUNBOOK.md's "apply first, then add the Google
# redirect URI" order.
resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  # Cognito derives the username from Google's `sub` claim automatically; we
  # only map the profile fields the app reads (auth-service upserts them into
  # the `users` table from the verified JWT claims on GET /api/auth/me).
  attribute_mapping = {
    email = "email"
    name  = "name"
  }
}

# Public web client: no client secret (a browser cannot hold one), which makes
# Cognito enforce PKCE on the authorization-code flow the web app uses
# (apps/web/app/auth/start + /auth/callback).
resource "aws_cognito_user_pool_client" "web" {
  name         = "smart-itinerary-web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  # Hosted-UI authorization-code settings — the /oauth2/authorize endpoint
  # issues a `code` back to callback_urls with the openid scopes requested.
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = [aws_cognito_identity_provider.google.provider_name]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  # SRP + refresh are what the hosted UI's own pages use internally; there is
  # deliberately no ALLOW_USER_PASSWORD_AUTH (our code never sends passwords).
  explicit_auth_flows = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]

  # Return a generic error for unknown usernames instead of "user not found".
  prevent_user_existence_errors = "ENABLED"

  # Tokens live 1 hour — the web session cookie inherits this TTL
  # (apps/web/lib/auth/cognito.ts). Refresh-token rotation is out of scope;
  # after an hour the user simply signs in again.
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
}

# Hosted UI domain — the Google sign-in pages the web app redirects to.
# The prefix must be globally unique across all AWS accounts.
resource "aws_cognito_user_pool_domain" "main" {
  domain       = var.hosted_ui_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}
