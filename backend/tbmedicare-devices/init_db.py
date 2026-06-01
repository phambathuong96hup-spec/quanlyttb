import os
import sys
import psycopg

# Add current dir to path to import env_loader
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import env_loader

def init_database():
    print("Loading environment files...")
    env_loader.load_all_env_files()
    
    db_url = os.getenv("DEVICES_DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/tbmedicare_devices")
    print(f"Target Database URL: {db_url}")
    
    # Extract connection parameters to connect to default 'postgres' database first
    # to create the target database if it doesn't exist.
    try:
        conn_params = psycopg.conninfo.conninfo_to_dict(db_url)
    except Exception as e:
        print(f"Error parsing database URL: {e}")
        sys.exit(1)
        
    target_db = conn_params.get("dbname", "tbmedicare_devices")
    
    # Connect to default 'postgres' db
    conn_params["dbname"] = "postgres"
    postgres_url = psycopg.conninfo.make_conninfo(**conn_params)
    
    print("Connecting to postgres default database to check/create target database...")
    try:
        with psycopg.connect(postgres_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                # Check if database exists
                cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target_db,))
                exists = cur.fetchone()
                if not exists:
                    print(f"Database '{target_db}' does not exist. Creating...")
                    cur.execute(f"CREATE DATABASE {target_db}")
                    print(f"Database '{target_db}' created successfully.")
                else:
                    print(f"Database '{target_db}' already exists.")
    except Exception as e:
        print(f"Error checking/creating database '{target_db}': {e}")
        sys.exit(1)
        
    # Now connect to the target database and execute schema.sql
    print(f"Connecting to '{target_db}' to apply schema...")
    try:
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
                if os.path.exists(schema_path):
                    print(f"Reading schema from {schema_path}...")
                    with open(schema_path, "r", encoding="utf-8") as f:
                        schema_sql = f.read()
                    
                    print("Applying schema...")
                    cur.execute(schema_sql)
                    conn.commit()
                    print("Schema applied successfully!")
                else:
                    print(f"Error: schema.sql not found at {schema_path}")
                    sys.exit(1)
    except Exception as e:
        print(f"Error applying schema to database '{target_db}': {e}")
        sys.exit(1)

if __name__ == "__main__":
    init_database()
