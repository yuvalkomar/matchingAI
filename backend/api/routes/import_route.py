"""
Import routes for file upload and processing.
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Dict, Any
import sys
import os
import asyncio
import concurrent.futures

# Add parent directory to path to import matching module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))

from backend.api.models import ColumnMapping
from backend.api.utils import load_file, get_sample_data, normalize_transactions

# Lazy import for LLM helper to avoid blocking startup
def get_auto_match_columns():
    """Lazy import of auto_match_columns to avoid blocking startup."""
    from matching.llm_helper import auto_match_columns
    return auto_match_columns

router = APIRouter(prefix="/api/import", tags=["import"])

# In-memory storage (in production, use database or Redis)
file_storage: Dict[str, Any] = {}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a file (ledger or bank)."""
    import time
    start_time = time.time()
    
    try:
        # Read file content
        read_start = time.time()
        content = await file.read()
        read_time = time.time() - read_start
        file_size = len(content)
        
        print(f"[UPLOAD] File read: {file.filename}, size: {file_size} bytes, took {read_time:.2f}s")
        
        # Load file in thread pool to prevent blocking
        loop = asyncio.get_event_loop()
        
        # Use a timeout for the entire file processing
        def process_file():
            try:
                load_start = time.time()
                df = load_file(content, file.filename)
                load_time = time.time() - load_start
                print(f"[UPLOAD] File loaded: {len(df)} rows, {len(df.columns)} cols, took {load_time:.2f}s")
                
                sample_start = time.time()
                sample_data = get_sample_data(df)
                sample_time = time.time() - sample_start
                print(f"[UPLOAD] Sample data extracted, took {sample_time:.2f}s")
                
                return df, sample_data
            except Exception as e:
                import traceback
                print(f"[UPLOAD] Error in process_file: {str(e)}")
                print(traceback.format_exc())
                raise ValueError(f"Error processing file: {str(e)}")
        
        try:
            process_start = time.time()
            df, sample_data = await asyncio.wait_for(
                loop.run_in_executor(None, process_file),
                timeout=15.0  # 15 second timeout for file processing
            )
            process_time = time.time() - process_start
            print(f"[UPLOAD] Processing complete, took {process_time:.2f}s")
        except asyncio.TimeoutError:
            total_time = time.time() - start_time
            print(f"[UPLOAD] TIMEOUT after {total_time:.2f}s")
            raise HTTPException(
                status_code=408, 
                detail=f"File processing timed out after 15 seconds. File size: {file_size} bytes."
            )
        
        # Store file data
        file_id = f"{file.filename}_{id(content)}"
        file_storage[file_id] = {
            'filename': file.filename,
            'df': df,
            'columns': list(df.columns),
            'sample_data': sample_data,
        }
        
        total_time = time.time() - start_time
        print(f"[UPLOAD] Complete: {file_id}, total time: {total_time:.2f}s")
        
        return {
            "file_id": file_id,
            "filename": file.filename,
            "columns": list(df.columns),
            "row_count": len(df),
            "sample_data": sample_data,
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        total_time = time.time() - start_time
        print(f"[UPLOAD] ERROR after {total_time:.2f}s: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")


@router.post("/auto-map")
async def auto_map_columns(file_id: str, timeout: int = 10):
    """Use AI to automatically map columns."""
    if file_id not in file_storage:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_data = file_storage[file_id]
    columns = file_data['columns']
    sample_data = file_data['sample_data']
    
    try:
        # Run LLM call in thread pool with timeout
        auto_match_columns = get_auto_match_columns()
        def call_auto_map():
            return auto_match_columns(columns, sample_data, timeout=timeout)
        
        loop = asyncio.get_event_loop()
        try:
            mapping, success = await asyncio.wait_for(
                loop.run_in_executor(None, call_auto_map),
                timeout=timeout + 2  # Add 2 seconds buffer
            )
            return {
                "mapping": mapping,
                "success": success,
            }
        except asyncio.TimeoutError:
            return {
                "mapping": {},
                "success": False,
                "error": f"Request timed out after {timeout} seconds",
            }
    except Exception as e:
        return {
            "mapping": {},
            "success": False,
            "error": str(e),
        }


@router.post("/process")
async def process_files(request: Dict[str, Any]):
    """Process uploaded files and normalize transactions."""
    ledger_file_id = request.get('ledger_file_id')
    bank_file_id = request.get('bank_file_id')
    ledger_mapping = request.get('ledger_mapping', {})
    bank_mapping = request.get('bank_mapping', {})
    
    if not ledger_file_id or ledger_file_id not in file_storage:
        raise HTTPException(status_code=404, detail="Ledger file not found")
    if not bank_file_id or bank_file_id not in file_storage:
        raise HTTPException(status_code=404, detail="Bank file not found")
    
    ledger_df = file_storage[ledger_file_id]['df']
    bank_df = file_storage[bank_file_id]['df']
    
    # Convert ColumnMapping to dict format expected by normalize_transactions
    ledger_map_dict = {
        'date': ledger_mapping.get('date'),
        'vendor': ledger_mapping.get('vendor'),
        'description': ledger_mapping.get('description'),
        'money_in': ledger_mapping.get('money_in'),
        'money_out': ledger_mapping.get('money_out'),
        'reference': ledger_mapping.get('reference'),
        'category': ledger_mapping.get('category'),
    }
    
    bank_map_dict = {
        'date': bank_mapping.get('date'),
        'vendor': bank_mapping.get('vendor'),
        'description': bank_mapping.get('description'),
        'money_in': bank_mapping.get('money_in'),
        'money_out': bank_mapping.get('money_out'),
        'reference': bank_mapping.get('reference'),
        'category': bank_mapping.get('category'),
    }
    
    # Normalize transactions
    normalized_ledger = normalize_transactions(ledger_df, ledger_map_dict, 'ledger')
    normalized_bank = normalize_transactions(bank_df, bank_map_dict, 'bank')
    
    return {
        "success": True,
        "ledger_count": len(normalized_ledger),
        "bank_count": len(normalized_bank),
        "normalized_ledger": normalized_ledger,
        "normalized_bank": normalized_bank,
    }


@router.get("/file/{file_id}")
async def get_file_info(file_id: str):
    """Get information about an uploaded file."""
    if file_id not in file_storage:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_data = file_storage[file_id]
    return {
        "file_id": file_id,
        "filename": file_data['filename'],
        "columns": file_data['columns'],
        "row_count": len(file_data['df']),
        "sample_data": file_data['sample_data'],
    }
