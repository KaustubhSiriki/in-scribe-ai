# backend/app/supabase_client.py
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv() # Ensure environment variables are loaded

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise EnvironmentError("Supabase URL or Service Key is missing from environment variables.")

# Initialize Supabase client with the service role key for backend operations
# This client will have admin-like privileges and can bypass RLS when needed.
# It's crucial this key is kept secret and only used in the backend.
supabase_admin_client: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def get_supabase_admin_client() -> Client:
    """
    Returns the initialized Supabase admin client.
    This ensures we use a single instance (module-level singleton).
    """
    return supabase_admin_client

# Why this structure?
# 1. Centralized Initialization: Ensures the Supabase client is initialized once
#    when the module is imported.
# 2. Environment Variable Driven: Securely loads credentials from .env.
# 3. Type Hinting: Provides type hints for better code quality and developer experience.
# 4. Service Role Usage: Clearly indicates this client uses the service_role key,
#    highlighting its privileged nature for backend-only operations.