from pydantic import BaseModel, field_validator
from enum import Enum
from typing import Optional
from datetime import datetime
from typing import Dict, Any


class APIState(str, Enum):
    ACTIVE  = "active"
    SHADOW  = "shadow"
    ZOMBIE  = "zombie"
    ROGUE   = "rogue"
    UNKNOWN = "unknown"


class DataSensitivity(str, Enum):
    PCI  = "PCI"
    PHI  = "PHI"
    PII  = "PII"
    NONE = "none"


class OWASPResult(BaseModel):
    check_id:  str
    passed:    bool
    evidence:  str
    severity:  str


# Recived output
class DiscoveredEndpoint(BaseModel):
    id:                          str
    method:                      str
    path:                        str
    service_name:                str
    sources:                     list[str]
    in_repo:                     bool
    in_gateway:                  bool
    seen_in_traffic:             bool
    auth_detected:               bool
    auth_type:                   str
    also_found_in_conflict_with: Optional[str]
    status_codes:                list[int]
    last_seen:                   Optional[datetime]
    tags:                        list[str]
    raw_context:                 str
    has_owner:                   bool = False   # default until Member 1 adds it


# Classification engine output
class EndpointRecord(BaseModel):
    endpoint_id:       str
    path:              str
    method:            str
    host:              str
    state:             APIState
    state_reason:      str
    data_sensitivity:  DataSensitivity
    sensitivity_score: float
    risk_score:        float
    risk_factors:      list[str]
    owasp_failures:    list[OWASPResult]
    scanned_at:        datetime
