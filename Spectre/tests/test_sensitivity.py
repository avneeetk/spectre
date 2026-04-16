from classification.sensitivity import detect_sensitivity
from models import DataSensitivity

tests = [
    ("/api/v1/users",           DataSensitivity.PII,  0.80),
    ("/api/v1/payment/process", DataSensitivity.PCI,  1.0),
    ("/api/v1/patient/records", DataSensitivity.PHI,  0.95),
    ("/api/v1/products",        DataSensitivity.NONE, 0.0),
    ("/api/v1/card/details",    DataSensitivity.PCI,  1.0),
    ("/api/v1/health/check",    DataSensitivity.PHI,  0.95),
    ("/api/v1/config",          DataSensitivity.NONE, 0.0),
]

all_passed = True

for path, expected_type, expected_score in tests:
    sensitivity, score = detect_sensitivity(path)
    passed = sensitivity == expected_type and score == expected_score
    status = "PASS" if passed else "FAIL"
    if not passed:
        all_passed = False
    print(f"{status} | {path:35} -> {sensitivity.value:4}  score={score}  (expected {expected_type.value} {expected_score})")

print()
print("All tests passed!" if all_passed else "Some tests FAILED — check above.")