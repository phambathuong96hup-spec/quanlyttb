import unittest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_manager


class DepartmentDeviceDashboardTests(unittest.TestCase):
    def test_duplicate_active_usages_count_machine_once(self):
        rows = [
            {
                "id": "machine-1",
                "machine_code": "M-001",
                "machine_name": "Monitor 1",
                "room_code": "P101",
                "machine_status": "available",
                "category_name": "Monitor",
                "usage_status": "in_use",
                "usage_department_code": "NHI",
                "usage_department_name": "Khoa Nhi",
                "patient_name": "Nguyen Van A",
                "his_treatment_code": "T001",
                "started_at": "2026-06-01T07:00:00+07:00",
            },
            {
                "id": "machine-1",
                "machine_code": "M-001",
                "machine_name": "Monitor 1",
                "room_code": "P101",
                "machine_status": "available",
                "category_name": "Monitor",
                "usage_status": "in_use",
                "usage_department_code": "NHI",
                "usage_department_name": "Khoa Nhi",
                "patient_name": "Tran Thi B",
                "his_treatment_code": "T002",
                "started_at": "2026-06-01T08:00:00+07:00",
            },
            {
                "id": "machine-2",
                "machine_code": "M-002",
                "machine_name": "Monitor 2",
                "room_code": "P102",
                "machine_status": "available",
                "category_name": "Monitor",
                "usage_status": None,
                "machine_department_code": "NHI",
                "machine_department_name": "Khoa Nhi",
            },
        ]

        dashboard = db_manager._build_department_device_dashboard(rows)

        self.assertEqual(dashboard["summary"]["machines_total"], 2)
        self.assertEqual(dashboard["summary"]["in_use"], 1)
        self.assertEqual(dashboard["summary"]["available"], 1)
        self.assertEqual(dashboard["departments"][0]["total"], 2)
        self.assertEqual(len(dashboard["departments"][0]["devices"]["in_use"]), 1)


if __name__ == "__main__":
    unittest.main()
