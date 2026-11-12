from slowapi import Limiter
from slowapi.util import get_remote_address

# In-memory storage: correct for the single-process uvicorn this app runs as.
limiter = Limiter(key_func=get_remote_address)
