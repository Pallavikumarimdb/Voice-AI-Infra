"""
Append-only JSONL Audit Trail with Cryptographic Hash Chain.
Guarantees non-repudiation and tamper-evident logging for compliance audits.
"""

import os
import json
import hashlib
import time
from typing import Dict, Any, Optional, Tuple

DEFAULT_AUDIT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "audit_logs"))

def compute_hash(data: Dict[str, Any]) -> str:
    """Computes SHA-256 over canonical JSON string (sorted keys, no extra spaces)."""
    canonical_str = json.dumps(data, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()

class AuditLogger:
    def __init__(self, session_id: str, log_dir: Optional[str] = None):
        self.session_id = session_id
        self.log_dir = log_dir or DEFAULT_AUDIT_DIR
        os.makedirs(self.log_dir, exist_ok=True)
        self.log_path = os.path.join(self.log_dir, f"{session_id}.jsonl")
        self.entry_index = 0
        self.last_hash = "GENESIS"
        self._init_existing_chain()

    def _init_existing_chain(self):
        """If resuming an existing log, read last entry to continue chain."""
        if os.path.exists(self.log_path):
            with open(self.log_path, "r", encoding="utf-8") as f:
                lines = [line.strip() for line in f if line.strip()]
                if lines:
                    last_entry = json.loads(lines[-1])
                    self.entry_index = last_entry.get("seq", len(lines))
                    self.last_hash = last_entry.get("hash", "GENESIS")

    def append(self, stage: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Appends a new hash-chained audit record to the JSONL log."""
        self.entry_index += 1
        record = {
            "seq": self.entry_index,
            "session_id": self.session_id,
            "ts": int(time.time() * 1000),
            "stage": stage,
            "payload": payload,
            "prev_hash": self.last_hash
        }
        current_hash = compute_hash(record)
        record["hash"] = current_hash
        self.last_hash = current_hash

        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

        return record

def verify_audit_file(log_path: str) -> Tuple[bool, Optional[str]]:
    """
    Verifies the cryptographic integrity of an audit JSONL log file.
    Returns (is_valid, error_reason).
    """
    if not os.path.exists(log_path):
        return False, f"File does not exist: {log_path}"

    with open(log_path, "r", encoding="utf-8") as f:
        lines = [l.strip() for l in f if l.strip()]

    if not lines:
        return True, None

    expected_prev = "GENESIS"
    for idx, line in enumerate(lines, start=1):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as ex:
            return False, f"Corrupted JSON on line {idx}: {ex}"

        stored_hash = entry.get("hash")
        entry_prev = entry.get("prev_hash")

        if entry_prev != expected_prev:
            return False, f"Broken chain at seq {entry.get('seq')}: prev_hash '{entry_prev}' != expected '{expected_prev}'"

        # Recompute hash without 'hash' key
        entry_to_hash = {k: v for k, v in entry.items() if k != "hash"}
        recomputed = compute_hash(entry_to_hash)

        if recomputed != stored_hash:
            return False, f"Hash mismatch at seq {entry.get('seq')}: stored '{stored_hash}' != recomputed '{recomputed}'"

        expected_prev = stored_hash

    return True, None
