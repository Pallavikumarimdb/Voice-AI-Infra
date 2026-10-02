"""
Mock CRM interface for synthetic debtor accounts.
Enforces that debtor profile and account balance are hidden until identity is verified.
"""

import json
import os
from typing import Optional, Dict, Any

CRM_DATA_PATH = os.path.join(os.path.dirname(__file__), "debtors.json")

class MockCRM:
    def __init__(self, data_path: Optional[str] = None):
        self.data_path = data_path or CRM_DATA_PATH
        self._data: Dict[str, Any] = {}
        self._load()

    def _load(self):
        if os.path.exists(self.data_path):
            with open(self.data_path, "r", encoding="utf-8") as f:
                self._data = json.load(f)
        else:
            self._data = {}

    def get_by_phone(self, phone: str) -> Optional[Dict[str, Any]]:
        clean_phone = phone.replace("-", "").strip()
        for d in self._data.values():
            if d.get("phone", "").replace("-", "").strip() == clean_phone:
                return d.copy()
        return None

    def get_by_id(self, debtor_id: str) -> Optional[Dict[str, Any]]:
        record = self._data.get(debtor_id)
        return record.copy() if record else None

    def verify_credentials(self, debtor_id: str, stated_dob: str, stated_name_or_postal: Optional[str] = None) -> bool:
        record = self._data.get(debtor_id)
        if not record:
            return False
        
        # Normalize DOB (YYYY-MM-DD or YYYY年MM月DD日 or conversational "1985年4月12日です")
        import re
        actual_dob = record.get("dob", "")
        parts_actual = [int(p) for p in actual_dob.split("-") if p.isdigit()]
        if len(parts_actual) != 3:
            return False
        act_y, act_m, act_d = parts_actual

        dob_match = False
        m = re.search(r'([0-9]{4}|昭和[0-9]{1,2}|平成[0-9]{1,2})?\D*([0-9]{1,2})\D+([0-9]{1,2})', stated_dob)
        if m:
            y_raw, m_raw, d_raw = m.group(1), m.group(2), m.group(3)
            if y_raw and "昭和" in y_raw:
                year = 1925 + int(re.sub(r'\D', '', y_raw))
            elif y_raw and "平成" in y_raw:
                year = 1988 + int(re.sub(r'\D', '', y_raw))
            elif y_raw and y_raw.isdigit():
                year = int(y_raw)
            else:
                year = None

            month = int(m_raw)
            day = int(d_raw)

            if year is not None:
                dob_match = (year == act_y and month == act_m and day == act_d)
            else:
                dob_match = (month == act_m and day == act_d)

        if not stated_name_or_postal:
            return dob_match

        clean_stated_extra = stated_name_or_postal.replace("-", "").replace(" ", "").strip()
        actual_postal = record.get("postal_code", "").replace("-", "").strip()
        actual_name = record.get("name", "").replace(" ", "").strip()
        actual_kana = record.get("name_kana", "").replace(" ", "").strip()

        extra_match = (
            clean_stated_extra in actual_postal
            or clean_stated_extra in actual_name
            or clean_stated_extra in actual_kana
        )

        return dob_match and extra_match

crm = MockCRM()
