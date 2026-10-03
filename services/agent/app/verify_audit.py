#!/usr/bin/env python3
"""
CLI script to verify the cryptographic hash chain of an audit JSONL log file.
Usage: python verify_audit.py path/to/session.jsonl
"""

import sys
import os

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.audit import verify_audit_file

def main():
    if len(sys.argv) < 2:
        print("Usage: python verify_audit.py <path_to_audit_jsonl>")
        sys.exit(1)

    log_path = sys.argv[1]
    is_valid, reason = verify_audit_file(log_path)
    if is_valid:
        print(f"[AUDIT VERIFICATION SUCCESS] File '{log_path}' is cryptographically valid and untampered.")
        sys.exit(0)
    else:
        print(f"[AUDIT VERIFICATION FAILED] Tampering or corruption detected: {reason}")
        sys.exit(1)

if __name__ == "__main__":
    main()
