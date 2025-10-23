#!/usr/bin/env python3
"""Simple server runner to avoid shell script issues"""
import os
import uvicorn

if __name__ == "__main__":
    # Run database migrations
    try:
        from app.db.utils import create_tables
        create_tables()
        print("✅ Database migrations completed")
    except Exception as e:
        print(f"⚠️  Migration warning: {e}")
    
    # Start the server
    port = int(os.getenv("PORT", 5000))
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=False
    )