from models import DataSensitivity


PCI_SIGNALS = [
    "payment", "card", "billing", "transaction",
    "checkout", "invoice", "bank", "wallet", "refund", "charge"
]

PHI_SIGNALS = [
    "patient", "health", "medical", "record",
    "prescription", "diagnosis", "clinical", "ehr", "lab", "doctor"
]

PII_SIGNALS = [
    "user", "profile", "account", "customer", "person",
    "email", "address", "identity", "kyc", "contact"
]


def detect_sensitivity(path: str) -> tuple[DataSensitivity, float]:
    p = path.lower()

    for keyword in PCI_SIGNALS:
        if keyword in p:
            return DataSensitivity.PCI, 1.0

    for keyword in PHI_SIGNALS:
        if keyword in p:
            return DataSensitivity.PHI, 0.95

    for keyword in PII_SIGNALS:
        if keyword in p:
            return DataSensitivity.PII, 0.80

    return DataSensitivity.NONE, 0.0