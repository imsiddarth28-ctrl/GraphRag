import json
import logging
import sys
from datetime import datetime
from typing import Any

class StructuredJSONFormatter(logging.Formatter):
    """
    Custom formatter to output logs in structured JSON format,
    perfect for containerized environments and log aggregators.
    """
    def format(self, record: logging.LogRecord) -> str:
        log_record = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "file_name": record.filename,
            "function_name": record.funcName,
            "line_number": record.lineno,
            "message": record.getMessage(),
        }
        
        # Include exception traceback if present
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
            
        return json.dumps(log_record)

def get_configured_logger(name: str = "graphrag", log_level: str = "INFO") -> logging.Logger:
    """
    Configures and returns a structured JSON logger.
    """
    logger = logging.getLogger(name)
    
    # Prevent duplicate handlers if configured multiple times
    if not logger.handlers:
        logger.setLevel(log_level.upper())
        
        # Configure console output handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(log_level.upper())
        
        # Apply structured JSON formatter
        formatter = StructuredJSONFormatter()
        console_handler.setFormatter(formatter)
        
        logger.addHandler(console_handler)
        logger.propagate = False
        
    return logger
